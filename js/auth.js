// Authentication Logic
const Auth = {
    async hashPassword(password, email = '') {
        return window.hashPassword(password, email);
    },

    async init() {
        // Parallelize initial checks
        const [m, user] = await Promise.all([
            this.getMaintenance(),
            SessionManager.getCurrentUser()
        ]);

        // Start maintenance banner polling (30s is enough for landing page)
        this.updateMaintBanners(m);
        setInterval(() => this.updateMaintBanners(), 30000);

        // Check for forced password change session
        if (user && user.reset_request && user.reset_request.status === 'approved') {
            this.showNewPassword();
            return;
        }

        this.showSection('landing');
    },

    // ---- Maintenance helpers ----
    async getMaintenance() {
        try {
            return await SupabaseDB.getMaintenance();
        } catch (error) {
            console.error('Error fetching maintenance:', error);
            return { enabled: false, schedules: [] };
        }
    },

    // ---- Section Switching ----
    showSection(id) {
        const overlay = document.getElementById('authOverlay');
        if (id === 'landing') {
            if (overlay) overlay.classList.remove('active');
            document.querySelectorAll('.container').forEach(c => c.style.display = 'none');
            return;
        }

        document.querySelectorAll('.container').forEach(c => c.style.display = 'none');
        const el = document.getElementById(id);
        if (overlay) overlay.classList.add('active');
        if (el) {
            el.style.display = 'block';
            // Focus first input
            const firstInput = el.querySelector('input');
            if (firstInput) firstInput.focus();
        }
    },

    showRoleAuth(role) {
        this.selectedRole = role;
        this.showLogin();
    },

    showSignup(role) {
        const targetRole = role || this.selectedRole || 'student';
        const titleEl = document.getElementById('signup-title');
        const roleEl = document.getElementById('role');
        if (titleEl) titleEl.innerText = `Sign Up as ${targetRole.charAt(0).toUpperCase() + targetRole.slice(1)}`;
        if (roleEl) roleEl.value = targetRole;
        this.showSection('signup');
    },

    showLogin() {
        const titleEl = document.querySelector('#login h2');
        if (titleEl && this.selectedRole) {
            titleEl.innerText = `Login as ${this.selectedRole.charAt(0).toUpperCase() + this.selectedRole.slice(1)}`;
        } else if (titleEl) {
            titleEl.innerText = 'Login';
        }
        this.showSection('login');
    },
    showReset() { this.showSection('reset'); },
    showNewPassword() { this.showSection('newPassword'); },

    closeAuth() {
        const overlay = document.getElementById('authOverlay');
        if (overlay) overlay.classList.remove('active');
        document.querySelectorAll('.container').forEach(c => c.style.display = 'none');
    },

    // ---- Maintenance Banners ----
    mountMaintBanners() {
        return {
            landing: document.getElementById('maintBanner'),
            signup: document.getElementById('maintBannerSignup'),
            login: document.getElementById('maintBannerLogin'),
            reset: document.getElementById('maintBannerReset'),
        };
    },

    async updateMaintBanners(existingM = null) {
        const m = existingM || await this.getMaintenance();
        const b = this.mountMaintBanners();
        const banners = [b.landing, b.signup, b.login, b.reset];
        const showText = (el, text) => { 
            if (!el) return; 
            if (text) { 
                el.style.display = 'block'; 
                el.textContent = text; 
            } else { 
                el.style.display = 'none'; 
                el.textContent = ''; 
            } 
        };
        
        if (isActiveMaintenance(m)) {
            const until = getActiveMaintenanceEnd(m);
            const remain = Math.max(0, (until || Date.now()) - Date.now());
            const h = Math.floor(remain / 3600000);
            const mm = Math.floor((remain % 3600000) / 60000);
            const ss = Math.floor((remain % 60000) / 1000);
            const msg = `System maintenance ACTIVE — restores in ${h}h ${mm}m ${ss}s (until ${new Date(until || Date.now()).toLocaleString()})`;
            banners.forEach(el => showText(el, msg));
        } else {
            const up = getUpcomingMaintenance(m);
            if (up) {
                const remain = Math.max(0, new Date(up.startAt).getTime() - Date.now());
                const h = Math.floor(remain / 3600000);
                const mm = Math.floor((remain % 3600000) / 60000);
                const ss = Math.floor((remain % 60000) / 1000);
                const msg = `Upcoming system maintenance — starts in ${h}h ${mm}m ${ss}s (at ${new Date(up.startAt).toLocaleString()})`;
                banners.forEach(el => showText(el, msg));
            } else {
                banners.forEach(el => showText(el, null));
            }
        }
    },

    redirectByRole(role) {
        if (role === 'student') window.location.href = 'student.html';
        else if (role === 'teacher') window.location.href = 'teacher.html';
        else if (role === 'admin') window.location.href = 'admin.html';
    }
};

