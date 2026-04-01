async function updateHeaderStats() {
  try {
  const me = await SessionManager.getCurrentUser();
  if (!me) return;
  const [user, enrollments, assigns, submissions, badges] = await Promise.all([
    SupabaseDB.getUser(me.email),
    SupabaseDB.getEnrollments(me.email),
    SupabaseDB.getAssignments(),
    SupabaseDB.getSubmissions(null, me.email),
    SupabaseDB.getUserBadges(me.email)
  ]);
  
  const enrolledCourseIds = enrollments.map(e => e.course_id);
  const now = Date.now();
  const dueSoon = assigns.filter(a => {
    const isEnrolled = enrolledCourseIds.includes(a.course_id);
    const dueDate = new Date(a.due_date).getTime();
    const isSubmitted = submissions.some(s => s.assignment_id === a.id);
    return isEnrolled && a.status === 'published' && !isSubmitted && dueDate > now && (dueDate - now) < (7 * 24 * 60 * 60 * 1000);
  });
  const statCourses = document.getElementById('statCourses');
  const statDue = document.getElementById('statDue');
  const statLevel = document.getElementById('statLevel');
  const statBadges = document.getElementById('statBadges');
  const profileName = document.getElementById('profileName');
  if (statCourses) statCourses.textContent = enrollments.length;
  if (statDue) statDue.textContent = dueSoon.length;
  if (statLevel) statLevel.textContent = user.level || 1;
  if (statBadges) statBadges.textContent = badges.length;
  if (profileName) profileName.textContent = user.full_name || 'Student';
  } catch (e) {
      console.warn('Failed to update header stats:', e);
  }
}

async function renderCourses() {
  const container = document.getElementById('pageContent');
  if (!container) return;

  try {
    const user = await SessionManager.getCurrentUser();
    const [courses, enrollments] = await Promise.all([
      SupabaseDB.getCourses(),
      SupabaseDB.getEnrollments(user.email)
    ]);
    updateHeaderStats().catch(e => console.warn('Header stats error:', e));

    const publishedCourses = courses.filter(c => c.status === 'published');

  container.innerHTML = `
    <div class="flex-between mb-20">
      <h2 class="m-0">Course Catalog</h2>
      <div class="flex gap-10">
        <input type="text" id="catalogSearch" placeholder="Search courses..." class="m-0" style="width:200px" oninput="filterCatalog()">
      </div>
    </div>
    <div class="grid" id="catalogGrid" style="grid-template-columns: repeat(auto-fill, minmax(280px, 1fr))"></div>
  `;

    window.allPublishedCourses = publishedCourses;
    window.myEnrollments = enrollments;
    displayCatalog(publishedCourses);
  } catch (error) {
    console.error('Courses error:', error);
    container.innerHTML = `<div class="stat-card danger">
      <h3>Error Loading Catalog</h3>
      <div class="small danger-text">${escapeHtml(error.message)}</div>
      <button class="button w-auto mt-10" onclick="renderCourses()">Retry</button>
    </div>`;
  }
}

