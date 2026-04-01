async function renderDashboard() {
  NotificationManager.initPolling();
  SupabaseDB.deleteExpiredBroadcasts().catch(e => console.warn('Cleanup error:', e));

  const content = document.getElementById('pageContent');
  if (!content) return;

  try {
    const [users, assignments, submissions, maintenance] = await Promise.all([
      SupabaseDB.getUsers(),
      SupabaseDB.getAssignments(),
      SupabaseDB.getSubmissions(),
      SupabaseDB.getMaintenance()
    ]);
    const stats = {
      totalUsers: users.length,
      students: users.filter(u => u.role === 'student').length,
      teachers: users.filter(u => u.role === 'teacher').length,
      locked: users.filter(u => isAccountLocked(u)).length,
      flagged: users.filter(u => u.flagged).length,
      pendingResets: users.filter(u => u.reset_request && u.reset_request.status === 'pending').length,
      assignments: assignments.length,
      submissions: submissions.length,
      pendingGrading: submissions.filter(s => s.status === 'submitted').length,
      maintStatus: isActiveMaintenance(maintenance) ? 'Active' : 'Off'
    };

    content.innerHTML = `
    <div class="card">
      <h3>Broadcast Notification</h3>
      <div class="grid-2">
        <input type="text" id="bcTitle" placeholder="Title" class="no-margin">
        <select id="bcRole" class="no-margin">
          <option value="all">All Users</option>
          <option value="student">Students</option>
          <option value="teacher">Teachers</option>
        </select>
      </div>
      <div class="grid-2 mt-10">
        <textarea id="bcMsg" placeholder="Message content..." rows="2" class="no-margin"></textarea>
        <div class="flex-column gap-5">
            <label class="tiny m-0">Expiry (days)</label>
            <input type="number" id="bcExpiry" value="30" min="1" class="no-margin">
        </div>
      </div>
      <button class="button mt-10" onclick="broadcastNotif()">Send Broadcast</button>
    </div>

    <div class="stats-grid">
      <div class="stat-card"><h4>Total Users</h4><div class="value">${escapeHtml(stats.totalUsers)}</div></div>
      <div class="stat-card" style="border-left-color: var(--danger)"><h4>Locked Accounts</h4><div class="value">${escapeHtml(stats.locked)}</div></div>
      <div class="stat-card" style="border-left-color: var(--warn)"><h4>Flagged Accounts</h4><div class="value">${escapeHtml(stats.flagged)}</div></div>
      <div class="stat-card"><h4>Pending Resets</h4><div class="value">${escapeHtml(stats.pendingResets)}</div></div>
      <div class="stat-card"><h4>Assignments</h4><div class="value">${escapeHtml(stats.assignments)}</div></div>
      <div class="stat-card"><h4>Submissions</h4><div class="value">${escapeHtml(stats.submissions)}</div></div>
      <div class="stat-card"><h4>Pending Grading</h4><div class="value">${escapeHtml(stats.pendingGrading)}</div></div>
      <div class="stat-card" style="border-left-color: ${stats.maintStatus === 'Active' ? 'var(--warn)' : 'var(--ok)'}">
        <h4>Maintenance</h4><div class="value">${escapeHtml(stats.maintStatus)}</div>
      </div>
    </div>

    <section>
      <h3>Recent Activity</h3>
      <div class="small">System running normally. All services operational.</div>
    </section>
    `;
  } catch (error) {
    console.error('Dashboard error:', error);
    content.innerHTML = `
    <div class="card" style="border-left: 4px solid var(--danger)">
      <h3>Error Loading Dashboard</h3>
      <p>Failed to retrieve system statistics. Please check your database connection.</p>
      <div class="small danger-text">${escapeHtml(error.message)}</div>
      <button class="button" onclick="renderDashboard()" style="width:auto; margin-top:10px">Retry</button>
    </div>`;
  }
}

let allUsers = [];
let filteredUsers = [];

async function renderUsers() {
  const content = document.getElementById('pageContent');
  if (!content) return;

  try {
    allUsers = await SupabaseDB.getUsers();
    content.innerHTML = `
    <section>
      <div class="controls-row">
        <input type="text" id="userSearch" class="search-input no-margin" placeholder="Search by name or email" oninput="filterUsers()">
        <select id="roleFilter" class="filter-select no-margin" onchange="filterUsers()">
          <option value="all">All Roles</option>
          <option value="student">Student</option>
          <option value="teacher">Teacher</option>
          <option value="admin">Admin</option>
        </select>
        <select id="statusFilter" class="filter-select no-margin" onchange="filterUsers()">
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="locked">Locked</option>
          <option value="flagged">Flagged</option>
        </select>
        <button class="button secondary" style="width:auto;" onclick="exportUsersCSV()">Export CSV</button>
      </div>
      <div style="margin-bottom:20px">
        <button class="button" onclick="showCreateUserForm()" style="width:auto; padding: 10px 30px">+ Add User</button>
      </div>
      
      <div id="usersList" class="grid"></div>
    </section>
    `;
    filteredUsers = allUsers;
    displayUsers(allUsers);
  } catch (error) {
    console.error('Users error:', error);
    content.innerHTML = `
    <div class="card danger-border">
      <h3>Error Loading Users</h3>
      <p>Could not fetch user list from the server.</p>
      <div class="small danger-text">${escapeHtml(error.message)}</div>
      <button class="button" onclick="renderUsers()" style="width:auto; margin-top:10px">Retry</button>
    </div>`;
  }
}

