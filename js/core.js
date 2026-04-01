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

    viewFile(url, title) {
        const backdrop = document.createElement('div');
        backdrop.className = 'modal-backdrop';
        backdrop.style.display = 'flex';
        backdrop.innerHTML = `
            <div class="modal" style="width:90%; max-width:1000px; height:90vh; display:flex; flex-direction:column">
                <div class="flex-between mb-10">
                    <h3 class="m-0">${escapeHtml(title)}</h3>
                    <button class="button secondary w-auto small" onclick="this.closest('.modal-backdrop').remove()">Close</button>
                </div>
                <div style="flex:1; background:#f0f0f0; border-radius:8px; overflow:hidden">
                    <iframe src="${escapeAttr(url)}" style="width:100%; height:100%; border:none"></iframe>
                </div>
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

    // Enforce account restrictions
    try {
        const freshUser = await SupabaseDB.getUser(user.email);
        if (!freshUser || !freshUser.active || freshUser.flagged || isAccountLocked(freshUser)) {
            let msg = 'Access denied.';
            if (!freshUser) msg = 'Account not found.';
            else if (!freshUser.active) msg = 'Your account has been deactivated.';
            else if (freshUser.flagged) msg = 'Your account is flagged for suspicious activities.';
            else if (isAccountLocked(freshUser)) msg = 'Your account is temporarily locked.';

            alert(msg + ' Logging out.');
            await SessionManager.clearCurrentUser();
            window.location.href = 'index.html';
            return null;
        }

        // Force password change if reset is approved but not yet completed
        if (freshUser.reset_request && freshUser.reset_request.status === 'approved') {
            alert('You must change your password before continuing.');
            window.location.href = 'index.html';
            return null;
        }
    } catch (e) {
        console.warn('Initial restriction check failed, will retry in background polling.', e);
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
                        deferredPrompt.prompt();
                        const { outcome } = await deferredPrompt.userChoice;
                        deferredPrompt = null;
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
            const [personal, broadcasts, enrollments] = await Promise.all([
                SupabaseDB.getNotifications(user.email),
                SupabaseDB.getBroadcasts(),
                user.role === 'student' ? SupabaseDB.getEnrollments(user.email) : Promise.resolve([])
            ]);

            const enrolledCourseIds = enrollments.map(e => e.course_id);

            // 2. Filter broadcasts based on relevance and recency (e.g. last 14 days)
            const recentDate = new Date();
            recentDate.setDate(recentDate.getDate() - 14);

            const relevantBroadcasts = broadcasts.filter(b => {
                // Check recency
                if (new Date(b.created_at) < recentDate) return false;
                // If course-specific, must be enrolled
                if (b.course_id && !enrolledCourseIds.includes(b.course_id)) return false;
                // If role-specific, must match role
                if (b.target_role && b.target_role !== user.role) return false;
                return true;
            });

            // 3. Mark broadcasts as "read" locally using localStorage
            const readBroadcasts = JSON.parse(localStorage.getItem(`read_broadcasts_${user.email}`) || '[]');
            const mappedBroadcasts = relevantBroadcasts.map(b => ({
                ...b,
                is_read: readBroadcasts.includes(b.id),
                is_broadcast: true
            }));

            // 4. Combine and sort
            return [...personal, ...mappedBroadcasts].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        } catch (e) {
            console.warn('Failed to fetch notifications:', e);
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

    async subscribeToPush() {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            console.warn('Push messaging is not supported');
            return;
        }

        try {
            const registration = await navigator.serviceWorker.ready;
            const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: this.vapidPublicKey
            });
            // Here you would send the subscription to your backend
            // await SupabaseDB.savePushSubscription(subscription);
        } catch (e) {
            console.error('Failed to subscribe to push:', e);
        }
    },

    async markAllAsRead() {
        const user = await SessionManager.getCurrentUser();
        if (!user) return;

        const notifications = await this.fetchNotifications();

        // Mark personal notifications in DB
        await SupabaseDB.markNotificationsAsRead(user.email);

        // Mark broadcasts in localStorage
        const broadcastIds = notifications.filter(n => n.is_broadcast).map(n => n.id);
        const readBroadcasts = JSON.parse(localStorage.getItem(`read_broadcasts_${user.email}`) || '[]');
        const updatedRead = [...new Set([...readBroadcasts, ...broadcastIds])];
        localStorage.setItem(`read_broadcasts_${user.email}`, JSON.stringify(updatedRead));

        this.updateUI();
    },

    async updateUI() {
        const notifications = await this.fetchNotifications();
        const unreadCount = notifications.filter(n => !n.is_read).length;
        
        const bell = document.getElementById('unreadCount');
        if (bell) {
            bell.textContent = unreadCount;
            bell.style.display = unreadCount > 0 ? 'flex' : 'none';
        }

        const list = document.getElementById('notifList');
        if (list) {
            try {
            list.innerHTML = `
                <div style="padding:10px; border-bottom:1px solid #eee; display:flex; justify-content:space-between; align-items:center">
                    <strong>Notifications</strong>
                    <button class="button secondary" style="padding:2px 6px; font-size:10px" onclick="NotificationManager.markAllAsRead()">Mark all as read</button>
                </div>
                ${notifications.length === 0 ? '<div style="padding:20px; text-align:center; color:#666">No notifications</div>' : ''}
                ${notifications.map(n => `
                    <div style="padding:10px; border-bottom:1px solid #f9f9f9; background:${n.is_read ? '#fff' : '#f0f4ff'}; cursor:pointer"
                         onclick="${n.is_broadcast ? `NotificationManager.markBroadcastRead('${n.id}');` : ''} ${n.link ? `window.location.href='${escapeAttr(n.link)}'` : ''}">
                        <div style="font-weight:600; font-size:13px">${n.is_broadcast ? '📢 ' : ''}${escapeHtml(n.title)}</div>
                        <div style="font-size:12px; color:#444">${escapeHtml(n.message)}</div>
                        <div style="font-size:10px; color:#999; margin-top:4px">${new Date(n.created_at).toLocaleString()}</div>
                    </div>
                `).join('')}
            `;
            } catch (e) {
                console.warn('Error updating notif list:', e);
                list.innerHTML = '<div style="padding:10px">Could not load notifications.</div>';
            }
        }
        
        // Browser notification for new unread ones
        const lastCount = parseInt(sessionStorage.getItem('lastNotifCount') || '0');
        if (unreadCount > lastCount) {
            const latest = notifications[notifications.length - 1];
        if (latest) this.sendBrowserNotification(latest.title, latest.message);
        }
        sessionStorage.setItem('lastNotifCount', unreadCount);
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

    async sendBrowserNotification(title, body) {
        // Push notifications disabled per request
    },

    async subscribeToPush() {
        UI.showNotification('Browser push notifications are currently disabled.', 'info');
    },

    initPolling() {
        if (this._polling) return;
        this._polling = true;
        this.updateUI();
        setInterval(() => this.updateUI(), 10000); // Poll every 10s
        
        // Request browser permission if not set
        if (Notification.permission === 'default') {
            requestNotificationPermission();
        }

        const bell = document.getElementById('notifBell');
        const list = document.getElementById('notifList');
        if (bell && list) {
            bell.addEventListener('click', (e) => {
                e.stopPropagation();
                list.classList.toggle('active');
            });
            document.addEventListener('click', () => list.classList.remove('active'));
            list.addEventListener('click', (e) => e.stopPropagation());
        }
    }
};

async function updateMaintBanner() {
    let m;
    try {
        m = await SupabaseDB.getMaintenance(true);
    } catch (e) {
        console.warn('Maintenance check failed:', e);
        return;
    }

    // Force check account status and maintenance for active sessions
    try {
        const user = await SessionManager.getCurrentUser();
        if (user) {
            // Bypass cache to get real-time status during polling
            const fresh = await SupabaseDB.getUser(user.email, true);
            const isMaint = isActiveMaintenance(m);
            const isRestricted = !fresh || !fresh.active || fresh.flagged || isAccountLocked(fresh);

            if ((isMaint && user.role !== 'admin') || isRestricted) {
                let msg = isMaint ? 'System entered maintenance mode.' : 'Your account status has changed.';
                await SessionManager.clearCurrentUser();
                if (!window.location.href.includes('index.html')) {
                    alert(msg + ' Logging out.');
                    window.location.href = 'index.html';
                }
            }
        }
    } catch (e) {
        console.warn('Account status check failed:', e);
    }

    const ids = ['maintBanner', 'maintBannerSignup', 'maintBannerLogin', 'maintBannerReset'];
    
    let content = '';

    if (isActiveMaintenance(m)) {
        const until = getActiveMaintenanceEnd(m);
        const remain = Math.max(0, (until || Date.now()) - Date.now());
        const h = Math.floor(remain / 3600000), mm = Math.floor((remain % 3600000) / 60000), ss = Math.floor((remain % 60000) / 1000);
        content = `System maintenance ACTIVE — restores in ${h}h ${mm}m ${ss}s (until ${new Date(until || Date.now()).toLocaleString()})`;
    } else {
        const up = getUpcomingMaintenance(m);
        if (up) {
            const remain = Math.max(0, new Date(up.startAt).getTime() - Date.now());
            const h = Math.floor(remain / 3600000), mm = Math.floor((remain % 3600000) / 60000), ss = Math.floor((remain % 60000) / 1000);
            content = `Upcoming system maintenance — starts in ${h}h ${mm}m ${ss}s (at ${new Date(up.startAt).toLocaleString()})`;
        }
    }

    ids.forEach(id => {
        const b = document.getElementById(id);
        if (b) {
            if (content) {
                b.style.display = 'block';
                b.textContent = content;
            } else {
                b.style.display = 'none';
            }
        }
    });
}

window.normalizeEmail = function(email) {
    return (email || '').trim().toLowerCase();
};

window.isValidEmail = function(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
};

window.isStrongPassword = function(pass) {
    if (!pass || pass.length < 8) return false;
    const hasUpper = /[A-Z]/.test(pass);
    const hasLower = /[a-z]/.test(pass);
    const hasNumber = /\d/.test(pass);
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(pass);
    return hasUpper && hasLower && hasNumber && hasSpecial;
};

window.isAccountLocked = function(user) {
    return !!(user && user.locked_until && Date.now() < new Date(user.locked_until).getTime());
};

window.isActiveMaintenance = function(m) {
    if (!m) return false;
    const now = new Date().getTime();
    if (m.enabled) {
        if (!m.manual_until) return true;
        if (now < new Date(m.manual_until).getTime()) return true;
    }
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
    if (m && m.manual_until && now < new Date(m.manual_until).getTime()) return new Date(m.manual_until).getTime();
    const s = (Array.isArray(m.schedules) ? m.schedules : []).find(s => now >= new Date(s.startAt).getTime() && now <= new Date(s.endAt).getTime());
    return s ? new Date(s.endAt).getTime() : null;
};

window.NotificationManager = NotificationManager;

window.hashPassword = async function(password, salt = '') {
    const encoder = new TextEncoder();
    // Use a fixed system salt + provided salt (e.g. email)
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

window.UI = UI;

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
            await SessionManager.clearCurrentUser();
            alert('Your session has expired due to inactivity.');
            window.location.href = 'index.html';
        } else if (elapsed >= (this.idleLimit - this.warningTime) && !this.warningShown) {
            this.warningShown = true;
            UI.showNotification('Your session will expire in 1 minute due to inactivity. Move your mouse or press a key to stay logged in.', 'info');
        }
    }
};

window.IdleManager = IdleManager;