function displayCatalog(courses) {
  const grid = document.getElementById('catalogGrid');
  if (!grid) return;

  if (!courses.length) {
    grid.innerHTML = '<div class="empty" style="grid-column: 1/-1">No courses found matching your criteria.</div>';
    return;
  }

  grid.innerHTML = courses.map(c => {
    const enrolled = window.myEnrollments.some(e => e.course_id === c.id);

    return `
      <div class="card flex-column gap-10" style="transition:transform 0.2s">
        <div style="width:100%; height:160px; background:linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius:6px; display:flex; align-items:center; justify-content:center; color:white; font-size:40px">📚</div>
        <div style="flex:1">
          <h3 class="m-0 mt-10" style="font-size:18px">${escapeHtml(c.title)}</h3>
          <p class="small mt-10 mb-20" style="line-height:1.4">${escapeHtml(c.description || '').substring(0, 80)}${c.description?.length > 80 ? '...' : ''}</p>
          <div class="flex-between">
            ${enrolled ?
              `<button class="button secondary w-auto small" onclick="viewCourse('${escapeAttr(c.id)}', false)">View Details</button>` :
              `<button class="button w-auto small" onclick="enroll('${escapeAttr(c.id)}')">Enroll Now</button>`
            }
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function filterCatalog() {
  const searchTerm = document.getElementById('catalogSearch').value.toLowerCase();

  const filtered = window.allPublishedCourses.filter(c => {
    return c.title.toLowerCase().includes(searchTerm) || (c.description || '').toLowerCase().includes(searchTerm);
  });

  displayCatalog(filtered);
}

async function renderMyCourses() {
  const user = await SessionManager.getCurrentUser();
  const [courses, enrollments] = await Promise.all([
    SupabaseDB.getCourses(),
    SupabaseDB.getEnrollments(user.email)
  ]);
  updateHeaderStats().catch(e => console.warn('Header stats error:', e));

  const enrolledCourseIds = enrollments.map(e => e.course_id);
  const myCourses = courses.filter(c => enrolledCourseIds.includes(c.id));

  const container = document.getElementById('pageContent');
  if (!container) return;

  container.innerHTML = `
    <h2 class="mb-20">My Enrolled Courses</h2>
    <div class="grid" style="grid-template-columns: repeat(auto-fill, minmax(280px, 1fr))">
      ${myCourses.map(c => {
        const enrollment = enrollments.find(e => e.course_id === c.id);
        const progress = enrollment?.progress || 0;
        return `
          <div class="card flex-column gap-10">
            <div style="width:100%; height:120px; background:linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius:6px; display:flex; align-items:center; justify-content:center; color:white; font-size:40px">📖</div>
            <h3 class="m-0">${escapeHtml(c.title)}</h3>
            <div class="progress-container" style="background:#eee; height:8px; border-radius:4px; overflow:hidden">
              <div class="progress-bar" style="background:var(--ok); height:100%; width:${progress}%"></div>
            </div>
            <div class="flex-between">
              <span class="tiny text-muted">${progress}% Complete</span>
              ${enrollment?.completed ? '<span class="badge badge-active tiny">Completed</span>' : ''}
            </div>
            <p class="small" style="flex:1">${escapeHtml(c.description || '').substring(0, 80)}...</p>
            <button class="button w-auto small" onclick="viewCourse('${escapeAttr(c.id)}', true)">Open Course</button>
          </div>
        `;
      }).join('') || '<div class="empty" style="grid-column:1/-1">You haven\'t enrolled in any courses yet. Visit the Catalog to find some!</div>'}
    </div>
  `;
}
async function enroll(courseId) {
  try {
    const user = await SessionManager.getCurrentUser();
    await SupabaseDB.saveEnrollment({ course_id: courseId, student_email: user.email });
    alert('Successfully enrolled!');
    renderCourses();
  } catch (e) {
    alert('Enrollment failed: ' + e.message);
  }
}
async function viewCourse(courseId, fromMyCourses = false) {
  // Ensure any active study session is stopped if navigating to course view
  if (studyInterval) await stopStudySession();
  const lessons = await SupabaseDB.getLessons(courseId);
  const assignments = await SupabaseDB.getAssignments();
  const courseAssignments = assignments.filter(a => a.course_id === courseId && a.status === 'published');
  const container = document.getElementById('pageContent');
  if (!container) return;

  const backAction = fromMyCourses ? 'renderMyCourses()' : 'renderCourses()';
  const backLabel = fromMyCourses ? '← Back to My Courses' : '← Back to Catalog';

  container.innerHTML = `
    <button class="button secondary w-auto mb-15" onclick="${backAction}">${backLabel}</button>
    <div class="grid-2 mt-20">
      <section class="card">
        <h3 class="m-0">Lessons</h3>
        <div class="mt-15">
            ${lessons.map(l => `
                <div class="question" style="cursor:pointer" onclick="showLesson('${escapeAttr(l.id)}', '${escapeAttr(courseId)}', ${fromMyCourses})">
                    <strong class="bold">${escapeHtml(l.title)}</strong>
                </div>
            `).join('') || '<p class="small">No lessons yet.</p>'}
        </div>
      </section>
      <section class="card">
        <h3 class="m-0">Course Assignments</h3>
        <div class="mt-15">
            ${courseAssignments.map(a => `
                <div class="question">
                    <strong class="bold">${escapeHtml(a.title)}</strong>
                    <p class="small mt-5">Due: ${new Date(a.due_date).toLocaleString()}</p>
                    <button class="button small w-auto mt-10" onclick="renderAssignments()">Go to Assignments</button>
                </div>
            `).join('') || '<p class="small">No assignments yet.</p>'}
        </div>
      </section>
    </div>`;
}
async function showLesson(lessonId, courseId, fromMyCourses = false) {
  const lessons = await SupabaseDB.getLessons(courseId);
  const lesson = lessons.find(l => l.id === lessonId);
  const container = document.getElementById('pageContent');
  if (!container) return;

  // Automate Focus Timer: Start session when lesson is viewed
  startStudySession(courseId);

  container.innerHTML = `
    <button class="button secondary w-auto mb-15" onclick="viewCourse('${escapeAttr(courseId)}', ${fromMyCourses})">← Back to Lessons</button>
    <div class="card">
      <h2 class="m-0">${escapeHtml(lesson.title)}</h2>
      <div class="mt-20" style="line-height:1.6">${escapeHtml(lesson.content).replace(/\n/g, '<br>')}</div>
    </div>`;
}

async function stopAndNavigateToViewCourse(courseId, fromMyCourses) {
  if (studyInterval) await stopStudySession();
  viewCourse(courseId, fromMyCourses);
}
window.stopAndNavigateToViewCourse = stopAndNavigateToViewCourse;
async function renderAssignments(){
  const container = document.getElementById('pageContent');
  if (!container) return;

  try {
    const user = await SessionManager.getCurrentUser();
    if(!user || user.role!=='student'){ alert('Login as student'); window.location.href='index.html'; return; }

    const [courses, enrollments, assigns, submissions] = await Promise.all([
      SupabaseDB.getCourses(),
      SupabaseDB.getEnrollments(user.email),
      SupabaseDB.getAssignments(),
      SupabaseDB.getSubmissions(null, user.email)
    ]);
    updateHeaderStats().catch(e => console.warn('Header stats error:', e));
  const enrolledCourseIds = enrollments.map(e => e.course_id);

  // From inline: filter active assignments
  const now = Date.now();
  const activeAssigns = assigns.filter(a => {
      const dueDate = new Date(a.due_date).getTime();
      return dueDate > now && a.status === 'published';
  });

  if (!container) return;
  container.innerHTML = `
    <h2>Assignments</h2>
    <div class="card" style="padding:0; overflow-x:auto">
      <table>
        <thead>
          <tr>
            <th>Assignment</th>
            <th>Course</th>
            <th>Due Date</th>
            <th>Status</th>
            <th>Grade</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody id="assignTableBody"></tbody>
      </table>
    </div>
    <div id="assignmentForm" class="hidden" style="margin-top:20px"></div>
  `;

  const tbody = document.getElementById('assignTableBody');
  const mine = assigns.filter(a => enrolledCourseIds.includes(a.course_id));
  if(!mine.length){ tbody.innerHTML = '<tr><td colspan="6" class="empty">No assignments found.</td></tr>'; return; }

  mine.forEach(a => {
    if (a.status !== 'published') return;

    // Check if it's past due and late submissions are NOT allowed
    const dueDate = new Date(a.due_date);
    const isPastDue = dueDate.getTime() < now;
    if (isPastDue && !a.allow_late_submissions) return;

    const submission = submissions.find(s => s.assignment_id === a.id);
    const course = courses.find(c => c.id === a.course_id);
    const isOverdue = dueDate.getTime() < now && !submission;

    let statusHtml = '';
    if (submission) {
      const badgeClass = submission.status === 'graded' ? 'badge-active' : 'badge-warn';
      statusHtml = `<span class="badge ${badgeClass}">${submission.status.toUpperCase()}</span>`;
    } else if (isOverdue) {
      statusHtml = `<span class="badge badge-inactive">OVERDUE</span>`;
    } else {
      statusHtml = `<span class="badge" style="background:#edf2f7; color:#4a5568">PENDING</span>`;
    }

    const row = document.createElement('tr');
    row.innerHTML = `
      <td>
        <div style="font-weight:600">${escapeHtml(a.title)}</div>
        <div class="small">${escapeHtml(a.description || '').substring(0, 50)}...</div>
      </td>
      <td>${escapeHtml(course?.title || 'Unknown')}</td>
      <td>
        <div class="${isOverdue ? 'danger-text' : ''}">${dueDate.toLocaleDateString()}</div>
        ${isOverdue ? '<div class="small danger-text">(Overdue)</div>' : ''}
      </td>
      <td>${statusHtml}</td>
      <td>${submission?.grade !== undefined && submission?.grade !== null ? `
          <div class="success-text bold">${submission.final_grade}%</div>
          <div class="tiny text-muted">${submission.grade} / ${a.points_possible}</div>
        ` : '-'}</td>
      <td>
        <div class="flex gap-5">
          ${!submission ?
            `<button class="button small w-auto ${isOverdue ? 'danger' : ''}" onclick="showAssignmentForm('${a.id}')">${isOverdue ? 'Submit Late' : 'Submit'}</button>` :
            (submission.status === 'submitted' || submission.status === 'draft' ?
              `<button class="button secondary small w-auto" onclick="showAssignmentForm('${a.id}')">View/Edit</button>` :
              `<button class="button small w-auto success" onclick="viewFeedback('${a.id}')" style="background:var(--ok)">Feedback</button>`)
          }
        </div>
      </td>
    `;
    tbody.appendChild(row);
    });
  } catch (error) {
    console.error('Assignments error:', error);
    container.innerHTML = `<div class="card" style="border-left: 4px solid var(--danger)">
      <h3>Error Loading Assignments</h3>
      <div class="small" style="color:var(--danger)">${escapeHtml(error.message)}</div>
      <button class="button" onclick="renderAssignments()" style="margin-top:10px; width:auto">Retry</button>
    </div>`;
  }
}

async function showAssignmentForm(assignmentId) {
  const user = await SessionManager.getCurrentUser();
  const [a, submission] = await Promise.all([
    SupabaseDB.getAssignment(assignmentId),
    SupabaseDB.getSubmission(assignmentId, user.email)
  ]);

  const formWrap = document.getElementById('assignmentForm');
  if (!formWrap) return;
  formWrap.classList.remove('hidden');
  formWrap.style.display = 'block'; // Ensure it shows even if it was hidden via style
  const now = new Date();
  const dueDate = new Date(a.due_date);
  const isLate = now > dueDate;

  formWrap.innerHTML = `
    <div class="card">
      <div class="flex-between">
        <h3 class="m-0">${submission ? 'Review' : 'Submit'}: ${escapeHtml(a.title)}</h3>
        <button class="button secondary w-auto small" onclick="const f=document.getElementById('assignmentForm'); f.classList.add('hidden'); f.style.display='none';">Close</button>
      </div>

      ${submission && submission.status === 'submitted' ? `
        <div class="card success-border p-10 mt-10" style="background:#f0fff4">
            <div class="bold success-text">SUBMITTED</div>
            <p class="small">You have already submitted this assignment. You can update your submission below.</p>
        </div>
      ` : ''}

      ${isLate && !submission ? `
        <div class="card danger-border p-10 mt-10">
            <div class="bold danger-text">LATE SUBMISSION</div>
            <p class="small">The due date was ${dueDate.toLocaleString()}. A late penalty of ${a.late_penalty_per_day}% per day will be applied.</p>
        </div>
      ` : ''}

      <div id="qwrap-${a.id}" class="mt-20"></div>
      <div class="flex gap-10 mt-20">
        <button class="button w-auto px-40" id="submitAssignBtn" onclick="submitAssignment('${a.id}', '${user.email}')">Submit Assignment</button>
        ${submission ? `<button class="button danger w-auto px-40" onclick="deleteSubmissionById('${a.id}', '${user.email}')">Delete Submission</button>` : ''}
      </div>
    </div>
  `;

  const qwrap = formWrap.querySelector(`#qwrap-${a.id}`);
  (a.questions || []).forEach((q, idx) => {
    const qDiv = document.createElement('div'); qDiv.className = 'question';
    const answer = submission?.answers?.[idx] || '';
    let inputHtml = '';
    if (q.type === 'essay') {
      inputHtml = `<textarea class="input" rows="6" placeholder="Your answer" data-q-idx="${idx}">${escapeHtml(answer)}</textarea>`;
    } else if (q.type === 'file') {
      inputHtml = `
        <div class="small">Upload File ${q.extensions ? `(${escapeHtml(q.extensions)})` : ''}:</div>
        <input type="file" class="input q-file" data-q-idx="${idx}" accept="${q.extensions || '*'}" onchange="previewFile(this, '${idx}')">
        <div id="preview-${idx}" style="margin-top:8px">
          ${answer ? `<button type="button" class="button secondary tiny w-auto" onclick="UI.viewFile('${escapeAttr(answer)}', 'Current Submission')">View Current File</button>` : '<span class="small">No file uploaded</span>'}
        </div>
      `;
    } else if (q.type === 'link') {
      inputHtml = `<div class="small">Submission Link:</div><input type="url" class="input q-link" placeholder="https://..." data-q-idx="${idx}" value="${escapeHtml(answer)}">`;
    }
    qDiv.innerHTML = `
      <div class="flex-between mb-10">
        <div class="bold">Q${idx + 1}. ${escapeHtml(q.text || '')}</div>
        <div class="badge badge-lock">${q.points || 0} pts</div>
      </div>
      ${inputHtml}
    `;
    qwrap.appendChild(qDiv);
  });
  formWrap.scrollIntoView({ behavior: 'smooth' });
}

window.previewFile = function(input, idx) {
  const preview = document.getElementById(`preview-${idx}`);
  if (input.files && input.files[0]) {
    preview.innerHTML = `<span class="small">Selected: ${escapeHtml(input.files[0].name)}</span>`;
  }
};

async function viewFeedback(assignmentId) {
  const user = await SessionManager.getCurrentUser();
  const [assignment, submission] = await Promise.all([
    SupabaseDB.getAssignment(assignmentId),
    SupabaseDB.getSubmission(assignmentId, user.email)
  ]);

  const container = document.getElementById('pageContent');
  if (!container) return;

  container.innerHTML = `
    <button class="button secondary w-auto mb-10" onclick="renderAssignments()">← Back to Assignments</button>
    <div class="card">
      <div class="flex-between">
        <h2 class="m-0">Feedback: ${escapeHtml(assignment.title)}</h2>
        <div class="text-right">
          <div class="bold" style="font-size:32px; color:var(--purple)">${submission.grade || 0} / ${assignment.points_possible}</div>
          <div class="bold" style="font-size:20px; color:var(--purple)">${submission.final_grade || 0}%</div>
          <div class="small">Final Grade</div>
        </div>
      </div>

      <div class="grid-2 mt-20 p-15" style="background:var(--bg); border-radius:8px">
        <div>
          <div class="small">Status:</div>
          <div class="bold">${submission.status.toUpperCase()}</div>
        </div>
      </div>

      <div class="mt-20 pt-20" style="border-top:1px solid var(--border)">
        <h4>Your Submission & Grades</h4>
        <div class="mt-15">
          ${(assignment.questions || []).map((q, idx) => {
            const answer = submission.answers[idx];
            const score = submission.question_scores?.[idx] || 0;
            const isUrl = typeof answer === 'string' && (answer.startsWith('http://') || answer.startsWith('https://'));
            const displayAnswer = answer ? (isUrl ? `<button class="button secondary small w-auto" onclick="UI.viewFile('${escapeAttr(answer)}', 'Question ${idx + 1} Submission')">View Submitted File/Link</button>` : `<div class="small p-10 mt-5" style="white-space: pre-wrap; background: #f7fafc; border-radius: 4px;">${escapeHtml(answer)}</div>`) : '<div class="small p-10 mt-5 text-muted italic">No answer provided.</div>';
            return `<div class="list-item mb-20 card border-light">
              <div class="flex-between">
                <div class="bold">Question ${idx + 1}: ${escapeHtml(q.text)}</div>
                <div class="badge ${score >= (q.points * 0.7) ? 'badge-active' : 'badge-warn'}">${score} / ${q.points} pts</div>
              </div>
              <div class="mt-10">${displayAnswer}</div>
            </div>`;
          }).join('')}
        </div>
      </div>

      <div class="mt-20 pt-20" style="border-top:1px solid var(--border)">
        <h4>Teacher Feedback</h4>
        <div class="small p-15" style="background:#fffcf0; border-radius:8px; border:1px solid #ffeeba">${escapeHtml(submission.feedback || 'No written feedback yet.')}</div>
      </div>

      <div class="mt-20 pt-20" style="border-top:1px solid var(--border)">
        <h4>Request Regrade</h4>
        <p class="small">If you believe there is a mistake in your grade, provide a reason below.</p>
        <textarea id="regradeReason" class="input" rows="3" placeholder="Reason for regrade..."></textarea>
        <button class="button secondary w-auto mt-10" onclick="requestRegrade('${escapeAttr(assignmentId)}')">Submit Regrade Request</button>
      </div>
    </div>
  `;
}

async function renderAchievements() {
  const user = await SessionManager.getCurrentUser();
  const badges = await SupabaseDB.getUserBadges(user.email);
  const container = document.getElementById('pageContent');
  if (!container) return;
  container.innerHTML = `
    <h2 class="m-0">My Achievements</h2>
    <div class="grid mt-20">
      ${badges.map(b => `
        <div class="card flex-center flex-column">
          <div style="font-size:40px">${escapeHtml(b.badges.icon_url || '🏆')}</div>
          <h3 class="m-0 mt-10">${escapeHtml(b.badges.title)}</h3>
          <p class="small mt-5">${escapeHtml(b.badges.description)}</p>
          <div class="small mt-10 text-muted">Awarded on: ${new Date(b.awarded_at).toLocaleDateString()}</div>
        </div>
      `).join('') || '<div class="empty">No badges earned yet. Keep learning!</div>'}
    </div>
  `;
}

async function renderDashboardOverview() {
  NotificationManager.initPolling();
  const user = await SessionManager.getCurrentUser();
  const [enrollments, submissions, allAssignments] = await Promise.all([
    SupabaseDB.getEnrollments(user.email),
    SupabaseDB.getSubmissions(null, user.email),
    SupabaseDB.getAssignments()
  ]);
  updateHeaderStats().catch(e => console.warn('Header stats error:', e));
  const container = document.getElementById('pageContent');
  if (!container) return;

  const enrolledCourseIds = enrollments.map(e => e.course_id);
  const pendingAssignments = allAssignments.filter(a =>
    enrolledCourseIds.includes(a.course_id) &&
    a.status === 'published' &&
    !submissions.some(s => s.assignment_id === a.id) &&
    new Date(a.due_date) > new Date()
  ).sort((a, b) => new Date(a.due_date) - new Date(b.due_date));

  container.innerHTML = `
    <h2>Welcome Back, ${escapeHtml(user.full_name)}!</h2>
    <div class="stats-grid">
      <div class="stat-card"><h4>Enrolled Courses</h4><div class="value">${escapeHtml(enrollments.length)}</div></div>
      <div class="stat-card"><h4>Completed Assignments</h4><div class="value">${escapeHtml(submissions.filter(s => s.status === 'graded').length)}</div></div>
      <div class="stat-card"><h4>Current XP</h4><div class="value">${escapeHtml(user.xp || 0)}</div></div>
    </div>

    <div class="grid-2">
      <div class="card">
        <h3>Recent Activity</h3>
        <p class="small">You have ${escapeHtml(enrollments.length)} active courses. Check your assignments to stay on track!</p>
      </div>

      <div class="card">
        <h3>Upcoming Assignments</h3>
        <div class="mt-15">
          ${pendingAssignments.slice(0, 5).map(a => `
            <div class="flex-between list-item">
              <div>
                <div class="bold">${escapeHtml(a.title)}</div>
                <div class="tiny text-muted">Due: ${new Date(a.due_date).toLocaleDateString()}</div>
              </div>
              <button class="button small w-auto" onclick="showAssignmentForm('${a.id}')">Submit</button>
            </div>
          `).join('') || '<p class="small">No pending assignments! Good job.</p>'}
          ${pendingAssignments.length > 5 ? `<button class="button secondary small w-100 mt-10" onclick="renderAssignments()">View All Assignments</button>` : ''}
        </div>
      </div>
    </div>
  `;
}

async function renderProgress() {
  const user = await SessionManager.getCurrentUser();
  const [sessions, enrollments, courses] = await Promise.all([
    SupabaseDB.getStudySessions(user.email),
    SupabaseDB.getEnrollments(user.email),
    SupabaseDB.getCourses()
  ]);

  const container = document.getElementById('pageContent');
  if (!container) return;

  const totalSeconds = sessions.reduce((acc, s) => acc + s.duration, 0);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);

  container.innerHTML = `
    <h2 class="m-0">My Progress & Study Tracking</h2>
    <div class="grid-2 mt-20 mb-20">
      <div class="card">
        <h3 class="m-0">Level ${user.level || 1}</h3>
        <div class="mt-10 mb-10" style="background:#eee; height:16px; border-radius:8px; overflow:hidden">
          <div style="background:var(--ok); height:100%; width:${(user.xp % 100)}%"></div>
        </div>
        <p class="small">${user.xp % 100} / 100 XP to level ${(user.level || 1) + 1}</p>
      </div>
      <div class="card">
        <h3 class="m-0">Total Study Time</h3>
        <div class="bold mt-10" style="font-size:32px; color:var(--purple);">${h}h ${m}m</div>
        <p class="small mt-5">Logged across ${sessions.length} sessions</p>
      </div>
    </div>

    <div class="card">
      <h3 class="m-0">Focus Tracking</h3>
      <p class="small mt-5">Your study time is automatically tracked while viewing lessons.</p>
      <div id="studyTimerDisplay" class="bold mt-10" style="font-size:24px; display:none">00:00:00</div>
    </div>

    <div class="card mt-20">
      <h3 class="m-0">Recent Sessions</h3>
      <div class="mt-15">
        ${sessions.slice(0, 5).map(s => {
          const c = courses.find(x => x.id === s.course_id);
          return `<div class="flex-between list-item">
            <span>${escapeHtml(c?.title || 'Course')}</span>
            <span class="small">${Math.floor(s.duration / 60)}m logged on ${new Date(s.started_at).toLocaleDateString()}</span>
          </div>`;
        }).join('') || '<div class="empty">No sessions logged yet.</div>'}
      </div>
    </div>
  `;
}

let studyInterval = null;
let studyStartTime = null;
let currentStudyCourseId = null;

async function startStudySession(courseId) {
    if (studyInterval) {
        if (currentStudyCourseId === courseId) return;
        await stopStudySession();
    }

    currentStudyCourseId = courseId;
    studyStartTime = new Date();

    if (!studyInterval) {
        // Start
        studyStartTime = new Date();
        const display = document.getElementById('studyTimerDisplay');
        if (display) display.style.display = 'block';
    }

    studyInterval = setInterval(() => {
        const elapsed = Math.floor((new Date() - studyStartTime) / 1000);
        const h = Math.floor(elapsed / 3600).toString().padStart(2, '0');
        const m = Math.floor((elapsed % 3600) / 60).toString().padStart(2, '0');
        const s = (elapsed % 60).toString().padStart(2, '0');
        const display = document.getElementById('studyTimerDisplay');
        if (display) display.textContent = `${h}:${m}:${s}`;
    }, 1000);
}

async function stopStudySession() {
    if (!studyInterval) return;

    clearInterval(studyInterval);
    studyInterval = null;
    const endTime = new Date();
    const duration = Math.floor((endTime - studyStartTime) / 1000);

    if (duration > 10) { // Only save if more than 10 seconds
        const user = await SessionManager.getCurrentUser();
        const courseId = currentStudyCourseId;
        await SupabaseDB.saveStudySession({
            user_email: user.email,
            course_id: courseId,
            duration: duration,
            started_at: studyStartTime.toISOString(),
            ended_at: endTime.toISOString()
        });
        UI.showNotification(`Study session saved: ${Math.floor(duration/60)} minutes logged!`, 'success');

        // Update Progress
        await SupabaseDB.updateCourseProgress(courseId, user.email);
    }

    currentStudyCourseId = null;
    studyStartTime = null;
}

window.startStudySession = startStudySession;
window.stopStudySession = stopStudySession;

async function renderGrades() {
  const user = await SessionManager.getCurrentUser();
  const [submissions, assigns] = await Promise.all([
    SupabaseDB.getSubmissions(null, user.email),
    SupabaseDB.getAssignments()
  ]);
  const graded = submissions.filter(s => s.status === 'graded').sort((a,b) => new Date(a.submitted_at) - new Date(b.submitted_at));
  const container = document.getElementById('pageContent');
  if (!container) return;

  container.innerHTML = `
    <h2 class="m-0">My Grades & Analytics</h2>
    <div class="grid mt-20 mb-20" style="grid-template-columns: 1.5fr 1fr">
      <div class="card">
        <h3 class="m-0">Grade Trends</h3>
        <div class="mt-15" style="height: 200px">
            <canvas id="gradeChart"></canvas>
        </div>
      </div>
      <div class="card">
        <h3 class="m-0">Performance Summary</h3>
        <div id="gradeStats" class="mt-15"></div>
      </div>
    </div>
    <div class="card p-0" style="overflow-x:auto">
      <table>
        <thead><tr><th>Assignment</th><th>Date</th><th>Grade</th><th>Feedback</th></tr></thead>
        <tbody>
          ${graded.map(s => {
            const a = assigns.find(x => x.id === s.assignment_id);
            return `<tr><td><strong class="bold">${escapeHtml(a?.title || 'Unknown')}</strong></td><td class="small">${new Date(s.submitted_at).toLocaleDateString()}</td><td><span class="badge ${s.final_grade >= 70 ? 'badge-active' : 'badge-inactive'}">${s.final_grade}%</span></td><td>${escapeHtml(s.feedback || '-')}</td></tr>`;
          }).join('') || '<tr><td colspan="4" class="empty">No graded assignments yet.</td></tr>'}
        </tbody>
      </table>
    </div>
  `;

  if (graded.length > 0) {
    const ctx = document.getElementById('gradeChart').getContext('2d');
    new Chart(ctx, {
      type: 'line',
      data: {
        labels: graded.map(s => {
          const a = assigns.find(x => x.id === s.assignment_id);
          return a ? a.title.substring(0, 10) + '...' : 'Assignment';
        }),
        datasets: [{
          label: 'Grade %',
          data: graded.map(s => s.final_grade),
          borderColor: '#5b2ea6',
          backgroundColor: 'rgba(91, 46, 166, 0.1)',
          tension: 0.3,
          fill: true
        }]
      },
      options: {
        scales: { y: { min: 0, max: 100 } },
        responsive: true,
        maintainAspectRatio: false
      }
    });

    const avg = Math.round(graded.reduce((acc, s) => acc + s.final_grade, 0) / graded.length);
    document.getElementById('gradeStats').innerHTML = `
      <div class="flex-center flex-column p-20">
        <div class="bold" style="font-size:48px; color:var(--purple)">${avg}%</div>
        <p class="small">Overall Average Score</p>
        <div class="flex-between w-auto gap-20 mt-15">
          <div class="text-center"><div class="bold">${graded.length}</div><div class="small">Graded</div></div>
          <div class="text-center"><div class="bold">${Math.max(...graded.map(s => s.final_grade))}%</div><div class="small">Highest</div></div>
        </div>
      </div>
    `;
  } else {
    document.getElementById('gradeStats').innerHTML = '<div class="empty">No data to display summary.</div>';
  }
}


async function renderMaterials() {
  const content = document.getElementById('pageContent');
  if (!content) return;

  try {
    const user = await SessionManager.getCurrentUser();
    const [enrollments, allCourses, allMaterials] = await Promise.all([
      SupabaseDB.getEnrollments(user.email),
      SupabaseDB.getCourses(),
      SupabaseDB.getMaterials()
    ]);

    const enrolledIds = enrollments.map(e => e.course_id);
    const myCourses = allCourses.filter(c => enrolledIds.includes(c.id));

    content.innerHTML = `
      <h2 class="m-0">Course Materials</h2>
      <div class="grid mt-20">
        ${myCourses.map(c => {
          const courseMaterials = allMaterials.filter(m => m.course_id === c.id);
          return `
            <div class="card">
              <h3 class="m-0">${escapeHtml(c.title)}</h3>
              <div class="mt-15">
                ${courseMaterials.map(m => `
                  <div class="flex-between list-item">
                    <span>${escapeHtml(m.title)}</span>
                    <div class="flex gap-5">
                      <button class="button small w-auto" onclick="UI.viewFile('${escapeAttr(m.file_url)}', '${escapeAttr(m.title)}')">View</button>
                      <a href="${m.file_url}" target="_blank" class="button secondary small w-auto">Download</a>
                    </div>
                  </div>
                `).join('') || '<p class="small">No materials shared for this course.</p>'}
              </div>
            </div>
          `;
        }).join('') || '<div class="empty">Enroll in courses to see shared materials.</div>'}
      </div>
    `;
  } catch (error) {
    console.error('Materials error:', error);
    content.innerHTML = `<div class="stat-card danger"><h3>Error Loading Materials</h3></div>`;
  }
}

async function renderDiscussions() {
  const user = await SessionManager.getCurrentUser();
  const enrollments = await SupabaseDB.getEnrollments(user.email);
  const courses = await SupabaseDB.getCourses();
  const myCourses = courses.filter(c => enrollments.some(e => e.course_id === c.id));
  const container = document.getElementById('pageContent');
  if (!container) return;
  container.innerHTML = `
    <h2 class="m-0">Discussions</h2>
    <div class="grid mt-20">
      ${myCourses.map(c => `
        <div class="card">
          <h3 class="m-0">${escapeHtml(c.title)}</h3>
          <button class="button w-auto mt-15" onclick="viewStudentDiscussions('${c.id}')">View Discussion</button>
        </div>
      `).join('') || '<div class="empty">Enroll in a course to join discussions.</div>'}
    </div>
  `;
}

async function viewStudentDiscussions(courseId) {
  const user = await SessionManager.getCurrentUser();
  const disc = await SupabaseDB.getDiscussions(courseId);
  const container = document.getElementById('pageContent');
  if (!container) return;

  const renderThread = (parentId = null, depth = 0) => {
    return disc.filter(d => d.parent_id === parentId).map(d => {
      const isMine = d.user_email === user.email;
      return `
        <div class="question mb-10" style="margin-left:${depth * 20}px" id="disc-${d.id}">
          <div class="flex-between" style="align-items:start">
            <div class="small"><strong>${escapeHtml(d.user_email)}</strong> - ${new Date(d.created_at).toLocaleString()}</div>
            <div class="flex gap-5">
              <button class="button secondary tiny" onclick="showReplyForm('${escapeAttr(d.id)}', '${escapeAttr(courseId)}')">Reply</button>
              ${isMine ? `
                <button class="button secondary tiny" onclick="editStudentDiscussion('${escapeAttr(d.id)}', '${escapeAttr(courseId)}')">Edit</button>
                <button class="button danger tiny" onclick="deleteStudentDiscussion('${escapeAttr(d.id)}', '${escapeAttr(courseId)}')">Delete</button>
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
    <button class="button secondary w-auto mb-10" onclick="renderDiscussions()">← Back</button>
    <div class="card">
      <h3 class="m-0">Course Discussion</h3>
      <div id="disc-list" class="mt-20 mb-20" style="max-height:500px; overflow-y:auto">
        ${renderThread() || '<div class="empty">No messages yet. Start the conversation!</div>'}
      </div>
      <div class="flex gap-10">
        <input type="text" id="discInput" placeholder="Start a new thread..." class="m-0">
        <button class="button w-auto" onclick="postDiscussion('${escapeAttr(courseId)}')">Post</button>
      </div>
    </div>
  `;
}

window.showReplyForm = (parentId, courseId) => {
  const area = document.getElementById(`reply-area-${parentId}`);
  area.innerHTML = `
    <div class="flex gap-10 mt-10">
      <input type="text" id="replyInput-${parentId}" placeholder="Write a reply..." class="m-0 small p-10">
      <button class="button small w-auto" onclick="postDiscussion('${escapeAttr(courseId)}', '${escapeAttr(parentId)}')">Reply</button>
      <button class="button secondary small w-auto" onclick="this.parentElement.remove()">Cancel</button>
    </div>
  `;
};

async function postDiscussion(courseId, parentId = null) {
  const user = await SessionManager.getCurrentUser();
  const inputId = parentId ? `replyInput-${parentId}` : 'discInput';
  const content = document.getElementById(inputId).value;
  if (!content) return;
  try {
    await SupabaseDB.saveDiscussion({
        id: crypto.randomUUID(),
        course_id: courseId,
        user_email: user.email,
        content,
        parent_id: parentId,
        created_at: new Date().toISOString()
    });
    viewStudentDiscussions(courseId);
  } catch (e) {
    alert('Failed to post message: ' + e.message);
  }
}

async function editStudentDiscussion(id, courseId) {
  const div = document.getElementById(`disc-${id}`);
  const contentDiv = div.querySelector('.disc-content');
  const current = contentDiv.innerText;
  contentDiv.innerHTML = `
    <textarea class="input" style="margin-top:10px">${escapeHtml(current)}</textarea>
    <div style="margin-top:8px; display:flex; gap:8px">
      <button class="button" style="padding:4px 8px; font-size:11px" onclick="saveStudentDiscussionEdit('${id}', '${courseId}')">Save</button>
      <button class="button secondary" style="padding:4px 8px; font-size:11px" onclick="viewStudentDiscussions('${courseId}')">Cancel</button>
    </div>
  `;
}

async function saveStudentDiscussionEdit(id, courseId) {
  const div = document.getElementById(`disc-${id}`);
  const content = div.querySelector('textarea').value;
  if (!content) return;
  try {
    const disc = await SupabaseDB.getDiscussions(courseId);
    const existing = disc.find(d => d.id === id);
    await SupabaseDB.saveDiscussion({ ...existing, content });
    viewStudentDiscussions(courseId);
  } catch (e) {
    alert('Error updating: ' + e.message);
  }
}

async function deleteStudentDiscussion(id, courseId) {
  if (!confirm('Delete this message?')) return;
  try {
    await SupabaseDB.deleteDiscussion(id);
    viewStudentDiscussions(courseId);
  } catch (e) {
    alert('Error deleting: ' + e.message);
  }
}

window.editStudentDiscussion = editStudentDiscussion;
window.saveStudentDiscussionEdit = saveStudentDiscussionEdit;
window.deleteStudentDiscussion = deleteStudentDiscussion;
window.enroll = enroll;
window.viewCourse = viewCourse;
window.showLesson = showLesson;
window.renderCourses = renderCourses;
window.renderMyCourses = renderMyCourses;
window.renderAssignments = renderAssignments;
window.renderQuizzes = renderQuizzes;
window.renderAchievements = renderAchievements;
window.renderDashboardOverview = renderDashboardOverview;
window.renderProgress = renderProgress;
window.renderGrades = renderGrades;
window.renderCalendar = renderCalendar;
window.renderMaterials = renderMaterials;
window.renderDiscussions = renderDiscussions;
window.renderCertificates = renderCertificates;
window.renderPlanner = renderPlanner;
window.renderLiveClasses = renderLiveClasses;
window.renderSettings = renderSettings;
window.renderHelp = renderHelp;
window.showAssignmentForm = showAssignmentForm;
window.viewFeedback = viewFeedback;
window.submitAssignment = submitAssignment;
window.deleteSubmissionById = deleteSubmissionById;
window.startQuiz = startQuiz;
window.viewQuizResults = viewQuizResults;
window.autoSaveQuiz = autoSaveQuiz;
window.submitQuiz = submitQuiz;
window.postDiscussion = postDiscussion;
window.addPlannerItem = addPlannerItem;
window.deletePlannerItem = deletePlannerItem;
window.filterCatalog = filterCatalog;
window.viewStudentDiscussions = viewStudentDiscussions;
window.renderDashboardOverview = renderDashboardOverview;
window.renderMyCourses = renderMyCourses;
window.renderProgress = renderProgress;
window.renderGrades = renderGrades;
window.renderCalendar = renderCalendar;
window.renderMaterials = renderMaterials;
window.renderDiscussions = renderDiscussions;
window.renderCertificates = renderCertificates;
window.renderPlanner = renderPlanner;
window.renderSettings = renderSettings;
window.renderHelp = renderHelp;

async function renderCertificates() {
  const user = await SessionManager.getCurrentUser();
  const certs = await SupabaseDB.getCertificates(user.email);
  const container = document.getElementById('pageContent');
  if (!container) return;
  container.innerHTML = `
    <h2 class="m-0">My Certificates</h2>
    <div class="grid mt-20">
      ${certs.map(c => `
        <div class="card flex-center flex-column">
          <div style="font-size:40px">📜</div>
          <h3 class="m-0 mt-10">${escapeHtml(c.courses.title)}</h3>
          <p class="small mt-5">Issued on: ${new Date(c.issued_at).toLocaleDateString()}</p>
          <button class="button w-auto px-30 mt-15" onclick="UI.viewFile('${escapeAttr(c.certificate_url)}', 'Certificate - ${escapeAttr(c.courses.title)}')">View Certificate</button>
        </div>
      `).join('') || '<div class="empty">No certificates earned yet. Finish a course to get one!</div>'}
    </div>
  `;
}

async function renderPlanner() {
  const user = await SessionManager.getCurrentUser();
  const items = await SupabaseDB.getPlannerItems(user.email);
  const container = document.getElementById('pageContent');
  if (!container) return;
  container.innerHTML = `
    <h2 class="m-0">Study Planner</h2>
    <div class="card mt-20">
      <div class="flex gap-10 mb-20">
        <input type="text" id="plannerTitle" placeholder="Task title..." class="m-0">
        <input type="date" id="plannerDate" class="m-0">
        <button class="button w-auto px-30" onclick="addPlannerItem()">Add Task</button>
      </div>
      <div id="plannerList" class="mt-15">
        ${items.map(item => `
          <div class="flex-between list-item">
            <span>${item.completed ? '✅' : '⏳'} <span class="bold">${escapeHtml(item.title)}</span> - ${new Date(item.due_date).toLocaleDateString()}</span>
            <button class="button danger small w-auto" onclick="deletePlannerItem('${item.id}')">Delete</button>
          </div>
        `).join('') || '<div class="empty">No tasks planned yet.</div>'}
      </div>
    </div>
  `;
}

async function addPlannerItem() {
  const user = await SessionManager.getCurrentUser();
  const title = document.getElementById('plannerTitle').value;
  const date = document.getElementById('plannerDate').value;
  if (!title || !date) return;
  await SupabaseDB.savePlannerItem({
      id: crypto.randomUUID(),
      user_email: user.email,
      title,
      due_date: date,
      completed: false,
      created_at: new Date().toISOString()
  });
  renderPlanner();
}

async function deletePlannerItem(id) {
  await SupabaseDB.deletePlannerItem(id);
  renderPlanner();
}

async function renderLiveClasses() {
  const content = document.getElementById('pageContent');
  if (!content) return;

  try {
    const user = await SessionManager.getCurrentUser();
    const [enrollments, allLiveClasses] = await Promise.all([
      SupabaseDB.getEnrollments(user.email),
      SupabaseDB.getLiveClasses()
    ]);

    const enrolledCourseIds = enrollments.map(e => e.course_id);
    const myClasses = allLiveClasses.filter(liveClass => enrolledCourseIds.includes(liveClass.course_id));

    content.innerHTML = `
      <div class="card">
        <h2 class="m-0">Upcoming Live Classes</h2>
      </div>
      <div class="grid mt-20">
        ${myClasses.map(liveClass => {
          const isLive = liveClass.status === 'live';
          return `
            <div class="card">
              <div class="flex-between" style="align-items:start">
                <div>
                  <h3 class="m-0">${escapeHtml(liveClass.title)}</h3>
                  <p class="small mt-5"><strong>Time:</strong> ${new Date(liveClass.start_at).toLocaleString()}</p>
                </div>
                <span class="badge ${isLive ? 'badge-active' : ''}">${liveClass.status.toUpperCase()}</span>
              </div>
              <div class="mt-15">
                ${isLive ?
                  `<button class="button w-auto" onclick="handleJoinLiveClass('${liveClass.id}', '${liveClass.room_name}', '${escapeAttr(liveClass.meeting_url || '')}')">Join Now</button>` :
                  `<button class="button secondary w-auto" disabled>Not Started</button>`
                }
              </div>
            </div>
          `;
        }).join('') || '<div class="empty">No live classes scheduled for your courses.</div>'}
      </div>
      <div id="jitsi-container" class="hidden mt-20" style="height:600px; border:1px solid var(--border); border-radius:8px; overflow:hidden; position:relative"></div>
    `;
  } catch (error) {
    console.error('Live Classes error:', error);
    content.innerHTML = `<div class="stat-card danger"><h3>Error Loading Live Classes</h3></div>`;
  }
}

let jitsiAPI = null;
let attendanceRecordId = null;
let attendanceStartTime = null;

async function handleJoinLiveClass(id, roomName, meetingUrl) {
    if (meetingUrl && meetingUrl.trim() !== '') {
        const choice = await UI.showMeetingChoice(meetingUrl);
        if (!choice) return;

        const user = await SessionManager.getCurrentUser();
        await SupabaseDB.saveAttendance({
            live_class_id: id,
            student_email: user.email,
            join_time: new Date().toISOString(),
            is_present: true
        });

        if (choice === 'tab') {
            window.open(meetingUrl, '_blank');
        } else {
            // Embed in app
            const container = document.getElementById('jitsi-container');
            if (container) {
                container.classList.remove('hidden');
                container.scrollIntoView({ behavior: 'smooth' });
                container.innerHTML = `<iframe src="${escapeAttr(meetingUrl)}" style="width:100%; height:600px; border:none" allow="camera; microphone; display-capture; autoplay; clipboard-write"></iframe>`;

                const closeBtnId = 'exit-meeting-btn';
                let closeBtn = document.getElementById(closeBtnId);
                if (!closeBtn) {
                    closeBtn = document.createElement('button');
                    closeBtn.id = closeBtnId;
                    closeBtn.className = 'button secondary w-auto mt-10';
                    closeBtn.textContent = 'Exit Meeting View';
                    container.after(closeBtn);
                } else {
                    closeBtn.classList.remove('hidden');
                    closeBtn.style.display = 'inline-flex';
                }

                closeBtn.onclick = () => {
                    container.classList.add('hidden');
                    container.innerHTML = '';
                    closeBtn.style.display = 'none';
                    stopAttendanceTracking(id);
                };
            } else {
                window.open(meetingUrl, '_blank');
            }
        }
    } else {
        joinLiveClass(id, roomName);
    }
}
window.handleJoinLiveClass = handleJoinLiveClass;

async function joinLiveClass(id, roomName) {
  const user = await SessionManager.getCurrentUser();
  const container = document.getElementById('jitsi-container');
  container.classList.remove('hidden');
  container.scrollIntoView({ behavior: 'smooth' });

  // Waiting State logic
  const waitingOverlay = document.createElement('div');
  waitingOverlay.id = 'waiting-overlay';
  waitingOverlay.className = 'absolute inset-0 flex-center flex-column';
  waitingOverlay.style.background = 'rgba(255,255,255,0.9)';
  waitingOverlay.style.zIndex = '5';
  waitingOverlay.innerHTML = `
    <div class="stat-card">
        <h3 class="m-0">Moderator has left</h3>
        <p class="small mt-10">Waiting for teacher to rejoin. Voice and chat are still active.</p>
        <div class="mt-15 flex-center"><div class="bar" style="width:50px; height:4px; background:var(--purple); animation: pulse 1.5s infinite"></div></div>
    </div>
  `;
  container.appendChild(waitingOverlay);
  waitingOverlay.classList.add('hidden');

  const domain = "meet.jit.si";
  const options = {
    roomName: roomName,
    height: 600,
    parentNode: container,
    userInfo: {
      displayName: user.full_name,
      email: user.email
    },
    configOverwrite: {
      startWithAudioMuted: true,
      startWithVideoMuted: true, // Low bandwidth: video off by default
      prejoinPageEnabled: false,
      remoteVideoMenu: { disable: true },
      disableRemoteMute: true
    },
    interfaceConfigOverwrite: {
        TOOLBAR_BUTTONS: ['microphone', 'camera', 'chat', 'raisehand', 'settings', 'hangup', 'tileview']
    }
  };

  if (jitsiAPI) jitsiAPI.dispose();
  jitsiAPI = new JitsiMeetExternalAPI(domain, options);

  // Moderator status tracking
  jitsiAPI.addEventListener('participantJoined', (p) => {
      if (p.role === 'moderator') {
          waitingOverlay.classList.add('hidden');
      }
  });

  jitsiAPI.addEventListener('participantLeft', (p) => {
      // If the last moderator left, show overlay
      // In this system, there's usually only one teacher/moderator
      if (p.role === 'moderator') {
          waitingOverlay.classList.remove('hidden');
      }
  });

  jitsiAPI.on('videoConferenceJoined', async () => {
    attendanceStartTime = new Date();
    const record = await SupabaseDB.saveAttendance({
        live_class_id: id,
        student_email: user.email,
        join_time: attendanceStartTime.toISOString(),
        is_present: false
    });
    attendanceRecordId = record?.id;
  });

  jitsiAPI.on('participantRoleChanged', (event) => {
      if (event.role === 'moderator') {
          waitingOverlay.classList.add('hidden');
          UI.showNotification('Moderator joined', 'info');
      } else {
          // If no moderators left in the room
          // (Simplified: if we get a role change and no one is moderator, we could show overlay)
      }
  });

  jitsiAPI.on('videoConferenceLeft', async () => {
    await stopAttendanceTracking(id);
    container.classList.add('hidden');
    waitingOverlay.remove();
  });

  jitsiAPI.addEventListener('readyToClose', () => {
    container.classList.add('hidden');
    waitingOverlay.remove();
    jitsiAPI.dispose();
    jitsiAPI = null;
  });
}

async function stopAttendanceTracking(classId) {
    if (!attendanceRecordId || !attendanceStartTime) return;

    const leaveTime = new Date();
    const duration = Math.floor((leaveTime - attendanceStartTime) / 1000);

    // Fetch the live class to get total duration
    const classes = await SupabaseDB.getLiveClasses();
    const liveClass = classes.find(x => x.id === classId);
    let isPresent = false;
    if (liveClass) {
        const totalExpected = (new Date(liveClass.end_at) - new Date(liveClass.start_at)) / 1000;
        // Mark present if duration >= 60% of class time or at least 30 mins (demo logic)
        if (duration >= (totalExpected * 0.6) || duration >= 1800) {
            isPresent = true;
        }
    }

    const user = await SessionManager.getCurrentUser();
    const records = await SupabaseDB.getAttendance(classId, user.email);
    const existing = records.find(r => r.id === attendanceRecordId);

    await SupabaseDB.saveAttendance({
        ...existing,
        id: attendanceRecordId,
        leave_time: leaveTime.toISOString(),
        duration: duration,
        is_present: isPresent
    });

    attendanceRecordId = null;
    attendanceStartTime = null;
}

window.joinLiveClass = joinLiveClass;
window.renderLiveClasses = renderLiveClasses;

async function renderHelp() {
  const content = document.getElementById('pageContent');
  if (!content) return;
  content.innerHTML = '<h2>Help & Support</h2><div class="card"><h3>FAQ</h3><p>Contact support at support@smartlms.com</p></div>';
}

async function renderSettings() {
  const content = document.getElementById('pageContent');
  if (!content) return;

  const prefs = await NotificationManager.getPreferences();

  content.innerHTML = `
    <h2 class="m-0">Settings</h2>
    <div class="card mt-20">
      <h3 class="m-0">Notification Preferences</h3>
      <p class="small mt-5">Choose how you want to receive updates.</p>
      <div class="flex-column gap-10 mt-15">
        <label class="flex-center-y gap-10"><input type="checkbox" id="prefInApp" ${prefs.inApp ? 'checked' : ''} class="w-auto m-0"> In-App Notifications</label>
        <label class="flex-center-y gap-10"><input type="checkbox" id="prefPush" ${prefs.push ? 'checked' : ''} class="w-auto m-0"> Browser Push Notifications</label>
        <label class="flex-center-y gap-10"><input type="checkbox" id="prefEmail" ${prefs.email ? 'checked' : ''} class="w-auto m-0"> Email Alerts</label>
        <button class="button w-auto px-30 mt-10" onclick="saveNotificationSettings()">Save Preferences</button>
      </div>
    </div>
    <div class="card mt-20">
      <h3 class="m-0">Push Subscription</h3>
      <p class="small mt-5">Enable real-time desktop notifications even when the app is closed.</p>
      <button class="button secondary w-auto px-30 mt-10" onclick="NotificationManager.subscribeToPush()">Enable Push Notifications</button>
    </div>
  `;
}

async function saveNotificationSettings() {
  const prefs = {
    inApp: document.getElementById('prefInApp').checked,
    push: document.getElementById('prefPush').checked,
    email: document.getElementById('prefEmail').checked
  };
  await NotificationManager.updatePreferences(prefs);
}

window.saveNotificationSettings = saveNotificationSettings;
window.renderSettings = renderSettings;

async function renderQuizzes() {
  const user = await SessionManager.getCurrentUser();
  const [enrollments, allQuizzes, subs, courses] = await Promise.all([
    SupabaseDB.getEnrollments(user.email),
    SupabaseDB.getQuizzes(),
    SupabaseDB.getQuizSubmissions(null, user.email),
    SupabaseDB.getCourses()
  ]);
  updateHeaderStats().catch(e => console.warn('Header stats error:', e));
  const enrolledCourseIds = enrollments.map(e => e.course_id);
  const quizzes = allQuizzes.filter(q => enrolledCourseIds.includes(q.course_id) && q.status === 'published');

  const container = document.getElementById('pageContent');
  if (!container) return;
  container.innerHTML = `
    <h2 class="m-0">My Quizzes</h2>
    <div class="grid mt-20">
      ${quizzes.map(q => {
        const mySubs = subs.filter(s => s.quiz_id === q.id && s.status === 'submitted').sort((a,b) => new Date(b.submitted_at) - new Date(a.submitted_at));
        const bestScore = mySubs.length ? Math.max(...mySubs.map(s => s.score || 0)) : '-';
        const attemptsUsed = mySubs.length;
        const canAttempt = attemptsUsed < q.attempts_allowed;

        const course = courses.find(c => c.id === q.course_id);
        return `
          <div class="card">
            <h3 class="m-0">${escapeHtml(q.title)}</h3>
            <p class="small"><strong>Course:</strong> ${escapeHtml(course?.title || 'Unknown')}</p>
            <p class="small mt-5">${escapeHtml(q.description || '')}</p>
            <div class="flex-between mt-15 p-10" style="background:var(--bg); border-radius:6px">
                <div class="text-center">
                    <div class="bold">${attemptsUsed} / ${q.attempts_allowed}</div>
                    <div class="small">Attempts</div>
                </div>
                <div class="text-center">
                    <div class="bold" style="color:var(--purple)">${bestScore !== '-' ? bestScore + '%' : '-'}</div>
                    <div class="small">Best Score</div>
                </div>
            </div>

            ${attemptsUsed > 0 ? `
                <div class="mt-15">
                    <div class="bold small mb-5">Previous Attempts:</div>
                    <div class="flex-column gap-5">
                        ${mySubs.map((s, i) => `
                            <div class="flex-between p-5 small border-radius-sm" style="background:#fff; border:1px solid var(--border)">
                                <span>#${attemptsUsed - i}: ${s.score}% (${Math.floor(s.time_spent / 60)}m)</span>
                                <button class="button secondary tiny w-auto" onclick="viewQuizResults('${q.id}', '${s.id}')">View Details</button>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}

            <div class="mt-20">
                ${canAttempt ?
                    `<button class="button w-auto small px-20" onclick="startQuiz('${q.id}')">Start New Attempt</button>` :
                    '<div class="badge badge-inactive w-100 text-center">All Attempts Used</div>'
                }
            </div>
          </div>
        `;
      }).join('') || '<div class="empty">No quizzes available for your courses.</div>'}
    </div>
    <div id="quizArea" class="hidden mt-20"></div>
  `;
}

let quizTimer = null;
let currentQuiz = null;
let currentSubmission = null;

async function startQuiz(quizId) {
  const user = await SessionManager.getCurrentUser();
  const quiz = await SupabaseDB.getQuiz(quizId);

  // Check for existing draft
  const subs = await SupabaseDB.getQuizSubmissions(quizId, user.email);
  const draft = subs.find(s => s.status === 'draft');

  if (draft && !confirm('You have an unfinished attempt. Resume it?')) {
    // If they don't want to resume, we could delete it, but better to just let them start fresh and we'll create a new one.
    // Actually, let's just resume if it exists.
  }

  currentQuiz = quiz;
  const content = document.getElementById('pageContent');
  if (!content) return;
  const card = content.querySelector('.card');
  if (card) card.style.display = 'none';
  const quizArea = document.getElementById('quizArea');
  if (!quizArea) return;
  quizArea.style.display = 'block';
  quizArea.innerHTML = `
    <div class="card">
      <div class="flex-between p-10 mb-20" style="position: sticky; top:0; background:#fff; z-index:10; border-bottom:1px solid var(--border)">
        <h3 class="m-0">${escapeHtml(quiz.title)}</h3>
        <div id="quizTimerDisplay" class="bold danger-text" style="font-size:1.2rem">Time Remaining: --:--</div>
      </div>
      <form id="quizForm">
        <div id="quizQuestions"></div>
        <div class="mt-20 flex gap-10">
          <button type="button" class="button w-auto px-40" id="submitQuizBtn" onclick="submitQuiz()">Submit Quiz</button>
        </div>
      </form>
    </div>
  `;

  const qList = quizArea.querySelector('#quizQuestions');

  // Create indexed question list for shuffling
  let questionsToDisplay = quiz.questions.map((q, idx) => ({ ...q, originalIdx: idx }));
  if (quiz.shuffle_questions) {
      for (let i = questionsToDisplay.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [questionsToDisplay[i], questionsToDisplay[j]] = [questionsToDisplay[j], questionsToDisplay[i]];
      }
  }

  questionsToDisplay.forEach((q, displayIdx) => {
    const idx = q.originalIdx;
    const qDiv = document.createElement('div'); qDiv.className = 'question';
    qDiv.style.marginBottom = '20px';
    let inputHtml = '';
    if (q.type === 'mcq') {
      inputHtml = q.options.map((opt, i) => `
        <div class="flex-center-y gap-10 mt-10" style="background:#fff; border:1px solid var(--border); padding:12px; border-radius:8px; cursor:pointer" onclick="const r=this.querySelector('input'); r.checked=true; r.dispatchEvent(new Event('change'))">
          <input type="radio" name="q-${idx}" value="${i}" onchange="autoSaveQuiz()" style="width:auto; margin:0">
          <div class="small">${escapeHtml(opt)}</div>
        </div>
      `).join('');
    } else if (q.type === 'tf') {
      inputHtml = `
        <div class="grid-2 gap-10 mt-10">
          <div class="flex-center-y gap-10" style="background:#fff; border:1px solid var(--border); padding:12px; border-radius:8px; cursor:pointer" onclick="const r=this.querySelector('input'); r.checked=true; r.dispatchEvent(new Event('change'))">
            <input type="radio" name="q-${idx}" value="True" onchange="autoSaveQuiz()" style="width:auto; margin:0">
            <div class="small">True</div>
          </div>
          <div class="flex-center-y gap-10" style="background:#fff; border:1px solid var(--border); padding:12px; border-radius:8px; cursor:pointer" onclick="const r=this.querySelector('input'); r.checked=true; r.dispatchEvent(new Event('change'))">
            <input type="radio" name="q-${idx}" value="False" onchange="autoSaveQuiz()" style="width:auto; margin:0">
            <div class="small">False</div>
          </div>
        </div>
      `;
    } else if (q.type === 'short') {
      inputHtml = `<input type="text" class="input" placeholder="Your answer..." oninput="autoSaveQuiz()" data-q-idx="${idx}">`;
    }

    qDiv.innerHTML = `
      <div class="bold mb-10">Q${displayIdx + 1}: ${escapeHtml(q.text)} (${q.points} pts)</div>
      ${q.hint ? `<div class="small p-5 mb-10" style="background:#fff4c2">💡 Hint: ${escapeHtml(q.hint)}</div>` : ''}
      <div class="mt-10">${inputHtml}</div>
    `;
    qList.appendChild(qDiv);
  });

  // Create or Use initial draft submission
  if (draft) {
    currentSubmission = draft;
    // Pre-fill answers
    Object.entries(draft.answers || {}).forEach(([idx, val]) => {
      const q = quiz.questions[idx];
      if (q.type === 'mcq' || q.type === 'tf') {
        const rad = document.querySelector(`input[name="q-${idx}"][value="${val}"]`);
        if (rad) rad.checked = true;
      } else {
        const input = document.querySelector(`input[data-q-idx="${idx}"]`);
        if (input) input.value = val;
      }
    });
  } else {
    const sub = await SupabaseDB.saveQuizSubmission({
      quiz_id: quizId,
      student_email: user.email,
      status: 'draft',
      answers: {},
      started_at: new Date().toISOString()
    });
    currentSubmission = sub;
  }

  // Start Timer
  if (quiz.time_limit > 0) {
    let secondsLeft = quiz.time_limit * 60;
    updateTimerDisplay(secondsLeft);
    quizTimer = setInterval(() => {
      secondsLeft--;
      updateTimerDisplay(secondsLeft);
      if (secondsLeft <= 0) {
        clearInterval(quizTimer);
        alert('Time is up! Submitting your quiz automatically.');
        submitQuiz();
      }
    }, 1000);
  } else {
    const timerDisplay = document.getElementById('quizTimerDisplay');
    if (timerDisplay) timerDisplay.textContent = 'No Time Limit';
  }

  quizArea.scrollIntoView({ behavior: 'smooth' });
}

function updateTimerDisplay(s) {
  const m = Math.floor(s / 60);
  const rs = s % 60;
  const timerDisplay = document.getElementById('quizTimerDisplay');
  if (timerDisplay) timerDisplay.textContent = `Time Remaining: ${m}:${rs.toString().padStart(2, '0')}`;
}

let quizDebounceTimer = null;
async function autoSaveQuiz() {
  if (!currentSubmission) return;
  if (quizDebounceTimer) clearTimeout(quizDebounceTimer);
  quizDebounceTimer = setTimeout(async () => {
      const answers = getQuizAnswers();
      currentSubmission.answers = answers;
      await SupabaseDB.saveQuizSubmission(currentSubmission);
  }, 1000);
}

function getQuizAnswers() {
  const answers = {};
  currentQuiz.questions.forEach((q, idx) => {
    if (q.type === 'mcq' || q.type === 'tf') {
      const selected = document.querySelector(`input[name="q-${idx}"]:checked`);
      if (selected) answers[idx] = selected.value;
    } else {
      const input = document.querySelector(`input[data-q-idx="${idx}"]`);
      if (input) answers[idx] = input.value;
    }
  });
  return answers;
}

async function submitQuiz() {
  const btn = document.getElementById('submitQuizBtn');
  if (btn) btn.disabled = true;
  if (quizTimer) clearInterval(quizTimer);
  const user = await SessionManager.getCurrentUser();
  const answers = getQuizAnswers();
  
  // Auto-grading logic
  let score = 0;
  let totalPoints = 0;
  currentQuiz.questions.forEach((q, idx) => {
    totalPoints += q.points;
    const studentAnswer = answers[idx];
    if (studentAnswer !== undefined && studentAnswer !== null) {
      if (studentAnswer.toString().trim().toLowerCase() === q.correct.toString().trim().toLowerCase()) {
        score += q.points;
      }
    }
  });

  const percentage = Math.round((score / totalPoints) * 100);
  const now = new Date();
  
  // Calculate time spent
  const timeSpent = currentSubmission ? Math.round((now - new Date(currentSubmission.started_at)) / 1000) : 0;

  await SupabaseDB.saveQuizSubmission({
    ...currentSubmission,
    answers: answers,
    score: percentage,
    total_points: totalPoints,
    status: 'submitted',
    time_spent: timeSpent,
    submitted_at: now.toISOString()
  });

  const quizArea = document.getElementById('quizArea');
  if (quizArea) quizArea.style.display = 'none';
  const pageContent = document.getElementById('pageContent');
  if (pageContent) {
    const cards = pageContent.querySelectorAll('.card');
    cards.forEach(c => c.style.display = 'block');
  }

  // Update Progress
  if (currentQuiz) await SupabaseDB.updateCourseProgress(currentQuiz.course_id, user.email);
  alert(`Quiz submitted! Your score: ${percentage}%`);
  currentQuiz = null;
  currentSubmission = null;
  renderQuizzes();
}

async function viewQuizResults(quizId, submissionId = null) {
  const user = await SessionManager.getCurrentUser();
  const quiz = await SupabaseDB.getQuiz(quizId);
  const subs = await SupabaseDB.getQuizSubmissions(quizId, user.email);

  let targetSub;
  if (submissionId) {
      targetSub = subs.find(s => s.id === submissionId);
  } else {
      targetSub = subs.filter(s => s.status === 'submitted').sort((a,b) => (b.score || 0) - (a.score || 0))[0];
  }

  if (!targetSub) return renderQuizzes();

  const container = document.getElementById('pageContent');
  if (!container) return;
  container.innerHTML = `
    <button class="button secondary w-auto mb-10" onclick="renderQuizzes()">← Back</button>
    <div class="card">
      <h2 class="m-0">Results: ${escapeHtml(quiz.title)}</h2>
      <div class="flex-between mt-10">
        <p class="m-0"><strong>Raw Score:</strong> ${Math.round((targetSub.score / 100) * targetSub.total_points)} / ${targetSub.total_points}</p>
        <p class="m-0"><strong>Attempt Score:</strong> <span class="bold" style="font-size:1.2rem; color:var(--purple)">${targetSub.score}%</span></p>
      </div>
      <div class="mt-20">
        ${quiz.questions.map((q, idx) => {
          const studentAnswer = targetSub.answers[idx];
          let studentDisplay = studentAnswer || 'No Answer';
          let correctDisplay = q.correct;

          if (q.type === 'mcq') {
              studentDisplay = q.options[studentAnswer] !== undefined ? q.options[studentAnswer] : studentAnswer;
              correctDisplay = q.options[q.correct] !== undefined ? q.options[q.correct] : q.correct;
          } else if (q.type === 'tf') {
              studentDisplay = studentAnswer;
              correctDisplay = q.correct;
          }

          const isCorrect = studentAnswer?.toString().trim().toLowerCase() === q.correct.toString().trim().toLowerCase();
          const statusColor = isCorrect ? 'var(--ok)' : 'var(--danger)';

          return `
            <div class="question" style="border-left: 5px solid ${statusColor}">
              <div class="flex-between">
                <div class="bold">Q${idx + 1}: ${escapeHtml(q.text)}</div>
                <div class="badge ${isCorrect ? 'badge-active' : 'badge-warn'}">${isCorrect ? q.points : 0} / ${q.points} pts</div>
              </div>
              <div class="small mt-10">Your Answer: <span class="bold">${escapeHtml(studentDisplay)}</span></div>
              ${!isCorrect ? `<div class="small success-text bold mt-5">Correct Answer: ${escapeHtml(correctDisplay)}</div>` : ''}
              ${q.explanation ? `<div class="small mt-10 p-10" style="background:var(--light); border-radius:4px; font-style:italic">📖 Explanation: ${escapeHtml(q.explanation)}</div>` : ''}
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

async function requestRegrade(assignmentId) {
    const reason = document.getElementById('regradeReason').value;
    if (!reason) return alert('Please provide a reason.');

    try {
        const user = await SessionManager.getCurrentUser();
        const submission = await SupabaseDB.getSubmission(assignmentId, user.email);
        submission.regrade_request = reason;
        await SupabaseDB.saveSubmission(submission);
        alert('Regrade request submitted!');
        viewFeedback(assignmentId);
    } catch (e) {
        alert('Failed to submit regrade request.');
    }
}
window.requestRegrade = requestRegrade;

async function deleteSubmissionById(assignmentId, studentEmail) {
  if (confirm('Delete submission?')) { try { await SupabaseDB.deleteSubmission(assignmentId, studentEmail); renderAssignments(); } catch (e) { alert('Error'); } }
}
async function submitAssignment(assignmentId, studentEmail) {
  const btn = document.getElementById('submitAssignBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Uploading...'; }

  try {
    const existing = await SupabaseDB.getSubmission(assignmentId, studentEmail);
    const answers = existing?.answers || {};
    const questions = document.querySelectorAll(`#qwrap-${assignmentId} .question`);

    for (let idx = 0; idx < questions.length; idx++) {
      const qDiv = questions[idx];
      const essay = qDiv.querySelector('textarea');
      const link = qDiv.querySelector('.q-link');
      const fileInput = qDiv.querySelector('.q-file');

      if (essay) {
        answers[idx] = essay.value;
      } else if (link) {
        answers[idx] = link.value;
      } else if (fileInput) {
        if (fileInput.files[0]) {
          const file = fileInput.files[0];
          const path = `submissions/${assignmentId}/${studentEmail}/${idx}_${Date.now()}_${file.name}`;
          await SupabaseDB.uploadFile('assignments', path, file);
          answers[idx] = await SupabaseDB.getPublicUrl('assignments', path);
        }
        // If no new file, existing answers[idx] remains as is
      }
    }

    const submission = {
      ...existing,
      assignment_id: assignmentId,
      student_email: studentEmail,
      submitted_at: new Date().toISOString(),
      answers: answers,
      attachments: existing?.attachments || [],
      status: 'submitted'
    };

    if (await SupabaseDB.saveSubmission(submission)) {
      // Update Progress
      const assigns = await SupabaseDB.getAssignments();
      const a = assigns.find(x => x.id === assignmentId);
      if (a) await SupabaseDB.updateCourseProgress(a.course_id, studentEmail);

      alert('Submitted!');
      renderAssignments();
    }
  } catch (e) {
    console.error('Submission failed:', e);
    alert(`Submission failed: ${e.message || 'Unknown error'}. ${e.details || ''}`);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Submit Assignment'; }
  }
}

window.addEventListener('beforeunload', async (e) => {
  if (currentQuiz && currentSubmission) {
    e.preventDefault();
    e.returnValue = 'You have an active quiz. Are you sure you want to leave?';
  }
  if (studyInterval) {
      // Browsers may not allow async in beforeunload, but we try a sync-like save or just let it go
      // In many cases, it's better to use beacon or just accept loss on hard close.
      // But we can try to call stopStudySession.
      stopStudySession();
  }
});

function initNav() {
  const studentNav = document.getElementById('studentNav');
  if (studentNav) {
    studentNav.querySelectorAll('button').forEach(button => {
      button.addEventListener('click', (e) => {
        studentNav.querySelectorAll('button').forEach(b => b.classList.remove('active'));
        button.classList.add('active');
        const page = button.dataset.page;
        if (studyInterval) stopStudySession();
        if(page === 'courses') renderCourses();
        else if(page === 'my-courses') renderMyCourses();
        else if(page === 'assignments') renderAssignments();
        else if(page === 'quizzes') renderQuizzes();
        else if(page === 'achievements') renderAchievements();
        else if(page === 'dashboard') renderDashboardOverview();
        else if(page === 'progress') renderProgress();
        else if(page === 'grades') renderGrades();
        else if(page === 'calendar') renderCalendar();
        else if(page === 'materials') renderMaterials();
        else if(page === 'discussions') renderDiscussions();
        else if(page === 'certificates') renderCertificates();
        else if(page === 'planner') renderPlanner();
        else if(page === 'live') renderLiveClasses();
        else if(page === 'settings') renderSettings();
        else if(page === 'help') renderHelp();
      });
    });
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const user = await initDashboard('student');
  if (user) {
    initNav();
    renderDashboardOverview();
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