function filterUsers() {
  const searchTerm = document.getElementById('userSearch').value.toLowerCase();
  const roleFilter = document.getElementById('roleFilter').value;
  const statusFilter = document.getElementById('statusFilter').value;

  filteredUsers = allUsers.filter(user => {
    const name = user.full_name || '';
    const email = user.email || '';
    const matchesSearch = name.toLowerCase().includes(searchTerm) || 
                          email.toLowerCase().includes(searchTerm);
    const matchesRole = roleFilter === 'all' || user.role === roleFilter;
    
    let matchesStatus = true;
    if (statusFilter !== 'all') {
      if (statusFilter === 'active') matchesStatus = user.active;
      else if (statusFilter === 'inactive') matchesStatus = !user.active;
      else if (statusFilter === 'flagged') matchesStatus = user.flagged;
      else if (statusFilter === 'locked') matchesStatus = isAccountLocked(user);
    }

    return matchesSearch && matchesRole && matchesStatus;
  });

  displayUsers(filteredUsers);
}

function displayUsers(users) {
  const list = document.getElementById('usersList');
  if (!list) return;
  
  if (users.length === 0) {
      list.innerHTML = '<div class="empty">No users found matching your criteria.</div>';
      return;
  }

  list.innerHTML = users.map(user => {
    const isLocked = isAccountLocked(user);
    const statusBadges = [];
    if (!user.active) statusBadges.push('<span class="badge badge-inactive">INACTIVE</span>');
    else statusBadges.push('<span class="badge badge-active">ACTIVE</span>');
    
    if (user.flagged) statusBadges.push('<span class="badge badge-flagged">FLAGGED</span>');
    if (isLocked) statusBadges.push('<span class="badge badge-lock">LOCKED</span>');

    return `
      <div class="card">
        <div class="user-header flex-between" style="margin-bottom:10px">
          <div class="user-title" style="font-weight:700">
            ${escapeHtml(user.full_name)} <span class="small">(${escapeHtml(user.role)}) - ${escapeHtml(user.email)}</span>
          </div>
          <div class="flex gap-10">${statusBadges.join('')}</div>
        </div>
        <div class="user-meta small" style="margin-bottom:15px">
          <div>Phone: ${escapeHtml(user.phone || 'N/A')} | 
          Password: <span id="pw-${escapeAttr(user.id || user.email)}">[ENCRYPTED]</span>
          </div>
          <div style="margin-top:4px">Failed Attempts: ${escapeHtml(user.failed_attempts || 0)} |
          Lockouts: ${escapeHtml(user.lockouts || 0)} |
          Joined: ${escapeHtml(user.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A')}</div>
        </div>
        <div class="action-row flex" style="flex-wrap:wrap; gap:8px">
          <button class="button" style="width:auto; padding:6px 12px; font-size:12px" onclick="editUser('${escapeAttr(user.email)}')">Edit</button>
          <button class="button secondary" style="width:auto; padding:6px 12px; font-size:12px" onclick="toggleUserStatus('${escapeAttr(user.email)}', ${escapeAttr(user.active)})">
            ${user.active ? 'Deactivate' : 'Activate'}
          </button>
          <button class="button danger" style="width:auto; padding:6px 12px; font-size:12px" onclick="deleteUserByEmail('${escapeAttr(user.email)}')">Delete</button>
          <button class="button secondary" style="width:auto; padding:6px 12px; font-size:12px" onclick="lockUser('${escapeAttr(user.email)}', 30)">Lock 30m</button>
          <button class="button secondary" style="width:auto; padding:6px 12px; font-size:12px" onclick="lockUser('${escapeAttr(user.email)}', 1440)">Lock 24h</button>
          <button class="button" style="width:auto; padding:6px 12px; font-size:12px" onclick="unlockUser('${escapeAttr(user.email)}')">Unlock</button>
          <button class="button ${user.flagged ? '' : 'danger'}" style="width:auto; padding:6px 12px; font-size:12px" onclick="toggleUserFlag('${escapeAttr(user.email)}', ${escapeAttr(user.flagged)})">
            ${user.flagged ? 'Unflag' : 'Flag'}
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// Ensure all handlers are global
window.renderDashboard = renderDashboard;
window.renderUsers = renderUsers;
window.renderResets = renderResets;
window.renderAnalytics = renderAnalytics;
window.renderMaintenance = renderMaintenance;
window.renderHealth = renderHealth;
window.renderManagement = renderManagement;
window.renderSettings = renderSettings;
window.renderSystem = renderSystem;
window.editUser = editUser;
window.toggleUserStatus = toggleUserStatus;
window.deleteUserByEmail = deleteUserByEmail;
window.lockUser = lockUser;
window.unlockUser = unlockUser;
window.toggleUserFlag = toggleUserFlag;
window.showCreateUserForm = showCreateUserForm;
window.exportUsersCSV = exportUsersCSV;
window.approveReset = approveReset;
window.denyReset = denyReset;
window.broadcastNotif = broadcastNotif;
window.showAddScheduleForm = showAddScheduleForm;
window.removeSchedule = removeSchedule;
window.filterUsers = filterUsers;
window.saveAutoSetting = saveAutoSetting;
window.saveNotificationSettings = saveNotificationSettings;
window.previewCleanup = previewCleanup;
window.executeCleanup = executeCleanup;
window.exportBackup = exportBackup;
window.importBackup = importBackup;

async function editUser(email) {
  const user = await SupabaseDB.getUser(email);
  if (user) showUserForm(user);
}

async function toggleUserStatus(email, currentStatus) {
  try {
    const user = await SupabaseDB.getUser(email);
    if (user) {
      user.active = !currentStatus;
      await SupabaseDB.saveUser(user);
      UI.showNotification(`User ${user.active ? 'activated' : 'deactivated'}`);
      renderUsers();
    }
  } catch (e) { alert('Error: ' + e.message); }
}

async function deleteUserByEmail(email) {
  if (confirm(`Are you sure you want to delete ${email}? This cannot be undone.`)) {
    try {
      await SupabaseDB.deleteUser(email);
      UI.showNotification('User deleted');
      renderUsers();
    } catch (e) { alert('Error: ' + e.message); }
  }
}

async function lockUser(email, minutes) {
  try {
    const user = await SupabaseDB.getUser(email);
    if (user) {
      user.locked_until = new Date(Date.now() + minutes * 60000).toISOString();
      await SupabaseDB.saveUser(user);
      UI.showNotification(`User locked for ${minutes} minutes`);
      renderUsers();
    }
  } catch (e) { alert('Error: ' + e.message); }
}

async function unlockUser(email) {
  try {
    const user = await SupabaseDB.getUser(email);
    if (user) {
      user.locked_until = null;
      user.failed_attempts = 0;
      await SupabaseDB.saveUser(user);
      UI.showNotification('User unlocked');
      renderUsers();
    }
  } catch (e) { alert('Error: ' + e.message); }
}

async function toggleUserFlag(email, currentFlag) {
  try {
    const user = await SupabaseDB.getUser(email);
    if (user) {
      user.flagged = !currentFlag;
      await SupabaseDB.saveUser(user);
      UI.showNotification(`User ${user.flagged ? 'flagged' : 'unflagged'}`);
      renderUsers();
    }
  } catch (e) { alert('Error: ' + e.message); }
}

function showCreateUserForm() {
  showUserForm(null);
}

function exportUsersCSV() {
  const listToExport = filteredUsers.length > 0 ? filteredUsers : allUsers;
  if (listToExport.length === 0) return alert('No users to export');
  const headers = ['Full Name', 'Email', 'Role', 'Status', 'Joined'];
  const rows = listToExport.map(u => [
    `"${(u.full_name || '').replace(/"/g, '""')}"`,
    `"${(u.email || '').replace(/"/g, '""')}"`,
    `"${(u.role || '').replace(/"/g, '""')}"`,
    u.active ? 'Active' : 'Inactive',
    new Date(u.created_at).toLocaleDateString()
  ]);
  const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", "users_export.csv");
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

