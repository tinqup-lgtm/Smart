/**
 * Unified Calendar Logic for SmartLMS
 * Handles recurring live classes and assignment due dates.
 */
async function renderCalendar() {
  const content = document.getElementById('pageContent');
  if (!content) return;

  const user = await SessionManager.getCurrentUser();
  const isTeacher = user.role === 'teacher';

  const [assignments, enrollments, liveClasses] = await Promise.all([
    SupabaseDB.getAssignments(isTeacher ? user.email : null),
    isTeacher ? Promise.resolve([]) : SupabaseDB.getEnrollments(user.email),
    SupabaseDB.getLiveClasses(null, isTeacher ? user.email : null)
  ]);

  const enrolledIds = isTeacher ? [] : enrollments.map(e => e.course_id);
  const myAssigns = assignments.filter(a => isTeacher || enrolledIds.includes(a.course_id)).filter(a => a.status === 'published');
  const myLiveClasses = liveClasses.filter(lc => isTeacher || enrolledIds.includes(lc.course_id));

  const now = new Date();
  let currentMonth = now.getMonth();
  let currentYear = now.getFullYear();

  window.renderCalendarGrid = (month, year) => {
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    let html = `
      <div class="flex-between mb-15">
        <h3 class="m-0">${monthNames[month]} ${year}</h3>
        <div class="flex gap-5">
          <button class="button secondary small w-auto" onclick="renderCalendarGrid(${month === 0 ? 11 : month - 1}, ${month === 0 ? year - 1 : year})">Prev</button>
          <button class="button secondary small w-auto" onclick="renderCalendarGrid(${month === 11 ? 0 : month + 1}, ${month === 11 ? year + 1 : year})">Next</button>
        </div>
      </div>
      <div class="grid" style="grid-template-columns: repeat(7, 1fr); gap:1px; background:var(--border); border:1px solid var(--border)">
        ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => `<div class="bold small" style="background:var(--light); padding:10px; text-align:center">${d}</div>`).join('')}
    `;

    // Empty cells before first day
    for (let i = 0; i < firstDay; i++) {
      html += `<div style="background:#fff; min-height:100px"></div>`;
    }

    // Days with events
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = new Date(year, month, day).toLocaleDateString();
      const events = myAssigns.filter(a => new Date(a.due_date).toLocaleDateString() === dateStr);
      const classes = myLiveClasses.filter(lc => new Date(lc.start_at).toLocaleDateString() === dateStr);

      html += `
        <div style="background:#fff; min-height:100px; padding:5px; border:1px solid var(--bg)">
          <div class="small mb-5 bold text-muted">${day}</div>
          <div class="flex-column gap-5">
              ${events.map(e => `
                <div class="badge small p-5" style="background:var(--purple); color:white; cursor:pointer" onclick="renderAssignments()">${escapeHtml(e.title)}</div>
              `).join('')}
              ${classes.map(lc => `
                <div class="badge small p-5" style="background:var(--ok); color:white; cursor:pointer" onclick="renderLiveClasses()">${escapeHtml(lc.title)}</div>
              `).join('')}
          </div>
        </div>
      `;
    }

    // Empty cells after last day
    const totalCells = firstDay + daysInMonth;
    const remaining = 42 - totalCells; // 6 rows
    for (let i = 0; i < remaining; i++) {
      html += `<div style="background:#fff; min-height:100px"></div>`;
    }

    html += `</div>`;
    const calArea = document.getElementById('calendarArea');
    if (calArea) calArea.innerHTML = html;
  };

  content.innerHTML = `
    <h2 class="m-0">Calendar</h2>
    <div class="card mt-20" id="calendarArea"></div>
  `;
  renderCalendarGrid(currentMonth, currentYear);
}
