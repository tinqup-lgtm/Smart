async function renderDashboard() {
  SupabaseDB.deleteExpiredBroadcasts().catch(e => console.warn('Cleanup error:', e));

  const content = document.getElementById('pageContent');
  if (!content) return;

  try {
    const [
      totalUsers,
      students,
      teachers,
      locked,
      flagged,
      pendingResets,
      assignments,
      submissions,
      pendingGrading,
      maintenance,
      courses,
      quizzes,
      enrollments,
      violations,
      openTickets
    ] = await Promise.all([
      SupabaseDB.getCount('users'),
      SupabaseDB.getCount('users', q => q.eq('role', 'student')),
      SupabaseDB.getCount('users', q => q.eq('role', 'teacher')),
      SupabaseDB.getCount('users', q => q.gt('locked_until', new Date().toISOString())),
      SupabaseDB.getCount('users', q => q.eq('flagged', true)),
      SupabaseDB.getCount('users', q => q.eq('reset_request->>status', 'pending')),
      SupabaseDB.getCount('assignments'),
      SupabaseDB.getCount('submissions'),
      SupabaseDB.getCount('submissions', q => q.or('status.eq.submitted,regrade_request.not.is.null')),
      SupabaseDB.getMaintenance(),
      SupabaseDB.getCount('courses'),
      SupabaseDB.getCount('quizzes'),
      SupabaseDB.getCount('enrollments'),
      SupabaseDB.getCount('violations'),
      SupabaseDB.getCount('support_tickets', q => q.or('status.eq.open,status.eq.pending'))
    ]);
    const stats = {
      totalUsers,
      students,
      teachers,
      locked,
      flagged,
      pendingResets,
      assignments,
      submissions,
      pendingGrading,
      courses,
      quizzes,
      enrollments,
      violations,
      openTickets,
      maintStatus: isActiveMaintenance(maintenance) ? 'Active' : 'Off'
    };

    content.innerHTML = `
    <div class="card">
      <h3 class="m-0 mb-15">Quick Broadcast</h3>
      <div class="grid-2">
        <input type="text" id="bcTitle" placeholder="Title" class="no-margin">
        <select id="bcRole" class="no-margin">
          <option value="all">All Users</option>
          <option value="student">Students</option>
          <option value="teacher">Teachers</option>
          <option value="admin">Admins</option>
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

    <h3 class="mb-15 mt-30">Academic Management & Support</h3>
    <div class="stats-grid">
      <div class="stat-card" style="border-left-color: var(--p)">
        <h4>Students / Teachers</h4>
        <div class="value">${escapeHtml(stats.students)} / ${escapeHtml(stats.teachers)}</div>
      </div>
      <div class="stat-card"><h4>Active Courses</h4><div class="value">${escapeHtml(stats.courses)}</div></div>
      <div class="stat-card"><h4>Enrollments</h4><div class="value">${escapeHtml(stats.enrollments)}</div></div>
      <div class="stat-card" style="border-left-color: var(--warn)"><h4>Support Tickets</h4><div class="value">${escapeHtml(stats.openTickets)}</div></div>
    </div>

    <div class="stats-grid">
      <div class="stat-card"><h4>Assignments</h4><div class="value">${escapeHtml(stats.assignments)}</div></div>
      <div class="stat-card"><h4>Submissions</h4><div class="value">${escapeHtml(stats.submissions)}</div></div>
      <div class="stat-card" style="border-left-color: var(--warn)"><h4>Pending Grading</h4><div class="value">${escapeHtml(stats.pendingGrading)}</div></div>
      <div class="stat-card"><h4>Quizzes</h4><div class="value">${escapeHtml(stats.quizzes)}</div></div>
    </div>

    <h3 class="mb-15 mt-30">User Security & Integrity</h3>
    <div class="stats-grid">
      <div class="stat-card" style="border-left-color: var(--danger)"><h4>Locked Accounts</h4><div class="value">${escapeHtml(stats.locked)}</div></div>
      <div class="stat-card" style="border-left-color: var(--danger)"><h4>Flagged Accounts</h4><div class="value">${escapeHtml(stats.flagged)}</div></div>
      <div class="stat-card" style="border-left-color: var(--danger)"><h4>Security Resets</h4><div class="value">${escapeHtml(stats.pendingResets)}</div></div>
      <div class="stat-card" style="border-left-color: var(--danger)"><h4>Violations</h4><div class="value">${escapeHtml(stats.violations)}</div></div>
    </div>

    <h3 class="mb-15 mt-30">System Status</h3>
    <div class="stats-grid">
      <div class="stat-card" style="border-left-color: ${stats.maintStatus === 'Active' ? 'var(--warn)' : 'var(--ok)'}">
        <h4>Maintenance Mode</h4><div class="value">${escapeHtml(stats.maintStatus)}</div>
      </div>
      <div class="stat-card"><h4>API Success Rate</h4><div class="value">${escapeHtml(SupabaseDB.getStats().successRate)}%</div></div>
    </div>
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
let allTickets = [];
let filteredUsers = [];

async function renderCourses() {
  const content = document.getElementById('pageContent');
  if (!content) return;

  try {
    const { data: courses, total } = await SupabaseDB.getCourses();

    content.innerHTML = `
    <section>
      <div class="flex-between mb-20">
        <h3 class="m-0">Global Course Management</h3>
        <div class="small text-muted">${total} Total Courses</div>
      </div>
      <div id="coursesTable"></div>
    </section>
    `;

    UI.renderTable('coursesTable', ['Title', 'Instructor', 'Status', 'Created At', 'Action'], courses, (c) => {
        let statusClass = 'badge-active';
        if (c.status === 'draft') statusClass = 'badge-warn';
        else if (c.status === 'archived') statusClass = 'badge-inactive';

        return `
            <tr>
              <td><div class="bold small">${escapeHtml(c.title)}</div></td>
              <td>
                <div class="small">${escapeHtml(c.created_by || 'N/A')}</div>
                <div class="tiny text-muted">${escapeHtml(c.teacher_email || 'No email')}</div>
              </td>
              <td><span class="badge ${statusClass}">${c.status.toUpperCase()}</span></td>
              <td>${c.created_at ? new Date(c.created_at).toLocaleDateString() : 'N/A'}</td>
              <td>
                <div class="flex gap-5">
                    <button class="button small w-auto" onclick="showChangeOwnerModal('${escapeAttr(c.id)}')">Change Owner</button>
                    <button class="button danger small w-auto" onclick="deleteCourse('${escapeAttr(c.id)}')">Delete</button>
                </div>
              </td>
            </tr>
        `;
    });
  } catch (error) {
    console.error('Courses error:', error);
    content.innerHTML = `<div class="card danger-border"><h3>Error Loading Courses</h3><p class="small">${escapeHtml(error.message)}</p></div>`;
  }
}

async function deleteCourse(id) {
    if (!await UI.confirm('Are you sure you want to delete this course and all its content? This cannot be undone.', 'Delete Course')) return;
    try {
        await SupabaseDB.deleteCourse(id);
        UI.showNotification('Course deleted successfully.', 'success');
        renderCourses();
    } catch (e) {
        UI.showNotification('Failed to delete course: ' + e.message, 'error');
    }
}

async function showChangeOwnerModal(courseId) {
    const course = await SupabaseDB.getCourse(courseId);
    if (!course) return;

    const { data: teachers } = await SupabaseDB.getUsersByRole('teacher');

    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.style.display = 'flex';
    backdrop.innerHTML = `
        <div class="modal" style="max-width:500px">
            <div class="flex-between mb-20">
                <h3 class="m-0">Change Course Owner</h3>
                <button class="button secondary tiny w-auto" onclick="this.closest('.modal-backdrop').remove()">✕</button>
            </div>
            <p class="small mb-15">Select a new instructor for <strong>${escapeHtml(course.title)}</strong>.</p>
            <div class="mb-20">
                <label class="tiny">Current Instructor:</label>
                <div class="card bg-light p-10 small">${escapeHtml(course.created_by)} (${escapeHtml(course.teacher_email)})</div>
            </div>
            <div class="mb-20">
                <label>Select New Instructor:</label>
                <select id="newTeacherSelect" class="w-100">
                    <option value="">-- Choose Teacher --</option>
                    ${teachers.map(t => `<option value="${escapeAttr(t.email)}" ${t.email === course.teacher_email ? 'disabled' : ''}>${escapeHtml(t.full_name)} (${escapeHtml(t.email)})</option>`).join('')}
                </select>
            </div>
            <div class="flex-end gap-10">
                <button class="button secondary w-auto" onclick="this.closest('.modal-backdrop').remove()">Cancel</button>
                <button class="button w-auto px-30" id="confirmChangeOwner">Update Owner</button>
            </div>
        </div>
    `;
    document.body.appendChild(backdrop);

    document.getElementById('confirmChangeOwner').onclick = async () => {
        const newEmail = document.getElementById('newTeacherSelect').value;
        if (!newEmail) return UI.showNotification('Please select a teacher.', 'warn');

        try {
            // Only update teacher_email; created_by is handled by database trigger tr_course_teacher_name_sync
            await SupabaseDB.saveCourse({
                ...course,
                teacher_email: newEmail
            });
            UI.showNotification('Course owner updated successfully.', 'success');
            backdrop.remove();
            renderCourses();
        } catch (e) {
            UI.showNotification('Failed to update owner: ' + e.message, 'error');
        }
    };
}

window.renderCourses = renderCourses;
window.deleteCourse = deleteCourse;
window.showChangeOwnerModal = showChangeOwnerModal;

async function renderUsers() {

  const content = document.getElementById('pageContent');
  if (!content) return;

  const searchTerm = document.getElementById('userSearch')?.value || '';
  const roleFilter = document.getElementById('roleFilter')?.value || 'all';
  const statusFilter = document.getElementById('statusFilter')?.value || 'all';

  try {
    const { data: users } = await SupabaseDB.getUsers({
        searchTerm,
        role: roleFilter === 'all' ? null : roleFilter
    });

    allUsers = users;

    // Client-side status filtering
    const filtered = users.filter(u => {
        if (statusFilter === 'active') return u.active;
        if (statusFilter === 'inactive') return !u.active;
        if (statusFilter === 'flagged') return u.flagged;
        if (statusFilter === 'locked') return isAccountLocked(u);
        return true;
    });

    content.innerHTML = `
    <section>
      <div class="controls-row">
        <input type="text" id="userSearch" class="search-input no-margin" placeholder="Search name/email..." value="${escapeAttr(searchTerm)}" oninput="renderUsers()">
        <select id="roleFilter" class="filter-select no-margin" onchange="renderUsers()">
          <option value="all" ${roleFilter === 'all' ? 'selected' : ''}>All Roles</option>
          <option value="student" ${roleFilter === 'student' ? 'selected' : ''}>Student</option>
          <option value="teacher" ${roleFilter === 'teacher' ? 'selected' : ''}>Teacher</option>
          <option value="admin" ${roleFilter === 'admin' ? 'selected' : ''}>Admin</option>
        </select>
        <select id="statusFilter" class="filter-select no-margin" onchange="renderUsers()">
          <option value="all" ${statusFilter === 'all' ? 'selected' : ''}>All Statuses</option>
          <option value="active" ${statusFilter === 'active' ? 'selected' : ''}>Active Only</option>
          <option value="inactive" ${statusFilter === 'inactive' ? 'selected' : ''}>Inactive Only</option>
          <option value="flagged" ${statusFilter === 'flagged' ? 'selected' : ''}>Flagged Only</option>
          <option value="locked" ${statusFilter === 'locked' ? 'selected' : ''}>Locked Only</option>
        </select>
        <button class="button secondary" style="width:auto;" onclick="exportUsersCSV()">Export CSV</button>
      </div>
      <div style="margin-bottom:20px; display:flex; gap:10px">
        <button class="button" onclick="showCreateUserForm()" style="width:auto; padding: 10px 30px">+ Add User</button>
        <button class="button" onclick="showInviteForm()" style="width:auto; padding: 10px 30px">✉️ Invite User</button>
      </div>
      
      <div id="usersList" class="grid"></div>
    </section>
    `;
    displayUsers(filtered);
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
          Joined: ${escapeHtml(user.created_at ? new Date(user.created_at).toISOString().split('T')[0] : 'N/A')}</div>
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
window.renderSupportTickets = renderSupportTickets;
window.renderInvites = renderInvites;
window.renderBroadcasts = renderBroadcasts;
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
window.showInviteForm = showInviteForm;
window.exportUsersCSV = exportUsersCSV;
window.approveReset = approveReset;
window.denyReset = denyReset;
window.revokeInvite = revokeInvite;
window.deleteBroadcast = deleteBroadcast;
window.broadcastNotif = broadcastNotif;
window.showAddScheduleForm = showAddScheduleForm;
window.removeSchedule = removeSchedule;
function filterUsers() { renderUsers(); }
window.filterUsers = filterUsers;
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

      // Explicit session invalidation if deactivating
      if (!user.active) {
          user.session_id = 'deactivated_' + Date.now();
          user.metadata = { ...(user.metadata || {}), last_invalidation_reason: 'deactivated' };
      }

      await SupabaseDB.saveUser(user);
      UI.showNotification(`User ${user.active ? 'activated' : 'deactivated'}`, 'success');

      // Update local state if filtered
      const idx = allUsers.findIndex(u => u.email === email);
      if (idx !== -1) {
          allUsers[idx].active = user.active;
          allUsers[idx].metadata = user.metadata;
      }

      filterUsers(); // Refresh display with current filters
    }
  } catch (e) { UI.showNotification('Error: ' + e.message, 'error'); }
}

async function deleteUserByEmail(email) {
  if (await UI.confirm(`Are you sure you want to delete ${email}? This cannot be undone.`, 'Delete User')) {
    try {
      await SupabaseDB.deleteUser(email);
      UI.showNotification('User deleted', 'success');
      renderUsers();
    } catch (e) { UI.showNotification('Error: ' + e.message, 'error'); }
  }
}

async function lockUser(email, minutes) {
  try {
    const user = await SupabaseDB.getUser(email);
    if (user) {
      user.locked_until = new Date(Date.now() + minutes * 60000).toISOString();

      // Explicit session invalidation
      user.session_id = 'locked_' + Date.now();
      user.metadata = { ...(user.metadata || {}), last_invalidation_reason: 'locked' };

      await SupabaseDB.saveUser(user);
      UI.showNotification(`User locked for ${minutes} minutes`);
      renderUsers();
    }
  } catch (e) { UI.showNotification('Error: ' + e.message, 'error'); }
}

async function unlockUser(email) {
  try {
    const user = await SupabaseDB.getUser(email);
    if (user) {
      user.locked_until = null;
      user.failed_attempts = 0;
      await SupabaseDB.saveUser(user);
      UI.showNotification('User unlocked', 'success');
      renderUsers();
    }
  } catch (e) { UI.showNotification('Error: ' + e.message, 'error'); }
}

async function toggleUserFlag(email, currentFlag) {
  try {
    const user = await SupabaseDB.getUser(email);
    if (user) {
      user.flagged = !currentFlag;

      // Explicit session invalidation if flagging
      if (user.flagged) {
          user.session_id = 'flagged_' + Date.now();
          user.metadata = { ...(user.metadata || {}), last_invalidation_reason: 'flagged' };
      }

      await SupabaseDB.saveUser(user);
      UI.showNotification(`User ${user.flagged ? 'flagged' : 'unflagged'}`, user.flagged ? 'warn' : 'success');

      // Update local state
      const idx = allUsers.findIndex(u => u.email === email);
      if (idx !== -1) {
          allUsers[idx].flagged = user.flagged;
          allUsers[idx].metadata = user.metadata;
      }

      filterUsers();
    }
  } catch (e) { UI.showNotification('Error: ' + e.message, 'error'); }
}

function showCreateUserForm() {
  showUserForm(null);
}

function exportUsersCSV() {
  const searchTerm = document.getElementById('userSearch')?.value?.toLowerCase() || '';
  const roleFilter = document.getElementById('roleFilter')?.value || 'all';

  const listToExport = allUsers.filter(u => {
    const matchesSearch = !searchTerm ||
        u.full_name?.toLowerCase().includes(searchTerm) ||
        u.email?.toLowerCase().includes(searchTerm);
    const matchesRole = roleFilter === 'all' || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  if (listToExport.length === 0) return UI.showNotification('No users to export matching current filters', 'warn');
  const headers = ['Full Name', 'Email', 'Role', 'Status', 'Joined'];
  const rows = listToExport.map(u => [
    `"${(u.full_name || '').replace(/"/g, '""')}"`,
    `"${(u.email || '').replace(/"/g, '""')}"`,
    `"${(u.role || '').replace(/"/g, '""')}"`,
    u.active ? 'Active' : 'Inactive',
    u.created_at ? new Date(u.created_at).toISOString().split('T')[0] : 'N/A'
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

  if (!title || !msg) return UI.showNotification('Title and message required', 'warn');

  try {
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + expiryDays);

    const broadcast = {
        id: crypto.randomUUID(),
        title,
        message: msg,
        target_role: role === 'all' ? null : role,
        type: 'system',
        expires_at: expiryDate.toISOString(),
        created_at: new Date().toISOString()
    };

    await SupabaseDB.saveBroadcast(broadcast);

    UI.showNotification(`Broadcast sent successfully.`, 'success');
    document.getElementById('bcTitle').value = '';
    document.getElementById('bcMsg').value = '';
  } catch (e) { UI.showNotification('Broadcast failed: ' + e.message, 'error'); }
}