async function broadcastNotif() {
  const title = document.getElementById('bcTitle').value;
  const role = document.getElementById('bcRole').value;
  const msg = document.getElementById('bcMsg').value;
  const expiryDays = parseInt(document.getElementById('bcExpiry').value) || 30;

  if (!title || !msg) return alert('Title and message required');

  try {
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + expiryDays);

    const broadcast = {
        id: crypto.randomUUID(),
        title,
        message: msg,
        target_role: role === 'all' ? null : role,
        type: 'broadcast',
        expires_at: expiryDate.toISOString(),
        created_at: new Date().toISOString()
    };

    await SupabaseDB.saveBroadcast(broadcast);

    alert(`Broadcast sent successfully.`);
    document.getElementById('bcTitle').value = '';
    document.getElementById('bcMsg').value = '';
  } catch (e) { alert('Broadcast failed: ' + e.message); }
}

async function removeSchedule(idx) {
  if (confirm('Remove this maintenance schedule?')) {
    try {
      const maintenance = await SupabaseDB.getMaintenance();
      maintenance.schedules.splice(idx, 1);
      await SupabaseDB.saveMaintenance(maintenance);
      renderMaintenance();
    } catch (e) { alert('Error: ' + e.message); }
  }
}

function saveAutoSetting(key, val) {
  localStorage.setItem(key, val);
  UI.showNotification('Setting saved');
}

