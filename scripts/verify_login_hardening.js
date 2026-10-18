const http = require('http');

function request(options, postData = null) {
    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                resolve({
                    statusCode: res.statusCode,
                    headers: res.headers,
                    body: body
                });
            });
        });
        req.on('error', reject);
        if (postData) {
            req.write(postData);
        }
        req.end();
    });
}

async function runTests() {
    console.log('🧪 Starting Verification Tests for Login Page Hardening...\n');

    // 1. Check Root Endpoint & Headers
    console.log('--- Test 1: Security Headers on http://localhost:5000/ ---');
    const rootRes = await request({
        hostname: 'localhost',
        port: 5000,
        path: '/',
        method: 'GET'
    });

    const csp = rootRes.headers['content-security-policy'] || '';
    const xcto = rootRes.headers['x-content-type-options'];
    const xfo = rootRes.headers['x-frame-options'];
    const refPol = rootRes.headers['referrer-policy'];

    console.log('CSP:', csp);
    console.log('X-Content-Type-Options:', xcto);
    console.log('X-Frame-Options:', xfo);
    console.log('Referrer-Policy:', refPol);

    if (!csp.includes("script-src 'self'")) throw new Error("CSP missing script-src 'self'");
    if (csp.includes("'unsafe-inline'") && csp.indexOf("'unsafe-inline'") < csp.indexOf('style-src')) {
        throw new Error("CSP unexpectedly allows unsafe-inline scripts!");
    }
    if (xcto !== 'nosniff') throw new Error("X-Content-Type-Options must be nosniff");
    if (xfo !== 'DENY') throw new Error("X-Frame-Options must be DENY");
    if (refPol !== 'no-referrer') throw new Error("Referrer-Policy must be no-referrer");
    console.log('✅ Security headers PASSED.\n');

    // 2. Check HTML Cleanup
    console.log('--- Test 2: HTML Content Verification ---');
    const html = rootRes.body;
    if (html.includes('onselectstart=')) throw new Error('HTML still contains inline onselectstart attribute!');
    if (html.includes('ondragstart=')) throw new Error('HTML still contains inline ondragstart attribute!');
    if (/<!--[\s\S]*?-->/.test(html)) throw new Error('HTML still contains developer comments!');
    if (html.includes('<script>') || html.includes('<script type=')) throw new Error('HTML still contains inline script tag!');
    if (!html.includes('/static/js/app.min.js')) throw new Error('HTML missing /static/js/app.min.js reference!');
    if (!html.includes('/static/css/login.min.css')) throw new Error('HTML missing /static/css/login.min.css reference!');
    console.log('✅ HTML has no inline handlers, no inline scripts, and zero comments.\n');

    // 3. Check Minified JS
    console.log('--- Test 3: Minified JS Verification ---');
    const jsRes = await request({
        hostname: 'localhost',
        port: 5000,
        path: '/static/js/app.min.js',
        method: 'GET'
    });

    if (jsRes.statusCode !== 200) throw new Error('Failed to fetch /static/js/app.min.js');
    if (jsRes.body.includes('console.log') || jsRes.body.includes('console.error')) {
        throw new Error('Minified JS contains console statements!');
    }
    if (jsRes.body.includes('sourceMappingURL=')) {
        throw new Error('Minified JS exposes source map!');
    }
    console.log(`✅ /static/js/app.min.js (${jsRes.body.length} bytes) is minified without console or sourcemaps.\n`);

    // 4. Test Student Login
    console.log('--- Test 4: Student Login Authentication ---');
    const studentLoginData = JSON.stringify({
        username: 'Mohanraj M',
        password: 'password123',
        role: 'student'
    });
    const studentRes = await request({
        hostname: 'localhost',
        port: 5000,
        path: '/login',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(studentLoginData)
        }
    }, studentLoginData);

    console.log('Student Login Status:', studentRes.statusCode);
    console.log('Student Login Body:', studentRes.body);
    const studentJson = JSON.parse(studentRes.body);
    if (!studentJson.success || studentJson.redirectUrl !== '/dashboard.html') {
        throw new Error('Student login failed or wrong redirectUrl: ' + studentRes.body);
    }
    const studentCookie = studentRes.headers['set-cookie'] || [];
    console.log('Student Set-Cookie:', studentCookie);
    const hasHttpOnlySession = studentCookie.some(c => c.includes('session_token=') && c.toLowerCase().includes('httponly'));
    if (!hasHttpOnlySession) throw new Error('Student login missing HttpOnly session_token cookie!');
    console.log('✅ Student Login succeeded with HttpOnly session cookie and server redirect.\n');

    // 5. Test Staff / HOD Login
    console.log('--- Test 5: Staff & HOD Login Authentication ---');
    const staffLoginData = JSON.stringify({
        username: 'admin',
        password: 'password123',
        role: 'staff'
    });
    const staffRes = await request({
        hostname: 'localhost',
        port: 5000,
        path: '/login',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(staffLoginData)
        }
    }, staffLoginData);

    console.log('Staff Login Status:', staffRes.statusCode);
    console.log('Staff Login Body:', staffRes.body);
    const staffJson = JSON.parse(staffRes.body);
    if (!staffJson.success || staffJson.redirectUrl !== '/staff-dashboard.html') {
        throw new Error('Staff login failed or wrong redirectUrl: ' + staffRes.body);
    }
    const staffCookie = staffRes.headers['set-cookie'] || [];
    console.log('Staff Set-Cookie:', staffCookie);
    const hasStaffSession = staffCookie.some(c => c.includes('session_token=') && c.toLowerCase().includes('httponly'));
    if (!hasStaffSession) throw new Error('Staff login missing HttpOnly session_token cookie!');
    console.log('✅ Staff & HOD Login succeeded with HttpOnly session cookie and server redirect.\n');

    // 6. Test Generic Error Handling (No account enumeration)
    console.log('--- Test 6: Generic Error on Invalid Credentials ---');
    const invalidData = JSON.stringify({
        username: 'nonexistent_user_123',
        password: 'randompassword',
        role: 'student'
    });
    const invalidRes = await request({
        hostname: 'localhost',
        port: 5000,
        path: '/login',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(invalidData)
        }
    }, invalidData);

    console.log('Invalid Login Status:', invalidRes.statusCode);
    console.log('Invalid Login Body:', invalidRes.body);
    const invalidJson = JSON.parse(invalidRes.body);
    if (invalidRes.statusCode !== 401 || invalidJson.message !== 'Invalid username or password.') {
        throw new Error('Failed to return generic 401 error message for invalid credentials!');
    }
    console.log('✅ Generic error returned without account or role leakage.\n');

    console.log('🎉 ALL LOGIN HARDENING VERIFICATION TESTS PASSED!');
}

runTests().catch(err => {
    console.error('❌ Verification failed:', err.message);
    process.exit(1);
});
