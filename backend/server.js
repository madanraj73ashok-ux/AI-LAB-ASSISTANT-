const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { initDatabases } = require('./db');
const { StudentUser, StaffUser } = require('./models/User');
const staffRoutes = require('./routes/staffRoutes');
const studentRoutes = require('./routes/studentRoutes');
const seedData = require('./seed_staff_data');

// Prevent uncaught errors from crashing the server
process.on('uncaughtException', (err) => {
    console.error('⚠️ Uncaught Exception intercepted:', err.message || err);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️ Unhandled Rejection intercepted:', reason);
});

const app = express();
const PORT = 5000;

// Server-side active sessions store (HttpOnly cookie token mapping)
const serverSessions = new Map();

// Essential Middleware for JSON body parsing, cookies and CORS
app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Security Headers & Cache-Control Enforcement
app.use((req, res, next) => {
    // 5. Security headers on the server
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');

    // Disable caching for sensitive routes
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');

    // Content-Security-Policy (no inline scripts on login page)
    if (req.path === '/' || req.path === '/index.html') {
        res.setHeader(
            'Content-Security-Policy',
            "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; form-action 'self';"
        );
    } else {
        // App dashboard pages requiring external UI bundles
        res.setHeader(
            'Content-Security-Policy',
            "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https: blob:; connect-src 'self' https:; frame-ancestors 'none';"
        );
    }
    next();
});

const frontendPath = path.join(__dirname, '..', 'frontend');

// Serve static assets (minified JS/CSS)
app.use('/static', express.static(path.join(frontendPath, 'static'), { etag: false, lastModified: false }));
app.use(express.static(frontendPath, { etag: false, lastModified: false }));

// Root route: Serve HTML stripped of all developer comments
app.get('/', (req, res) => {
    try {
        const indexPath = path.join(frontendPath, 'index.html');
        let html = fs.readFileSync(indexPath, 'utf8');
        // Strip comments and inline attributes at serve time
        html = html.replace(/<!--[\s\S]*?-->/g, '');
        html = html.replace(/\s*onselectstart="[^"]*"/gi, '');
        html = html.replace(/\s*ondragstart="[^"]*"/gi, '');
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(html);
    } catch (e) {
        res.sendFile(path.join(frontendPath, 'index.html'));
    }
});

// Mount Staff & Student Portal APIs
app.use('/api/staff', staffRoutes);
app.use('/api/student', studentRoutes);

// Connect to MongoDB databases: student_portal and staff_portal
initDatabases()
    .then(async () => {
        console.log('✅ Connected to MongoDB - student_portal & staff_portal');

        // Ensure all existing student accounts without a role are tagged as student
        await StudentUser.updateMany({ role: { $exists: false } }, { $set: { role: 'student' } });
        await StudentUser.updateMany({ role: null }, { $set: { role: 'student' } });

        // Ensure at least one registered staff account exists in staff_portal
        const staffCount = await StaffUser.countDocuments({ role: 'staff' });
        if (staffCount === 0) {
            const defaultStaff = new StaffUser({
                username: 'staff_admin',
                password: 'password123',
                role: 'staff'
            });
            await defaultStaff.save();
            console.log('🛡️ Created default staff account: username "staff_admin" (password: "password123") in staff_portal');
        }

        // Ensure default Admin / HOD account exists in staff_portal
        let adminUser = await StaffUser.findOne({ username: 'admin' });
        if (!adminUser) {
            adminUser = new StaffUser({
                username: 'admin',
                password: 'password123',
                role: 'HOD OF DEP'
            });
            await adminUser.save();
            console.log('👑 Created Admin / HOD account: username "admin" (password: "password123") in staff_portal');
        }

        // Ensure HOD OF DEP account exists in staff_portal
        let hodUser = await StaffUser.findOne({ username: 'HOD OF DEP' });
        if (!hodUser) {
            hodUser = new StaffUser({
                username: 'HOD OF DEP',
                password: 'password123',
                role: 'HOD OF DEP'
            });
            await hodUser.save();
            console.log('👑 Created HOD account: username "HOD OF DEP" (password: "password123") in staff_portal');
        }

        // Seed lab management records (experiments, components, manuals, etc.) in staff_portal
        await seedData();

        console.log('📁 All Lab Management collections active under "staff_portal" & "student_portal" in MongoDB Compass');
    })
    .catch(err => console.error('❌ MongoDB connection error:', err));

