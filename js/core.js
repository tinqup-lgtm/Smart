// Global Utilities
window.isAccountLocked = function(user) {
    return !!(user && user.locked_until && Date.now() < new Date(user.locked_until).getTime());
};

window.isActiveMaintenance = function(m) {
    if (!m) return false;
    if (m.enabled) return true; // Master manual override
    const now = new Date().getTime();
    const schedules = Array.isArray(m.schedules) ? m.schedules : [];
    return schedules.some(s => now >= new Date(s.startAt).getTime() && now <= new Date(s.endAt).getTime());
};

window.getUpcomingMaintenance = function(m) {
    const now = new Date().getTime();
    const schedules = (Array.isArray(m.schedules) ? m.schedules : []).filter(s => new Date(s.startAt).getTime() > now).sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
    return schedules[0] || null;
};

window.getActiveMaintenanceEnd = function(m) {
    const now = new Date().getTime();
    if (m && m.manual_until) {
        const end = new Date(m.manual_until).getTime();
        if (now < end) return end;
    }
    const s = (Array.isArray(m.schedules) ? m.schedules : []).find(s => now >= new Date(s.startAt).getTime() && now <= new Date(s.endAt).getTime());
    return s ? new Date(s.endAt).getTime() : null;
};

window.normalizeEmail = function(email) {
    return (email || '').trim().toLowerCase();
};

window.isValidEmail = function(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
};

window.isValidUrl = function(string) {
    try {
        const url = new URL(string);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch (_) {
        return false;
    }
};

window.extractYoutubeId = function(url) {
    if (!url) return null;
    const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/i;
    const match = url.match(regex);
    return match ? match[1] : null;
};

window.isStrongPassword = function(pass) {
    if (!pass || pass.length < 8) return false;
    const hasUpper = /[A-Z]/.test(pass);
    const hasLower = /[a-z]/.test(pass);
    const hasNumber = /\d/.test(pass);
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>[\]\\/`~;:'"-=+]/.test(pass);
    return hasUpper && hasLower && hasNumber && hasSpecial;
};

/**
 * Generates a secure temporary password meeting strength requirements.
 * Includes exactly one special character, uppercase, lowercase, and numbers.
 * Minimum 10 characters for added security.
 */
window.generateTempPassword = function() {
    const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const lower = "abcdefghijklmnopqrstuvwxyz";
    const nums = "0123456789";
    const specials = "!@#$%^&*()_+"; // Defined safe subset of predefined characters

    const getRandom = (chars) => {
        const array = new Uint32Array(1);
        crypto.getRandomValues(array);
        return chars[array[0] % chars.length];
    };

    // Ensure at least one of each required category (except special which is exactly one)
    let pwd = [
        getRandom(upper),
        getRandom(lower),
        getRandom(nums),
        getRandom(specials)
    ];

    // Fill remaining to reach length 10 using alphanumeric only to keep special char count at exactly one
    const alphanumeric = upper + lower + nums;
    while (pwd.length < 10) {
        pwd.push(getRandom(alphanumeric));
    }

    // Fisher-Yates shuffle
    for (let i = pwd.length - 1; i > 0; i--) {
        const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
        [pwd[i], pwd[j]] = [pwd[j], pwd[i]];
    }

    return pwd.join('');
};

window.updatePasswordStrength = function(password) {
    const meter = document.getElementById('passwordStrength');
    const container = document.getElementById('passwordStrengthContainer');
    if (!meter || !container) return;

    if (!password) {
        meter.style.width = '0';
        container.style.display = 'none';
        return;
    }

    container.style.display = 'block';
    let strength = 0;
    if (password.length >= 8) strength += 20;
    if (password.length >= 12) strength += 10;
    if (/[A-Z]/.test(password)) strength += 20;
    if (/[a-z]/.test(password)) strength += 10;
    if (/[0-9]/.test(password)) strength += 20;
    if (/[!@#$%^&*(),.?":{}|<>[\]\\/`~;:'"-=+]/.test(password)) strength += 20;

    meter.style.width = Math.min(100, strength) + '%';

    if (strength <= 40) meter.style.backgroundColor = 'var(--danger)';
    else if (strength <= 60) meter.style.backgroundColor = 'var(--warn)';
    else if (strength <= 80) meter.style.backgroundColor = '#4299e1'; // Blue
    else meter.style.backgroundColor = 'var(--ok)';
};

window.togglePasswordVisibility = function(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const toggle = input.parentElement?.querySelector('.password-toggle');
    const isPassword = input.type === 'password';
    input.type = isPassword ? 'text' : 'password';
    if (toggle) toggle.textContent = isPassword ? '🔒' : '👁️';
};

window.hashPassword = async function(password, salt = '') {
    const encoder = new TextEncoder();
    const systemSalt = 'smart-lms-v1-';
    const data = encoder.encode(systemSalt + salt + password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

window.legacyHashPassword = async function(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

// Common Utilities
window.escapeHtml = function(s) {
    if (s === null || s === undefined) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
};

window.escapeAttr = function(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
};

// Common UI and Logic
const UI = {
    renderStats(containerId, stats) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = `
            <div class="stats-grid">
                ${stats.map(s => `
                    <div class="stat-card">
                        <h4>${escapeHtml(s.label)}</h4>
                        <div class="value">${escapeHtml(s.value)}</div>
                    </div>
                `).join('')}
            </div>
        `;
    },

    isEmbeddable(url) {
        if (!url) return true;
        const restricted = ['meet.google.com', 'zoom.us', 'teams.microsoft.com', 'webex.com'];
        return !restricted.some(domain => url.toLowerCase().includes(domain));
    },

    showMeetingChoice(url = '') {
        return new Promise((resolve) => {
            const embeddable = this.isEmbeddable(url);
            const backdrop = document.createElement('div');
            backdrop.className = 'modal-backdrop';
            backdrop.style.display = 'flex';
            backdrop.innerHTML = `
                <div class="modal" style="max-width:400px; text-align:center">
                    <h3>Join Meeting</h3>
                    <p class="small">${embeddable ? 'How would you like to open this meeting?' : 'This meeting provider does not allow embedding. Please open in a new tab.'}</p>
                    <div class="flex-column gap-10 mt-20">
                        ${embeddable ? '<button class="button" id="choiceApp">Open in App (Embed)</button>' : ''}
                        <button class="button ${embeddable ? 'secondary' : ''}" id="choiceTab">Open in New Tab</button>
                        <button class="button danger small" id="choiceCancel">Cancel</button>
                    </div>
                </div>
            `;
            document.body.appendChild(backdrop);

            const cleanup = (val) => {
                backdrop.remove();
                resolve(val);
            };

            if (embeddable) document.getElementById('choiceApp').onclick = () => cleanup('app');
            document.getElementById('choiceTab').onclick = () => cleanup('tab');
            document.getElementById('choiceCancel').onclick = () => cleanup(null);
        });
    },

    showNotification(message, type = 'info') {
        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            container.className = 'toast-container';
            document.body.appendChild(container);
        }
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(() => {
            toast.style.animation = 'toastOut 0.3s ease forwards';
            setTimeout(() => toast.remove(), 3000);
        }, 3000);
    },

    showLoading(containerId = 'pageContent', message = 'Loading content...') {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = `
            <div class="loading-state flex-center flex-column p-40">
                <div class="loading-spinner mb-20"></div>
                <div class="text-muted">${escapeHtml(message)}</div>
            </div>
        `;
    },

    hideLoading(containerId = 'pageContent') {
        const container = document.getElementById(containerId);
        if (container) container.innerHTML = '';
    },

    renderTable(containerId, headers, data, renderRowFn, options = {}) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const { emptyMessage = 'No records found.', tableClass = 'm-0' } = options;

        if (!data || data.length === 0) {
            container.innerHTML = `<div class="empty">${emptyMessage}</div>`;
            return;
        }

        container.innerHTML = `
            <div class="card p-0" style="overflow-x:auto">
                <table class="${tableClass}">
                    <thead>
                        <tr>
                            ${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        ${data.map(item => renderRowFn(item)).join('')}
                    </tbody>
                </table>
            </div>
        `;
    },

    confirm(message, title = 'Confirm Action') {
        return new Promise((resolve) => {
            const backdrop = document.createElement('div');
            backdrop.className = 'modal-backdrop';
            backdrop.style.display = 'flex';
            backdrop.innerHTML = `
                <div class="modal" style="max-width:400px; text-align:center">
                    <h3>${escapeHtml(title)}</h3>
                    <p class="small">${escapeHtml(message)}</p>
                    <div class="flex gap-10 mt-20">
                        <button class="button danger" id="confirmYes">Confirm</button>
                        <button class="button secondary" id="confirmNo">Cancel</button>
                    </div>
                </div>
            `;
            document.body.appendChild(backdrop);
            document.getElementById('confirmYes').onclick = () => { backdrop.remove(); resolve(true); };
            document.getElementById('confirmNo').onclick = () => { backdrop.remove(); resolve(false); };
        });
    },

    prompt(message, placeholder = '', title = 'Input Required') {
        return new Promise((resolve) => {
            const backdrop = document.createElement('div');
            backdrop.className = 'modal-backdrop';
            backdrop.style.display = 'flex';
            backdrop.innerHTML = `
                <div class="modal" style="max-width:400px">
                    <h3>${escapeHtml(title)}</h3>
                    <p class="small">${escapeHtml(message)}</p>
                    <input type="text" id="promptInput" class="mt-10" placeholder="${escapeAttr(placeholder)}">
                    <div class="flex gap-10 mt-20">
                        <button class="button" id="promptOk">OK</button>
                        <button class="button secondary" id="promptCancel">Cancel</button>
                    </div>
                </div>
            `;
            document.body.appendChild(backdrop);
            const input = document.getElementById('promptInput');
            input.focus();
            document.getElementById('promptOk').onclick = () => {
                const val = input.value;
                backdrop.remove();
                resolve(val);
            };
            document.getElementById('promptCancel').onclick = () => { backdrop.remove(); resolve(null); };
        });
    },

    clearCountdowns(activeCountdownsArray, specialTimer = null) {
        if (Array.isArray(activeCountdownsArray)) {
            activeCountdownsArray.forEach(c => {
                if (c && typeof c.destroy === 'function') c.destroy();
            });
            activeCountdownsArray.length = 0;
        }
        if (specialTimer && typeof specialTimer.destroy === 'function') {
            specialTimer.destroy();
        }
    },

    viewFile(url, title) {
        const backdrop = document.createElement('div');
        backdrop.className = 'modal-backdrop';
        backdrop.style.display = 'flex';

        const ext = url.split('.').pop().toLowerCase().split('?')[0];
        const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext);
        const isOffice = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext);
        const isCsv = ext === 'csv';

        let viewerHtml = '';
        if (isImage) {
            viewerHtml = `<div style="flex:1; display:flex; align-items:center; justify-content:center; background:#f0f0f0; border-radius:8px; overflow:auto">
                <img src="${escapeAttr(url)}" style="max-width:100%; max-height:100%; object-fit:contain">
            </div>`;
        } else if (isOffice || isCsv) {
            // Office and CSV are best viewed via Google Docs viewer for in-app preview
            const viewerUrl = `https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`;
            viewerHtml = `<div style="flex:1; background:#f0f0f0; border-radius:8px; overflow:hidden; position:relative">
                <iframe src="${viewerUrl}" style="width:100%; height:100%; border:none"></iframe>
                <div class="absolute bottom-10 right-10 flex gap-5">
                    <a href="${escapeAttr(url)}" target="_blank" class="button secondary small w-auto" style="background:rgba(255,255,255,0.9)">Download Original</a>
                </div>
            </div>`;
        } else {
            // Default to iframe for PDF and others
            viewerHtml = `<div style="flex:1; background:#f0f0f0; border-radius:8px; overflow:hidden">
                <iframe src="${escapeAttr(url)}" style="width:100%; height:100%; border:none"></iframe>
            </div>`;
        }

        backdrop.innerHTML = `
            <div class="modal" style="width:95%; max-width:1200px; height:95vh; display:flex; flex-direction:column">
                <div class="flex-between mb-10">
                    <h3 class="m-0">${escapeHtml(title)}</h3>
                    <div class="flex gap-10">
                        <a href="${escapeAttr(url)}" download class="button secondary w-auto small">Download</a>
                        <button class="button secondary w-auto small" onclick="this.closest('.modal-backdrop').remove()">Close</button>
                    </div>
                </div>
                ${viewerHtml}
            </div>
        `;
        document.body.appendChild(backdrop);
    }
};