async function removeSchedule(idx) {
  if (await UI.confirm('Remove this maintenance schedule?', 'Remove Schedule')) {
    try {
      const maintenance = await SupabaseDB.getMaintenance();
      maintenance.schedules.splice(idx, 1);
      await SupabaseDB.saveMaintenance(maintenance);
      renderMaintenance();
    } catch (e) { UI.showNotification('Error: ' + e.message, 'error'); }
  }
}


async function renderSupportTickets() {
  const content = document.getElementById('pageContent');
  if (!content) return;

  try {
    const { data: tickets, total } = await SupabaseDB.getSupportTickets();
    allTickets = tickets;

    content.innerHTML = `
    <section>
      <div class="flex-between mb-20">
        <h3 class="m-0">User Concerns: Support Tickets</h3>
        <div class="small text-muted">${total} Tickets</div>
      </div>
      <div id="ticketsTable"></div>
    </section>
    `;

    UI.renderTable('ticketsTable', ['User', 'Subject', 'Status', 'Date', 'Action'], tickets, (t) => {
        return `
            <tr>
              <td>
                <div class="bold small">${escapeHtml(t.user_email)}</div>
                <div class="tiny text-muted">${escapeHtml(t.role || 'Unknown')}</div>
              </td>
              <td>
                <div class="bold small">${escapeHtml(t.subject)}</div>
                <div class="tiny text-muted">${escapeHtml(t.message.substring(0, 50))}${t.message.length > 50 ? '...' : ''}</div>
              </td>
              <td><span class="badge-${t.status === 'open' ? 'warn' : (t.status === 'pending' ? 'warn' : 'active')}">${t.status.toUpperCase()}</span></td>
              <td>${new Date(t.created_at).toLocaleDateString()}</td>
              <td>
                <div class="flex gap-5">
                    <button class="button small w-auto" onclick="viewTicketDetails('${escapeAttr(t.id)}')">View</button>
                    <select class="small w-auto m-0" onchange="updateTicketStatus('${escapeAttr(t.id)}', this.value)">
                        <option value="open" ${t.status === 'open' ? 'selected' : ''}>Open</option>
                        <option value="pending" ${t.status === 'pending' ? 'selected' : ''}>Pending</option>
                        <option value="resolved" ${t.status === 'resolved' ? 'selected' : ''}>Resolved</option>
                        <option value="closed" ${t.status === 'closed' ? 'selected' : ''}>Closed</option>
                    </select>
                    <button class="button danger small w-auto" onclick="deleteSupportTicket('${escapeAttr(t.id)}')">Delete</button>
                </div>
              </td>
            </tr>
        `;
    });

  } catch (error) {
    console.error('Tickets error:', error);
    content.innerHTML = `<div class="card danger-border"><h3>Error Loading Tickets</h3><p class="small">${escapeHtml(error.message)}</p></div>`;
  }
}

