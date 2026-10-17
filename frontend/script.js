/* ===================================
   Student Portal Login - JavaScript
   =================================== */

const API_BASE = 'http://localhost:5000/api';

document.addEventListener('DOMContentLoaded', () => {
    // ---- State ----
    let currentRole = 'student'; // 'student' | 'staff'
    let isSignupMode = false;

    // ---- DOM Elements ----
    const roleStudentBtn = document.getElementById('roleStudent');
    const roleStaffBtn = document.getElementById('roleStaff');
    const roleGlass = document.querySelector('.role-switcher-glass');
    const loginSubtitle = document.getElementById('loginSubtitle');

    const toggleBtn = document.getElementById('togglePassword');
    const passwordInput = document.getElementById('password');
    const usernameInput = document.getElementById('username');
    const eyeOff = toggleBtn.querySelector('.eye-off');
    const eyeOn = toggleBtn.querySelector('.eye-on');

    const loginForm = document.getElementById('loginForm');
    const loginBtn = document.getElementById('loginButton');
    const btnText = loginBtn.querySelector('.btn-text');
    const btnLoader = loginBtn.querySelector('.btn-loader');
    const signupLink = document.getElementById('signupLink');
    const signupSection = document.querySelector('.signup-section');
    const forgotLink = document.getElementById('forgotPassword');

    // ---- Role Switcher Logic ----
    function setRole(role) {
        if (currentRole === role) return;
        currentRole = role;

        // Clear any stale toasts or errors
        removeToast();

        if (currentRole === 'staff') {
            roleStaffBtn.classList.add('active');
            roleStudentBtn.classList.remove('active');
            roleStaffBtn.setAttribute('aria-selected', 'true');
            roleStudentBtn.setAttribute('aria-selected', 'false');
            roleGlass.classList.add('staff-active');

            // Exit signup mode if active (staff accounts cannot be self-registered)
            if (isSignupMode) {
                exitSignupMode();
            }

            loginSubtitle.textContent = 'Enter your staff account details';
            btnText.textContent = 'Login as Staff';

            // Show staff account provision note
            renderStaffSignupNotice();
        } else {
            roleStudentBtn.classList.add('active');
            roleStaffBtn.classList.remove('active');
            roleStudentBtn.setAttribute('aria-selected', 'true');
            roleStaffBtn.setAttribute('aria-selected', 'false');
            roleGlass.classList.remove('staff-active');

            loginSubtitle.textContent = isSignupMode ? 'Create a new student account' : 'Enter your student account details';
            btnText.textContent = isSignupMode ? 'Sign Up' : 'Login';

            // Restore student signup UI
            renderStudentSignupSection();
        }
    }

    roleStudentBtn.addEventListener('click', () => setRole('student'));
    roleStaffBtn.addEventListener('click', () => setRole('staff'));

    // Keyboard navigation for role switcher (Left / Right arrow keys)
    roleStudentBtn.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight') {
            roleStaffBtn.focus();
            setRole('staff');
        }
    });

    roleStaffBtn.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft') {
            roleStudentBtn.focus();
            setRole('student');
        }
    });

    // ---- Password Visibility Toggle ----
    toggleBtn.addEventListener('click', () => {
        const isPassword = passwordInput.type === 'password';
        passwordInput.type = isPassword ? 'text' : 'password';
        eyeOff.style.display = isPassword ? 'none' : 'block';
        eyeOn.style.display = isPassword ? 'block' : 'none';
    });

    // ---- Signup UI Helpers ----
    function renderStudentSignupSection() {
        signupSection.innerHTML = `
            <span>${isSignupMode ? 'Already have an account?' : "Don't have an account?"}</span>
            <a href="#" id="signupLink" class="signup-btn">${isSignupMode ? 'Login' : 'Sign up'}</a>
        `;
        document.getElementById('signupLink').addEventListener('click', handleSignupToggle);
    }

    function renderStaffSignupNotice() {
        signupSection.innerHTML = `
            <span style="color: var(--text-muted); font-size: 0.85rem;">
                Staff accounts are provisioned by administrator.
            </span>
        `;
    }

    function exitSignupMode() {
        isSignupMode = false;
        forgotLink.style.display = '';
        btnText.textContent = currentRole === 'staff' ? 'Login as Staff' : 'Login';
        loginSubtitle.textContent = currentRole === 'staff' ? 'Enter your staff account details' : 'Enter your student account details';
        renderStudentSignupSection();
    }

    function handleSignupToggle(e) {
        e.preventDefault();
        isSignupMode = !isSignupMode;
        removeToast();

        if (isSignupMode) {
            loginSubtitle.textContent = 'Create a new student account';
            btnText.textContent = 'Sign Up';
            forgotLink.style.display = 'none';
        } else {
            loginSubtitle.textContent = 'Enter your student account details';
            btnText.textContent = 'Login';
            forgotLink.style.display = '';
        }

        renderStudentSignupSection();
        usernameInput.value = '';
        passwordInput.value = '';
    }

    // Attach initial listener to signup button
    if (signupLink) {
        signupLink.addEventListener('click', handleSignupToggle);
    }

    // ---- Form Submission (Role-Based) ----
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const username = usernameInput.value.trim();
        const password = passwordInput.value.trim();

        if (!username || !password) {
            shakeElement(loginBtn);
            showToast('Please fill in all fields', 'error');
            return;
        }

        if (isSignupMode && password.length < 6) {
            shakeElement(loginBtn);
            showToast('Password must be at least 6 characters', 'error');
            return;
        }

        // Show loading state
        btnText.style.display = 'none';
        btnLoader.style.display = 'inline-flex';
        loginBtn.disabled = true;

        try {
            const endpoint = isSignupMode ? '/signup' : '/login';
            const payload = isSignupMode
                ? { username, password, role: 'student' }
                : { username, password, role: currentRole };

            const response = await fetch(`${API_BASE}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await response.json();

            // Reset button state
            btnText.style.display = 'inline';
            btnLoader.style.display = 'none';
            loginBtn.disabled = false;

            if (data.success) {
                // Success
                loginBtn.style.background = 'linear-gradient(135deg, #10b981, #059669)';
                btnText.textContent = '✓ ' + (data.message || 'Success');
                showToast(data.message, 'success');

                setTimeout(() => {
                    loginBtn.style.background = '';
                    if (isSignupMode) {
                        // Switch back to student login after signup
                        exitSignupMode();
                        showToast('Account created! Please log in now.', 'success');
                    } else {
                        // Save session details and redirect to appropriate dashboard
                        const loggedUser = data.username || (data.user && data.user.username) || username;
                        const loggedRole = data.role || (data.user && data.user.role) || currentRole;
                        localStorage.setItem('username', loggedUser);
                        localStorage.setItem('role', loggedRole);

                        if (['staff', 'HOD OF DEP', 'admin', 'hod'].includes(loggedRole)) {
                            window.location.href = 'staff-dashboard.html';
                        } else {
                            window.location.href = 'dashboard.html';
                        }
                    }
                }, 1000);
            } else {
                // Server returned error (e.g., account not found, wrong password, role mismatch)
                shakeElement(loginBtn);
                loginBtn.style.background = 'linear-gradient(135deg, #ef4444, #dc2626)';
                btnText.textContent = '✗ Access Denied';
                showToast(data.message, 'error');

                setTimeout(() => {
                    loginBtn.style.background = '';
                    if (isSignupMode) {
                        btnText.textContent = 'Sign Up';
                    } else {
                        btnText.textContent = currentRole === 'staff' ? 'Login as Staff' : 'Login';
                    }
                }, 2200);
            }
        } catch (error) {
            // Network error
            btnText.style.display = 'inline';
            btnLoader.style.display = 'none';
            loginBtn.disabled = false;

            shakeElement(loginBtn);
            loginBtn.style.background = 'linear-gradient(135deg, #ef4444, #dc2626)';
            btnText.textContent = '✗ Connection Error';
            showToast('Cannot connect to server. Make sure the server is running.', 'error');

            setTimeout(() => {
                loginBtn.style.background = '';
                btnText.textContent = isSignupMode ? 'Sign Up' : (currentRole === 'staff' ? 'Login as Staff' : 'Login');
            }, 2500);
        }
    });

    // ---- Toast Notification System ----
    function showToast(message, type = 'info') {
        removeToast();
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.id = 'toast';
        toast.setAttribute('role', 'alert');
        toast.innerHTML = `
            <span class="toast-icon">${type === 'success' ? '✓' : type === 'error' ? '✗' : 'ℹ'}</span>
            <span class="toast-msg">${message}</span>
        `;
        document.body.appendChild(toast);

        requestAnimationFrame(() => toast.classList.add('toast-visible'));
        setTimeout(() => removeToast(), 4500);
    }

    function removeToast() {
        const existing = document.getElementById('toast');
        if (existing) {
            existing.classList.remove('toast-visible');
            setTimeout(() => existing.remove(), 250);
        }
    }

    // ---- Shake Animation ----
    function shakeElement(el) {
        el.classList.add('shake');
        setTimeout(() => el.classList.remove('shake'), 450);
    }

    // Dynamic style definitions for Toast and Shake
    const dynamicStyle = document.createElement('style');
    dynamicStyle.textContent = `
        @keyframes shakeAnim {
            0%, 100% { transform: translateX(0); }
            20% { transform: translateX(-6px); }
            40% { transform: translateX(6px); }
            60% { transform: translateX(-4px); }
            80% { transform: translateX(4px); }
        }
        .shake {
            animation: shakeAnim 0.4s ease-in-out !important;
        }

        .toast {
            position: fixed;
            top: 24px;
            right: 24px;
            max-width: 420px;
            padding: 14px 20px;
            border-radius: 12px;
            display: flex;
            align-items: center;
            gap: 12px;
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            font-size: 0.9rem;
            font-weight: 500;
            line-height: 1.4;
            z-index: 9999;
            transform: translateX(120%);
            transition: transform 0.35s cubic-bezier(0.2, 0.8, 0.2, 1);
            box-shadow: 0 10px 30px rgba(0,0,0,0.45);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
        }
        .toast-visible {
            transform: translateX(0);
        }
        .toast-success {
            background: rgba(16, 185, 129, 0.95);
            color: #fff;
            border: 1px solid rgba(255, 255, 255, 0.2);
        }
        .toast-error {
            background: rgba(220, 38, 38, 0.95);
            color: #fff;
            border: 1px solid rgba(255, 255, 255, 0.2);
        }
        .toast-info {
            background: rgba(133, 85, 232, 0.95);
            color: #fff;
            border: 1px solid rgba(255, 255, 255, 0.2);
        }
        .toast-icon {
            font-size: 1.1rem;
            font-weight: 700;
            flex-shrink: 0;
        }
    `;
    document.head.appendChild(dynamicStyle);

    // ---- Input Focus Effects ----
    const inputs = document.querySelectorAll('.input-group input');
    inputs.forEach(input => {
        input.addEventListener('focus', () => input.parentElement.classList.add('focused'));
        input.addEventListener('blur', () => input.parentElement.classList.remove('focused'));
    });

    // ---- Forgot Password ----
    forgotLink.addEventListener('click', (e) => {
        e.preventDefault();
        showToast('Password reset is managed by the portal administrator.', 'info');
    });

    // ---- Check Ejection Status ----
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('ejected') === 'phone_detected') {
        setTimeout(() => {
            showToast('🚨 Ejected: Academic integrity violation! Unauthorized mobile phone detected during the assessment.', 'error');
        }, 300);
    }
});