// Global init for all dashboards
async function initDashboard(role) {
    // 1. Initialize UI interactions immediately
    const toggle = document.getElementById('sidebarToggle');
    if (toggle) {
        // Use a persistent listener to avoid issues with cloning if called multiple times
        if (!toggle.hasAttribute('data-listener')) {
            toggle.setAttribute('data-listener', 'true');
            toggle.addEventListener('click', (e) => {
                e.stopPropagation();
                if (window.innerWidth <= 1024) {
                    document.body.classList.toggle('sidebar-open');
                } else {
                    document.body.classList.toggle('sidebar-collapsed');
                }
            });
        }
    }

    if (!document.documentElement.hasAttribute('data-global-click')) {
        document.documentElement.setAttribute('data-global-click', 'true');
        document.addEventListener('click', (e) => {
            if (window.innerWidth <= 1024 && document.body.classList.contains('sidebar-open')) {
                const sidebar = document.querySelector('.sidebar, aside');
                if (sidebar && !sidebar.contains(e.target)) {
                    document.body.classList.remove('sidebar-open');
                }
            }
        });
    }

    const navButtons = document.querySelectorAll('nav button');
    navButtons.forEach(btn => {
        if (!btn.hasAttribute('data-listener')) {
            btn.setAttribute('data-listener', 'true');
            btn.addEventListener('click', () => {
                if (window.innerWidth <= 1024) {
                    document.body.classList.remove('sidebar-open');
                }
            });
        }
    });

    // 2. Auth checks
    const user = await SessionManager.getCurrentUser();

    // Start idle management if user is logged in
    if (user) {
        IdleManager.init();
    }

    if (!user || user.role !== role) {
        if (!window.location.href.includes('index.html')) {
            alert(`Please login as a ${role}`);
            window.location.href = 'index.html';
        }
        return null;
    }

    // Initialize SessionGuard and perform initial validation
    if (typeof SessionGuard !== 'undefined') {
        SessionGuard.init();
        await SessionGuard.validate(true);
    }

    // Force password change if reset is approved but not yet completed
    try {
        const freshUser = await SupabaseDB.getUser(user.email);

        // Strengthened RBAC: Verify role against database
        if (!freshUser || freshUser.role !== role) {
            alert(`Unauthorized access. Please login as a ${role}`);
            window.location.href = 'index.html';
            return null;
        }

        if (freshUser.reset_request && freshUser.reset_request.status === 'approved') {
            alert('You must change your password before continuing.');
            window.location.href = 'index.html';
            return null;
        }
    } catch (e) {
        console.warn('Dashboard init check failed:', e);
    }

    return user;
}

// Register Service Worker (only on supported protocols like https or http://localhost)
if ('serviceWorker' in navigator && (window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
    });
}

// Request notification permission
async function requestNotificationPermission() {
    if ('Notification' in window) {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
        }
    }
}

// PWA Install Logic
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    // Centralize the installprompt banner on the landing page only
    const isLandingPage = window.location.pathname === '/' || window.location.pathname.endsWith('index.html') || window.location.pathname.endsWith('/');
    if (!isLandingPage) return;

    e.preventDefault();
    deferredPrompt = e;

    // Show a custom install button or banner after 10 seconds of active interaction
    // We check if it's the first time in the current session
    if (!sessionStorage.getItem('installPromptShown')) {
        setTimeout(() => {
            if (deferredPrompt) {
                UI.showNotification('Install SmartLMS App for offline access and a better experience! Tap here to install.', 'info');
                sessionStorage.setItem('installPromptShown', 'true');
                const toasts = document.querySelectorAll('.toast');
                const lastToast = toasts[toasts.length - 1];
                if (lastToast) {
                    lastToast.style.cursor = 'pointer';
                    lastToast.onclick = async () => {
                        if (deferredPrompt) {
                            try {
                                await deferredPrompt.prompt();
                                await deferredPrompt.userChoice;
                            } catch (err) {
                                console.warn('Install prompt error:', err);
                            } finally {
                                deferredPrompt = null;
                            }
                        }
                        lastToast.remove();
                    };
                }
            }
        }, 10000);
    }
});

window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
});