function viewTicketDetails(id) {
    const t = allTickets.find(x => x.id === id);
    if (!t) return;
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.style.display = 'flex';
    backdrop.innerHTML = `
        <div class="modal" style="max-width:600px">
            <div class="flex-between mb-20">
                <h3 class="m-0">Ticket Details</h3>
                <button class="button secondary tiny w-auto" onclick="this.closest('.modal-backdrop').remove()">✕</button>
            </div>
            <div class="mb-15">
                <strong>From:</strong> ${escapeHtml(t.user_email)} (${escapeHtml(t.role)})
            </div>
            <div class="mb-15">
                <strong>Subject:</strong> ${escapeHtml(t.subject)}
            </div>
            <div class="mb-15">
                <strong>Status:</strong> <span class="badge-${t.status === 'open' ? 'warn' : 'active'}">${t.status.toUpperCase()}</span>
            </div>
            <div class="card bg-light p-15" style="white-space: pre-wrap">
                ${escapeHtml(t.message)}
            </div>
            <div class="mt-20">
                <label>Resolution Notes:</label>
                <textarea id="resNotes-${escapeAttr(t.id)}" rows="3" placeholder="Enter resolution details...">${escapeHtml(t.resolution_notes || '')}</textarea>
            </div>
            <div class="mt-20 flex-end gap-10">
                <button class="button w-auto px-20" onclick="saveTicketNotes('${escapeAttr(t.id)}')">Save Notes</button>
                <button class="button secondary px-40" onclick="this.closest('.modal-backdrop').remove()">Close</button>
            </div>
        </div>
    `;
    document.body.appendChild(backdrop);
}
window.viewTicketDetails = viewTicketDetails;

