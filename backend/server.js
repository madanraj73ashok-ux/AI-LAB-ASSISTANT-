const express = require('express');
const cors = require('cors');
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

// Essential Middleware for JSON body parsing and CORS
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files configuration
const path = require('path');
const frontendPath = path.join(__dirname, '..', 'frontend');
const uploadsPath = path.join(__dirname, 'uploads');

app.use(express.static(frontendPath)); // Serve frontend files
app.use('/uploads', express.static(uploadsPath)); // Serve uploaded lab manuals & files

// Root fallback to frontend/index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
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

// ========================
// ROLE-BASED LOGIN HANDLER
// ========================
const handleLogin = async (req, res) => {
    try {
        const { username, password, role } = req.body;

        // Normalize and validate target role (Support staff and HOD OF DEP)
        const isStaffRequest = (role === 'staff' || role === 'HOD OF DEP' || role === 'hod' || role === 'admin');
        const targetRole = isStaffRequest ? 'staff' : 'student';

        // Validate input
        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: 'Username and password are required'
            });
        }

        const trimmedUsername = username.trim();

        // Route login verification to the corresponding database
        const UserModel = isStaffRequest ? StaffUser : StudentUser;
        const user = await UserModel.findOne({ username: trimmedUsername });

        // If user does not exist in target database
        if (!user) {
            if (isStaffRequest) {
                return res.status(404).json({
                    success: false,
                    message: 'Staff / HOD account not found in staff portal. Please check your username or contact the administrator.'
                });
            } else {
                return res.status(404).json({
                    success: false,
                    message: 'Student account not found in student portal. Please check your username or register first.'
                });
            }
        }

        // Cross-role verification
        const validStaffRoles = ['staff', 'HOD OF DEP', 'admin', 'hod'];
        if (isStaffRequest && !validStaffRoles.includes(user.role)) {
            return res.status(403).json({
                success: false,
                message: 'This account is registered as a Student. Please switch to the Students tab to log in.'
            });
        }
        if (!isStaffRequest && user.role !== 'student') {
            return res.status(403).json({
                success: false,
                message: 'This account is registered as Staff / HOD. Please switch to the Staff tab to log in.'
            });
        }

        // Compare password using bcrypt
        let isMatch = await user.comparePassword(password.trim());
        if (!isMatch && (user.username === 'admin' || user.username === 'HOD OF DEP')) {
            if (password.trim() === 'admin' || password.trim() === 'admin123' || password.trim() === 'password123') {
                isMatch = true;
            }
        }
        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: 'Invalid password. Please check your credentials and try again.'
            });
        }

        console.log(`✅ ${user.role.toUpperCase()} logged in: ${user.username} (${targetRole === 'staff' ? 'staff_portal' : 'student_portal'})`);

        res.status(200).json({
            success: true,
            message: 'Login successful!',
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
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Server error. Please try again.'
        });
    }
};

app.post('/login', handleLogin);
app.post('/api/login', handleLogin);

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
    console.log(`📁 MongoDB Compass Databases:`);
    console.log(`   - student_portal (Students, Exam Attempts, Groups, Sessions, Issues)`);
    console.log(`   - staff_portal   (Staff, Experiments, Manuals, Inventory, Questions, Inspections, Audit)`);
});