// Global notification system
const NotificationManager = {
    _polling: false,

    async fetchNotifications() {
        try {
            const user = await SessionManager.getCurrentUser();
            if (!user) return [];

            // 1. Fetch personal notifications and active broadcasts
            // RLS now handles role and course-specific filtering for broadcasts
            const [personalRes, broadcastsRes] = await Promise.all([
                SupabaseDB.getNotifications(user.email),
                SupabaseDB.getBroadcasts()
            ]);

            const personal = personalRes.data || [];
            const broadcasts = broadcastsRes.data || [];

            // 2. Filter broadcasts based on recency (e.g. last 14 days)
            const recentDate = new Date();
            recentDate.setDate(recentDate.getDate() - 14);

            const relevantBroadcasts = broadcasts.filter(b => new Date(b.created_at) >= recentDate);

            // 3. Filter out cleared broadcasts
            const clearedBroadcasts = JSON.parse(localStorage.getItem(`cleared_broadcasts_${user.email}`) || '[]');
            const activeBroadcasts = relevantBroadcasts.filter(b => !clearedBroadcasts.includes(b.id));

            // 4. Mark broadcasts as "read" locally using localStorage
            const readBroadcasts = JSON.parse(localStorage.getItem(`read_broadcasts_${user.email}`) || '[]');
            const mappedBroadcasts = activeBroadcasts.map(b => ({
                ...b,
                is_read: readBroadcasts.includes(b.id),
                is_broadcast: true
            }));

            // 5. Combine and sort
            return [...personal, ...mappedBroadcasts].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        } catch (e) {
            console.warn('Failed to fetch notifications:', e);
            UI.showNotification('Could not update notifications. Retrying...', 'error');
            return [];
        }
    },

    async getPreferences() {
        const user = await SessionManager.getCurrentUser();
        if (!user) return { email: true, push: true, inApp: true };
        const fresh = await SupabaseDB.getUser(user.email);
        return fresh?.notification_preferences || { email: true, push: true, inApp: true };
    },

    async updatePreferences(prefs) {
        const user = await SessionManager.getCurrentUser();
        if (!user) return;
        const fresh = await SupabaseDB.getUser(user.email);
        await SupabaseDB.saveUser({ ...fresh, notification_preferences: prefs });
        UI.showNotification('Notification preferences updated.');
    },


    async markAllAsRead() {
        const user = await SessionManager.getCurrentUser();
        if (!user) return;

        try {
            const notifications = await this.fetchNotifications();

            // Mark personal notifications in DB
            await SupabaseDB.markNotificationsAsRead(user.email);

            // Mark broadcasts in localStorage
            const broadcastIds = notifications.filter(n => n.is_broadcast).map(n => n.id);
            const readBroadcasts = JSON.parse(localStorage.getItem(`read_broadcasts_${user.email}`) || '[]');
            const updatedRead = [...new Set([...readBroadcasts, ...broadcastIds])];
            localStorage.setItem(`read_broadcasts_${user.email}`, JSON.stringify(updatedRead));

            this.updateUI();
            UI.showNotification('All notifications marked as read', 'success');
        } catch (e) {
            console.error('Failed to mark all as read:', e);
        }
    },

    async clearAll() {
        if (!confirm('Are you sure you want to clear all notification history? Broadcasts will also be hidden.')) return;

        const user = await SessionManager.getCurrentUser();
        if (!user) return;

        try {
            const notifications = await this.fetchNotifications();

            // Clear broadcasts by saving their IDs to cleared_broadcasts
            const broadcastIds = notifications.filter(n => n.is_broadcast).map(n => n.id);
            const clearedBroadcasts = JSON.parse(localStorage.getItem(`cleared_broadcasts_${user.email}`) || '[]');
            const updatedCleared = [...new Set([...clearedBroadcasts, ...broadcastIds])];
            localStorage.setItem(`cleared_broadcasts_${user.email}`, JSON.stringify(updatedCleared));

            // Actually delete personal notifications for this user using SupabaseDB
            await SupabaseDB.deleteNotifications(user.email);
            this.updateUI();
            UI.showNotification('Notifications cleared', 'info');
        } catch (e) {
            console.error('Failed to clear notifications:', e);
            UI.showNotification('Error clearing notifications', 'error');
        }
    },

    async updateUI() {
        const notifications = await this.fetchNotifications();
        const unreadCount = notifications.filter(n => !n.is_read).length;
        
        const unreadBadge = document.getElementById('unreadCount');
        if (unreadBadge) {
            unreadBadge.textContent = unreadCount;
            unreadBadge.style.display = unreadCount > 0 ? 'flex' : 'none';
        }

        const list = document.getElementById('notifList');
        if (list) {
            try {
            const itemsHtml = notifications.map(n => `
                <div class="notif-item" style="padding:12px; border-bottom:1px solid #f0f0f0; background:${n.is_read ? '#fff' : '#f0f4ff'}; cursor:pointer; transition: background 0.2s"
                        onclick="NotificationManager.handleNotificationClick('${n.id}', ${!!n.is_broadcast}, '${n.link || ''}')">
                    <div style="display:flex; justify-content:space-between; align-items:start">
                        <div style="font-weight:600; font-size:13px; color:var(--text)">${n.is_broadcast ? '📢 ' : ''}${escapeHtml(n.title)}</div>
                        ${!n.is_read ? '<div style="width:8px; height:8px; background:var(--purple); border-radius:50%; margin-top:4px"></div>' : ''}
                    </div>
                    <div style="font-size:12px; color:#555; margin-top:4px; line-height:1.4">${escapeHtml(n.message)}</div>
                    <div style="font-size:10px; color:#999; margin-top:8px; display:flex; justify-content:space-between">
                        <span>${new Date(n.created_at).toLocaleString()}</span>
                        ${n.is_broadcast ? '<span style="color:var(--purple); font-weight:bold">BROADCAST</span>' : ''}
                    </div>
                </div>
            `).join('');

            list.innerHTML = `
                <div style="padding:12px; border-bottom:1px solid #eee; display:flex; justify-content:space-between; align-items:center; background:#fafafa; position:sticky; top:0; z-index:10">
                    <div class="flex-center-y gap-10">
                        <button class="button secondary tiny" style="width:24px; height:24px; padding:0; margin:0; display:flex; align-items:center; justify-content:center; border-radius:50%" onclick="document.getElementById('notifList').classList.remove('active'); event.stopPropagation();">✕</button>
                        <strong style="font-size:14px">Notifications</strong>
                    </div>
                    <div class="flex gap-5">
                        <button class="button secondary tiny" style="width:auto; margin:0" onclick="NotificationManager.markAllAsRead(); event.stopPropagation();">Mark Read</button>
                        <button class="button danger tiny" style="width:auto; margin:0; background:#fee2e2; color:#b91c1c" onclick="NotificationManager.clearAll(); event.stopPropagation();">Clear All</button>
                    </div>
                </div>
                <div class="notif-items-container" style="max-height:350px; overflow-y:auto; scroll-behavior: smooth;">
                    ${notifications.length === 0 ? '<div style="padding:40px 20px; text-align:center; color:#999"><div style="font-size:32px; margin-bottom:10px">🔔</div>No notifications yet</div>' : itemsHtml}
                </div>
            `;

            // Ensure the view scrolls to the last message if they are plenty
            const container = list.querySelector('.notif-items-container');
            if (container && notifications.length > 0) {
                container.style.paddingBottom = '20px';
                // Use a small timeout to ensure the DOM is rendered before scrolling
                setTimeout(() => {
                    container.scrollTop = container.scrollHeight;
                }, 100);
            }
            } catch (e) {
                console.warn('Error updating notif list:', e);
                list.innerHTML = '<div style="padding:10px">Could not load notifications.</div>';
            }
        }
        
        // Browser notification for new unread ones
        const user = await SessionManager.getCurrentUser();
        if (user) {
            const storageKey = `last_notified_id_${user.email}`;
            const lastNotifiedId = localStorage.getItem(storageKey);

            // Newest notifications are first in the list
            const latest = notifications.find(n => !n.is_read);

            if (latest && latest.id !== lastNotifiedId) {
                this.sendBrowserNotification(latest.title, latest.message);
                localStorage.setItem(storageKey, latest.id);
            } else if (!latest) {
                // If all are read, clear the tracker so the next new one triggers correctly
                localStorage.removeItem(storageKey);
            }
        }
    },

    async handleNotificationClick(id, isBroadcast, link) {
        if (isBroadcast) {
            this.markBroadcastRead(id);
        } else {
            try {
                const user = await SessionManager.getCurrentUser();
                if (user) {
                    await SupabaseDB.markNotificationsAsRead(user.email, id);
                    this.updateUI();
                }
            } catch (e) {
                console.warn('Failed to mark notification as read:', e);
            }
        }
        if (link) {
            // Internal deep linking support
            if (link.startsWith('student.html') || link.startsWith('teacher.html') || link.startsWith('admin.html')) {
                const url = new URL(link, window.location.origin);
                const page = url.searchParams.get('page');

                // If we are already on the same dashboard, use internal navigation
                const currentDashboard = window.location.pathname.split('/').pop();
                const targetDashboard = link.split('?')[0];

                if (currentDashboard === targetDashboard && page) {
                    const navBtn = document.querySelector(`nav button[data-page="${page}"]`);
                    if (navBtn) {
                        navBtn.click();
                        // Close notification list
                        document.getElementById('notifList')?.classList.remove('active');
                        return;
                    }
                }
            }
            window.location.href = link;
        }
    },

    markBroadcastRead(id) {
        SessionManager.getCurrentUser().then(user => {
            if (!user) return;
            const readBroadcasts = JSON.parse(localStorage.getItem(`read_broadcasts_${user.email}`) || '[]');
            if (!readBroadcasts.includes(id)) {
                readBroadcasts.push(id);
                localStorage.setItem(`read_broadcasts_${user.email}`, JSON.stringify(readBroadcasts));
                this.updateUI();
            }
        });
    },

    async renderSettings(containerId, pushDesc = 'Enable real-time desktop notifications.') {
        const container = document.getElementById(containerId);
        if (!container) return;

        const prefs = await this.getPreferences();

        container.innerHTML = `
            <div class="card">
                <h3 class="m-0">Notification Preferences</h3>
                <p class="small mt-5">Choose how you want to receive updates across different channels.</p>
                <div class="flex-column gap-15 mt-20">
                    <label class="flex-center-y gap-10"><input type="checkbox" id="prefInApp" ${prefs.inApp ? 'checked' : ''} class="w-auto m-0"> In-App Notifications</label>
                    <label class="flex-center-y gap-10"><input type="checkbox" id="prefPush" ${prefs.push ? 'checked' : ''} class="w-auto m-0"> Browser Push Notifications</label>
                    <label class="flex-center-y gap-10"><input type="checkbox" id="prefEmail" ${prefs.email ? 'checked' : ''} class="w-auto m-0"> Email Alerts</label>
                    <button class="button w-auto mt-10 px-40" onclick="NotificationManager.saveSettings()">Save Preferences</button>
                </div>
            </div>
            <div class="card mt-20">
                <h3 class="m-0">System Integration</h3>
                <p class="small mt-5">${escapeHtml(pushDesc)}</p>
                <button class="button secondary w-auto mt-15 px-40" onclick="NotificationManager.subscribeToPush()">Enable Browser Push</button>
            </div>
        `;
    },

    async saveSettings() {
        const prefs = {
            inApp: document.getElementById('prefInApp').checked,
            push: document.getElementById('prefPush').checked,
            email: document.getElementById('prefEmail').checked
        };
        await this.updatePreferences(prefs);
    },

    async sendBrowserNotification(title, body) {
        if (!('Notification' in window) || Notification.permission !== 'granted') return;

        try {
            const options = {
                body,
                icon: 'favicon.ico',
                badge: 'favicon.ico',
                tag: 'smartlms-notif',
                renotify: true
            };

            // Try to use service worker registration if available
            if ('serviceWorker' in navigator) {
                const reg = await navigator.serviceWorker.ready;
                reg.showNotification(title, options);
            } else {
                new Notification(title, options);
            }
        } catch (e) {
            console.warn('Failed to send browser notification:', e);
        }
    },

    async subscribeToPush() {
        if (!('Notification' in window)) {
            UI.showNotification('Push notifications are not supported by your browser.', 'error');
            return;
        }

        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            UI.showNotification('Push notifications enabled successfully!', 'success');
            // Logic for actual push token registration would go here
        } else {
            UI.showNotification('Notification permission was denied.', 'warn');
        }
    },

    initPolling() {
        if (this._polling) return;
        this._polling = true;
        this.updateUI();
        setInterval(() => this.updateUI(), 60000); // Poll every 60s
        
        // Request browser permission if not set
        if (Notification.permission === 'default') {
            requestNotificationPermission();
        }

        // Global event delegation for the notification bell
        if (!document.documentElement.hasAttribute('data-notif-listener')) {
            document.documentElement.setAttribute('data-notif-listener', 'true');
            document.addEventListener('click', (e) => {
                const bell = e.target.closest('#notifBell') || e.target.closest('#unreadCount');
                const list = document.getElementById('notifList');

                if (bell) {
                    e.stopPropagation();
                    if (list) {
                        const isActive = list.classList.contains('active');
                        // Close all other dropdowns if any, then toggle this one
                        document.querySelectorAll('.notif-list.active').forEach(el => el.classList.remove('active'));
                        if (!isActive) list.classList.add('active');
                    }
                } else if (list && list.classList.contains('active')) {
                    if (!list.contains(e.target)) {
                        list.classList.remove('active');
                    }
                }
            });
        }
    },

    initRealtimeSubscriptions(email, role, onTableChange = null) {
        if (!window.supabaseClient) return;

        const channel = window.supabaseClient.channel(`${role}-db-changes`);

        // Always subscribe to personal notifications
        channel.on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_email=eq.${email}` }, () => {
            SupabaseDB.invalidateCache(`notifications_${email}`);
            this.updateUI();
        });

        channel.on('postgres_changes', { event: '*', schema: 'public', table: 'broadcasts' }, () => {
            SupabaseDB.invalidateCache('broadcasts_active');
            this.updateUI();
        });

        // Optional callback for specific dashboard table changes
        if (onTableChange) {
            // Apply status filter for teacher/admin to avoid huge in-progress payloads
            // Student only sees their own, but teacher/admin sees everyone
            const filter = role === 'student' ? `student_email=eq.${email}` : `status=eq.submitted`;
            channel.on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'quiz_submissions',
                filter: filter
            }, onTableChange);
        }

        channel.subscribe();
    }
};

let maintCountdown = null;

const SessionGuard = {
    _lastCheck: 0,
    _throttle: 5000, // 5 seconds

    async validate(force = false) {
        const now = Date.now();
        if (!force && (now - this._lastCheck < this._throttle)) return;
        this._lastCheck = now;

        try {
            const user = await SessionManager.getCurrentUser();
            if (!user) return;

            const [fresh, m] = await Promise.all([
                SupabaseDB.getUser(user.email, true),
                SupabaseDB.getMaintenance(true)
            ]);

            if (!fresh) {
                console.warn('SessionGuard: User not found.');
                return this.logout('Your account could not be verified.');
            }

            const isMaint = isActiveMaintenance(m);
            const isRestricted = !fresh.active || fresh.flagged || isAccountLocked(fresh);
            const roleMismatch = fresh.role !== user.role;
            const currentSid = SessionManager.getSessionId();
            // Invalidation detection: mismatch occurs if fresh.session_id is missing (unauthorized)
            // or if it doesn't match the local session ID.
            const sessionMismatch = !fresh.session_id || fresh.session_id !== currentSid;

            if ((isMaint && user.role !== 'admin') || isRestricted || sessionMismatch || roleMismatch) {
                let msg = isMaint ? 'System entered maintenance mode.' : 'Your account status has changed.';

                if (isRestricted) {
                    if (!fresh.active) msg = 'Your account has been deactivated.';
                    else if (fresh.flagged) msg = 'Your account has been flagged for suspicious activity.';
                    else if (isAccountLocked(fresh)) msg = 'Your account has been locked due to multiple failed attempts.';
                } else if (sessionMismatch) {
                    const reason = fresh.metadata?.last_invalidation_reason;
                    if (reason === 'password_change') {
                        msg = 'Your password was changed. Please login again.';
                    } else if (reason === 'manual_logout') {
                        msg = 'You have been logged out from another tab.';
                    } else if (reason === 'idle_timeout') {
                        msg = 'Your session has expired due to inactivity.';
                    } else if (reason === 'new_login') {
                        msg = 'You have been logged in from another device or tab.';
                    } else if (reason === 'role_change') {
                        msg = 'Your account permissions have been updated.';
                    } else {
                        msg = 'Your session has been invalidated.';
                    }
                } else if (roleMismatch) {
                    msg = 'Your permissions have been updated. Please login again.';
                }

                await this.logout(msg);
            }
        } catch (e) {
            console.warn('SessionGuard: Validation failed', e);
        }
    },

    async logout(message, reason = null) {
        await SessionManager.clearCurrentUser(reason);
        if (!window.location.href.includes('index.html')) {
            window.location.href = 'index.html?reason=' + encodeURIComponent(message);
        } else {
            // If already on landing page, show notification so user knows why they were cleared
            UI.showNotification(message, 'info');
        }
    },

    init() {
        if (this._initialized) return;
        this._initialized = true;

        // Listen for visibility changes and focus to trigger immediate validation
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') this.validate(true);
        });
        window.addEventListener('focus', () => this.validate(true));

        // Initial check
        this.validate();
    }
};

async function updateMaintBanner() {
    // Integrate session validation into the banner update polling
    await SessionGuard.validate();

    let m;
    try {
        m = await SupabaseDB.getMaintenance(false); // Use cache here for banner as SessionGuard already bypassed it
    } catch (e) {
        console.warn('Maintenance check failed:', e);
        return;
    }

    const ids = ['maintBanner', 'maintBannerSignup', 'maintBannerLogin', 'maintBannerReset'];
    
    let targetDate = null;
    let labelPrefix = '';

    if (isActiveMaintenance(m)) {
        targetDate = getActiveMaintenanceEnd(m);
        labelPrefix = 'System maintenance ACTIVE — ' + (targetDate ? 'restores in ' : 'please check back later');
    } else {
        const up = getUpcomingMaintenance(m);
        if (up) {
            targetDate = new Date(up.startAt).getTime();
            labelPrefix = 'Upcoming system maintenance — starts in ';
        }
    }

    if (isActiveMaintenance(m) || targetDate) {
        if (!maintCountdown) {
            maintCountdown = new Countdown({
                targetDate: targetDate,
                headless: true,
                onEnd: () => {
                    maintCountdown = null;
                    updateMaintBanner();
                },
                onTick: (time) => {
                    let displayStr = labelPrefix;
                    if (targetDate) {
                        const h = Math.floor(time.total / 3600000);
                        const mm = Math.floor((time.total % 3600000) / 60000);
                        const ss = Math.floor((time.total % 60000) / 1000);
                        displayStr += `${h}h ${mm}m ${ss}s (at ${new Date(targetDate).toLocaleString()})`;
                    }

                    ids.forEach(id => {
                        const b = document.getElementById(id);
                        if (b) {
                            b.style.display = 'block';
                            b.textContent = displayStr;
                        }
                    });
                }
            });
        } else {
            maintCountdown.setTargetDate(targetDate);
        }

        // Ensure it is "mounted" (subscribed to TimerManager)
        if (!maintCountdown.mounted) {
            maintCountdown.mount();
        }
        maintCountdown.update();
    } else {
        ids.forEach(id => {
            const b = document.getElementById(id);
            if (b) b.style.display = 'none';
        });
        if (maintCountdown) {
            maintCountdown.destroy();
            maintCountdown = null;
        }
    }
}

window.NotificationManager = NotificationManager;

const CertificateGenerator = {
    async generatePDF(studentName, courseTitle, issueDate, verificationId) {
        if (!window.jspdf) {
            console.error('jsPDF not loaded');
            return null;
        }
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({
            orientation: 'landscape',
            unit: 'mm',
            format: 'a4'
        });

        const width = doc.internal.pageSize.getWidth();
        const height = doc.internal.pageSize.getHeight();

        // Background
        doc.setFillColor(248, 246, 255);
        doc.rect(0, 0, width, height, 'F');

        // Border
        doc.setDrawColor(91, 46, 166);
        doc.setLineWidth(2);
        doc.rect(10, 10, width - 20, height - 20);
        doc.setLineWidth(0.5);
        doc.rect(12, 12, width - 24, height - 24);

        // Header
        doc.setTextColor(91, 46, 166);
        doc.setFontSize(40);
        doc.setFont('helvetica', 'bold');
        doc.text('CERTIFICATE OF COMPLETION', width / 2, 40, { align: 'center' });

        // Body
        doc.setTextColor(34, 34, 34);
        doc.setFontSize(20);
        doc.setFont('helvetica', 'normal');
        doc.text('This is to certify that', width / 2, 65, { align: 'center' });

        doc.setFontSize(32);
        doc.setFont('helvetica', 'bold');
        doc.text(studentName, width / 2, 85, { align: 'center' });

        doc.setFontSize(20);
        doc.setFont('helvetica', 'normal');
        doc.text('has successfully completed the course', width / 2, 105, { align: 'center' });

        doc.setFontSize(26);
        doc.setFont('helvetica', 'bold');
        doc.text(courseTitle, width / 2, 125, { align: 'center' });

        // Footer
        doc.setFontSize(14);
        doc.setFont('helvetica', 'normal');
        doc.text(`Issued on: ${new Date(issueDate).toLocaleDateString()}`, width / 2, 155, { align: 'center' });
        doc.text(`Verification ID: ${verificationId}`, width / 2, 165, { align: 'center' });

        // Logo / Stamp Placeholder
        doc.setDrawColor(91, 46, 166);
        doc.setLineWidth(1);
        doc.circle(width / 2, 185, 10);
        doc.setFontSize(10);
        doc.text('SmartLMS', width / 2, 186, { align: 'center' });

        return doc;
    }
};

window.CertificateGenerator = CertificateGenerator;

const Exporter = {
    csv(filename, headers, rows) {
        const csvContent = [
            headers,
            ...rows.map(row => row.map(val => `"${String(val || '').replace(/"/g, '""')}"`))
        ].map(e => e.join(",")).join("\n");

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    },

    async pdf(filename, title, headers, rows) {
        if (!window.jspdf) {
            UI.showNotification('PDF Library not loaded.', 'error');
            return;
        }
        const { jsPDF } = window.jspdf;
        const orientation = headers.length > 4 ? 'landscape' : 'portrait';
        const doc = new jsPDF({ orientation });
        const width = doc.internal.pageSize.getWidth();

        // Title
        doc.setFontSize(18);
        doc.text(title, width / 2, 20, { align: 'center' });
        doc.setFontSize(10);
        doc.text(`Generated on: ${new Date().toLocaleString()}`, width / 2, 28, { align: 'center' });

        // Table logic
        let y = 40;
        const margin = 15;
        const colWidth = (width - (margin * 2)) / headers.length;

        // Headers
        doc.setFont('helvetica', 'bold');
        doc.setFillColor(240, 240, 240);
        doc.rect(margin, y - 5, width - (margin * 2), 7, 'F');
        headers.forEach((h, i) => {
            doc.text(String(h), margin + (i * colWidth), y);
        });

        y += 10;
        doc.setFont('helvetica', 'normal');

        // Rows
        rows.forEach((row, rowIndex) => {
            // Page break check
            if (y > 280) {
                doc.addPage();
                y = 20;
                // Re-render headers on new page
                doc.setFont('helvetica', 'bold');
                doc.setFillColor(240, 240, 240);
                doc.rect(margin, y - 5, width - (margin * 2), 7, 'F');
                headers.forEach((h, i) => {
                    doc.text(String(h), margin + (i * colWidth), y);
                });
                y += 10;
                doc.setFont('helvetica', 'normal');
            }

            row.forEach((cell, i) => {
                const text = String(cell || '');
                const truncated = text.length > 25 ? text.substring(0, 22) + '...' : text;
                doc.text(truncated, margin + (i * colWidth), y);
            });
            y += 8;
        });

        doc.save(filename);
    }
};