async function updateTicketStatus(id, newStatus) {
    try {
        await SupabaseDB.updateSupportTicket(id, { status: newStatus });
        UI.showNotification('Ticket status updated.', 'success');
        updateSidebarBadges();
        renderSupportTickets();
    } catch (e) {
        UI.showNotification('Failed to update status: ' + e.message, 'error');
    }
}

async function saveTicketNotes(id) {
    const notes = document.getElementById(`resNotes-${id}`).value;
    try {
        await SupabaseDB.updateSupportTicket(id, { resolution_notes: notes });
        UI.showNotification('Resolution notes saved.', 'success');
        renderSupportTickets();
    } catch (e) {
        UI.showNotification('Failed to save notes: ' + e.message, 'error');
    }
}

window.updateTicketStatus = updateTicketStatus;
window.saveTicketNotes = saveTicketNotes;

async function deleteSupportTicket(id) {
    if (!await UI.confirm('Are you sure you want to delete this ticket?', 'Delete Ticket')) return;
    try {
        await SupabaseDB.deleteSupportTicket(id);
        UI.showNotification('Ticket deleted.', 'success');
        updateSidebarBadges();
        renderSupportTickets();
    } catch (e) {
        UI.showNotification('Failed to delete ticket: ' + e.message, 'error');
    }
}
window.deleteSupportTicket = deleteSupportTicket;

async function renderInvites() {
  const content = document.getElementById('pageContent');
  if (!content) return;

  try {
    const invites = await SupabaseDB.getAllTableData('invites');
    const now = new Date();

    content.innerHTML = `
    <section>
      <div class="flex-between mb-20">
        <h3 class="m-0">Invitations</h3>
        <button class="button w-auto" onclick="showInviteForm()">+ Generate Invite</button>
      </div>
      ${invites.length === 0 ? '<p class="empty">No invitations generated yet.</p>' : `
        <div class="card" style="padding:0; overflow-x:auto">
          <table>
            <thead><tr><th>Recipient / Role</th><th>Token</th><th>Status</th><th>Expires</th><th>Action</th></tr></thead>
            <tbody>
              ${invites.map(i => {
                const isExpired = new Date(i.expires_at) < now;
                const isUsed = !!i.used_at;
                let statusHtml = '<span class="badge badge-active">ACTIVE</span>';
                if (isUsed) statusHtml = '<span class="badge" style="background:#edf2f7; color:#4a5568">USED</span>';
                else if (isExpired) statusHtml = '<span class="badge badge-inactive">EXPIRED</span>';

                return `
                <tr>
                  <td>
                    <div class="bold small">${escapeHtml(i.email || 'Open Invite')}</div>
                    <div class="tiny text-muted">Role: ${escapeHtml(i.role)}</div>
                  </td>
                  <td><code class="tiny">${escapeHtml(i.token)}</code></td>
                  <td>${statusHtml}</td>
                  <td><div class="tiny">${new Date(i.expires_at).toLocaleString()}</div></td>
                  <td>
                    ${!isUsed ? `<button class="button danger tiny w-auto" onclick="revokeInvite('${escapeAttr(i.token)}')">Revoke</button>` : '-'}
                  </td>
                </tr>
              `}).join('')}
            </tbody>
          </table>
        </div>
      `}
    </section>
    `;
  } catch (error) {
    console.error('Invites error:', error);
    content.innerHTML = `<div class="card danger-border"><h3>Error Loading Invites</h3><p class="small">${escapeHtml(error.message)}</p></div>`;
  }
}

async function revokeInvite(token) {
    if (!await UI.confirm('Revoke this invitation? The link will no longer work.', 'Revoke Invite')) return;
    try {
        await SupabaseDB.deleteInvite(token);
        UI.showNotification('Invitation revoked.', 'info');
        renderInvites();
    } catch (e) {
        UI.showNotification('Failed to revoke: ' + e.message, 'error');
    }
}
window.revokeInvite = revokeInvite;