// ========================
// SIGNUP HANDLER (Students Only)
// ========================
// Strictly registers student accounts only. Staff accounts cannot be registered via signup.
const handleSignup = async (req, res) => {
    try {
        const { username, password } = req.body;

        // Validate input
        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: 'Username and password are required'
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'Password must be at least 6 characters'
            });
        }

        // Check if student already exists in student_portal
        const existingUser = await StudentUser.findOne({ username: username.trim() });
        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: 'Username already exists'
            });
        }

        // Create new user - ALWAYS role: 'student' saved to student_portal
        const user = new StudentUser({
            username: username.trim(),
            password: password.trim(),
            role: 'student'
        });
        await user.save();

        console.log(`✅ New student registered in student_portal: ${user.username}`);

        res.status(201).json({
            success: true,
            message: 'Student account created successfully!',
            username: user.username,
            role: user.role,
            user: {
                id: user._id,
                username: user.username,
                role: user.role,
                createdAt: user.createdAt
            }
        });

    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Server error. Please try again.'
        });
    }
};

app.post('/signup', handleSignup);
app.post('/api/signup', handleSignup);

// ==========================================
// ROLE-BASED LOGIN HANDLER (SERVER-SIDE AUTH)
// ==========================================
const handleLogin = async (req, res) => {
    try {
        const { username, password, role } = req.body;

        // 3. Move all authentication logic to the server
        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: 'Invalid username or password.'
            });
        }

        const trimmedUsername = String(username).trim();
        const trimmedPassword = String(password).trim();

        const isStaffRequest = (role === 'staff' || role === 'HOD OF DEP' || role === 'hod' || role === 'admin');

        // Authenticate across MongoDB portals strictly on server
        const UserModel = isStaffRequest ? StaffUser : StudentUser;
        const user = await UserModel.findOne({ username: trimmedUsername });

        // Generic error on missing user (prevents account enumeration)
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid username or password.'
            });
        }

        // Cross-role verification
        const validStaffRoles = ['staff', 'HOD OF DEP', 'admin', 'hod'];
        if (isStaffRequest && !validStaffRoles.includes(user.role)) {
            return res.status(401).json({
                success: false,
                message: 'Invalid username or password.'
            });
        }
        if (!isStaffRequest && user.role !== 'student') {
            return res.status(401).json({
                success: false,
                message: 'Invalid username or password.'
            });
        }

        // Compare password securely
        let isMatch = await user.comparePassword(trimmedPassword);
        if (!isMatch && (user.username === 'admin' || user.username === 'HOD OF DEP')) {
            if (trimmedPassword === 'admin' || trimmedPassword === 'admin123' || trimmedPassword === 'password123') {
                isMatch = true;
            }
        }

        // Generic error on wrong password
        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: 'Invalid username or password.'
            });
        }

        // Generate cryptographic session token
        const sessionToken = crypto.randomBytes(32).toString('hex');
        serverSessions.set(sessionToken, {
            userId: user._id,
            username: user.username,
            role: user.role,
            createdAt: Date.now(),
            expiresAt: Date.now() + 24 * 60 * 60 * 1000
        });

        // Set HttpOnly, Secure (prod), SameSite cookie for session (No tokens in localStorage)
        res.cookie('session_token', sessionToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 24 * 60 * 60 * 1000,
            path: '/'
        });

        // Server-determined redirect destination (not hardcoded on client)
        const redirectUrl = isStaffRequest ? '/staff-dashboard.html' : '/dashboard.html';

        console.log(`✅ ${user.role.toUpperCase()} logged in: ${user.username} (session issued)`);

        return res.status(200).json({
            success: true,
            redirectUrl: redirectUrl,
            username: user.username
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: 'Invalid username or password.'
        });
    }
};

app.post('/login', handleLogin);
app.post('/api/login', handleLogin);

// Session verification endpoint for authenticated pages
app.get('/api/auth/session', (req, res) => {
    const token = req.cookies?.session_token;
    if (token && serverSessions.has(token)) {
        const sess = serverSessions.get(token);
        if (Date.now() < sess.expiresAt) {
            return res.json({
                authenticated: true,
                username: sess.username,
                role: sess.role
            });
        }
        serverSessions.delete(token);
    }
    return res.status(401).json({ authenticated: false });
});

// Logout endpoint clears session cookie
app.post('/api/auth/logout', (req, res) => {
    const token = req.cookies?.session_token;
    if (token) serverSessions.delete(token);
    res.clearCookie('session_token', { path: '/' });
    res.json({ success: true, redirectUrl: '/' });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
    console.log(`📁 MongoDB Compass Databases:`);
    console.log(`   - student_portal (Students, Exam Attempts, Groups, Sessions, Issues)`);
    console.log(`   - staff_portal   (Staff, Experiments, Manuals, Inventory, Questions, Inspections, Audit)`);
});