window.Exporter = Exporter;

UI.createFileUploader = function(containerId, options = {}) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const {
        bucket = 'materials',
        pathPrefix = 'uploads',
        maxSize = 5 * 1024 * 1024, // 5MB
        allowedTypes = [], // e.g. ['.pdf', '.docx']
        onUploadSuccess = (url) => {}
    } = options;

    container.innerHTML = `
        <div class="uploader-wrapper" onclick="this.querySelector('input').click()">
            <input type="file" style="display:none" ${allowedTypes.length ? `accept="${allowedTypes.join(',')}"` : ''}>
            <div class="uploader-icon">📁</div>
            <div class="uploader-text">Click to upload or drag and drop</div>
            <div class="uploader-info">Max size: ${maxSize / 1024 / 1024}MB ${allowedTypes.length ? `• Types: ${allowedTypes.join(', ')}` : ''}</div>
            <div class="uploader-progress">
                <div class="bar"></div>
            </div>
        </div>
    `;

    const input = container.querySelector('input');
    const text = container.querySelector('.uploader-text');
    const info = container.querySelector('.uploader-info');
    const progress = container.querySelector('.uploader-progress');
    const bar = progress.querySelector('.bar');

    input.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Validation
        if (file.size > maxSize) {
            alert(`File is too large. Max size is ${maxSize / 1024 / 1024}MB.`);
            return;
        }

        if (allowedTypes.length) {
            const ext = '.' + file.name.split('.').pop().toLowerCase();
            if (!allowedTypes.includes(ext)) {
                alert(`Invalid file type. Allowed: ${allowedTypes.join(', ')}`);
                return;
            }
        }

        // Start Upload
        text.textContent = `Uploading ${file.name}...`;
        progress.style.display = 'block';
        bar.style.width = '20%';

        try {
            const fileName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
            const path = `${pathPrefix}/${fileName}`;

            await SupabaseDB.uploadFile(bucket, path, file);
            bar.style.width = '80%';

            const url = await SupabaseDB.getPublicUrl(bucket, path);
            bar.style.width = '100%';

            text.textContent = 'Upload complete!';
            text.style.color = 'var(--ok)';
            info.textContent = file.name;

            onUploadSuccess(url, file.name);
        } catch (err) {
            console.error('Upload error:', err);
            text.textContent = 'Upload failed. Try again.';
            text.style.color = 'var(--danger)';
            bar.style.width = '0';
        }
    });

    // Drag and Drop
    const wrapper = container.querySelector('.uploader-wrapper');
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        wrapper.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
        }, false);
    });

    wrapper.addEventListener('dragover', () => wrapper.style.borderColor = 'var(--purple)');
    wrapper.addEventListener('dragleave', () => wrapper.style.borderColor = '#d9e0ea');
    wrapper.addEventListener('drop', (e) => {
        wrapper.style.borderColor = '#d9e0ea';
        input.files = e.dataTransfer.files;
        input.dispatchEvent(new Event('change'));
    });
};

