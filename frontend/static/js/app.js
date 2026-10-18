(function () {
    'use strict';

    document.addEventListener('selectstart', function (e) {
        if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
            return true;
        }
        e.preventDefault();
        return false;
    }, true);

    document.addEventListener('dragstart', function (e) {
        if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
            return true;
        }
        e.preventDefault();
        return false;
    }, true);

    document.addEventListener('keydown', function (e) {
        if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A' || e.keyCode === 65)) {
            if (!e.target || (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA')) {
                e.preventDefault();
                if (window.getSelection) {
                    window.getSelection().removeAllRanges();
                }
                return false;
            }
        }
    }, true);

    document.addEventListener('mouseup', function (e) {
        if (!e.target || (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA')) {
            if (window.getSelection) {
                window.getSelection().removeAllRanges();
            }
        }
    }, true);

    var currentRole = 'student';
    var isSignUpMode = false;

    var btnStudentRole = document.getElementById('btnStudentRole');
    var btnStaffRole = document.getElementById('btnStaffRole');
    var formHeading = document.getElementById('formHeading');
    var formSubtext = document.getElementById('formSubtext');
    var alertBanner = document.getElementById('alertBanner');
    var alertIcon = document.getElementById('alertIcon');
    var alertText = document.getElementById('alertText');
    var authForm = document.getElementById('authForm');
    var fullNameGroup = document.getElementById('fullNameGroup');
    var usernameInput = document.getElementById('username');
    var passwordInput = document.getElementById('password');
    var togglePasswordBtn = document.getElementById('togglePasswordBtn');
    var eyeIcon = document.getElementById('eyeIcon');
    var eyeOffIcon = document.getElementById('eyeOffIcon');
    var forgotWrap = document.getElementById('forgotWrap');
    var forgotBtn = document.getElementById('forgotBtn');
    var submitBtn = document.getElementById('submitBtn');
    var submitBtnText = document.getElementById('submitBtnText');
    var submitBtnSpinner = document.getElementById('submitBtnSpinner');
    var bottomQuestionText = document.getElementById('bottomQuestionText');
    var toggleModeBtn = document.getElementById('toggleModeBtn');
    var bannerPortalName = document.getElementById('bannerPortalName');
    var bannerTagline = document.getElementById('bannerTagline');

    function showAlert(type, message) {
        if (!alertBanner || !alertIcon || !alertText) return;
        alertBanner.className = 'alert-banner ' + type;
        alertIcon.textContent = type === 'error' ? '⚠️' : '✅';
        alertText.textContent = message;
        alertBanner.style.display = 'flex';
    }

    function clearAlert() {
        if (!alertBanner || !alertText) return;
        alertBanner.style.display = 'none';
        alertBanner.className = 'alert-banner';
        alertText.textContent = '';
    }

    function setRole(role) {
        currentRole = role;
        clearAlert();

        if (role === 'staff') {
            btnStaffRole.classList.add('active');
            btnStaffRole.setAttribute('aria-selected', 'true');
            btnStudentRole.classList.remove('active');
            btnStudentRole.setAttribute('aria-selected', 'false');

            bannerPortalName.textContent = 'staff portal';
            bannerTagline.textContent = 'Login to access department controls';

            if (isSignUpMode) {
                setMode(false);
            }
            bottomQuestionText.textContent = 'Staff account managed by Admin';
            toggleModeBtn.style.display = 'none';
            formSubtext.textContent = 'Enter your staff / HOD account details';
        } else {
            btnStudentRole.classList.add('active');
            btnStudentRole.setAttribute('aria-selected', 'true');
            btnStaffRole.classList.remove('active');
            btnStaffRole.setAttribute('aria-selected', 'false');

            bannerPortalName.textContent = 'student portal';
            bannerTagline.textContent = 'Login to access your account';

            toggleModeBtn.style.display = 'inline-block';
            bottomQuestionText.textContent = isSignUpMode ? 'Already have an account?' : "Don't have an account?";
            formSubtext.textContent = isSignUpMode ? 'Enter your details to create an account' : 'Enter your account details';
        }
    }

    if (btnStudentRole) {
        btnStudentRole.addEventListener('click', function () {
            setRole('student');
        });
    }

    if (btnStaffRole) {
        btnStaffRole.addEventListener('click', function () {
            setRole('staff');
        });
    }

    if (togglePasswordBtn && passwordInput) {
        togglePasswordBtn.addEventListener('click', function () {
            var isPassword = passwordInput.getAttribute('type') === 'password';
            passwordInput.setAttribute('type', isPassword ? 'text' : 'password');
            if (eyeIcon) eyeIcon.style.display = isPassword ? 'none' : 'block';
            if (eyeOffIcon) eyeOffIcon.style.display = isPassword ? 'block' : 'none';
        });
    }

    function setMode(signUp) {
        isSignUpMode = signUp;
        clearAlert();

        if (isSignUpMode) {
            formHeading.textContent = 'Sign Up';
            formSubtext.textContent = 'Enter your details to create an account';
            if (fullNameGroup) fullNameGroup.style.display = 'block';
            if (forgotWrap) forgotWrap.style.display = 'none';
            submitBtnText.textContent = 'Sign Up';
            bottomQuestionText.textContent = 'Already have an account?';
            toggleModeBtn.textContent = 'Login';
        } else {
            formHeading.textContent = 'Login';
            formSubtext.textContent = currentRole === 'staff' ? 'Enter your staff / HOD account details' : 'Enter your account details';
            if (fullNameGroup) fullNameGroup.style.display = 'none';
            if (forgotWrap) forgotWrap.style.display = 'flex';
            submitBtnText.textContent = 'Login';
            bottomQuestionText.textContent = "Don't have an account?";
            toggleModeBtn.textContent = 'Sign up';
        }
    }

    if (toggleModeBtn) {
        toggleModeBtn.addEventListener('click', function () {
            setMode(!isSignUpMode);
        });
    }

    if (forgotBtn) {
        forgotBtn.addEventListener('click', function () {
            showAlert('error', 'Please contact your departmental administrator to reset credentials.');
        });
    }

    function setLoading(loading, customText) {
        if (submitBtn) submitBtn.disabled = loading;
        if (submitBtnSpinner) submitBtnSpinner.style.display = loading ? 'inline-block' : 'none';
        if (submitBtnText) submitBtnText.textContent = customText || (isSignUpMode ? 'Sign Up' : 'Login');
    }

    if (authForm) {
        authForm.addEventListener('submit', function (e) {
            e.preventDefault();
            clearAlert();

            var username = usernameInput ? usernameInput.value.trim() : '';
            var password = passwordInput ? passwordInput.value.trim() : '';

            if (!username || !password) {
                showAlert('error', 'Please fill in both username and password.');
                return;
            }

            if (isSignUpMode) {
                if (password.length < 6) {
                    showAlert('error', 'Password must be at least 6 characters.');
                    return;
                }

                setLoading(true, 'Creating account...');

                fetch('/signup', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: username, password: password })
                })
                    .then(function (res) {
                        return res.json().then(function (data) {
                            return { ok: res.ok, data: data };
                        });
                    })
                    .then(function (result) {
                        if (!result.ok || !result.data.success) {
                            showAlert('error', result.data.message || 'Registration failed. Try a different username.');
                            setLoading(false);
                            return;
                        }

                        showAlert('success', 'Student account created successfully! Switching to login...');
                        setTimeout(function () {
                            setMode(false);
                            if (usernameInput) usernameInput.value = username;
                            if (passwordInput) passwordInput.value = password;
                            setLoading(false);
                        }, 1200);
                    })
                    .catch(function () {
                        showAlert('error', 'Server error during registration. Please verify connection.');
                        setLoading(false);
                    });
            } else {
                setLoading(true, 'Signing in...');

                fetch('/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        username: username,
                        password: password,
                        role: currentRole
                    })
                })
                    .then(function (res) {
                        return res.json().then(function (data) {
                            return { ok: res.ok, data: data };
                        });
                    })
                    .then(function (result) {
                        if (!result.ok || !result.data.success) {
                            showAlert('error', result.data.message || 'Invalid username or password.');
                            setLoading(false);
                            return;
                        }

                        if (result.data.username) {
                            try {
                                localStorage.setItem('username', result.data.username);
                            } catch (_) {}
                        }

                        if (result.data.redirectUrl) {
                            window.location.href = result.data.redirectUrl;
                        } else {
                            window.location.reload();
                        }
                    })
                    .catch(function () {
                        showAlert('error', 'Unable to reach authentication server. Please check backend.');
                        setLoading(false);
                    });
            }
        });
    }
})();