async function saveNotificationSettings() {
  const prefs = {
    inApp: document.getElementById('prefInApp').checked,
    push: document.getElementById('prefPush').checked,
    email: document.getElementById('prefEmail').checked
  };
  await NotificationManager.updatePreferences(prefs);
}

async function renderResets() {
  const content = document.getElementById('pageContent');
  if (!content) return;

  try {
    const users = await SupabaseDB.getUsers();
    const pendingResets = users.filter(u => u.reset_request && u.reset_request.status === 'pending');
    content.innerHTML = `
    <section>
      <h3>Password Reset Requests</h3>
      ${pendingResets.length === 0 ? '<p class="empty">No pending reset requests.</p>' : `
        <div class="card" style="padding:0; overflow-x:auto">
          <table>
            <thead><tr><th>Name</th><th>Email</th><th>Requested At</th><th>Actions</th></tr></thead>
            <tbody>
              ${pendingResets.map(user => `
                <tr>
                  <td>${escapeHtml(user.full_name)}</td>
                  <td>${escapeHtml(user.email)}</td>
                  <td>${escapeHtml(new Date(user.reset_request.created_at).toLocaleString())}</td>
                  <td>
                    <button class="button" style="width:auto; padding:4px 8px; font-size:12px" onclick="approveReset('${escapeAttr(user.email)}')">Approve</button>
                    <button class="button danger" style="width:auto; padding:4px 8px; font-size:12px" onclick="denyReset('${escapeAttr(user.email)}')">Deny</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `}
    </section>
    `;
  } catch (error) {
    console.error('Resets error:', error);
    content.innerHTML = `
    <div class="card danger-border">
      <h3>Error Loading Resets</h3>
      <div class="small danger-text">${escapeHtml(error.message)}</div>
      <button class="button" onclick="renderResets()" style="width:auto; margin-top:10px">Retry</button>
    </div>`;
  }
}

async function updateSidebarBadges() {
  const users = await SupabaseDB.getUsers();
  const pendingResets = users.filter(u => u.reset_request && u.reset_request.status === 'pending').length;
  const badge = document.getElementById('resetBadge');
  if (badge) {
    badge.textContent = pendingResets;
    badge.style.display = pendingResets > 0 ? 'inline-block' : 'none';
  }
}

async function approveReset(email) {
  try {
    const user = await SupabaseDB.getUser(email);
    if (user && user.reset_request) {
      const array = new Uint32Array(1);
      crypto.getRandomValues(array);
      const tempPassword = array[0].toString(36).slice(-8);

      // Hash the temporary password
      const hashedTemp = await window.hashPassword(tempPassword, email);

      user.reset_request.status = 'approved';
      user.reset_request.temp_password = hashedTemp;
      user.reset_request.expires_at = new Date(Date.now() + 72 * 3600 * 1000).toISOString();

      if (await SupabaseDB.saveUser(user)) {
        alert(`Reset request approved. Temporary password: ${tempPassword}\n\nPLEASE COPY THIS NOW. IT WILL NOT BE SHOWN AGAIN.`);
        renderResets();
        updateSidebarBadges();
      }
    }
  } catch (e) {
    alert('Error approving reset: ' + e.message);
  }
}

async function denyReset(email) {
  const reason = prompt("Enter denial reason:");
  if (reason !== null) {
    try {
      const user = await SupabaseDB.getUser(email);
      if (user && user.reset_request) {
        user.reset_request.status = 'denied';
        user.reset_request.denial_reason = reason;
        if (await SupabaseDB.saveUser(user)) {
          alert('Reset request denied');
          renderResets();
          updateSidebarBadges();
        }
      }
    } catch (e) {
      alert('Error denying reset: ' + e.message);
    }
  }
}

async function renderAnalytics() {
  const content = document.getElementById('pageContent');
  if (!content) return;

  try {
    const [submissions, users] = await Promise.all([
      SupabaseDB.getSubmissions(),
      SupabaseDB.getUsers()
    ]);

    const submissionsByDate = {};
    submissions.forEach(s => {
      const date = new Date(s.submitted_at || Date.now()).toLocaleDateString();
      submissionsByDate[date] = (submissionsByDate[date] || 0) + 1;
    });

    const dates = Object.keys(submissionsByDate).sort((a, b) => new Date(a) - new Date(b));
    const counts = dates.map(d => submissionsByDate[d]);

    content.innerHTML = `
    <section>
      <h3>System Analytics</h3>
      <div class="stats-grid">
        <div class="stat-card"><h4>Submission Rate</h4><div class="value">${escapeHtml(submissions.length)}</div></div>
        <div class="stat-card"><h4>Active Users</h4><div class="value">${escapeHtml(users.filter(u => u.active).length)}</div></div>
      </div>
      <div class="card" style="margin-top:20px">
        <h4>Submission Activity</h4>
        <div style="height:300px; margin-top:20px">
          <canvas id="analyticsChart"></canvas>
        </div>
      </div>
    </section>
    `;

    if (dates.length > 0) {
      const ctx = document.getElementById('analyticsChart').getContext('2d');
      new Chart(ctx, {
        type: 'line',
        data: {
          labels: dates,
          datasets: [{
            label: 'Submissions',
            data: counts,
            borderColor: '#5b2ea6',
            backgroundColor: 'rgba(91, 46, 166, 0.1)',
            tension: 0.3,
            fill: true
          }]
        },
        options: {
          scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
          responsive: true,
          maintainAspectRatio: false
        }
      });
    }
  } catch (error) {
    console.error('Analytics error:', error);
    content.innerHTML = `
    <div class="card danger-border">
      <h3>Error Loading Analytics</h3>
      <div class="small danger-text">${escapeHtml(error.message)}</div>
      <button class="button" onclick="renderAnalytics()" style="width:auto; margin-top:10px">Retry</button>
    </div>`;
  }
}

async function renderMaintenance() {
  const content = document.getElementById('pageContent');
  if (!content) return;

  try {
    const maintenance = await SupabaseDB.getMaintenance();
    content.innerHTML = `
    <section>
      <h3>Maintenance Settings</h3>
      <form id="maintenanceForm" class="card">
        <div style="margin-bottom:15px">
            <label class="flex" style="align-items:center; gap:10px">
                <input type="checkbox" id="maintenanceEnabled" ${maintenance.enabled ? 'checked' : ''} style="width:auto; margin:0">
                Enable Maintenance Mode
            </label>
        </div>
        <div style="margin-bottom:15px">
            <label>Manual Until (optional):</label>
            <input type="datetime-local" id="manualUntil" value="${maintenance.manual_until ? new Date(maintenance.manual_until).toISOString().slice(0, 16) : ''}">
        </div>
        <button type="submit" class="button" style="width:auto; padding:10px 40px">Save Settings</button>
      </form>

      <div style="margin-top:30px">
        <h4>Scheduled Maintenance</h4>
        <div id="schedulesList" class="grid">
          ${(maintenance.schedules || []).map((schedule, idx) => `
            <div class="card flex-between">
              <div>
                <div class="small">From: ${escapeHtml(new Date(schedule.startAt).toLocaleString())}</div>
                <div class="small">To: ${escapeHtml(new Date(schedule.endAt).toLocaleString())}</div>
              </div>
              <button class="button danger" onclick="removeSchedule(${escapeAttr(idx)})" style="width:auto; padding:6px 12px; font-size:12px">Remove</button>
            </div>
          `).join('') || '<div class="empty">No schedules configured.</div>'}
        </div>
        <button class="button" onclick="showAddScheduleForm()" style="width:auto; margin-top:15px">+ Add Schedule</button>
      </div>
    </section>
  `;
  document.getElementById('maintenanceForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    maintenance.enabled = document.getElementById('maintenanceEnabled').checked;
    maintenance.manual_until = document.getElementById('manualUntil').value ? new Date(document.getElementById('manualUntil').value).toISOString() : null;
    if (await SupabaseDB.saveMaintenance(maintenance)) { alert('Saved!'); renderMaintenance(); }
  });
  } catch (error) {
    console.error('Maintenance error:', error);
    content.innerHTML = `<div class="card danger-border">
      <h3>Error Loading Settings</h3>
      <div class="small danger-text">${escapeHtml(error.message)}</div>
      <button class="button" onclick="renderMaintenance()" style="width:auto; margin-top:10px">Retry</button>
    </div>`;
  }
}

async function renderHealth() {
  const content = document.getElementById('pageContent');
  if (!content) return;

  try {
    const start = performance.now();
    const [maint, users, assignments, subs] = await Promise.all([
      SupabaseDB.getMaintenance(true),
      SupabaseDB.getUsers(),
      SupabaseDB.getAssignments(),
      SupabaseDB.getSubmissions()
    ]);
    const apiStats = SupabaseDB.getStats();
    const dbLatency = apiStats.lastRequestTime;

    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - (60 * 60 * 1000));
    const loginsLastHour = users.filter(u => new Date(u.created_at) > oneHourAgo).length;

    const thirtyMinsAgo = new Date(now.getTime() - (30 * 60 * 1000));
    const activeSessions = users.filter(u => new Date(u.updated_at) > thirtyMinsAgo).length;

    const totalRecords = users.length + assignments.length + subs.length;
    const estStorageUsage = (totalRecords * 0.5 / 1024).toFixed(2);

    content.innerHTML = `
      <section>
        <h3>System Health & Performance</h3>
        <div class="stats-grid">
          <div class="stat-card"><h4>DB Response</h4><div class="value">${escapeHtml(dbLatency)}ms</div></div>
          <div class="stat-card"><h4>Service Status</h4><div class="value success-text">ONLINE</div></div>
          <div class="stat-card"><h4>Est. Storage</h4><div class="value">${escapeHtml(estStorageUsage)}MB</div></div>
          <div class="stat-card"><h4>API Success</h4><div class="value" style="color:${apiStats.successRate > 95 ? 'var(--ok)' : 'var(--danger)'}">${escapeHtml(apiStats.successRate)}%</div></div>
        </div>

        <div class="grid-2 mt-20">
          <div class="card">
            <h4>Real-time Traffic</h4>
            <ul style="list-style:none; padding:0">
              <li style="padding:10px 0; border-bottom:1px solid var(--border)"><strong>New Users (1h):</strong> ${escapeHtml(loginsLastHour)}</li>
              <li style="padding:10px 0; border-bottom:1px solid var(--border)"><strong>Active Users (30m):</strong> ${escapeHtml(activeSessions)}</li>
              <li style="padding:10px 0"><strong>Total Requests:</strong> ${escapeHtml(apiStats.totalRequests)}</li>
            </ul>
          </div>
          <div class="card">
            <h4>Backend Health</h4>
            <p class="small">All services operational. Maintenance mode: <strong style="color:${isActiveMaintenance(maint) ? 'var(--danger)' : 'var(--ok)'}">${isActiveMaintenance(maint) ? 'ACTIVE' : 'INACTIVE'}</strong></p>
          </div>
        </div>
      </section>
    `;
  } catch (error) {
    console.error('Health error:', error);
    content.innerHTML = `<div class="card danger-border"><h3>Health Check Failed</h3><button class="button" onclick="renderHealth()" style="width:auto">Retry</button></div>`;
  }
}

async function renderManagement() {
  const content = document.getElementById('pageContent');
  if (!content) return;
  content.innerHTML = `
    <section>
      <h3>System Management</h3>
      <div class="grid-2">
        <div class="card">
          <h4>Database Cleanup</h4>
          <p class="small">Remove old logs, drafts, and unused records.</p>
          <button class="button" style="width:auto; margin-top:10px" onclick="previewCleanup()">Preview Cleanup</button>
        </div>
        <div class="card">
          <h4>System Backup</h4>
          <p class="small">Export or Restore system data.</p>
          <div class="flex gap-10" style="margin-top:10px">
            <button class="button" onclick="exportBackup()">Export Backup</button>
            <button class="button secondary" onclick="document.getElementById('importFile').click()">Import/Restore</button>
            <input type="file" id="importFile" class="hidden" onchange="importBackup(event)">
          </div>
        </div>
        <div class="card">
          <h4>Automated Tasks</h4>
          <p class="small">Configure scheduled system maintenance.</p>
          <div class="flex" style="flex-direction:column; gap:8px; margin-top:10px">
            <label class="small flex" style="align-items:center; gap:8px"><input type="checkbox" id="autoCleanupCheck" style="width:auto; margin:0" onchange="saveAutoSetting('autoCleanup', this.checked)"> Daily Auto-Cleanup</label>
            <label class="small flex" style="align-items:center; gap:8px"><input type="checkbox" id="autoBackupCheck" style="width:auto; margin:0" onchange="saveAutoSetting('autoBackup', this.checked)"> Weekly Cloud Backup</label>
          </div>
        </div>
      </div>
      <div id="mgt-area" style="margin-top:20px"></div>
    </section>
  `;
  // Set initial states from localStorage
  if (document.getElementById('autoCleanupCheck')) document.getElementById('autoCleanupCheck').checked = localStorage.getItem('autoCleanup') === 'true';
  if (document.getElementById('autoBackupCheck')) document.getElementById('autoBackupCheck').checked = localStorage.getItem('autoBackup') === 'true';
}

async function previewCleanup() {
  const [users, courses] = await Promise.all([SupabaseDB.getUsers(), SupabaseDB.getCourses()]);
  const inactiveUsers = users.filter(u => !u.active);
  const draftCourses = courses.filter(c => c.status === 'draft');

  const area = document.getElementById('mgt-area');
  area.innerHTML = `
    <div class="card">
      <h4>Cleanup Preview</h4>
      <p class="small">The following items are candidates for cleanup:</p>
      <ul class="small">
        <li>Inactive Users: ${escapeHtml(inactiveUsers.length)}</li>
        <li>Draft Courses: ${escapeHtml(draftCourses.length)}</li>
      </ul>
      <button class="button danger" style="width:auto; margin-top:10px" onclick="executeCleanup()">Execute Cleanup Now</button>
    </div>
  `;
}

async function executeCleanup() {
  if (!confirm('Are you sure? This action is irreversible.')) return;
  try {
    const [users, courses] = await Promise.all([SupabaseDB.getUsers(), SupabaseDB.getCourses()]);
    const inactiveUsers = users.filter(u => !u.active);
    const draftCourses = courses.filter(c => c.status === 'draft');

    const userProms = inactiveUsers.map(u => SupabaseDB.deleteUser(u.email));
    const courseProms = draftCourses.map(c => SupabaseDB.deleteCourse(c.id));

    await Promise.all([...userProms, ...courseProms]);

    alert(`Cleanup successful: ${inactiveUsers.length} users and ${draftCourses.length} courses removed.`);
    renderManagement();
  } catch (e) {
    alert('Cleanup failed: ' + e.message);
  }
}

async function exportBackup() {
  const [users, courses, assigns] = await Promise.all([SupabaseDB.getUsers(), SupabaseDB.getCourses(), SupabaseDB.getAssignments()]);
  const data = { users, courses, assigns, exportedAt: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `lms_backup_${Date.now()}.json`;
  a.click();
}

async function importBackup(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (confirm(`Restore ${data.users?.length || 0} users and ${data.courses?.length || 0} courses? This will overwrite existing records with same IDs.`)) {
        const userProms = (data.users || []).map(u => SupabaseDB.saveUser(u));
        const courseProms = (data.courses || []).map(c => SupabaseDB.saveCourse(c));
        const assignProms = (data.assigns || []).map(a => SupabaseDB.saveAssignment(a));

        await Promise.all([...userProms, ...courseProms, ...assignProms]);
        alert('System Restore completed successfully.');
        renderManagement();
      }
    } catch (err) {
      console.error('Restore error:', err);
      alert('Failed to restore backup: ' + err.message);
    }
  };
  reader.readAsText(file);
}

async function renderSettings() {
  const content = document.getElementById('pageContent');
  if (!content) return;

  const prefs = await NotificationManager.getPreferences();

  content.innerHTML = `
    <h2>Admin Settings</h2>
    <div class="card">
      <h3>Notification Preferences</h3>
      <p class="small">Choose how you want to receive system alerts.</p>
      <div class="flex-column gap-10 mt-15">
        <label class="flex-center-y gap-10"><input type="checkbox" id="prefInApp" ${prefs.inApp ? 'checked' : ''} class="w-auto m-0"> In-App Notifications</label>
        <label class="flex-center-y gap-10"><input type="checkbox" id="prefPush" ${prefs.push ? 'checked' : ''} class="w-auto m-0"> Browser Push Notifications</label>
        <label class="flex-center-y gap-10"><input type="checkbox" id="prefEmail" ${prefs.email ? 'checked' : ''} class="w-auto m-0"> Email Alerts</label>
        <button class="button w-auto mt-10 px-30" onclick="saveNotificationSettings()">Save Preferences</button>
      </div>
    </div>
    <div class="card mt-20">
      <h3>Push Subscription</h3>
      <p class="small">Enable real-time desktop notifications for system health and reset requests.</p>
      <button class="button secondary w-auto mt-10" onclick="NotificationManager.subscribeToPush()">Enable Push Notifications</button>
    </div>
  `;
}

async function renderSystem() {
  const content = document.getElementById('pageContent');
  if (!content) return;

  try {
    await SupabaseDB.getMaintenance();
    content.innerHTML = `
      <section>
        <h3>System Information</h3>
        <div class="grid">
          <div class="card">
            <h4>Database Status</h4>
            <div class="success-text bold">✅ Connected to Supabase</div>
          </div>
          <div class="card">
            <h4>Application Version</h4>
            <div>SmartLMS v1.1.1</div>
          </div>
          <div class="card">
            <h4>Session Storage</h4>
            <div>${sessionStorage.getItem('currentUser') ? '✅ Active Session' : '❌ No Session'}</div>
          </div>
        </div>
      </section>
    `;
  } catch (error) {
    console.error('System Info error:', error);
    content.innerHTML = `<div class="card danger-border">
      <h3>System Error</h3>
      <div class="small danger-text">${escapeHtml(error.message)}</div>
      <button class="button w-auto mt-10" onclick="renderSystem()">Retry</button>
    </div>`;
  }
}

function showUserForm(user = null) {
  const content = document.getElementById('pageContent');
  if (!content) return;
  const isEdit = !!user;
  content.innerHTML = `
    <section>
      <h3>${isEdit ? 'Edit User' : 'Create User'}</h3>
      <form id="userForm" class="card">
        <label>Full Name</label>
        <input type="text" id="fullName" placeholder="Full Name" value="${isEdit ? escapeHtml(user.full_name) : ''}" required>
        <label>Email</label>
        <input type="email" id="email" placeholder="Email" value="${isEdit ? escapeHtml(user.email) : ''}" required>
        <label>Phone Number</label>
        <input type="tel" id="phone" placeholder="Phone Number" value="${isEdit ? escapeHtml(user.phone || '') : ''}">
        <label>Password</label>
        <div class="relative">
          <input type="password" id="password" placeholder="${isEdit ? 'New Password (leave blank to keep current)' : 'Password'}" ${isEdit ? '' : 'required'}>
          <span class="absolute" style="right:10px; top:10px; cursor:pointer" onclick="const p=document.getElementById('password'); p.type=p.type==='password'?'text':'password'">👁️</span>
        </div>
        <label>Role</label>
        <select id="role">
          <option value="student" ${isEdit && user.role === 'student' ? 'selected' : ''}>Student</option>
          <option value="teacher" ${isEdit && user.role === 'teacher' ? 'selected' : ''}>Teacher</option>
          <option value="admin" ${isEdit && user.role === 'admin' ? 'selected' : ''}>Admin</option>
        </select>
        <div class="mb-10 mt-10">
            <label class="flex-center-y gap-10">
                <input type="checkbox" id="active" ${(!isEdit || user.active) ? 'checked' : ''} class="w-auto m-0">
                Active Account
            </label>
        </div>
        <div class="flex gap-10 mt-20">
            <button type="submit" class="button w-auto px-40">${isEdit ? 'Update User' : 'Create User'}</button>
            <button type="button" class="button secondary w-auto px-40" onclick="renderUsers()">Cancel</button>
        </div>
      </form>
    </section>
  `;
  document.getElementById('userForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const fullName = document.getElementById('fullName').value.trim();
      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;

      if (!fullName) return alert('Full name is required.');
      if (!isValidEmail(email)) return alert('Please enter a valid email address.');

      let hashedPassword = isEdit ? user.password : '';
      if (password) {
        if (!isStrongPassword(password)) {
          alert('Password must be 8+ chars, include upper, lower, number, and special char.');
          return;
        }
        hashedPassword = await window.hashPassword(password, email);
      }
      const userData = {
          ...user,
          full_name: fullName,
          email: email,
          phone: document.getElementById('phone').value,
          password: hashedPassword,
          role: document.getElementById('role').value,
          active: document.getElementById('active').checked,
          created_at: isEdit ? user.created_at : new Date().toISOString()
      };
      if (isEdit && user.email !== userData.email) {
          if (await SupabaseDB.updateUserEmail(user.email, userData.email, userData)) {
              alert('Updated including email!');
              renderUsers();
          }
      } else {
          if (await SupabaseDB.saveUser(userData)) {
            alert(isEdit ? 'Updated!' : 'Created!');
            renderUsers();
          }
      }
    } catch (err) {
      alert('Error saving user: ' + err.message);
    }
  });
}

function showAddScheduleForm() {
  const area = document.createElement('div');
  area.id = 'scheduleModal';
  area.className = 'modal-backdrop';
  area.style.display = 'flex';
  area.innerHTML = `
    <div class="modal">
      <h3>Add Maintenance Schedule</h3>
      <form id="scheduleForm">
        <div class="grid-2">
            <div><label class="small">Start At</label><input type="datetime-local" id="scheduleStart" required></div>
            <div><label class="small">End At</label><input type="datetime-local" id="scheduleEnd" required></div>
        </div>
        <div class="flex gap-10 mt-15">
            <button type="submit" class="button w-auto px-30">Add Schedule</button>
            <button type="button" class="button secondary w-auto px-30" onclick="this.closest('#scheduleModal').remove()">Cancel</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(area);

  document.getElementById('scheduleForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const maintenance = await SupabaseDB.getMaintenance();
      maintenance.schedules = maintenance.schedules || [];
      maintenance.schedules.push({
          startAt: new Date(document.getElementById('scheduleStart').value).toISOString(),
          endAt: new Date(document.getElementById('scheduleEnd').value).toISOString()
      });
      if (await SupabaseDB.saveMaintenance(maintenance)) {
          UI.showNotification('Schedule added');
          area.remove();
          renderMaintenance();
      }
    } catch (err) { alert('Failed to add schedule: ' + err.message); }
  });
}

function initNav() {
  const adminNav = document.getElementById('adminNav');
  if (adminNav) {
    adminNav.querySelectorAll('button').forEach(button => {
      button.addEventListener('click', (e) => {
        adminNav.querySelectorAll('button').forEach(b => b.classList.remove('active'));
        button.classList.add('active');
        const page = button.dataset.page;
        if(page === 'dashboard') renderDashboard();
        else if(page === 'resets') renderResets();
        else if(page === 'users') renderUsers();
        else if(page === 'analytics') renderAnalytics();
        else if(page === 'maintenance') renderMaintenance();
        else if(page === 'health') renderHealth();
        else if(page === 'management') renderManagement();
        else if(page === 'settings') renderSettings();
        else if(page === 'system') renderSystem();
      });
    });
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const user = await initDashboard('admin');
  if (user) {
    initNav();
    renderDashboard();
    updateSidebarBadges();
    setInterval(updateSidebarBadges, 60000);
    setInterval(updateMaintBanner, 30000);
    updateMaintBanner();
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        await SessionManager.clearCurrentUser();
        window.location.href = 'index.html';
      });
    }
  }
});