UI.renderDiscussion = function(containerId, discussions, currentUserEmail, options = {}) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const {
        onReply = (parentId) => {},
        onEdit = (id) => {},
        onDelete = (id) => {},
        onPost = (content, parentId) => {}
    } = options;

    const renderThread = (parentId = null, depth = 0) => {
        return discussions.filter(d => d.parent_id === parentId).map(d => {
            const isMine = d.user_email === currentUserEmail;
            return `
                <div class="question mb-10" style="margin-left:${depth * 20}px" id="disc-${d.id}">
                    <div class="flex-between" style="align-items:start">
                        <div class="small"><strong>${escapeHtml(d.user_email)}</strong> - ${new Date(d.created_at).toLocaleString()}</div>
                        <div class="flex gap-5">
                            <button class="button secondary tiny" onclick="UI._dispatchDiscussionAction('${containerId}', 'reply', '${d.id}')">Reply</button>
                            ${isMine ? `
                                <button class="button secondary tiny" onclick="UI._dispatchDiscussionAction('${containerId}', 'edit', '${d.id}')">Edit</button>
                                <button class="button danger tiny" onclick="UI._dispatchDiscussionAction('${containerId}', 'delete', '${d.id}')">Delete</button>
                            ` : ''}
                        </div>
                    </div>
                    <div class="mt-5 disc-content">${escapeHtml(d.content)}</div>
                    <div id="reply-area-${d.id}"></div>
                    ${renderThread(d.id, depth + 1)}
                </div>
            `;
        }).join('');
    };

    container.innerHTML = `
        <div class="card">
            <h3 class="m-0">Course Discussion</h3>
            <div id="disc-list" class="mt-20 mb-20" style="max-height:500px; overflow-y:auto">
                ${renderThread() || '<div class="empty">No messages yet. Start the conversation!</div>'}
            </div>
            <div class="flex gap-10">
                <input type="text" id="discInputMain" placeholder="Start a new thread..." class="m-0">
                <button class="button w-auto" onclick="UI._dispatchDiscussionAction('${containerId}', 'post', null)">Post</button>
            </div>
        </div>
    `;

    // Internal action dispatcher
    UI._discussionOptions = UI._discussionOptions || {};
    UI._discussionOptions[containerId] = options;
};

UI._dispatchDiscussionAction = function(containerId, action, id) {
    const opts = UI._discussionOptions[containerId];
    if (!opts) return;

    if (action === 'reply') {
        const area = document.getElementById(`reply-area-${id}`);
        area.innerHTML = `
            <div class="flex gap-10 mt-10">
                <input type="text" id="replyInput-${id}" placeholder="Write a reply..." class="m-0 small p-10">
                <button class="button small w-auto" onclick="UI._dispatchDiscussionAction('${containerId}', 'post', '${id}')">Reply</button>
                <button class="button secondary small w-auto" onclick="this.parentElement.remove()">Cancel</button>
            </div>
        `;
    } else if (action === 'post') {
        const inputId = id ? `replyInput-${id}` : 'discInputMain';
        const content = document.getElementById(inputId).value;
        if (content) opts.onPost(content, id);
    } else if (action === 'edit') {
        opts.onEdit(id);
    } else if (action === 'delete') {
        opts.onDelete(id);
    }
};