async function renderBroadcasts() {
  const content = document.getElementById('pageContent');
  if (!content) return;

  try {
    const { data: broadcasts, total } = await SupabaseDB.getBroadcasts();

    content.innerHTML = `
    <section>
      <div class="flex-between mb-20">
        <h3 class="m-0">Active Broadcasts</h3>
        <button class="button w-auto" onclick="renderDashboard()">+ New Broadcast</button>
      </div>
      ${broadcasts.length === 0 ? '<p class="empty">No active broadcasts found.</p>' : `
        <div class="card" style="padding:0; overflow-x:auto">
          <table>
            <thead><tr><th>Message</th><th>Target</th><th>Sent At</th><th>Expires</th><th>Action</th></tr></thead>
            <tbody>
              ${broadcasts.map(b => `
                <tr>
                  <td>
                    <div class="bold small">${escapeHtml(b.title)}</div>
                    <div class="tiny text-muted">${escapeHtml(b.message.substring(0, 50))}${b.message.length > 50 ? '...' : ''}</div>
                  </td>
                  <td><span class="badge" style="background:#edf2f7; color:#4a5568">${(b.target_role || 'ALL').toUpperCase()}</span></td>
                  <td><div class="tiny">${new Date(b.created_at).toLocaleString()}</div></td>
                  <td><div class="tiny">${new Date(b.expires_at).toLocaleString()}</div></td>
                  <td>
                    <button class="button danger tiny w-auto" onclick="deleteBroadcast('${escapeAttr(b.id)}')">Delete</button>
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
    console.error('Broadcasts error:', error);
    content.innerHTML = `<div class="card danger-border"><h3>Error Loading Broadcasts</h3><p class="small">${escapeHtml(error.message)}</p></div>`;
  }
}

async function deleteBroadcast(id) {
    if (!await UI.confirm('Delete this broadcast? It will be removed for all users.', 'Delete Broadcast')) return;
    try {
        await SupabaseDB.deleteBroadcast(id);
        UI.showNotification('Broadcast deleted.', 'info');
        renderBroadcasts();
    } catch (e) {
        UI.showNotification('Failed to delete: ' + e.message, 'error');
    }
}
window.deleteBroadcast = deleteBroadcast;

async function renderResets() {
  const content = document.getElementById('pageContent');
  if (!content) return;

  try {
    // Optimization: Use server-side filtering for pending resets
    const { data: pendingResets, total } = await SupabaseDB.getUsers({
        resetStatus: 'pending'
    });

    content.innerHTML = `
    <section>
      <div class="flex-between mb-20">
        <h3 class="m-0">Security: Password Resets</h3>
        <div class="small text-muted">${total} Pending</div>
      </div>
      <div id="resetsTable"></div>
    </section>
    `;

    UI.renderTable('resetsTable', ['Name', 'Email', 'Category', 'Level', 'Requested At', 'Actions'], pendingResets, (user) => {
        const req = user.reset_request || {};
        const level = req.security_level || 'N/A';
        let levelClass = 'badge-lock';
        if (level === 'Critical') levelClass = 'badge-inactive';
        else if (level === 'High') levelClass = 'badge-warn';
        else if (level === 'Low') levelClass = 'badge-active';

        return `
            <tr>
                <td>${escapeHtml(user.full_name)}</td>
                <td>${escapeHtml(user.email)}</td>
                <td>
                    <div class="small bold">${escapeHtml(req.category || 'N/A')}</div>
                    <div class="tiny text-muted">${escapeHtml(req.reason || '')}</div>
                    ${req.custom_reason ? `<div class="tiny mt-5 p-5" style="background:var(--bg); border-radius:4px; max-width:200px"><strong>Note:</strong> ${escapeHtml(req.custom_reason)}</div>` : ''}
                </td>
                <td><span class="badge ${levelClass}">${escapeHtml(level)}</span></td>
                <td>${escapeHtml(new Date(req.created_at).toLocaleString())}</td>
                <td>
                    <button class="button" style="width:auto; padding:4px 8px; font-size:12px" onclick="approveReset('${escapeAttr(user.email)}')">Approve</button>
                    <button class="button danger" style="width:auto; padding:4px 8px; font-size:12px" onclick="denyReset('${escapeAttr(user.email)}')">Deny</button>
                </td>
            </tr>
        `;
    }, { emptyMessage: 'No pending reset requests.' });
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
  const [pendingResets, openTickets] = await Promise.all([
    SupabaseDB.getCount('users', q => q.eq('reset_request->>status', 'pending')),
    SupabaseDB.getCount('support_tickets', q => q.or('status.eq.open,status.eq.pending'))
  ]);

  const resetBadge = document.getElementById('resetBadge');
  if (resetBadge) {
    resetBadge.textContent = pendingResets;
    resetBadge.style.display = pendingResets > 0 ? 'inline-block' : 'none';
  }

  const supportBadge = document.getElementById('supportBadge');
  if (supportBadge) {
    supportBadge.textContent = openTickets;
    supportBadge.style.display = openTickets > 0 ? 'inline-block' : 'none';
  }
}

async function approveReset(email) {
  try {
    const normalizedEmail = normalizeEmail(email);
    const user = await SupabaseDB.getUser(normalizedEmail);
    if (user && user.reset_request) {
      const tempPassword = window.generateTempPassword();

      // Hash the temporary password using normalized email as salt
      const hashedTemp = await window.hashPassword(tempPassword, normalizedEmail);

      user.reset_request.status = 'approved';
      user.reset_request.temp_password = hashedTemp;
      user.reset_request.temp_password_plain = tempPassword; // Store for showing to user via auth errors
      user.reset_request.expires_at = new Date(Date.now() + 72 * 3600 * 1000).toISOString();

      // Ensure user.password is also updated to the hashed temp password so login RPC works
      user.password = hashedTemp;

      if (await SupabaseDB.saveUser(user)) {
        const backdrop = document.createElement('div');
        backdrop.className = 'modal-backdrop';
        backdrop.style.display = 'flex';
        backdrop.innerHTML = `
            <div class="modal" style="max-width:400px; text-align:center">
                <h3>Reset Approved</h3>
                <p>Reset request approved. Temporary password:</p>
                <div class="card mb-20" style="background:var(--bg-light); font-family:monospace; font-size:1.5rem; letter-spacing:2px">
                    ${tempPassword}
                </div>
                <p class="small danger-text bold">PLEASE COPY THIS NOW. IT WILL NOT BE SHOWN AGAIN.</p>
                <button class="button mt-20" onclick="this.closest('.modal-backdrop').remove()">Done</button>
            </div>
        `;
        document.body.appendChild(backdrop);
        renderResets();
      }
    }
  } catch (e) {
    UI.showNotification('Error approving reset: ' + e.message, 'error');
  }
}

async function denyReset(email) {
  const reason = await UI.prompt("Enter denial reason:", "Verification failed", "Deny Reset Request");
  if (reason !== null) {
    try {
      const user = await SupabaseDB.getUser(email);
      if (user && user.reset_request) {
        user.reset_request.status = 'denied';
        user.reset_request.denial_reason = reason;
        if (await SupabaseDB.saveUser(user)) {
          UI.showNotification('Reset request denied', 'info');
          renderResets();
        }
      }
    } catch (e) {
      UI.showNotification('Error denying reset: ' + e.message, 'error');
    }
  }
}

async function renderAnalytics() {

  const content = document.getElementById('pageContent');
  if (!content) return;

  try {
    const [
        totalSubs,
        activeUsers,
        totalCourses,
        totalEnrollments,
        totalViolations,
        { data: recentSubs }
    ] = await Promise.all([
      SupabaseDB.getCount('submissions'),
      SupabaseDB.getCount('users', q => q.eq('active', true)),
      SupabaseDB.getCount('courses'),
      SupabaseDB.getCount('enrollments'),
      SupabaseDB.getCount('violations'),
      SupabaseDB.getSubmissions(null, null, null)
    ]);

    const submissionsByDate = {};
    recentSubs.forEach(s => {
      const date = (s.submitted_at || new Date().toISOString()).split('T')[0];
      submissionsByDate[date] = (submissionsByDate[date] || 0) + 1;
    });

    const dates = Object.keys(submissionsByDate).sort();
    const counts = dates.map(d => submissionsByDate[d]);

    content.innerHTML = `
    <section>
      <h3>System Analytics</h3>
      <div class="stats-grid">
        <div class="stat-card"><h4>Total Submissions</h4><div class="value">${escapeHtml(totalSubs)}</div></div>
        <div class="stat-card"><h4>Active Users</h4><div class="value">${escapeHtml(activeUsers)}</div></div>
        <div class="stat-card"><h4>Total Courses</h4><div class="value">${escapeHtml(totalCourses)}</div></div>
        <div class="stat-card"><h4>Total Enrollments</h4><div class="value">${escapeHtml(totalEnrollments)}</div></div>
        <div class="stat-card" style="border-left-color:var(--danger)"><h4>Total Violations</h4><div class="value">${escapeHtml(totalViolations)}</div></div>
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
    const maintenance = await SupabaseDB.getMaintenance(true);

    // Auto-cleanup expired schedules
    const now = Date.now();
    const originalCount = maintenance.schedules?.length || 0;
    maintenance.schedules = (maintenance.schedules || []).filter(s => new Date(s.endAt).getTime() > now);
    if (maintenance.schedules.length !== originalCount) {
        await SupabaseDB.saveMaintenance(maintenance);
    }

    const isActive = isActiveMaintenance(maintenance);

    content.innerHTML = `
    <section>
      <div class="flex-between">
        <h3>Maintenance Settings</h3>
        <span class="badge ${isActive ? 'badge-warn' : 'badge-active'}" style="font-size: 0.9rem; padding: 5px 15px;">
            STATUS: ${isActive ? 'ACTIVE' : 'INACTIVE'}
        </span>
      </div>
      <form id="maintenanceForm" class="card">
        <div style="margin-bottom:15px">
            <label class="flex" style="align-items:center; gap:10px">
                <input type="checkbox" id="maintenanceEnabled" ${maintenance.enabled ? 'checked' : ''} style="width:auto; margin:0">
                Enable Maintenance Mode (Master Toggle)
            </label>
        </div>
        <div style="margin-bottom:15px">
            <label>Manual Until (optional):</label>
            <input type="datetime-local" id="manualUntil" value="${maintenance.manual_until ? new Date(maintenance.manual_until).toISOString().slice(0, 16) : ''}">
        </div>
        <div style="margin-bottom:15px">
            <label>Public Maintenance Message:</label>
            <textarea id="maintenanceMessage" rows="2" placeholder="e.g. System is undergoing scheduled upgrades. Expect downtime.">${escapeHtml(maintenance.message || '')}</textarea>
        </div>
        <button type="submit" id="saveMaintBtn" class="button" style="width:auto; padding:10px 40px">Save Settings</button>
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
          `).join('') || '<div class="empty">No upcoming schedules.</div>'}
        </div>
        <button class="button" onclick="showAddScheduleForm()" style="width:auto; margin-top:15px">+ Add Schedule</button>
      </div>
    </section>
  `;
  document.getElementById('maintenanceForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('saveMaintBtn');
    btn.disabled = true;
    btn.textContent = 'Saving...';
    try {
        maintenance.enabled = document.getElementById('maintenanceEnabled').checked;
        maintenance.manual_until = document.getElementById('manualUntil').value ? new Date(document.getElementById('manualUntil').value).toISOString() : null;
        maintenance.message = document.getElementById('maintenanceMessage').value;
        if (await SupabaseDB.saveMaintenance(maintenance)) {
            UI.showNotification('Maintenance settings updated', 'success');
            renderMaintenance();
        }
    } catch (err) {
        UI.showNotification('Failed to save: ' + err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Save Settings';
    }
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
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - (60 * 60 * 1000));
    const thirtyMinsAgo = new Date(now.getTime() - (30 * 60 * 1000));

    const [
        maint,
        totalUsers,
        totalAssignments,
        totalSubmissions,
        totalCourses,
        totalQuizzes,
        loginsLastHour,
        activeSessions
    ] = await Promise.all([
      SupabaseDB.getMaintenance(true),
      SupabaseDB.getCount('users'),
      SupabaseDB.getCount('assignments'),
      SupabaseDB.getCount('submissions'),
      SupabaseDB.getCount('courses'),
      SupabaseDB.getCount('quizzes'),
      SupabaseDB.getCount('users', q => q.gt('created_at', oneHourAgo.toISOString())),
      SupabaseDB.getCount('users', q => q.gt('updated_at', thirtyMinsAgo.toISOString()))
    ]);

    const apiStats = SupabaseDB.getStats();
    const dbLatency = apiStats.lastRequestTime;

    const totalRecords = totalUsers + totalAssignments + totalSubmissions + totalCourses + totalQuizzes;
    const estStorageUsage = (totalRecords * 0.5 / 1024).toFixed(2);

    const isOnline = apiStats.failedRequests < apiStats.totalRequests || apiStats.totalRequests === 0;

    content.innerHTML = `
      <section>
        <h3>System Health & Performance</h3>
        <div class="stats-grid">
          <div class="stat-card"><h4>DB Response</h4><div class="value">${escapeHtml(dbLatency)}ms</div></div>
          <div class="stat-card"><h4>Service Status</h4><div class="value ${isOnline ? 'success-text' : 'danger-text'}">${isOnline ? 'ONLINE' : 'DEGRADED'}</div></div>
          <div class="stat-card"><h4>Est. Storage</h4><div class="value">${escapeHtml(estStorageUsage)}MB</div></div>
          <div class="stat-card"><h4>API Success</h4><div class="value" style="color:${apiStats.successRate > 95 ? 'var(--ok)' : 'var(--danger)'}">${escapeHtml(apiStats.successRate)}%</div></div>
        </div>

        <div class="grid-2 mt-20">
          <div class="card">
            <h4>Real-time Traffic</h4>
            <ul style="list-style:none; padding:0">
              <li style="padding:10px 0; border-bottom:1px solid var(--border)"><strong>New Signups (1h):</strong> ${escapeHtml(loginsLastHour)}</li>
              <li style="padding:10px 0; border-bottom:1px solid var(--border)"><strong>Active Sessions (30m):</strong> ${escapeHtml(activeSessions)}</li>
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

  try {
    const maintenance = await SupabaseDB.getMaintenance();
    const autoSettings = maintenance.metadata?.autoTasks || {};

    content.innerHTML = `
      <section>
        <div class="flex-between mb-20">
          <h3>System Management</h3>
        </div>
        <div class="grid-2">
          <div class="card">
            <h4>Database Cleanup</h4>
            <p class="small">Remove old logs, drafts, and unused records.</p>
            <button class="button" style="width:auto; margin-top:10px" onclick="previewCleanup()">Preview Cleanup</button>
          </div>
          <div class="card">
            <h4>System Backup</h4>
            <p class="small">Export or Restore complete system data.</p>
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
              <label class="small flex" style="align-items:center; gap:8px">
                <input type="checkbox" id="autoCleanupCheck" ${autoSettings.autoCleanup ? 'checked' : ''} style="width:auto; margin:0" onchange="saveAutoTask('autoCleanup', this.checked)">
                Daily Auto-Cleanup
              </label>
              <label class="small flex" style="align-items:center; gap:8px">
                <input type="checkbox" id="autoBackupCheck" ${autoSettings.autoBackup ? 'checked' : ''} style="width:auto; margin:0" onchange="saveAutoTask('autoBackup', this.checked)">
                Weekly Cloud Backup
              </label>
            </div>
          </div>
        </div>
        <div id="mgt-area" style="margin-top:20px"></div>
      </section>
    `;
  } catch (error) {
    console.error('Management error:', error);
    content.innerHTML = `<div class="stat-card danger">
      <h3>Error Loading Management</h3>
      <div class="small danger-text">${escapeHtml(error.message)}</div>
      <button class="button w-auto mt-10" onclick="renderManagement()">Retry</button>
    </div>`;
  }
}

async function previewCleanup() {
  const [inactiveCount, draftCount] = await Promise.all([
      SupabaseDB.getCount('users', q => q.eq('active', false)),
      SupabaseDB.getCount('courses', q => q.eq('status', 'draft'))
  ]);

  const area = document.getElementById('mgt-area');
  area.innerHTML = `
    <div class="card">
      <h4>Cleanup Preview</h4>
      <p class="small">The following items are candidates for cleanup:</p>
      <ul class="small">
        <li>Inactive Users: ${escapeHtml(inactiveCount)}</li>
        <li>Draft Courses: ${escapeHtml(draftCount)}</li>
      </ul>
      <button class="button danger" style="width:auto; margin-top:10px" onclick="executeCleanup()">Execute Cleanup Now</button>
    </div>
  `;
}

async function executeCleanup() {
  if (!await UI.confirm('Are you sure? This action is irreversible.', 'Execute Cleanup')) return;
  try {
    UI.showLoading('mgt-area', 'Performing cleanup...');

    const [{ data: users }, { data: courses }] = await Promise.all([
        SupabaseDB.getUsers(),
        SupabaseDB.getCourses(null, 'draft')
    ]);

    const inactiveUsers = (users || []).filter(u => !u.active);
    const draftCourses = courses || [];

    const userProms = inactiveUsers.map(u => SupabaseDB.deleteUser(u.email));
    const courseProms = draftCourses.map(c => SupabaseDB.deleteCourse(c.id));

    await Promise.all([...userProms, ...courseProms]);

    UI.showNotification(`Cleanup successful: ${inactiveUsers.length} users and ${draftCourses.length} courses removed.`, 'success');
  } catch (e) {
    UI.showNotification('Cleanup failed: ' + e.message, 'error');
  } finally {
    UI.hideLoading('mgt-area');
    renderManagement();
  }
}

async function exportBackup() {
  UI.showNotification('Preparing full system backup...', 'info');
  try {
    const tables = [
        'users', 'courses', 'lessons', 'materials', 'assignments', 'quizzes',
        'live_classes', 'submissions', 'quiz_submissions', 'attendance',
        'enrollments', 'discussions', 'notifications', 'broadcasts',
        'planner', 'certificates', 'study_sessions', 'violations',
        'invites', 'support_tickets', 'maintenance'
    ];
    const backupData = {
        exportedAt: new Date().toISOString(),
        version: '1.1.1',
        tables: {}
    };

    const fetchPromises = tables.map(async table => {
        try {
            backupData.tables[table] = await SupabaseDB.getAllTableData(table);
        } catch (err) {
            console.warn(`Failed to export table ${table}:`, err);
            backupData.tables[table] = [];
        }
    });

    await Promise.all(fetchPromises);

    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `smartlms_full_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    UI.showNotification('Full system backup exported successfully.', 'success');
  } catch (e) {
    UI.showNotification('Backup failed: ' + e.message, 'error');
  }
}

async function importBackup(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = JSON.parse(e.target.result);
      const tables = data.tables || {};
      const tableList = Object.keys(tables);

      if (await UI.confirm(`Restore data from ${tableList.length} tables? This may overwrite existing records.`, 'System Restore')) {
        UI.showLoading('mgt-area', 'Restoring system data...');

        // High-fidelity restoration logic
        const batchSize = 25;
        for (const table of tableList) {
            const records = tables[table] || [];
            if (records.length === 0) continue;

            for (let i = 0; i < records.length; i += batchSize) {
                const batch = records.slice(i, i + batchSize);
                if (table === 'users') {
                    // Users require special handling to sync to secrets if password_hash exists
                    await Promise.all(batch.map(r => {
                        if (r.password_hash && !r.password) r.password = r.password_hash;
                        return SupabaseDB.saveUser(r);
                    }));
                } else {
                    await supabaseClient.from(table).upsert(batch);
                }
            }
        }

        UI.showNotification('System Restore completed successfully.', 'success');
        renderManagement();
      }
    } catch (err) {
      console.error('Restore error:', err);
      UI.showNotification('Failed to restore backup: ' + err.message, 'error');
    } finally {
        UI.hideLoading('mgt-area');
        event.target.value = '';
    }
  };
  reader.readAsText(file);
}

async function renderSettings() {
    SettingsManager.render('Enable real-time desktop notifications for system health, server alerts, and password reset requests.');
}

async function renderHelp() {
  const content = document.getElementById('pageContent');
  if (!content) return;

  content.innerHTML = `
    <div class="flex-between mb-20">
        <h2 class="m-0">System Help & Admin Support</h2>
    </div>
    <div id="helpContainer"></div>
  `;
  HelpSystem.renderHelpCenter('helpContainer', 'admin');
}
window.renderHelp = renderHelp;

async function renderSystem() {

  const content = document.getElementById('pageContent');
  if (!content) return;

  try {
    const [maint, serverTimeRes] = await Promise.all([
        SupabaseDB.getMaintenance(),
        supabaseClient.rpc('get_server_time')
    ]);

    const serverTime = serverTimeRes.data;

    content.innerHTML = `
      <section>
        <h3>System Information</h3>
        <div class="grid-2">
          <div class="card">
            <h4>Application Info</h4>
            <ul class="small" style="list-style:none; padding:0">
                <li class="mb-10"><strong>Version:</strong> SmartLMS v1.1.1-PROD</li>
                <li class="mb-10"><strong>Environment:</strong> Production</li>
                <li class="mb-10"><strong>Platform:</strong> Web / PWA</li>
                <li><strong>Local Time:</strong> ${new Date().toLocaleString()}</li>
            </ul>
          </div>
          <div class="card">
            <h4>Backend Status</h4>
            <ul class="small" style="list-style:none; padding:0">
                <li class="mb-10"><strong>API Status:</strong> <span class="success-text bold">ONLINE</span></li>
                <li class="mb-10"><strong>Database:</strong> Supabase (PostgreSQL)</li>
                <li class="mb-10"><strong>Server Time:</strong> ${serverTime ? new Date(serverTime).toLocaleString() : 'Unavailable'}</li>
                <li><strong>Maintenance:</strong> ${isActiveMaintenance(maint) ? '<span class="danger-text bold">ACTIVE</span>' : '<span class="success-text bold">INACTIVE</span>'}</li>
            </ul>
          </div>
          <div class="card">
            <h4>Client Security</h4>
            <ul class="small" style="list-style:none; padding:0">
                <li class="mb-10"><strong>Session:</strong> ${sessionStorage.getItem('currentUser') ? '✅ Valid' : '❌ None'}</li>
                <li class="mb-10"><strong>Session ID:</strong> <code class="tiny">${escapeHtml(SessionManager.getSessionId())}</code></li>
                <li><strong>Encryption:</strong> AES-256 (SubtleCrypto)</li>
            </ul>
          </div>
          <div class="card">
            <h4>Resource Usage</h4>
            <ul class="small" style="list-style:none; padding:0">
                <li class="mb-10"><strong>API Requests (Session):</strong> ${SupabaseDB.getStats().totalRequests}</li>
                <li class="mb-10"><strong>API Errors:</strong> ${SupabaseDB.getStats().failedRequests}</li>
                <li><strong>Storage Buckets:</strong> 3 Active</li>
            </ul>
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
        <div class="password-wrapper">
          <input type="password" id="password" placeholder="${isEdit ? 'New Password (leave blank to keep current)' : 'Password'}" ${isEdit ? '' : 'required'}>
          <span class="password-toggle" onclick="const p=document.getElementById('password'); const isPass=p.type==='password'; p.type=isPass?'text':'password'; this.textContent=isPass?'🔒':'👁️'">👁️</span>
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

    if (!fullName) return UI.showNotification('Full name is required.', 'warn');
    if (!isValidEmail(email)) return UI.showNotification('Please enter a valid email address.', 'warn');

      const normalizedEmail = normalizeEmail(email);
      let hashedPassword = isEdit ? user.password : '';
      if (password) {
        if (!isStrongPassword(password)) {
        UI.showNotification('Password must be 8+ chars, include upper, lower, number, and special char.', 'warn');
          return;
        }
        hashedPassword = await window.hashPassword(password, normalizedEmail);
      }
      const userData = {
          ...user,
          full_name: fullName,
          email: normalizedEmail,
          phone: document.getElementById('phone').value,
          password: hashedPassword,
          role: document.getElementById('role').value,
          active: document.getElementById('active').checked
      };
      if (isEdit) userData.created_at = user.created_at;
      if (isEdit) {
          const roleChanged = user.role !== userData.role;
          const statusChanged = user.active !== userData.active;
          if (roleChanged || (statusChanged && !userData.active)) {
              userData.session_id = 'admin_mod_' + Date.now();
              userData.metadata = {
                  ...(user.metadata || {}),
                  last_invalidation_reason: roleChanged ? 'role_change' : 'deactivated'
              };
          }
      }

      if (isEdit && user.email !== userData.email) {
          if (await SupabaseDB.updateUserEmail(user.email, userData.email, userData)) {
            UI.showNotification('User updated including email', 'success');
              renderUsers();
          }
      } else {
          if (await SupabaseDB.saveUser(userData)) {
          UI.showNotification(isEdit ? 'User updated' : 'User created', 'success');
            renderUsers();
          }
      }
    } catch (err) {
    UI.showNotification('Error saving user: ' + err.message, 'error');
    }
  });
}