// Global helpers (accessible from onclick)
window.showRoleAuth = (role) => Auth.showRoleAuth(role);
window.showSignup = (role) => Auth.showSignup(role);
window.showLogin = () => Auth.showLogin();
window.showReset = () => Auth.showReset();
window.showSection = (id) => Auth.showSection(id);
window.closeAuth = () => Auth.closeAuth();

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    Auth.init();

    // ---- Signup ----
    const signupForm = document.getElementById('signupForm');
    if (signupForm) {
        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const m = await Auth.getMaintenance();
            if (isActiveMaintenance(m)) {
                const untilTs = getActiveMaintenanceEnd(m);
                const untilStr = untilTs ? new Date(untilTs).toLocaleString() : 'the scheduled end time';
                alert(`System is currently undergoing maintenance. Signups are disabled until ${untilStr}.`);
                return;
            }
            const upcoming = getUpcomingMaintenance(m);
            if(upcoming){ alert(`Upcoming system maintenance: ${new Date(upcoming.startAt).toLocaleString()}`); }
            
            const fullName = (document.getElementById('fullName').value || '').trim();
            const email = normalizeEmail(document.getElementById('email').value);
            const phone = (document.getElementById('phone').value || '').trim();
            const password = document.getElementById('password').value;
            const confirm = document.getElementById('confirmPassword').value;
            const role = (document.getElementById('role').value || 'student');

            const errorEl = document.getElementById('signupError');
            errorEl.innerText = '';

            if (!fullName) {
                errorEl.innerText = 'Full name is required.';
                return;
            }
            if (!isValidEmail(email)) {
                errorEl.innerText = 'Please enter a valid email address.';
                return;
            }

            if (phone && !/^\+?[\d\s-]{10,}$/.test(phone)) {
                errorEl.innerText = 'Please enter a valid phone number (at least 10 digits).';
                return;
            }

            // Enforce limit of 3 accounts for admin and teacher roles for landing page signups
            if (role === 'admin' || role === 'teacher') {
                try {
                    const allUsers = await SupabaseDB.getUsers();
                    const roleCount = allUsers.filter(u => u.role === role).length;
                    if (roleCount >= 3) {
                        const roleName = role.charAt(0).toUpperCase() + role.slice(1);
                        errorEl.innerText = `The maximum number of ${roleName} accounts has been reached. Please contact an existing admin to create more accounts.`;
                        return;
                    }
                } catch (e) {
                    console.error(`Error checking ${role} count:`, e);
                }
            }

            const existing = await SupabaseDB.getUser(email);
            if (existing) {
                if (existing.reset_request) {
                    if (existing.reset_request.status === 'pending') {
                        errorEl.innerText = 'This account has an active password reset request pending admin review. You cannot sign up again.';
                        return;
                    }
                    if (existing.reset_request.status === 'approved') {
                        errorEl.innerText = 'This account has an approved password reset. Please use the temporary password provided to you to login.';
                        return;
                    }
                }
                errorEl.innerText = 'Account with this email already exists.';
                return;
            }
            if (password !== confirm) {
                errorEl.innerText = 'Passwords do not match.';
                return;
            }
            if (!isStrongPassword(password)) {
                errorEl.innerText = 'Password must be 8+ chars, include upper, lower, number, and special char.';
                return;
            }

            const hashedPassword = await Auth.hashPassword(password, email);
            const user = {
                full_name: fullName,
                email,
                phone,
                password: hashedPassword,
                role,
                created_at: new Date().toISOString(),
                failed_attempts: 0,
                locked_until: null,
                lockouts: 0,
                flagged: false,
                reset_request: null,
                active: true
            };
            
            const savedUser = await SupabaseDB.saveUser(user);
            if (!savedUser) {
                errorEl.innerText = 'Failed to create account. Please try again.';
                return;
            }
            
            await SessionManager.setCurrentUser(savedUser);
            alert(`Welcome ${fullName}! Your ${role} account has been created.`);
            Auth.redirectByRole(role);
        });
    }

    // ---- Login ----
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = normalizeEmail(document.getElementById('loginEmail').value);
            const emailErr = document.getElementById('loginEmailError');
            if (emailErr) emailErr.innerText = '';

            if (!isValidEmail(email)) {
                if (emailErr) emailErr.innerText = 'Please enter a valid email address.';
                return;
            }

            const m = await Auth.getMaintenance();
            if (isActiveMaintenance(m)) {
                let allow = false;
                try {
                    const user = await SupabaseDB.getUser(email);
                    allow = !!(user && user.role === 'admin');
                } catch (_) { allow = false; }
                if (!allow) {
                    const untilTs = getActiveMaintenanceEnd(m);
                    const untilStr = untilTs ? new Date(untilTs).toLocaleString() : 'the scheduled end time';
                    alert(`System is currently undergoing maintenance. Only admin login allowed until ${untilStr}.`);
                    return;
                }
            }
            const upcoming = getUpcomingMaintenance(m);
            if (upcoming) { alert(`Upcoming system maintenance: ${new Date(upcoming.startAt).toLocaleString()}`); }
            
            const password = document.getElementById('loginPassword').value;
            const user = await SupabaseDB.getUser(email);

            const passErr = document.getElementById('loginPasswordError');
            if (emailErr) emailErr.innerText = '';
            if (passErr) passErr.innerText = '';

            if (!user) {
                if (emailErr) emailErr.innerText = 'No account found with this email';
                return;
            }
            if (!user.active) {
                if (emailErr) emailErr.innerText = 'Your account has been deactivated by an administrator.';
                return;
            }
            if (user.flagged) {
                if (emailErr) emailErr.innerText = 'Your account is flagged for suspicious activities. Contact admin for support.';
                return;
            }

            // Handle expired reset requests
            if (user.reset_request && user.reset_request.expires_at && Date.now() > new Date(user.reset_request.expires_at).getTime()) {
                user.reset_request = null;
                await SupabaseDB.saveUser(user);
            }

            if (user.reset_request) {
                if (user.reset_request.status === 'pending') {
                    if (passErr) passErr.innerText = 'Password reset request pending admin review.';
                    return;
                }
                if (user.reset_request.status === 'approved') {
                    if (user.reset_request.expires_at && Date.now() > new Date(user.reset_request.expires_at).getTime()) {
                        user.reset_request = null;
                        await SupabaseDB.saveUser(user);
                        if (passErr) passErr.innerText = 'Temporary password expired. Please request a new reset.';
                        return;
                    }
                    const hashedTempInput = await Auth.hashPassword(password, email);
                    if (user.reset_request.temp_password === hashedTempInput || user.reset_request.temp_password === password) {
                        await SessionManager.setCurrentUser(user);
                        Auth.showNewPassword();
                        return;
                    } else {
                        if (passErr) passErr.innerText = 'Your reset request is approved. Please enter the temporary password provided to you.';
                        return;
                    }
                }
                if (user.reset_request.status === 'denied') {
                    if (passErr) passErr.innerText = 'Your reset request was denied. You may request a new reset.';
                    return;
                }
            }

            if (isAccountLocked(user)) {
                const mins = Math.ceil((new Date(user.locked_until).getTime() - Date.now()) / 60000);
                if (passErr) passErr.innerText = `Account is locked. Try again in ${mins} minutes`;
                return;
            }

            const hashedInput = await Auth.hashPassword(password, email);
            const legacyHashedInput = await window.legacyHashPassword(password);

            let authenticated = false;
            if (user.password === hashedInput) {
                authenticated = true;
            } else if (user.password === legacyHashedInput || user.password === password) {
                // Migrate to new salted hash
                user.password = hashedInput;
                authenticated = true;
            }

            if (!authenticated) {
                user.failed_attempts++;
                if (user.failed_attempts >= 5) {
                    user.locked_until = new Date(Date.now() + 30 * 60000).toISOString();
                    user.failed_attempts = 0;
                    user.lockouts++;
                    if (user.lockouts >= 3) user.flagged = true;
                    if (passErr) passErr.innerText = 'Too many failed attempts. Account locked for 30 minutes';
                } else {
                    const remain = 5 - user.failed_attempts;
                    if (passErr) passErr.innerText = `Invalid password. ${remain} attempts remaining`;
                }
                await SupabaseDB.saveUser(user);
                return;
            }

            user.failed_attempts = 0;
            user.locked_until = null;
            await SupabaseDB.saveUser(user);
            await SessionManager.setCurrentUser(user);

            alert(`Welcome back ${user.full_name}!`);
            Auth.redirectByRole(user.role);
        });
    }

    // ---- Reset Request ----
    const resetForm = document.getElementById('resetForm');
    if (resetForm) {
        resetForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = normalizeEmail(document.getElementById('resetEmail').value);
            const m = await Auth.getMaintenance();
            const err = document.getElementById('resetError');
            if (err) err.innerText = '';

            if (isActiveMaintenance(m)) {
                try {
                    const user = await SupabaseDB.getUser(email);
                    if (!(user && user.role === 'admin')) {
                        const untilTs = getActiveMaintenanceEnd(m);
                        const untilStr = untilTs ? new Date(untilTs).toLocaleString() : 'the scheduled end time';
                        if (err) err.innerText = `System is currently undergoing maintenance. No reset allowed until ${untilStr}.`;
                        return;
                    }
                } catch (_) {
                    const untilTs = getActiveMaintenanceEnd(m);
                    const untilStr = untilTs ? new Date(untilTs).toLocaleString() : 'the scheduled end time';
                    if (err) err.innerText = `System is currently undergoing maintenance. No reset allowed until ${untilStr}.`;
                    return;
                }
            }
            const upcoming = getUpcomingMaintenance(m);
            if (upcoming) { if (err) err.innerText = `Upcoming system maintenance: ${new Date(upcoming.startAt).toLocaleString()}`; }
            
            const user = await SupabaseDB.getUser(email);
            if (!user) {
                if (err) err.innerText = 'No account found with this email';
                return;
            }
            if (!user.active) {
                if (err) err.innerText = 'Your account has been deactivated.';
                return;
            }
            if (user.flagged) {
                if (err) err.innerText = 'Your account is flagged for suspicious activities. Contact admin for support.';
                return;
            }
            if (isAccountLocked(user)) {
                if (err) err.innerText = 'Your account is locked due to failed attempts. Try again later.';
                return;
            }

            // Expire old reset automatically
            if (user.reset_request && user.reset_request.expires_at && Date.now() > new Date(user.reset_request.expires_at).getTime()) {
                user.reset_request = null;
            }

            if (user.reset_request) {
                if (user.reset_request.status === 'pending') {
                    if (err) err.innerText = 'Reset request already pending review.';
                    return;
                }
                if (user.reset_request.status === 'approved') {
                    if (err) err.innerText = 'Reset already approved. Please use your temporary password to login.';
                    return;
                }
            }

            user.reset_request = {
                status: 'pending',
                temp_password: null,
                created_at: new Date().toISOString(),
                expires_at: null,
                denial_reason: null
            };

            await Promise.all([
                SupabaseDB.saveUser(user),
                SupabaseDB.createNotification(
                    user.email,
                    'Reset Requested',
                    'Password reset requested and pending admin review.',
                    null,
                    'reset_requested'
                )
            ]);
            alert('Password reset request submitted. Admin will review it.');
            Auth.showLogin();
        });
    }

    // ---- New Password ----
    const newPasswordForm = document.getElementById('newPasswordForm');
    if (newPasswordForm) {
        newPasswordForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            let user = await SessionManager.getCurrentUser();

            const newPass = document.getElementById('newPass').value;
            const confirm = document.getElementById('confirmNewPass').value;

            const err = document.getElementById('newPasswordError');
            if (err) err.innerText = '';

            if (!user) {
                if (err) err.innerText = 'Session expired. Please login again with temporary password.';
                Auth.showLogin();
                return;
            }

            // Validate reset approval still valid
            const freshUser = await SupabaseDB.getUser(user.email);
            if (!freshUser.reset_request || freshUser.reset_request.status !== 'approved') {
                if (err) err.innerText = 'No active reset found. Please request a new reset.';
                Auth.showReset();
                return;
            }
            if (freshUser.reset_request.expires_at && Date.now() > new Date(freshUser.reset_request.expires_at).getTime()) {
                freshUser.reset_request = null;
                await SupabaseDB.saveUser(freshUser);
                if (err) err.innerText = 'Temporary password expired. Please request a new reset.';
                Auth.showReset();
                return;
            }

            if (newPass !== confirm) {
                if (err) err.innerText = 'Passwords do not match.';
                return;
            }
            if (!isStrongPassword(newPass)) {
                if (err) err.innerText = 'Password must be at least 8 chars with letters and numbers.';
                return;
            }

            // update password and clear reset request
            freshUser.password = await Auth.hashPassword(newPass, freshUser.email);
            freshUser.reset_request = null;

            await Promise.all([
                SupabaseDB.saveUser(freshUser),
                SupabaseDB.createNotification(
                    freshUser.email,
                    'Password Updated',
                    'Password updated after reset.',
                    null,
                    'password_updated'
                )
            ]);
            await SessionManager.setCurrentUser(freshUser);

            alert('Password successfully reset. You can now login with your new password.');
            Auth.showLogin();
        });
    }
});