UI.renderIntegrityReport = function(containerId, violations, userEmail) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (typeof AntiCheat === 'undefined' || !AntiCheat.calculateStats) {
        container.innerHTML = '<div class="empty">Anti-Cheat system not loaded.</div>';
        return;
    }

    const stats = AntiCheat.calculateStats(violations);
    const firstV = violations[violations.length - 1];
    const lastV = violations[0];

    container.innerHTML = `
      <div class="card mb-20">
        <h3>Session Information</h3>
        <div class="stats-grid">
          <div class="stat-card">
            <h4>Device Context</h4>
            <div class="value" style="font-size: 1.1rem">
                ${lastV?.device || 'Unknown'} / ${lastV?.os || 'N/A'}
            </div>
          </div>
          <div class="stat-card">
            <h4>Browser</h4>
            <div class="value" style="font-size: 1.1rem">${lastV?.browser || 'Unknown'}</div>
          </div>
          <div class="stat-card">
            <h4>Session Window</h4>
            <div class="value" style="font-size: 1.1rem">
                ${firstV ? new Date(firstV.timestamp).toLocaleTimeString() : 'N/A'} -
                ${lastV ? new Date(lastV.timestamp).toLocaleTimeString() : 'N/A'}
            </div>
          </div>
          <div class="stat-card">
            <h4>Duration (est)</h4>
            <div class="value" style="font-size: 1.1rem">
                ${firstV && lastV ? Math.round((new Date(lastV.timestamp) - new Date(firstV.timestamp)) / 60000) : 0} min
            </div>
          </div>
        </div>
      </div>

      <div class="card mb-20">
        <h3>Violation Statistics</h3>
        <div class="stats-grid">
          <div class="stat-card ${stats.riskLevel === 'High' ? 'danger' : (stats.riskLevel === 'Medium' ? 'warn' : 'success')}">
            <h4>Risk Level</h4>
            <div class="value">
                <span class="badge ${stats.riskLevel === 'High' ? 'badge-inactive' : (stats.riskLevel === 'Medium' ? 'badge-warn' : 'badge-active')}">
                    ${stats.riskLevel}
                </span>
            </div>
          </div>
          <div class="stat-card">
            <h4>Total Score</h4>
            <div class="value">${stats.totalScore}</div>
          </div>
          <div class="stat-card">
            <h4>Frequency</h4>
            <div class="value" style="font-size: 1rem">
                C:${stats.criticalCount} | H:${stats.highCount} | L:${stats.lowCount}
            </div>
          </div>
          <div class="stat-card">
            <h4>Most Frequent</h4>
            <div class="value" style="font-size: 1rem">${escapeHtml(stats.topViolation)}</div>
          </div>
        </div>
      </div>

      <div class="card">
        <h3>Detailed Violation History</h3>
        ${violations.length === 0 ? `
          <div class="empty">No violations detected for this session.</div>
        ` : `
          <div style="overflow-x: auto;">
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Type</th>
                  <th>Severity</th>
                  <th>Score</th>
                  <th>Context</th>
                </tr>
              </thead>
              <tbody>
                ${violations.map(v => `
                  <tr>
                    <td class="small">${new Date(v.timestamp).toLocaleTimeString()}</td>
                    <td><span class="bold">${escapeHtml(v.type.replace(/_/g, ' '))}</span></td>
                    <td>
                        <span class="badge ${v.severity === 'CRITICAL' ? 'badge-inactive' : (v.severity === 'HIGH' ? 'badge-warn' : 'badge-active')}">
                            ${v.severity}
                        </span>
                    </td>
                    <td>${v.score || 0}</td>
                    <td class="tiny text-muted">
                        ${v.metadata?.url ? `URL: ${v.metadata.url.substring(0,30)}...` : ''}
                        ${v.metadata?.shortcut ? `Shortcut: ${v.metadata.shortcut}` : ''}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `}
      </div>
    `;
};

window.UI = UI;

const HELP_DATA = {
    roles: {
        student: { title: 'Student', icon: '🧑‍🎓', description: 'Access learning resources & support' },
        teacher: { title: 'Teacher', icon: '🧑‍🏫', description: 'Manage courses & students' },
        admin: { title: 'Admin', icon: '⚙️', description: 'System configuration & control' }
    },
    contact: {
        email: 'eduquizlms@gmail.com',
        phone: '+233 50 596 5310',
        hours: 'Monday to Friday, 9 AM - 5 PM GMT'
    },
    infoModals: {
        about: {
            title: 'About SmartLMS',
            content: `
                <p>SmartLMS is a secure, next-generation learning platform designed for modern education. We focus on academic integrity, student engagement, and providing educators with the tools they need to succeed in a digital-first world.</p>
                <p>Our mission is to make education accessible and interactive for everyone, everywhere. We believe in the power of technology to transform learning and empower both students and teachers.</p>
                <div class="about-image-placeholder">
                    <div class="text-center">
                        <div class="about-placeholder-icon">🌐</div>
                        <div>Global Learning Platform</div>
                    </div>
                </div>
                <div class="about-stats">
                    <div class="about-stat-item">
                        <div class="value">100%</div>
                        <div class="label">Secure</div>
                    </div>
                    <div class="about-stat-item">
                        <div class="value">24/7</div>
                        <div class="label">Accessible</div>
                    </div>
                    <div class="about-stat-item">
                        <div class="value">Real-time</div>
                        <div class="label">Analytics</div>
                    </div>
                </div>
            `
        },
        privacy: {
            title: 'Privacy Policy',
            content: `
                <p>At SmartLMS, your privacy is our priority. We only collect data necessary to provide you with the best learning experience.</p>
                <ul>
                    <li><strong>Personal Information:</strong> We store your name, email, and phone number for account management.</li>
                    <li><strong>Learning Data:</strong> We track your progress, grades, and attendance to help you and your teachers.</li>
                    <li><strong>Security Data:</strong> In proctored assessments, we monitor browser activity to ensure academic integrity.</li>
                </ul>
                <p>We do not sell your data to third parties.</p>
            `
        },
        terms: {
            title: 'Terms of Service',
            content: `
                <p>By using SmartLMS, you agree to follow our code of conduct:</p>
                <ul>
                    <li><strong>Academic Integrity:</strong> Users must not engage in cheating or plagiarism during assessments.</li>
                    <li><strong>Respect:</strong> Users must be respectful in discussions and live classes.</li>
                    <li><strong>Account Security:</strong> You are responsible for maintaining the confidentiality of your password.</li>
                </ul>
            `
        },
        standards: {
            title: 'Teaching Standards',
            content: `
                <p>Our platform encourages high teaching standards through:</p>
                <ul>
                    <li><strong>Clear Objectives:</strong> Every course and lesson should have clearly defined learning outcomes.</li>
                    <li><strong>Active Engagement:</strong> Teachers are encouraged to use live classes and discussions to engage students.</li>
                    <li><strong>Timely Feedback:</strong> Providing feedback on assignments in a timely manner.</li>
                    <li><strong>Integrity Monitoring:</strong> Utilizing our anti-cheat tools to ensure fair assessments for all students.</li>
                </ul>
            `
        }
    },
    faqs: {
        student: [
            {
                category: "ACCOUNT",
                items: [
                    { q: "How do I reset my password?", a: "Click on 'Forgot Password' on the login screen and follow the instructions to request a reset." },
                    { q: "Can I change my email address?", a: "Email addresses are currently locked to your account. Contact an administrator if you need a change." },
                    { q: "How do I earn XP?", a: "You earn XP by completing lessons, assignments, and quizzes across your enrolled courses." }
                ]
            },
            {
                category: "COURSES",
                items: [
                    { q: "How do I enroll in a course?", a: "Browse the catalog and click 'Enroll'. Some courses may require an Enrollment ID from your teacher." },
                    { q: "Where can I find my course materials?", a: "Navigate to your course dashboard and look under the 'Materials' tab." },
                    { q: "How is my progress calculated?", a: "Your progress is based on the percentage of lessons and assignments completed in the course." }
                ]
            },
            {
                category: "TECHNICAL",
                items: [
                    { q: "Does SmartLMS work offline?", a: "You can access some materials offline if you have installed the PWA app on your device." },
                    { q: "What file types are supported for assignments?", a: "We support PDF, DOCX, ZIP, and common image formats (JPG, PNG)." },
                    { q: "Why can't I access a live class?", a: "Ensure the teacher has started the session and you have a stable internet connection." }
                ]
            }
        ],
        teacher: [
            {
                category: "COURSE MANAGEMENT",
                items: [
                    { q: "How do I create a new course?", a: "Click 'Create Course' in your teacher dashboard and fill in the required details." },
                    { q: "Can I hide a course while building it?", a: "Yes, set the course status to 'Draft' until you are ready to publish it." },
                    { q: "How do I manage enrollments?", a: "You can view and manage students in the 'Students' section of your course dashboard." }
                ]
            },
            {
                category: "GRADING & ASSESSMENTS",
                items: [
                    { q: "How do I grade assignments?", a: "Go to the 'Grading' tab to view pending submissions and provide feedback and scores." },
                    { q: "What are regrade requests?", a: "Students can request a review of their grade if they believe there was an error in assessment." },
                    { q: "How do quizzes work?", a: "Quizzes are automatically graded based on the correct answers you provide during creation." }
                ]
            },
            {
                category: "LIVE INTERACTION",
                items: [
                    { q: "How do I start a live class?", a: "Create a session and click 'Start Meeting' at the scheduled time." }
                ]
            }
        ],
        admin: [
            {
                category: "SYSTEM",
                items: [
                    { q: "How do I manage system maintenance?", a: "Use the 'Maintenance' tab in the admin dashboard to schedule or toggle maintenance mode." },
                    { q: "How do I view system health?", a: "The 'Overview' tab provides real-time health metrics and server status." }
                ]
            },
            {
                category: "USER MANAGEMENT",
                items: [
                    { q: "How do I create teacher accounts?", a: "Go to 'User Management' and use the 'Invite User' or 'Create User' function." },
                    { q: "Can I reactivate a deactivated user?", a: "Yes, find the user in the management list and toggle their 'Active' status." }
                ]
            }
        ]
    }
};

const HelpSystem = {
    async renderHelpCenter(containerId, role, options = {}) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const { isModal = false, showAuthOnly = false } = options;
        const faqs = HELP_DATA.faqs[role] || [];

        let user = null;
        try {
            user = await SessionManager.getCurrentUser();
        } catch (e) {
            console.warn('[HelpSystem] Failed to get current user:', e);
        }
        const userEmail = user?.email || null;

        const layoutClass = isModal ? 'help-center-body help-center-layout' : 'help-page-layout';
        const containerStyle = isModal ? 'height: 100%; overflow-y: auto; background: #f9fafb;' : 'padding: 20px;';

        container.innerHTML = `
            <div class="${layoutClass}" style="${containerStyle}">
                <div class="help-main-col">
                    ${userEmail ? `
                    <div class="section-title mb-20" style="display: flex; align-items: center; gap: 10px; font-weight: 700; font-size: 1.1rem;">
                        <span style="color: var(--warn); font-size: 1.2rem;">🕒</span> Your Recent Requests
                        <span style="margin-left: auto; color: var(--purple); font-size: 0.8rem; cursor: pointer;" onclick="HelpSystem.refreshRequests('${userEmail}')">REFRESH</span>
                    </div>
                    <div id="recentRequestsList" class="card mb-40" style="background: #fff; border: 1px dashed #ddd; padding: 40px; text-align: center; color: #999; border-radius: 15px;">
                        Loading your requests...
                    </div>
                    ` : ''}

                    <div class="section-title mb-20" style="display: flex; align-items: center; gap: 10px; font-weight: 700; font-size: 1.1rem;">
                        <span style="color: var(--purple); font-size: 1.2rem;">❓</span> Frequently Asked Questions (${role.toUpperCase()})
                    </div>

                    <div class="faq-accordion" style="max-height: 600px; overflow-y: auto; padding-right: 10px;">
                        ${faqs.map(cat => `
                            <div class="faq-cat-group mb-30">
                                <h4 style="font-size: 0.8rem; color: #999; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 15px;">${cat.category}</h4>
                                ${cat.items.map(item => `
                                    <div class="faq-accordion-item" style="background: #fff; border: 1px solid #eee; border-radius: 12px; margin-bottom: 10px; overflow: hidden;">
                                        <div class="faq-accordion-header" onclick="HelpSystem.toggleAccordion(this)" style="padding: 18px 20px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; transition: background 0.2s;">
                                            <span style="font-weight: 600; color: #333;">${item.q}</span>
                                            <span class="icon" style="color: #ccc; transition: transform 0.3s;">⌄</span>
                                        </div>
                                        <div class="faq-accordion-content" style="padding: 0 20px; max-height: 0; overflow: hidden; transition: all 0.3s ease-out; color: #666; line-height: 1.6;">
                                            <div style="padding-bottom: 20px;">${item.a}</div>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        `).join('')}
                    </div>
                </div>

                <div class="help-sidebar-col" style="max-height: 800px; overflow-y: auto; padding-right: 5px;">
                    ${userEmail ? `
                    <div class="card" style="background: #111827; color: #fff; padding: 30px; border-radius: 20px; border: none; margin-bottom: 30px;">
                        <h3 style="margin-top: 0; margin-bottom: 5px;">Contact Support</h3>
                        <p style="font-size: 0.85rem; color: #9ca3af; margin-bottom: 20px;">Expected response time: Under 24 hours</p>

                        <label style="color: #9ca3af; font-size: 0.75rem; margin-bottom: 5px; text-transform: uppercase;">Your Email</label>
                        <input type="email" id="supportEmail" value="${userEmail}" style="background: #1f2937; border: 1px solid #374151; color: #fff; border-radius: 8px; margin-bottom: 15px;" readonly>

                        <label style="color: #9ca3af; font-size: 0.75rem; margin-bottom: 5px; text-transform: uppercase;">Subject</label>
                        <input type="text" id="supportSubject" placeholder="e.g. Access Issue" style="background: #1f2937; border: 1px solid #374151; color: #fff; border-radius: 8px; margin-bottom: 15px;">

                        <label style="color: #9ca3af; font-size: 0.75rem; margin-bottom: 5px; text-transform: uppercase;">Message</label>
                        <textarea id="supportMessage" rows="4" placeholder="Describe your problem in detail..." style="background: #1f2937; border: 1px solid #374151; color: #fff; border-radius: 8px; margin-bottom: 20px;"></textarea>

                        <button class="button" style="width: 100%; gap: 10px;" onclick="HelpSystem.submitSupport('${role}')">
                            <span>✈️</span> Send Message
                        </button>
                    </div>
                    ` : `
                    <div class="card" style="background: var(--bg-light); padding: 30px; border-radius: 20px; text-align: center; margin-bottom: 30px; border: 1px dashed var(--border);">
                        <div style="font-size: 2rem; margin-bottom: 15px;">🔒</div>
                        <h3 style="margin-top: 0;">Support Restricted</h3>
                        <p class="small text-muted mb-20">Please sign in to your account to send a support ticket to our technical team.</p>
                        <button class="button primary small" onclick="if(window.showLogin) showLogin(); else window.location.href='index.html'">Sign In Now</button>
                    </div>
                    `}

                    <div class="card" style="padding: 25px; border-radius: 20px;">
                         <h4 style="margin-top: 0;">Quick Resources</h4>
                         <p class="tiny text-muted">Direct links to important documents.</p>
                         <ul style="list-style: none; padding: 0; margin-top: 15px;">
                            <li class="mb-10"><a href="#" onclick="if(window.LandingUI) LandingUI.showInfoModal('standards'); else UI.showNotification('Refer to Landing Page for full standards.')" style="color: var(--p); font-weight: 600; text-decoration: none;">📘 Teaching Standards</a></li>
                            <li class="mb-10"><a href="#" onclick="if(window.LandingUI) LandingUI.showInfoModal('privacy'); else UI.showNotification('Refer to Landing Page for full policy.')" style="color: var(--p); font-weight: 600; text-decoration: none;">🛡️ Privacy Policy</a></li>
                            <li><a href="#" onclick="if(window.LandingUI) LandingUI.showInfoModal('terms'); else UI.showNotification('Refer to Landing Page for full terms.')" style="color: var(--p); font-weight: 600; text-decoration: none;">📜 Terms of Service</a></li>
                         </ul>
                    </div>
                </div>
            </div>
        `;

        if (userEmail) {
            this.refreshRequests(userEmail);
        }
    },

    async refreshRequests(email) {
        const list = document.getElementById('recentRequestsList');
        if (!list || !email) return;

        try {
            const { data: tickets } = await SupabaseDB.getSupportTickets(email);
            if (!tickets || tickets.length === 0) {
                list.innerHTML = 'No recent support requests.';
                list.style.borderStyle = 'dashed';
                return;
            }

            list.style.borderStyle = 'solid';
            list.style.textAlign = 'left';
            list.style.padding = '15px';
            list.innerHTML = tickets.map(t => `
                <div style="border-bottom: 1px solid #eee; padding: 15px 0;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
                        <div>
                            <div class="bold" style="font-size: 0.9rem;">${escapeHtml(t.subject)}</div>
                            <div class="tiny text-muted">${new Date(t.created_at).toLocaleDateString()}</div>
                        </div>
                        <span class="badge-${t.status === 'open' ? 'warn' : (t.status === 'pending' ? 'warn' : 'active')}" style="font-size: 0.7rem; padding: 2px 8px;">${t.status.toUpperCase()}</span>
                    </div>
                    <div class="small text-muted mb-5">${escapeHtml(t.message.substring(0, 100))}${t.message.length > 100 ? '...' : ''}</div>
                    ${t.resolution_notes ? `
                        <div class="mt-10 p-10 border-radius-sm" style="background: #f0fdf4; border: 1px solid #bbf7d0;">
                            <div class="tiny bold text-success" style="text-transform: uppercase; margin-bottom: 4px;">Resolution Update:</div>
                            <div class="small text-dark" style="white-space: pre-wrap;">${escapeHtml(t.resolution_notes)}</div>
                        </div>
                    ` : ''}
                </div>
            `).join('');
        } catch (e) {
            console.error('Failed to fetch tickets:', e);
            list.innerHTML = 'Error loading requests.';
        }
    },

    async submitSupport(role) {
        const emailInput = document.getElementById('supportEmail');
        const subjectInput = document.getElementById('supportSubject');
        const messageInput = document.getElementById('supportMessage');

        if (!emailInput || !subjectInput || !messageInput) return;

        const email = emailInput.value;
        const subject = subjectInput.value;
        const message = messageInput.value;

        if (!email || !subject || !message) {
            UI.showNotification('Please fill in all fields.', 'error');
            return;
        }

        try {
            await SupabaseDB.saveSupportTicket({
                user_email: email,
                role: role,
                subject: subject,
                message: message
            });
            UI.showNotification('Support ticket submitted successfully! We will get back to you shortly.', 'success');

            // Clear inputs
            subjectInput.value = '';
            messageInput.value = '';

            // Refresh list
            this.refreshRequests(email);
        } catch (e) {
            console.error('Failed to submit ticket:', e);
            UI.showNotification('Failed to submit ticket. Please ensure you are logged in.', 'error');
        }
    },

    toggleAccordion(header) {
        const item = header.parentElement;
        const content = item.querySelector('.faq-accordion-content');
        const icon = header.querySelector('.icon');
        const isOpen = item.classList.contains('active');

        if (isOpen) {
            item.classList.remove('active');
            content.style.maxHeight = '0';
            icon.style.transform = 'rotate(0deg)';
            header.style.background = '#fff';
        } else {
            item.classList.add('active');
            content.style.maxHeight = content.scrollHeight + 'px';
            icon.style.transform = 'rotate(180deg)';
            header.style.background = '#f8fafc';
        }
    }
};

window.HelpSystem = HelpSystem;

const DiscussionManager = {
    async post(courseId, content, parentId = null) {
        if (!content) return;
        const user = await SessionManager.getCurrentUser();
        try {
            await SupabaseDB.saveDiscussion({
                id: crypto.randomUUID(),
                course_id: courseId,
                user_email: user.email,
                content: content,
                parent_id: parentId,
                created_at: new Date().toISOString()
            });
            return true;
        } catch (e) {
            UI.showNotification('Error posting message: ' + e.message, 'error');
            return false;
        }
    },

    async edit(id, onSave) {
        const div = document.getElementById(`disc-${id}`);
        if (!div) return;
        const contentDiv = div.querySelector('.disc-content');
        const current = contentDiv.innerText;
        contentDiv.innerHTML = `
            <textarea class="input" style="margin-top:10px">${escapeHtml(current)}</textarea>
            <div style="margin-top:8px; display:flex; gap:8px">
                <button class="button" style="padding:4px 8px; font-size:11px" id="save-disc-${id}">Save</button>
                <button class="button secondary" style="padding:4px 8px; font-size:11px" id="cancel-disc-${id}">Cancel</button>
            </div>
        `;

        document.getElementById(`save-disc-${id}`).onclick = async () => {
            const content = contentDiv.querySelector('textarea').value;
            if (!content) return;
            try {
                // Fetching individual record for consistency check if needed,
                // but typically we just need the ID and new content for save.
                // We'll trust the current UI flow which already has course info via closure in callers.
                if (await onSave(id, content)) {
                    // Success handled by caller re-rendering
                }
            } catch (e) {
                UI.showNotification('Error updating: ' + e.message, 'error');
            }
        };

        document.getElementById(`cancel-disc-${id}`).onclick = () => {
            contentDiv.innerText = current;
        };
    },

    async delete(id, onDelete) {
        if (!confirm('Delete this message?')) return;
        try {
            await SupabaseDB.deleteDiscussion(id);
            if (onDelete) onDelete();
            return true;
        } catch (e) {
            UI.showNotification('Error deleting: ' + e.message, 'error');
            return false;
        }
    }
};

window.DiscussionManager = DiscussionManager;

const IdleManager = {
    idleLimit: 15 * 60 * 1000, // 15 minutes
    warningTime: 60 * 1000, // 1 minute
    lastActivity: Date.now(),
    warningShown: false,
    _interval: null,

    init() {
        if (this._interval) return;
        ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'].forEach(name => {
            document.addEventListener(name, () => this.resetTimer(), true);
        });
        this.lastActivity = Date.now();
        this._interval = setInterval(() => this.checkIdle(), 10000);
    },

    resetTimer() {
        this.lastActivity = Date.now();
        if (this.warningShown) {
            this.warningShown = false;
            // Remove any existing warning toast if possible, or just let it expire
        }
    },

    async checkIdle() {
        const elapsed = Date.now() - this.lastActivity;
        const user = await SessionManager.getCurrentUser();
        if (!user) {
            if (this._interval) {
                clearInterval(this._interval);
                this._interval = null;
            }
            return;
        }

        if (elapsed >= this.idleLimit) {
            await SessionGuard.logout('Your session has expired due to inactivity.', 'idle_timeout');
        } else if (elapsed >= (this.idleLimit - this.warningTime) && !this.warningShown) {
            this.warningShown = true;
            UI.showNotification('Your session will expire in 1 minute due to inactivity. Move your mouse or press a key to stay logged in.', 'info');
        }
    }
};