function showInviteForm() {
  const area = document.createElement('div');
  area.id = 'inviteModal';
  area.className = 'modal-backdrop';
  area.style.display = 'flex';
  area.innerHTML = `
    <div class="modal" style="max-width:500px">
      <h3>Generate Invite Link</h3>
      <p class="small">Invites bypass the public registration limits for Admin and Teacher roles.</p>
      <form id="inviteForm">
        <label>Recipient Email (Optional for Students)</label>
        <input type="email" id="inviteEmail" placeholder="email@example.com">
        <label>Target Role</label>
        <select id="inviteRole" required>
          <option value="student">Student</option>
          <option value="teacher">Teacher</option>
          <option value="admin">Admin</option>
        </select>
        <label>Expires In</label>
        <select id="inviteExpiry">
          <option value="1">24 Hours</option>
          <option value="7" selected>7 Days</option>
          <option value="30">30 Days</option>
        </select>
        <div id="inviteResult" style="margin-top:15px; display:none">
          <label>Invitation Link:</label>
          <div class="flex gap-5">
            <input type="text" id="inviteLink" readonly style="margin:0">
            <button type="button" class="button w-auto px-15" onclick="copyInviteLink()">Copy</button>
          </div>
          <p class="tiny success-text mt-5">Share this link with the recipient.</p>
        </div>
        <div class="flex gap-10 mt-20" id="inviteActions">
            <button type="submit" class="button w-auto px-30">Generate Link</button>
            <button type="button" class="button secondary w-auto px-30" onclick="this.closest('#inviteModal').remove()">Cancel</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(area);

  window.copyInviteLink = () => {
    const link = document.getElementById('inviteLink');
    if (!link) return;
    link.select();
    document.execCommand('copy');
    UI.showNotification('Link copied to clipboard!');
  };

  const inviteForm = document.getElementById('inviteForm');
  if (inviteForm) inviteForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const emailEl = document.getElementById('inviteEmail');
      const roleEl = document.getElementById('inviteRole');
      const expiryEl = document.getElementById('inviteExpiry');

      if (!roleEl || !expiryEl) return UI.showNotification('System error: Form fields missing.', 'error');

      const email = emailEl ? emailEl.value.trim() : '';
      const role = roleEl.value;
      const expiryDays = parseInt(expiryEl.value);

      if ((role === 'admin' || role === 'teacher') && !email) {
        return UI.showNotification('Email is required for Admin and Teacher invites.', 'warn');
      }

      if (email) {
        const existing = await SupabaseDB.getUser(email);
      if (existing) return UI.showNotification('A user with this email already exists.', 'warn');
      }

      const token = crypto.randomUUID();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expiryDays);

      const user = await SessionManager.getCurrentUser();
      const invite = {
          token,
          email: email || null,
          role,
          expires_at: expiresAt.toISOString(),
          created_by: user.email
      };

      if (await SupabaseDB.saveInvite(invite)) {
          const baseUrl = window.location.origin + window.location.pathname.replace('admin.html', 'index.html');
          const inviteUrl = `${baseUrl}?invite=${token}`;

          const resultEl = document.getElementById('inviteResult');
          const linkEl = document.getElementById('inviteLink');
          const actionsEl = document.getElementById('inviteActions');

          if (linkEl) linkEl.value = inviteUrl;
          if (resultEl) resultEl.style.display = 'block';
          if (actionsEl) {
              const submitBtn = actionsEl.querySelector('button[type="submit"]');
              if (submitBtn) submitBtn.style.display = 'none';
          }
          UI.showNotification('Invite generated!');
      }
  } catch (err) { UI.showNotification('Failed to generate invite: ' + err.message, 'error'); }
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
    } catch (err) { UI.showNotification('Failed to add schedule: ' + err.message, 'error'); }
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
        else if(page === 'users') renderUsers();
        else if(page === 'courses') renderCourses();
        else if(page === 'support') renderSupportTickets();
        else if(page === 'invites') renderInvites();
        else if(page === 'broadcasts') renderBroadcasts();
        else if(page === 'resets') renderResets();
        else if(page === 'analytics') renderAnalytics();
        else if(page === 'maintenance') renderMaintenance();
        else if(page === 'health') renderHealth();
        else if(page === 'management') renderManagement();
        else if(page === 'settings') renderSettings();
        else if(page === 'system') renderSystem();
        else if(page === 'help') renderHelp();
      });
    });
  }
}

async function saveAutoTask(task, enabled) {
  try {
    const maintenance = await SupabaseDB.getMaintenance();
    maintenance.metadata = maintenance.metadata || {};
    maintenance.metadata.autoTasks = maintenance.metadata.autoTasks || {};
    maintenance.metadata.autoTasks[task] = enabled;
    await SupabaseDB.saveMaintenance(maintenance);
    UI.showNotification('Automated task setting updated', 'success');
  } catch (err) {
    UI.showNotification('Failed to save setting: ' + err.message, 'error');
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const user = await initDashboard('admin');
  if (user) {
    initNav();
    NotificationManager.initPolling();
    NotificationManager.initRealtimeSubscriptions(user.email, 'admin', () => {
        const activeEl = document.activeElement;
        const isTyping = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT');
        if (!isTyping && document.querySelector('[data-page="dashboard"].active')) {
            renderDashboard();
            updateSidebarBadges();
        }
    });
    renderDashboard();
    updateSidebarBadges();
    setInterval(() => {
        if (document.querySelector('[data-page="dashboard"].active')) {
            updateSidebarBadges();
        }
    }, 60000);
    setInterval(updateMaintBanner, 30000);
    updateMaintBanner();
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        await SessionManager.clearCurrentUser('manual_logout');
        window.location.href = 'index.html';
      });
    }
  }
});