window.IdleManager = IdleManager;

const SettingsManager = {
    async render(pushDesc) {
        const content = document.getElementById('pageContent');
        if (!content) return;

        try {
            const user = await SessionManager.getCurrentUser();
            const fresh = await SupabaseDB.getUser(user.email);

            content.innerHTML = `
                <div class="settings-page">
                    <h2 class="mb-30" style="font-size: 1.75rem; font-weight: 800; color: var(--text-dark)">Account Settings</h2>

                    <div class="settings-layout">
                        <aside class="settings-sidebar">
                            <button class="settings-nav-btn active" data-tab="profile" onclick="SettingsManager.switchTab('profile')">
                                <span class="icon">👤</span>
                                <span>Profile Info</span>
                            </button>
                            <button class="settings-nav-btn" data-tab="notifications" onclick="SettingsManager.switchTab('notifications', '${escapeAttr(pushDesc || '')}')">
                                <span class="icon">🔔</span>
                                <span>Notifications</span>
                            </button>
                            <button class="settings-nav-btn" data-tab="security" onclick="SettingsManager.switchTab('security')">
                                <span class="icon">🔒</span>
                                <span>Security</span>
                            </button>
                        </aside>

                        <main class="settings-content" id="settingsTabContent">
                            ${this._getProfileHtml(fresh)}
                        </main>
                    </div>
                </div>
            `;
        } catch (e) {
            console.error('Settings render error:', e);
            content.innerHTML = `<div class="stat-card danger"><h3>Error loading settings</h3><p class="small">${escapeHtml(e.message)}</p></div>`;
        }
    },

    _getProfileHtml(user) {
        const roleIcon = user.role === 'admin' ? '⚙️' : (user.role === 'teacher' ? '🧑‍🏫' : '🧑‍🎓');

        return `
            <div class="animate-fade-in">
                <div class="settings-header-box mb-30">
                    <div class="settings-avatar">
                        <div class="avatar-icon">${roleIcon}</div>
                    </div>
                    <div class="settings-user-meta">
                        <div class="email bold">${escapeHtml(user.email)}</div>
                        <div class="role tiny">${user.role.toUpperCase()}</div>
                    </div>
                </div>

                <div class="card p-30">
                    <div class="mb-20">
                        <label class="settings-label">DISPLAY NAME</label>
                        <input type="text" id="settingsFullName" class="settings-input" placeholder="Your full name" value="${escapeHtml(user.full_name)}">
                    </div>
                    <div class="mb-25">
                        <label class="settings-label">PHONE NUMBER</label>
                        <input type="tel" id="settingsPhone" class="settings-input" placeholder="e.g. 0505965310" value="${escapeHtml(user.phone || '')}">
                    </div>

                    <hr class="mb-25" style="border: 0; border-top: 1px solid var(--border)">

                    <button class="button w-auto px-40" onclick="SettingsManager.saveProfile()" id="saveProfileBtn">
                        <span style="margin-right: 10px">💾</span> Save Settings
                    </button>
                </div>
            </div>
        `;
    },

    _getSecurityHtml() {
        return `
            <div class="animate-fade-in">
                <div class="card p-30">
                    <h3 class="m-0 mb-10">Security & Password</h3>
                    <p class="small mb-25">Keep your account secure by regularly updating your password.</p>

                    <div class="mb-20">
                        <label class="settings-label">CURRENT PASSWORD</label>
                        <div class="password-wrapper">
                            <input type="password" id="currPass" class="settings-input" placeholder="••••••••">
                            <span class="password-toggle" onclick="togglePasswordVisibility('currPass')">👁️</span>
                        </div>
                    </div>

                    <div class="grid-2 mb-25">
                        <div>
                            <label class="settings-label">NEW PASSWORD</label>
                            <div class="password-wrapper">
                                <input type="password" id="newPass" class="settings-input" placeholder="Minimum 8 chars" oninput="window.updatePasswordStrength(this.value)">
                                <span class="password-toggle" onclick="togglePasswordVisibility('newPass')">👁️</span>
                            </div>
                            <div id="passwordStrengthContainer" class="mt-8" style="display:none">
                                <div class="strength-meter"><div id="passwordStrength" class="strength-meter-fill"></div></div>
                                <div class="tiny text-muted mt-4">Password Strength</div>
                            </div>
                        </div>
                        <div>
                            <label class="settings-label">CONFIRM NEW PASSWORD</label>
                            <div class="password-wrapper">
                                <input type="password" id="confirmPass" class="settings-input" placeholder="Confirm your new password">
                                <span class="password-toggle" onclick="togglePasswordVisibility('confirmPass')">👁️</span>
                            </div>
                        </div>
                    </div>

                    <button class="button w-auto px-40" onclick="SettingsManager.changePassword()" id="changePassBtn">
                        <span style="margin-right: 10px">🔐</span> Update Password
                    </button>
                </div>
            </div>
        `;
    },

    async switchTab(tab, arg) {
        const container = document.getElementById('settingsTabContent');
        if (!container) return;

        // Update nav buttons
        document.querySelectorAll('.settings-nav-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tab);
        });

        if (tab === 'profile') {
            const user = await SessionManager.getCurrentUser();
            const fresh = await SupabaseDB.getUser(user.email);
            container.innerHTML = this._getProfileHtml(fresh);
        } else if (tab === 'notifications') {
            await NotificationManager.renderSettings('settingsTabContent', arg);
        } else if (tab === 'security') {
            container.innerHTML = this._getSecurityHtml();
        }
    },

    async saveProfile() {
        const btn = document.getElementById('saveProfileBtn');
        const name = document.getElementById('settingsFullName').value.trim();
        const phone = document.getElementById('settingsPhone').value.trim();

        if (!name) return UI.showNotification('Name is required.', 'warn');

        btn.disabled = true;
        btn.textContent = 'Saving...';

        try {
            const user = await SessionManager.getCurrentUser();
            const fresh = await SupabaseDB.getUser(user.email);

            fresh.full_name = name;
            fresh.phone = phone;

            await SupabaseDB.saveUser(fresh);
            UI.showNotification('Profile updated successfully!', 'success');

            // Update session data
            await SessionManager.setCurrentUser(fresh);

            // Update header if applicable
            const profileName = document.getElementById('profileName');
            if (profileName) profileName.textContent = name;

        } catch (e) {
            UI.showNotification('Failed to update profile: ' + e.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<span style="margin-right: 10px">💾</span> Save Settings';
        }
    },

    async changePassword() {
        const btn = document.getElementById('changePassBtn');
        const curr = document.getElementById('currPass').value;
        const n1 = document.getElementById('newPass').value;
        const n2 = document.getElementById('confirmPass').value;

        if (!curr || !n1 || !n2) return UI.showNotification('All password fields are required.', 'warn');
        if (n1 !== n2) return UI.showNotification('New passwords do not match.', 'warn');
        if (!isStrongPassword(n1)) return UI.showNotification('New password does not meet security requirements.', 'warn');

        btn.disabled = true;
        btn.textContent = 'Updating...';

        try {
            const user = await SessionManager.getCurrentUser();

            // Verify current password via authentication attempt (re-auth)
            const hashedCurr = await window.hashPassword(curr, user.email);
            // We use authenticate_user which will also check for locks/flagged etc
            // Generating a dummy session ID for re-auth check
            const authCheck = await SupabaseDB.authenticateUser(user.email, hashedCurr, 'reauth_' + Date.now());

            if (!authCheck.success) {
                throw new Error('Current password incorrect.');
            }

            const fresh = await SupabaseDB.getUser(user.email);
            const hashedNew = await window.hashPassword(n1, user.email);
            fresh.password = hashedNew;

            // Generate fresh session to invalidate other sessions (Security Best Practice)
            const sid = SessionManager.getSessionId(true);
            fresh.session_id = sid;
            fresh.metadata = { ...fresh.metadata, last_invalidation_reason: 'password_change' };

            await SupabaseDB.saveUser(fresh);
            window.setSupabaseSession(sid);
            await SessionManager.setCurrentUser(fresh);

            UI.showNotification('Password updated. You have been re-authenticated.', 'success');

            // Clear fields
            document.getElementById('currPass').value = '';
            document.getElementById('newPass').value = '';
            document.getElementById('confirmPass').value = '';
            document.getElementById('passwordStrengthContainer').style.display = 'none';

        } catch (e) {
            UI.showNotification(e.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<span style="margin-right: 10px">🔐</span> Update Password';
        }
    }
};

window.SettingsManager = SettingsManager;

// Global error handling for unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled Promise Rejection:', event.reason);
    // Suppress notification for background sync errors to avoid UI noise
    const reason = event.reason?.message || String(event.reason);
    if (!reason.includes('background sync')) {
        UI.showNotification('A background operation failed. Please refresh if the issue persists.', 'warn');
    }

});
