async function renderDashboard() {
  NotificationManager.initPolling();
  const content = document.getElementById('pageContent');
  if (!content) return;

  try {
    const user = await SessionManager.getCurrentUser();
    const [courses, assignments, mySubmissions] = await Promise.all([
      SupabaseDB.getCourses(user.email),
      SupabaseDB.getAssignments(user.email),
      SupabaseDB.getSubmissions(null, null, user.email)
    ]);

    const totalSubmissions = mySubmissions.length;
    const pendingGrading = mySubmissions.filter(s => s.status === 'submitted').length;

    content.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card"><h4>My Courses</h4><div class="value">${escapeHtml(courses.length)}</div></div>
      <div class="stat-card"><h4>Assignments</h4><div class="value">${escapeHtml(assignments.length)}</div></div>
      <div class="stat-card"><h4>Total Submissions</h4><div class="value">${escapeHtml(totalSubmissions)}</div></div>
      <div class="stat-card warn"><h4>Pending Grading</h4><div class="value">${escapeHtml(pendingGrading)}</div></div>
    </div>
      <section><h3>Teacher Overview</h3><p>Welcome back! You have ${escapeHtml(pendingGrading)} submissions waiting to be graded.</p></section>
    `;
  } catch (error) {
    console.error('Dashboard error:', error);
    content.innerHTML = `<div class="stat-card danger">
      <h3>Error Loading Dashboard</h3>
      <div class="small danger-text">${escapeHtml(error.message)}</div>
      <button class="button w-auto mt-10" onclick="renderDashboard()">Retry</button>
    </div>`;
  }
}

async function renderCourses() {
  const content = document.getElementById('pageContent');
  if (!content) return;

  try {
    const user = await SessionManager.getCurrentUser();
    const courses = await SupabaseDB.getCourses(user.email);
    content.innerHTML = `
    <div class="card flex-between">
      <h2 class="m-0">Course Management</h2>
      <button class="button w-auto" onclick="showCourseForm()">+ Create Course</button>
    </div>
    <div class="grid">
      ${courses.map(c => `
        <div class="card">
          <h3 class="m-0">${escapeHtml(c.title)}</h3>
          <p class="small">${escapeHtml(c.description || '')}</p>
          <div class="mt-10"><span class="badge ${c.status === 'published' ? 'badge-active' : 'badge-lock'}">${escapeHtml(c.status)}</span></div>
          <div class="flex gap-10 mt-15">
            <button class="button w-auto small" onclick="editCourse('${escapeAttr(c.id)}')">Manage Lessons</button>
            <button class="button secondary w-auto small" onclick="loadAndEditCourse('${escapeAttr(c.id)}')">Edit Info</button>
            <button class="button danger w-auto small" onclick="deleteCourseById('${escapeAttr(c.id)}')">Delete</button>
          </div>
        </div>
      `).join('') || '<div class="empty">No courses created yet.</div>'}
      </div>
    `;
  } catch (error) {
    console.error('Courses error:', error);
    content.innerHTML = `<div class="card danger-border">
      <h3>Error Loading Courses</h3>
      <div class="small danger-text">${escapeHtml(error.message)}</div>
      <button class="button w-auto mt-10" onclick="renderCourses()">Retry</button>
    </div>`;
  }
}

async function loadAndEditCourse(id) {
    try {
        const course = await SupabaseDB.getCourse(id);
        if (course) showCourseForm(course);
    } catch (e) {
        alert('Error loading course: ' + e.message);
    }
}
window.loadAndEditCourse = loadAndEditCourse;

function showCourseForm(course = null) {
  const content = document.getElementById('pageContent');
  if (!content) return;
  const isEdit = !!course;

  content.innerHTML = `
    <div class="card">
      <h2>${isEdit ? 'Edit Course' : 'Create Course'}</h2>
      <form id="courseForm">
        <div class="grid">
          <div>
            <label>Course Title</label>
            <input type="text" id="courseTitle" placeholder="Course Title" value="${isEdit ? escapeHtml(course.title) : ''}" required>
          </div>
          <div>
            <label>Description</label>
            <textarea id="courseDescription" placeholder="Description" rows="4">${isEdit ? escapeHtml(course.description || '') : ''}</textarea>
          </div>
          <div>
            <label>Status</label>
            <select id="courseStatus">
              <option value="draft" ${isEdit && course.status === 'draft' ? 'selected' : ''}>Draft</option>
              <option value="published" ${isEdit && course.status === 'published' ? 'selected' : ''}>Published</option>
            </select>
          </div>
        </div>
        <div class="flex gap-10 mt-20">
          <button type="submit" class="button w-auto px-30">${isEdit ? 'Update Course' : 'Create Course'}</button>
          <button type="button" class="button secondary w-auto px-30" onclick="renderCourses()">Cancel</button>
        </div>
      </form>
    </div>
  `;
  document.getElementById('courseForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const user = await SessionManager.getCurrentUser();
      const courseId = isEdit ? course.id : crypto.randomUUID();

      const courseData = {
        ...course,
        id: courseId,
        title: document.getElementById('courseTitle').value,
        description: document.getElementById('courseDescription').value,
        status: document.getElementById('courseStatus').value,
        teacher_email: user.email
      };

      await SupabaseDB.saveCourse(courseData);
      renderCourses();
    } catch (err) {
      alert('Error saving course: ' + err.message);
    }
  });
}
async function editCourse(id) {
  const user = await SessionManager.getCurrentUser();
  const [courses, lessons, courseAssignments] = await Promise.all([
    SupabaseDB.getCourses(user.email),
    SupabaseDB.getLessons(id),
    SupabaseDB.getAssignments(user.email, id)
  ]);
  const course = courses.find(c => c.id === id);
  const content = document.getElementById('pageContent');
  if (!content) return;
  content.innerHTML = `
    <div class="card flex-between">
      <h2 class="m-0">Course: ${escapeHtml(course.title)}</h2>
      <button class="button secondary w-auto" onclick="renderCourses()">← Back to Courses</button>
    </div>
    <div class="grid-2 mt-20">
      <section class="card">
        <div class="flex-between">
          <h3 class="m-0">Lessons</h3>
          <button class="button w-auto small" onclick="showLessonForm('${id}')">+ Add Lesson</button>
        </div>
        <div class="mt-15">
          ${lessons.map(l => `
            <div class="flex-between list-item">
              <span>${escapeHtml(l.title)}</span>
              <div class="flex gap-5">
                <button class="button small w-auto" onclick="editLesson('${l.id}', '${id}')">Edit</button>
                <button class="button danger small w-auto" onclick="deleteLessonById('${l.id}', '${id}')">Delete</button>
              </div>
            </div>
          `).join('') || '<div class="empty p-10">No lessons yet.</div>'}
        </div>
      </section>
      <section class="card">
        <div class="flex-between">
          <h3 class="m-0">Assignments</h3>
          <button class="button w-auto small" onclick="showAssignmentForm(null, '${id}')">+ Create Assignment</button>
        </div>
        <div class="mt-15">
          ${courseAssignments.map(a => `
            <div class="flex-between list-item">
              <span>${escapeHtml(a.title)}</span>
              <div class="flex gap-5">
                <button class="button small w-auto" onclick="editAssignment('${a.id}')">Edit</button>
                <button class="button danger small w-auto" onclick="deleteAssignmentById('${a.id}', '${id}')">Delete</button>
              </div>
            </div>
          `).join('') || '<div class="empty p-10">No assignments yet.</div>'}
        </div>
      </section>
    </div>
  `;
}
function showLessonForm(courseId, lesson = null) {
  const isEdit = !!lesson;
  const content = document.getElementById('pageContent');
  if (!content) return;
  content.innerHTML = `
    <div class="card">
      <h2 class="m-0">${isEdit ? 'Edit Lesson' : 'Add Lesson'}</h2>
      <form id="lessonForm" class="mt-20">
        <label>Lesson Title</label>
        <input type="text" id="lessonTitle" placeholder="Lesson Title" value="${isEdit ? escapeHtml(lesson.title) : ''}" required>
        <label>Content</label>
        <textarea id="lessonContent" placeholder="Lesson content..." rows="10">${isEdit ? escapeHtml(lesson.content) : ''}</textarea>
        <label>Order Index</label>
        <input type="number" id="lessonOrder" placeholder="Order Index" value="${isEdit ? lesson.order_index : 0}">
        <div class="flex gap-10 mt-20">
          <button type="submit" class="button w-auto px-40">${isEdit ? 'Update Lesson' : 'Save Lesson'}</button>
          <button type="button" class="button secondary w-auto px-40" onclick="editCourse('${courseId}')">Cancel</button>
        </div>
      </form>
    </div>
  `;
  document.getElementById('lessonForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
        ...lesson,
        id: isEdit ? lesson.id : crypto.randomUUID(),
        course_id: courseId,
        title: document.getElementById('lessonTitle').value,
        content: document.getElementById('lessonContent').value,
        order_index: parseInt(document.getElementById('lessonOrder').value) || 0
    };
    await SupabaseDB.saveLesson(data); editCourse(courseId);
  });
}
async function editLesson(lessonId, courseId) { const lessons = await SupabaseDB.getLessons(courseId); const lesson = lessons.find(l => l.id === lessonId); showLessonForm(courseId, lesson); }
async function deleteLessonById(id, courseId) {
  if (confirm('Delete?')) {
    try {
      await SupabaseDB.deleteLesson(id);
      editCourse(courseId);
    } catch (e) {
      alert('Error deleting lesson: ' + e.message);
    }
  }
}
async function deleteCourseById(id) {
  if (confirm('Delete?')) {
    try {
      await SupabaseDB.deleteCourse(id);
      renderCourses();
    } catch (e) {
      alert('Error deleting course: ' + e.message);
    }
  }
}
async function renderAssignments() {
  const content = document.getElementById('pageContent');
  if (!content) return;

  try {
    const user = await SessionManager.getCurrentUser();
    const [assignments, mySubmissions, courses] = await Promise.all([
      SupabaseDB.getAssignments(user.email),
      SupabaseDB.getSubmissions(null, null, user.email),
      SupabaseDB.getCourses(user.email)
    ]);
    const totalSubmissions = mySubmissions.length;

  content.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card"><h4>Total Assignments</h4><div class="value">${assignments.length}</div></div>
      <div class="stat-card"><h4>Published</h4><div class="value">${assignments.filter(a => a.status === 'published').length}</div></div>
      <div class="stat-card"><h4>Total Submissions</h4><div class="value">${totalSubmissions}</div></div>
    </div>
    <div class="card flex-between">
      <h2 class="m-0">My Assignments</h2>
      <button class="button w-auto" onclick="showAssignmentForm()">+ Create Assignment</button>
    </div>
    <div class="grid">
      ${assignments.map(a => {
        const course = courses.find(c => c.id === a.course_id);
        return `
        <div class="card">
          <h3 class="m-0">${escapeHtml(a.title)}</h3>
          <p class="small"><strong>Course:</strong> ${escapeHtml(course?.title || 'None')}</p>
          <p class="small">${escapeHtml(a.description || '')}</p>
          <p class="small mt-10">Due: ${new Date(a.due_date).toLocaleString()}</p>
          <div class="flex gap-10 mt-15">
            <button class="button small w-auto" onclick="editAssignment('${escapeAttr(a.id)}')">Edit</button>
            <button class="button small w-auto danger" onclick="deleteAssignmentById('${escapeAttr(a.id)}')">Delete</button>
          </div>
        </div>
`;}).join('') || '<div class="empty">No assignments found.</div>'}
      </div>
    `;
  } catch (error) {
    console.error('Assignments error:', error);
    content.innerHTML = `<div class="stat-card danger">
      <h3>Error Loading Assignments</h3>
      <div class="small danger-text">${escapeHtml(error.message)}</div>
      <button class="button w-auto mt-10" onclick="renderAssignments()">Retry</button>
    </div>`;
  }
}
async function renderGrading() {
  const content = document.getElementById('pageContent');
  if (!content) return;

  try {
    const user = await SessionManager.getCurrentUser();
    const [assignments, mySubmissions] = await Promise.all([
      SupabaseDB.getAssignments(user.email),
      SupabaseDB.getSubmissions(null, null, user.email)
    ]);

    let gradingHtml = '<h2>Grading Queue</h2>';
    let hasPending = false;
    assignments.sort((a,b) => new Date(a.due_date) - new Date(b.due_date));

    assignments.forEach((assignment) => {
      const pendingSubmissions = mySubmissions.filter(s => s.assignment_id === assignment.id && (s.status === 'submitted' || s.regrade_request));
      if (pendingSubmissions.length > 0) {
        hasPending = true;
        gradingHtml += `
          <div class="card">
            <div class="flex-between">
              <h3 class="m-0">${escapeHtml(assignment.title)}</h3>
              <span class="badge">${pendingSubmissions.length} Pending</span>
            </div>
            <div class="p-0 mt-10" style="overflow-x:auto">
                <table>
                  <thead><tr><th>Student</th><th>Submitted</th><th>Status</th><th>Action</th></tr></thead>
                  <tbody>
                    ${pendingSubmissions.map(s => {
                      const isRegrade = !!s.regrade_request;
                      return `
                      <tr>
                        <td>${escapeHtml(s.student_email)}</td>
                        <td>${new Date(s.submitted_at).toLocaleString()}</td>
                        <td>${isRegrade ? '<span class="badge badge-warn">REGRADE REQ</span>' : '<span class="badge badge-active">NEW SUB</span>'}</td>
                        <td><button class="button small w-auto" onclick="gradeSubmission('${escapeAttr(assignment.id)}', '${escapeAttr(s.student_email)}')">Review</button></td>
                      </tr>
                    `;}).join('')}
                  </tbody>
                </table>
            </div>
          </div>
        `;
      }
    });
    content.innerHTML = hasPending ? gradingHtml : '<div class="empty"><h3>All caught up!</h3><p class="small">No pending submissions to grade.</p></div>';
  } catch (error) {
    console.error('Grading error:', error);
    content.innerHTML = `<div class="card danger-border">
      <h3>Error Loading Queue</h3>
      <div class="small danger-text">${escapeHtml(error.message)}</div>
      <button class="button w-auto mt-10" onclick="renderGrading()">Retry</button>
    </div>`;
  }
}
async function renderStudents() {
  const content = document.getElementById('pageContent');
  if (!content) return;

  try {
    const user = await SessionManager.getCurrentUser();
    const [allUsers, myCourses] = await Promise.all([
        SupabaseDB.getUsers(),
        SupabaseDB.getCourses(user.email)
    ]);

    const myCourseIds = myCourses.map(c => c.id);
    const enrollments = await SupabaseDB.getEnrollmentsByCourses(myCourseIds);
    const enrolledStudentEmails = new Set(enrollments.map(e => e.student_email));

    const students = allUsers.filter(u => u.role === 'student' && enrolledStudentEmails.has(u.email));

    content.innerHTML = `
    <div class="card">
      <h2 class="m-0">My Enrolled Students</h2>
      <div class="p-0 mt-15" style="overflow-x:auto">
          <table>
            <thead><tr><th>Name</th><th>Email</th><th>Level</th><th>Action</th></tr></thead>
            <tbody>
              ${students.map(s => `
                <tr>
                  <td>${escapeHtml(s.full_name)}</td>
                  <td>${escapeHtml(s.email)}</td>
                  <td>Level ${escapeHtml(s.level || 1)}</td>
                  <td>
                    <button class="button small w-auto" onclick="showCertForm('${escapeAttr(s.email)}')">Issue Certificate</button>
                  </td>
                </tr>
              `).join('') || '<tr><td colspan="4" class="empty">No students enrolled.</td></tr>'}
            </tbody>
          </table>
      </div>
    </div>
    <div id="certFormArea" class="hidden mt-20"></div>
    `;
  } catch (error) {
    console.error('Students error:', error);
    content.innerHTML = `<div class="stat-card danger">
      <h3>Error Loading Students</h3>
      <div class="small danger-text">${escapeHtml(error.message)}</div>
      <button class="button w-auto mt-10" onclick="renderStudents()">Retry</button>
    </div>`;
  }
}

async function showCertForm(studentEmail) {
  const user = await SessionManager.getCurrentUser();
  const courses = await SupabaseDB.getCourses(user.email);
  const area = document.getElementById('certFormArea');
  if (!area) return;
  area.classList.remove('hidden');
  area.innerHTML = `
    <div class="card">
      <h3 class="m-0">Issue Certificate to ${escapeHtml(studentEmail)}</h3>
      <label class="mt-15">Select Course</label>
      <select id="certCourseId">${courses.map(c => `<option value="${escapeAttr(c.id)}">${escapeHtml(c.title)}</option>`).join('')}</select>
      <p class="small mt-10">This will generate a official PDF certificate and award it to the student.</p>
      <div class="flex gap-10 mt-15">
        <button class="button w-auto px-30" id="issueCertBtn" onclick="issueCert('${escapeAttr(studentEmail)}')">Issue & Generate PDF</button>
        <button class="button secondary w-auto px-30" onclick="document.getElementById('certFormArea').classList.add('hidden')">Cancel</button>
      </div>
    </div>
  `;
}

async function issueCert(studentEmail) {
  const btn = document.getElementById('issueCertBtn');
  btn.disabled = true; btn.textContent = 'Generating...';

  const courseId = document.getElementById('certCourseId').value;
  const student = await SupabaseDB.getUser(studentEmail);
  const course = (await SupabaseDB.getCourses()).find(c => c.id === courseId);
  const verificationId = crypto.randomUUID().slice(0, 13).toUpperCase();
  const issueDate = new Date().toISOString();

  try {
    const doc = await CertificateGenerator.generatePDF(student.full_name, course.title, issueDate, verificationId);
    if (!doc) throw new Error('PDF Generation failed');

    // Upload to Supabase Storage
    const pdfBlob = doc.output('blob');
    const path = `certificates/${studentEmail}/${courseId}_${Date.now()}.pdf`;
    await SupabaseDB.uploadFile('certificates', path, pdfBlob);
    const certUrl = await SupabaseDB.getPublicUrl('certificates', path);

    await SupabaseDB.issueCertificate({
      id: crypto.randomUUID(),
      student_email: studentEmail,
      course_id: courseId,
      certificate_url: certUrl,
      issued_at: issueDate
    });

    alert('Certificate issued successfully!');
    renderStudents();
    const area = document.getElementById('certFormArea');
    if (area) area.style.display = 'none';
  } catch (e) {
    console.error('Cert Issue error:', e);
    alert('Error issuing certificate: ' + e.message);
  } finally {
    btn.disabled = false; btn.textContent = 'Issue & Generate PDF';
  }
}
async function showAssignmentForm(assignment = null, courseId = null) {
  const content = document.getElementById('pageContent');
  if (!content) return;
  const isEdit = !!assignment;
  const finalCourseId = isEdit ? assignment.course_id : courseId;

  const user = await SessionManager.getCurrentUser();
  const courses = await SupabaseDB.getCourses(user.email);

  content.innerHTML = `
    <div class="card">
      <h2>${isEdit ? 'Edit Assignment' : 'Create Assignment'}</h2>
      <form id="assignmentForm">
        <label>Assignment Title</label>
        <input type="text" id="assignmentTitle" placeholder="Assignment Title" value="${isEdit ? escapeHtml(assignment.title) : ''}" required>

        <label>Course</label>
        <select id="assignmentCourseId" required>
          <option value="">Select Course</option>
          ${courses.map(c => `<option value="${c.id}" ${((isEdit ? assignment.course_id : courseId) === c.id) ? 'selected' : ''}>${escapeHtml(c.title)}</option>`).join('')}
        </select>

        <label>Description</label>
        <textarea id="assignmentDescription" placeholder="Description" rows="4">${isEdit ? escapeHtml(assignment.description) : ''}</textarea>

        <label>Due Date</label>
        <input type="datetime-local" id="assignmentDueDate" value="${isEdit ? new Date(assignment.due_date).toISOString().slice(0, 16) : ''}" required>

        <div class="grid-3 mt-10">
          <div><label class="small">Max Points:</label><input type="number" id="assignmentPoints" value="${isEdit ? assignment.points_possible : 0}" readonly style="background:#f0f0f0"></div>
          <div><label class="small">Late Penalty/Day (%):</label><input type="number" id="assignmentLatePenalty" value="${isEdit ? assignment.late_penalty_per_day : 0}"></div>
          <div>
            <label class="small">Allow Late?</label>
            <select id="assignmentAllowLate">
              <option value="true" ${isEdit && assignment.allow_late_submissions ? 'selected' : ''}>Yes</option>
              <option value="false" ${isEdit && !assignment.allow_late_submissions ? 'selected' : ''}>No</option>
            </select>
          </div>
        </div>
        <div class="mt-10">
          <label>Global Allowed Extensions (for file questions):</label>
          <input type="text" id="allowedExtensions" placeholder=".pdf, .docx, .zip, .jpg" value="${isEdit ? (assignment.allowed_extensions || []).join(', ') : '.pdf, .docx, .zip, .jpg'}">
        </div>
        <label>Status</label>
        <select id="assignmentStatus">
          <option value="draft" ${isEdit && assignment.status === 'draft' ? 'selected' : ''}>Draft</option>
          <option value="published" ${isEdit && assignment.status === 'published' ? 'selected' : ''}>Published</option>
        </select>
        <div class="mt-20">
          <h3 class="m-0">Questions</h3>
          <div id="questionsContainer" class="mt-15"></div>
          <button type="button" class="button w-auto secondary small" onclick="addQuestionField()">+ Add Question</button>
        </div>
        <div class="flex gap-10 mt-30">
          <button type="submit" class="button w-auto px-40">${isEdit ? 'Update Assignment' : 'Create Assignment'}</button>
          <button type="button" class="button secondary w-auto px-40" onclick="${finalCourseId ? `editCourse('${finalCourseId}')` : 'renderAssignments()'}">Cancel</button>
        </div>
      </form>
    </div>
  `;
  window.toggleTeacherAssignmentType = (select) => {
    const container = select.parentElement.parentElement.parentElement.querySelector('.q-type-ext');
    if (select.value === 'file') {
      container.innerHTML = `<label>Allowed Extensions (comma-separated):</label><input type="text" class="q-ext" placeholder=".pdf, .docx, .csv, .jpg" value="">`;
    } else {
      container.innerHTML = '';
    }
  };
  window.addQuestionField = (q = null) => {
    const container = document.getElementById('questionsContainer');
    if (!container) return;
    const div = document.createElement('div');
    div.className = 'question mb-20 card';
    div.innerHTML = `
      <div class="flex-between mb-15">
        <h4 class="m-0">Assignment Question</h4>
        <button type="button" class="button danger small w-auto" onclick="this.closest('.question').remove(); window.updateAssignmentTotalPoints();">Remove Question</button>
      </div>
      <div class="grid">
        <div class="mb-10">
          <label class="bold">Question Text:</label>
          <input type="text" class="q-text" placeholder="Enter question description here..." value="${q ? escapeHtml(q.text) : ''}" required>
        </div>
        <div class="grid-2">
          <div><label>Submission Type:</label><select class="q-type" onchange="toggleTeacherAssignmentType(this)"><option value="essay" ${q?.type === 'essay' ? 'selected' : ''}>Essay Text</option><option value="file" ${q?.type === 'file' ? 'selected' : ''}>File Upload (PDF, Docx, etc.)</option><option value="link" ${q?.type === 'link' ? 'selected' : ''}>Link Submission</option></select></div>
          <div><label>Question Points:</label><input type="number" class="q-points" value="${q ? q.points : 10}" min="0"></div>
        </div>
        <div class="q-type-ext mt-10">
          ${q?.type === 'file' ? `<label>Allowed Extensions (comma-separated):</label><input type="text" class="q-ext" placeholder=".pdf, .docx, .csv, .jpg" value="${q.extensions || ''}">` : ''}
        </div>
      </div>
    `;
    container.appendChild(div);

    // Auto-update total points when individual question points change
    div.querySelector('.q-points').addEventListener('input', updateAssignmentTotalPoints);

    updateAssignmentTotalPoints();
  };

  window.updateAssignmentTotalPoints = () => {
    const total = Array.from(document.querySelectorAll('#questionsContainer .q-points'))
        .reduce((sum, input) => sum + (parseInt(input.value) || 0), 0);
    const pointsInput = document.getElementById('assignmentPoints');
    if (pointsInput) pointsInput.value = total;
  };
  if (isEdit && assignment.questions) { assignment.questions.forEach(q => window.addQuestionField(q)); }
  document.getElementById('assignmentForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const user = await SessionManager.getCurrentUser();
      const questions = [];
      document.querySelectorAll('#questionsContainer .question').forEach(item => {
        const q = {
          text: item.querySelector('.q-text').value,
          type: item.querySelector('.q-type').value,
          points: parseInt(item.querySelector('.q-points').value) || 0
        };
        const extInput = item.querySelector('.q-ext');
        if (extInput) q.extensions = extInput.value;
        questions.push(q);
      });
      const allowedExt = document.getElementById('allowedExtensions').value.split(',').map(e => e.trim().toLowerCase()).filter(e => e);
      const selCourseId = document.getElementById('assignmentCourseId').value;
      const assignmentData = {
        ...assignment,
        id: isEdit ? assignment.id : crypto.randomUUID(),
        course_id: selCourseId,
        title: document.getElementById('assignmentTitle').value,
        description: document.getElementById('assignmentDescription').value,
        due_date: new Date(document.getElementById('assignmentDueDate').value).toISOString(),
        points_possible: parseInt(document.getElementById('assignmentPoints').value) || 100,
        late_penalty_per_day: parseInt(document.getElementById('assignmentLatePenalty').value) || 0,
        allow_late_submissions: document.getElementById('assignmentAllowLate').value === 'true',
        status: document.getElementById('assignmentStatus').value,
        teacher_email: user.email,
        created_at: isEdit ? assignment.created_at : new Date().toISOString(),
        updated_at: new Date().toISOString(),
        questions: questions,
        allowed_extensions: allowedExt,
        attachments: isEdit ? assignment.attachments : []
      };
      const result = await SupabaseDB.saveAssignment(assignmentData);
      if (result) { alert('Success!'); if (selCourseId && !assignment) editCourse(selCourseId); else renderAssignments(); }
    } catch (err) {
      alert('Error saving assignment: ' + err.message);
    }
  });
}
async function editAssignment(id) { const user = await SessionManager.getCurrentUser(); const assignments = await SupabaseDB.getAssignments(user.email); const assignment = assignments.find(a => a.id === id); if (assignment) showAssignmentForm(assignment); }
async function deleteAssignmentById(id, courseId = null) {
  if (confirm('Delete?')) { await SupabaseDB.deleteAssignment(id); if (courseId) editCourse(courseId); else renderAssignments(); }
}
async function gradeSubmission(assignmentId, studentEmail) {
  const content = document.getElementById('pageContent');
  if (!content) return;

  try {
    const [assignment, submission] = await Promise.all([
        SupabaseDB.getAssignment(assignmentId),
        SupabaseDB.getSubmission(assignmentId, studentEmail)
    ]);

    // Late penalty calculation
    const dueDate = new Date(assignment.due_date);
    const subDate = new Date(submission.submitted_at);
    let lateDays = 0;
    let latePenalty = 0;
    if (subDate > dueDate) {
        lateDays = Math.ceil((subDate - dueDate) / (1000 * 60 * 60 * 24));
        latePenalty = lateDays * (assignment.late_penalty_per_day || 0);
    }

    content.innerHTML = `
    <div class="card">
      <h2 class="m-0">Grade Submission</h2>
      <div class="flex-between mt-10">
          <p class="small"><strong>Student:</strong> ${escapeHtml(studentEmail)}</p>
          <p class="small"><strong>Max Points:</strong> ${assignment.points_possible}</p>
      </div>

      ${lateDays > 0 ? `
        <div class="card danger-border p-10 mt-10">
            <div class="bold danger-text">LATE SUBMISSION (${lateDays} days)</div>
            <div class="small">Penalty configured: ${assignment.late_penalty_per_day}% per day. Total Penalty: ${latePenalty}%</div>
        </div>
      ` : ''}

      ${submission.regrade_request ? `
        <div class="card warn-border p-10 mt-10" style="background:#fffcf0">
            <div class="bold warning-text">REGRADE REQUESTED</div>
            <div class="small mt-5"><strong>Student Note:</strong> ${escapeHtml(submission.regrade_request)}</div>
        </div>
      ` : ''}

      <p class="small mt-5"><strong>Student:</strong> ${escapeHtml(studentEmail)}</p>
      <form id="gradingForm">
        <div class="mt-20">
          <h4 class="m-0">Submitted Answers & Individual Scoring:</h4>
          <div class="mt-15">
            ${(assignment.questions || []).map((q, idx) => {
              const answer = submission.answers[idx];
              const score = submission.question_scores?.[idx] || 0;
              const isUrl = typeof answer === 'string' && (answer.startsWith('http://') || answer.startsWith('https://'));
              const displayAnswer = answer ? (isUrl ? `<button type="button" class="button secondary small w-auto" onclick="UI.viewFile('${escapeAttr(answer)}', 'Student Submission - Q${idx+1}')">View Submitted File/Link</button>` : `<div class="small p-10 mt-5" style="white-space: pre-wrap; background: #f7fafc; border-radius: 4px;">${escapeHtml(answer)}</div>`) : '<div class="small p-10 mt-5 text-muted italic">No answer provided.</div>';
              return `<div class="list-item mb-20 card border-light">
                <div class="bold mb-5">Question ${idx + 1}: ${escapeHtml(q.text)}</div>
                <div class="mt-5">${displayAnswer}</div>
                <div class="mt-10 flex-center-y gap-10 p-10 bg-light border-radius-sm">
                    <label class="small m-0">Points Earned (max ${q.points}):</label>
                    <input type="number" class="q-score-input small w-auto m-0" style="width:80px" data-q-idx="${idx}" data-max="${q.points}" value="${score}" min="0" max="${q.points}">
                </div>
              </div>`;
            }).join('')}
          </div>
        </div>
        <div class="mt-20 grid-2">
          <div>
            <label>Raw Score (0-${assignment.points_possible}):</label>
            <input type="number" id="grade" min="0" max="${assignment.points_possible}" value="${submission.grade || ''}" required>
          </div>
          <div>
            <label>Final Adjusted Grade (%):</label>
            <input type="number" id="finalGrade" min="0" max="100" value="${submission.final_grade || ''}" readonly style="background:#f0f0f0">
            <p class="tiny mt-5">Auto-calculated based on penalty.</p>
          </div>
        </div>
        <div class="mt-10">
          <label>Feedback:</label>
          <textarea id="feedback" rows="4" placeholder="Enter feedback for student..."></textarea>
        </div>
        <div class="flex gap-10 mt-20">
          <button type="submit" class="button w-auto px-40">Submit Grade</button>
          <button type="button" class="button secondary w-auto px-40" onclick="renderGrading()">Cancel</button>
        </div>
      </form>
    </div>
  `;
  const rawInput = document.getElementById('grade');
  const finalInput = document.getElementById('finalGrade');

  const updateRawFromQuestions = () => {
      const total = Array.from(document.querySelectorAll('.q-score-input'))
          .reduce((sum, input) => sum + (parseInt(input.value) || 0), 0);
      rawInput.value = total;
      updateFinal();
  };

  const updateFinal = () => {
      const raw = parseInt(rawInput.value) || 0;
      const percent = assignment.points_possible > 0 ? (raw / assignment.points_possible) * 100 : 0;
      const final = Math.max(0, percent - latePenalty);
      finalInput.value = Math.round(final);
  };

  document.querySelectorAll('.q-score-input').forEach(input => {
      input.addEventListener('input', updateRawFromQuestions);
  });
  rawInput.addEventListener('input', updateFinal);
  updateFinal();

  document.getElementById('gradingForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const questionScores = {};
      document.querySelectorAll('.q-score-input').forEach(input => {
          questionScores[input.dataset.qIdx] = parseInt(input.value) || 0;
      });

      const updatedSubmission = {
        ...submission,
        grade: parseInt(rawInput.value),
        final_grade: parseInt(finalInput.value),
        question_scores: questionScores,
        late_penalty_applied: latePenalty,
        feedback: document.getElementById('feedback').value,
        status: 'graded',
        regrade_request: null, // Clear regrade request once graded
        updated_at: new Date().toISOString()
      };
      if (await SupabaseDB.saveSubmission(updatedSubmission)) {
        alert('Graded!');
        renderGrading();
      }
    } catch (e) {
      alert('Error saving grade: ' + e.message);
    }
  });
  } catch (error) {
    console.error('Grade error:', error);
    content.innerHTML = `<div class="card" style="border-left: 4px solid var(--danger)">
      <h3>Error Loading Submission</h3>
      <div class="small" style="color:var(--danger)">${escapeHtml(error.message)}</div>
      <button class="button" onclick="renderGrading()" style="margin-top:10px; width:auto">Back to Queue</button>
    </div>`;
  }
}
async function renderDiscussions() {
  const container = document.getElementById('pageContent');
  if (!container) return;

  try {
    const user = await SessionManager.getCurrentUser();
    const courses = await SupabaseDB.getCourses(user.email);
    container.innerHTML = `
    <div class="card">
      <h2 class="m-0">Discussions</h2>
      <p class="small mt-5">Manage discussions for your courses.</p>
    </div>
    <div class="grid">
      ${courses.map(c => `
        <div class="card">
          <h3 class="m-0">${escapeHtml(c.title)}</h3>
          <button class="button w-auto mt-10" onclick="viewCourseDiscussions('${escapeAttr(c.id)}')">View Discussions</button>
        </div>
      `).join('')}
      </div>
    `;
  } catch (error) {
    console.error('Discussions error:', error);
    container.innerHTML = `<div class="stat-card danger">
      <h3>Error Loading Discussions</h3>
      <div class="small danger-text">${escapeHtml(error.message)}</div>
      <button class="button w-auto mt-10" onclick="renderDiscussions()">Retry</button>
    </div>`;
  }
}

async function viewCourseDiscussions(courseId) {
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
              <button class="button secondary tiny" onclick="showTeacherReplyForm('${escapeAttr(d.id)}', '${escapeAttr(courseId)}')">Reply</button>
              ${isMine ? `
                <button class="button secondary tiny" onclick="editDiscussion('${escapeAttr(d.id)}', '${escapeAttr(courseId)}')">Edit</button>
                <button class="button danger tiny" onclick="deleteDiscussion('${escapeAttr(d.id)}', '${escapeAttr(courseId)}')">Delete</button>
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
      <h3>Course Discussions</h3>
      <div id="disc-list" class="mb-20" style="max-height:500px; overflow-y:auto">
        ${renderThread() || '<div class="empty">No messages yet.</div>'}
      </div>
      <div class="flex gap-10">
        <input type="text" id="discInput" placeholder="Start a new thread..." class="m-0">
        <button class="button w-auto" onclick="postTeacherDiscussion('${escapeAttr(courseId)}')">Post</button>
      </div>
    </div>
  `;
}

window.showTeacherReplyForm = (parentId, courseId) => {
  const area = document.getElementById(`reply-area-${parentId}`);
  area.innerHTML = `
    <div class="flex gap-10 mt-10">
      <input type="text" id="replyInput-${parentId}" placeholder="Write a reply..." class="m-0 small p-10">
      <button class="button small w-auto" onclick="postTeacherDiscussion('${escapeAttr(courseId)}', '${escapeAttr(parentId)}')">Reply</button>
      <button class="button secondary small w-auto" onclick="this.parentElement.remove()">Cancel</button>
    </div>
  `;
};

async function postTeacherDiscussion(courseId, parentId = null) {
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
    viewCourseDiscussions(courseId);
  } catch (e) {
    alert('Error posting message: ' + e.message);
  }
}

async function editDiscussion(id, courseId) {
  const div = document.getElementById(`disc-${id}`);
  const contentDiv = div.querySelector('.disc-content');
  const current = contentDiv.innerText;
  contentDiv.innerHTML = `
    <textarea class="input" style="margin-top:10px">${escapeHtml(current)}</textarea>
    <div style="margin-top:8px; display:flex; gap:8px">
      <button class="button" style="padding:4px 8px; font-size:11px" onclick="saveDiscussionEdit('${id}', '${courseId}')">Save</button>
      <button class="button secondary" style="padding:4px 8px; font-size:11px" onclick="viewCourseDiscussions('${courseId}')">Cancel</button>
    </div>
  `;
}

async function saveDiscussionEdit(id, courseId) {
  const div = document.getElementById(`disc-${id}`);
  const content = div.querySelector('textarea').value;
  if (!content) return;
  try {
    const disc = await SupabaseDB.getDiscussions(courseId);
    const existing = disc.find(d => d.id === id);
    await SupabaseDB.saveDiscussion({ ...existing, content });
    viewCourseDiscussions(courseId);
  } catch (e) {
    alert('Error updating: ' + e.message);
  }
}

async function deleteDiscussion(id, courseId) {
  if (!confirm('Delete this message?')) return;
  try {
    await SupabaseDB.deleteDiscussion(id);
    viewCourseDiscussions(courseId);
  } catch (e) {
    alert('Error deleting: ' + e.message);
  }
}

window.editDiscussion = editDiscussion;
window.saveDiscussionEdit = saveDiscussionEdit;
window.deleteDiscussion = deleteDiscussion;
window.showCourseForm = showCourseForm;
window.editCourse = editCourse;
window.deleteCourseById = deleteCourseById;
window.showLessonForm = showLessonForm;
window.editLesson = editLesson;
window.deleteLessonById = deleteLessonById;
window.showAssignmentForm = showAssignmentForm;
window.editAssignment = editAssignment;
window.deleteAssignmentById = deleteAssignmentById;
window.gradeSubmission = gradeSubmission;
window.viewCourseDiscussions = viewCourseDiscussions;
window.postTeacherDiscussion = postTeacherDiscussion;
window.showBadgeForm = showBadgeForm;
window.awardBadge = awardBadge;
window.showQuizForm = showQuizForm;
window.editQuiz = editQuiz;
window.deleteQuizById = deleteQuizById;
window.viewQuizResults = viewQuizResults;
window.renderDashboard = renderDashboard;
window.renderCourses = renderCourses;
window.renderAssignments = renderAssignments;
window.renderMaterials = renderMaterials;
window.renderGrading = renderGrading;
window.renderStudents = renderStudents;
window.renderDiscussions = renderDiscussions;
window.renderBadges = renderBadges;
window.renderQuizzes = renderQuizzes;
window.renderLiveClasses = renderLiveClasses;
window.renderSettings = renderSettings;
window.showCertForm = showCertForm;
window.issueCert = issueCert;
window.renderCalendar = renderCalendar;
window.renderSettings = renderSettings;

async function renderBadges() {
  const container = document.getElementById('pageContent');
  if (!container) return;

  try {
    const [badges, allUsers] = await Promise.all([
      SupabaseDB.getBadges(),
      SupabaseDB.getUsers()
    ]);
    const students = allUsers.filter(u => u.role === 'student');
    container.innerHTML = `
    <div class="card flex-between">
      <h2 class="m-0">Badges Management</h2>
      <button class="button w-auto" onclick="showBadgeForm()">+ Create Badge</button>
    </div>
    <div class="grid">
      ${badges.map(b => `
        <div class="card">
          <div style="font-size:30px">${b.icon_url || '🏆'}</div>
          <h3 class="m-0 mt-10">${escapeHtml(b.title)}</h3>
          <p class="small">${escapeHtml(b.description)}</p>
          <div class="flex gap-10 mt-15">
            <select id="award-to-${b.id}" class="w-auto m-0">${students.map(s => `<option value="${s.email}">${escapeHtml(s.full_name)}</option>`).join('')}</select>
            <button class="button small w-auto" onclick="awardBadge('${b.id}')">Award</button>
          </div>
        </div>
      `).join('') || '<div class="empty">No badges created yet.</div>'}
      </div>
    `;
  } catch (error) {
    console.error('Badges error:', error);
    container.innerHTML = `<div class="stat-card danger">
      <h3>Error Loading Badges</h3>
      <div class="small danger-text">${escapeHtml(error.message)}</div>
      <button class="button w-auto mt-10" onclick="renderBadges()">Retry</button>
    </div>`;
  }
}

function showBadgeForm() {
  const container = document.getElementById('pageContent');
  if (!container) return;
  container.innerHTML = `
    <div class="card">
      <h2>Create Badge</h2>
      <form id="badgeForm">
        <input type="text" id="badgeTitle" placeholder="Badge Title" required>
        <textarea id="badgeDesc" placeholder="Description"></textarea>
        <input type="text" id="badgeIcon" placeholder="Icon (emoji or URL)">
        <button type="submit" class="button">Save Badge</button>
        <button type="button" class="button secondary" onclick="renderBadges()">Cancel</button>
      </form>
    </div>
  `;
  document.getElementById('badgeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    await SupabaseDB.saveBadge({
        id: crypto.randomUUID(),
        title: document.getElementById('badgeTitle').value,
        description: document.getElementById('badgeDesc').value,
        icon_url: document.getElementById('badgeIcon').value
    });
    renderBadges();
  });
}

async function awardBadge(badgeId) {
  const email = document.getElementById(`award-to-${badgeId}`).value;
  try {
    await SupabaseDB.awardBadge(email, badgeId);
    alert('Badge awarded!');
  } catch (e) {
    alert('Error awarding badge: ' + e.message);
  }
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
        <button class="button w-auto mt-10 px-30" onclick="saveNotificationSettings()">Save Preferences</button>
      </div>
    </div>
    <div class="card mt-20">
      <h3 class="m-0">Push Subscription</h3>
      <p class="small mt-5">Enable real-time desktop notifications even when the app is closed.</p>
      <button class="button secondary w-auto mt-10 px-30" onclick="NotificationManager.subscribeToPush()">Enable Push Notifications</button>
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

async function renderLiveClasses() {
  const content = document.getElementById('pageContent');
  if (!content) return;

  try {
    const user = await SessionManager.getCurrentUser();
    const [liveClasses, courses] = await Promise.all([
      SupabaseDB.getLiveClasses(null, user.email),
      SupabaseDB.getCourses(user.email)
    ]);

    const activeClass = liveClasses.find(liveClass => liveClass.status === 'live');

    content.innerHTML = `
      <div class="card flex-between">
        <h2 class="m-0">Live Classes</h2>
        <div class="flex gap-10">
            ${activeClass ? `<button id="globalStopBtn" class="button danger w-auto" onclick="stopLiveClass('${activeClass.id}')">Stop Active Session</button>` : ''}
            <button class="button w-auto" onclick="showLiveClassForm()">+ Schedule Class</button>
        </div>
      </div>

      <div id="mod-controls" class="card hidden mt-20">
        <h3>Moderation Controls</h3>
        <div class="flex gap-10">
          <button class="button w-auto small" onclick="teacherModAction('muteAll')">Mute All</button>
          <button class="button w-auto small" onclick="teacherModAction('toggleLobby')">Toggle Lobby</button>
          <button class="button w-auto small" onclick="teacherModAction('stopVideoAll')">Restrict Video</button>
        </div>
      </div>

      <div class="grid mt-20">
        ${liveClasses.map(liveClass => {
          const course = courses.find(c => c.id === liveClass.course_id);
          const isLive = liveClass.status === 'live';
          return `
            <div class="card">
              <div class="flex-between" style="align-items:start">
                <div>
                  <h3 class="m-0">${escapeHtml(liveClass.title)}</h3>
                  <p class="small"><strong>Course:</strong> ${escapeHtml(course?.title || 'Unknown')}</p>
                  <p class="small"><strong>Time:</strong> ${new Date(liveClass.start_at).toLocaleString()} - ${new Date(liveClass.end_at).toLocaleTimeString()}</p>
                </div>
                <span class="badge ${isLive ? 'badge-active' : ''}">${liveClass.status.toUpperCase()}</span>
              </div>
              <div class="flex gap-10 mt-15">
                <button class="button w-auto small" onclick="handleStartLiveClass('${liveClass.id}', '${liveClass.room_name}', '${escapeAttr(liveClass.meeting_url || '')}')">
                  ${isLive ? 'Join Class' : 'Start Class'}
                </button>
                <button class="button secondary w-auto small" onclick="loadAndEditLiveClass('${liveClass.id}')">Edit</button>
                <button class="button secondary w-auto small" onclick="viewAttendance('${liveClass.id}')">Attendance</button>
                <button class="button danger w-auto small" onclick="deleteLiveClass('${liveClass.id}')">Cancel</button>
              </div>
            </div>
          `;
        }).join('') || '<div class="empty">No live classes scheduled.</div>'}
      </div>
      <div id="liveFormArea" class="hidden mt-20"></div>
      <div id="jitsi-container" class="hidden mt-20" style="height:600px; border:1px solid var(--border); border-radius:8px; overflow:hidden"></div>
    `;
  } catch (error) {
    console.error('Live Classes error:', error);
    content.innerHTML = `<div class="card"><h3>Error Loading Live Classes</h3></div>`;
  }
}

async function loadAndEditLiveClass(id) {
    const liveClass = await SupabaseDB.getLiveClass(id);
    if (liveClass) showLiveClassForm(liveClass);
}
window.loadAndEditLiveClass = loadAndEditLiveClass;

async function showLiveClassForm(liveClass = null) {
  const isEdit = !!liveClass;
  const area = document.getElementById('liveFormArea');
  if (!area) return;
  area.classList.remove('hidden');
  area.scrollIntoView({ behavior: 'smooth' });

  try {
    const user = await SessionManager.getCurrentUser();
    const [courses, allLiveClasses] = await Promise.all([
        SupabaseDB.getCourses(user.email),
        SupabaseDB.getLiveClasses(null, user.email)
    ]);

    area.innerHTML = `
      <div class="card">
        <h3 class="m-0">${isEdit ? 'Edit Live Class' : 'Schedule Live Class'}</h3>
        <form id="liveClassForm" class="mt-20">
          <label>Title</label>
          <input type="text" id="liveClassTitle" placeholder="e.g. Week 1 Live Session" value="${isEdit ? escapeHtml(liveClass.title) : ''}" required>
          <label>Course</label>
          <select id="liveClassCourseId">
            ${courses.map(c => `<option value="${c.id}" ${isEdit && liveClass.course_id === c.id ? 'selected' : ''}>${escapeHtml(c.title)}</option>`).join('')}
          </select>
          <div class="grid-2 mt-10">
            <div><label class="small">Start At</label><input type="datetime-local" id="liveClassStart" value="${isEdit ? new Date(liveClass.start_at).toISOString().slice(0, 16) : ''}" required></div>
            <div><label class="small">End At</label><input type="datetime-local" id="liveClassEnd" value="${isEdit ? new Date(liveClass.end_at).toISOString().slice(0, 16) : ''}" required></div>
          </div>
          <div class="grid-2 mt-10">
            <div>
              <label class="small">Recurring Pattern</label>
              <select id="liveClassRecurring">
                  <option value="none" ${isEdit && liveClass.recurring_config?.pattern === 'none' ? 'selected' : ''}>None</option>
                  <option value="daily" ${isEdit && liveClass.recurring_config?.pattern === 'daily' ? 'selected' : ''}>Daily</option>
                  <option value="weekly" ${isEdit && liveClass.recurring_config?.pattern === 'weekly' ? 'selected' : ''}>Weekly</option>
                  <option value="monthly" ${isEdit && liveClass.recurring_config?.pattern === 'monthly' ? 'selected' : ''}>Monthly</option>
              </select>
            </div>
            <div>
              <label class="small">Custom Meeting URL (optional)</label>
              <input type="url" id="liveClassMeetingUrl" placeholder="https://..." value="${isEdit ? escapeHtml(liveClass.meeting_url || '') : ''}">
              <div id="urlHintArea"></div>
            </div>
          </div>
          <div class="flex gap-10 mt-15">
            <button type="submit" class="button w-auto px-40">${isEdit ? 'Update Class' : 'Schedule Class'}</button>
            <button type="button" class="button secondary w-auto px-40" onclick="document.getElementById('liveFormArea').classList.add('hidden')">Cancel</button>
          </div>
        </form>
      </div>
    `;
    const courseSelect = document.getElementById('liveClassCourseId');
    const urlInput = document.getElementById('liveClassMeetingUrl');
    const recurringSelect = document.getElementById('liveClassRecurring');

    const updateUrlHint = () => {
        const courseId = courseSelect.value;
        const pattern = recurringSelect.value;
        if (courseId && !urlInput.value) {
            const course = courses.find(c => c.id === courseId);
            const savedUrl = course?.metadata?.last_live_url;
            if (savedUrl) {
                document.getElementById('urlHintArea').innerHTML = `<p class="tiny success-text mt-5" style="cursor:pointer" onclick="document.getElementById('liveClassMeetingUrl').value='${escapeAttr(savedUrl)}'">💡 Use saved URL for this course</p>`;
            } else {
                const prev = allLiveClasses.find(x => x.course_id === courseId && x.meeting_url);
                if (prev) {
                    document.getElementById('urlHintArea').innerHTML = `<p class="tiny success-text mt-5" style="cursor:pointer" onclick="document.getElementById('liveClassMeetingUrl').value='${escapeAttr(prev.meeting_url)}'">💡 Use previous URL for this course</p>`;
                } else {
                    document.getElementById('urlHintArea').innerHTML = '';
                }
            }
        } else {
            document.getElementById('urlHintArea').innerHTML = '';
        }
    };

    courseSelect.addEventListener('change', updateUrlHint);
    recurringSelect.addEventListener('change', updateUrlHint);
    updateUrlHint();

    document.getElementById('liveClassForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const user = await SessionManager.getCurrentUser();
      const selCourseId = document.getElementById('liveClassCourseId').value;
      const selPattern = document.getElementById('liveClassRecurring').value;
      const selUrl = document.getElementById('liveClassMeetingUrl').value;

      const roomName = isEdit ? liveClass.room_name : 'SmartLMS_' + Math.random().toString(36).substring(2, 12);
      const data = {
        ...liveClass,
        id: isEdit ? liveClass.id : crypto.randomUUID(),
        title: document.getElementById('liveClassTitle').value,
        course_id: selCourseId,
        teacher_email: user.email,
        start_at: new Date(document.getElementById('liveClassStart').value).toISOString(),
        end_at: new Date(document.getElementById('liveClassEnd').value).toISOString(),
        room_name: roomName,
        meeting_url: selUrl,
        status: isEdit ? liveClass.status : 'scheduled',
        recurring_config: {
            pattern: selPattern
        }
      };

      // Save URL to course metadata if recurring
      if (selPattern !== 'none' && selUrl) {
          const course = courses.find(c => c.id === selCourseId);
          if (course) {
              course.metadata = { ...course.metadata, last_live_url: selUrl };
              await SupabaseDB.saveCourse(course);
          }
      }

      await SupabaseDB.saveLiveClass(data);
      UI.showNotification(isEdit ? 'Class updated' : 'Class scheduled', 'success');
      renderLiveClasses();
    });
  } catch (e) {
      console.error(e);
  }
}

let jitsiAPI = null;
let liveClassTimer = null;

function startLiveClassTimer(id, endAt) {
    if (liveClassTimer) clearInterval(liveClassTimer);
    window._warnedEnd = false;
    const endTime = new Date(endAt).getTime();

    liveClassTimer = setInterval(() => {
        const now = Date.now();
        if (now >= endTime) {
            clearInterval(liveClassTimer);
            if (confirm('Scheduled class time has reached. Do you want to extend by 15 minutes? Press Cancel to end class.')) {
                extendLiveClass(id, 15);
            } else {
                stopLiveClass(id);
            }
        } else if (endTime - now <= 5 * 60 * 1000 && !window._warnedEnd) {
            window._warnedEnd = true;
            UI.showNotification('Class ends in 5 minutes', 'warn');
        }
    }, 30000);
}

async function handleStartLiveClass(id, roomName, meetingUrl) {
    // Hide any existing stop buttons initially to reset state
    const oldStopBtn = document.getElementById('stopClassBtn');
    if (oldStopBtn) oldStopBtn.classList.add('hidden');
    const globalStop = document.getElementById('globalStopBtn');
    if (globalStop) globalStop.classList.add('hidden');

    if (meetingUrl && meetingUrl.trim() !== '') {
        const choice = await UI.showMeetingChoice(meetingUrl);
        if (!choice) return;

        try {
            const freshLc = await SupabaseDB.getLiveClass(id);
            if (freshLc && freshLc.status !== 'live') {
                freshLc.status = 'live';
                await SupabaseDB.saveLiveClass(freshLc);
            }

            if (choice === 'tab') {
                window.open(meetingUrl, '_blank');
                renderLiveClasses();
            } else {
                // Embed in app
                const container = document.getElementById('jitsi-container');
                if (container) {
                    container.classList.remove('hidden');
                    container.scrollIntoView({ behavior: 'smooth' });
                    container.innerHTML = `<iframe src="${escapeAttr(meetingUrl)}" style="width:100%; height:600px; border:none" allow="camera; microphone; display-capture; autoplay; clipboard-write"></iframe>`;

                    let stopBtn = document.getElementById('stopClassBtn');
                    if (!stopBtn) {
                      stopBtn = document.createElement('button');
                      stopBtn.id = 'stopClassBtn';
                      stopBtn.className = 'button danger w-auto mt-10';
                      stopBtn.textContent = 'Stop Class & End Meeting';
                      stopBtn.onclick = () => stopLiveClass(id);
                      container.after(stopBtn);
                    } else {
                        stopBtn.classList.remove('hidden');
                        stopBtn.style.display = 'inline-flex';
                        stopBtn.onclick = () => stopLiveClass(id);
                    }
                } else {
                    // Fallback to new tab if container missing
                    window.open(meetingUrl, '_blank');
                    renderLiveClasses();
                }
            }
        } catch (e) {
            UI.showNotification('Error starting class: ' + e.message, 'error');
        }
    } else {
        startTeacherLiveClass(id, roomName);
    }
}
window.handleStartLiveClass = handleStartLiveClass;

async function startTeacherLiveClass(id, roomName) {
  const user = await SessionManager.getCurrentUser();
  const container = document.getElementById('jitsi-container');
  container.classList.remove('hidden');
  container.scrollIntoView({ behavior: 'smooth' });

  // Update status to live
  const freshLc = await SupabaseDB.getLiveClass(id);
  if (freshLc && freshLc.status !== 'live') {
    freshLc.status = 'live';
    await SupabaseDB.saveLiveClass(freshLc);
  }

  const domain = "meet.jit.si";
  const options = {
    roomName: roomName,
    height: 600,
    parentNode: container,
    userInfo: {
      displayName: user.full_name,
      email: user.email
    },
    interfaceConfigOverwrite: {
      TOOLBAR_BUTTONS: [
        'microphone', 'camera', 'closedcaptions', 'desktop', 'fullscreen',
        'fodeviceselection', 'hangup', 'profile', 'chat', 'recording',
        'livestreaming', 'etherpad', 'sharedvideo', 'settings', 'raisehand',
        'videoquality', 'filmstrip', 'invite', 'feedback', 'stats', 'shortcuts',
        'tileview', 'videobackgroundblur', 'download', 'help', 'mute-everyone',
        'security'
      ],
    },
    configOverwrite: {
      startWithAudioMuted: false,
      startWithVideoMuted: false
    }
  };

  if (jitsiAPI) jitsiAPI.dispose();
  jitsiAPI = new JitsiMeetExternalAPI(domain, options);

  // Show Moderation Controls (if they exist in layout)
  const modControls = document.getElementById('mod-controls');
  if (modControls) modControls.classList.remove('hidden');

  // Add "Stop Class" button dynamically if not present
  let stopBtn = document.getElementById('stopClassBtn');
  if (!stopBtn) {
    stopBtn = document.createElement('button');
    stopBtn.id = 'stopClassBtn';
    stopBtn.className = 'button danger w-auto mt-10';
    stopBtn.textContent = 'Stop Class & End Meeting';
    stopBtn.onclick = () => stopLiveClass(id);
    // Ensure it's inserted after the container and made visible
    container.after(stopBtn);
  } else {
      stopBtn.classList.remove('hidden');
      stopBtn.style.display = 'inline-flex';
      stopBtn.onclick = () => stopLiveClass(id);
  }

  jitsiAPI.addEventListener('readyToClose', async () => {
    container.classList.add('hidden');
    if (modControls) modControls.classList.add('hidden');
    if (stopBtn) stopBtn.classList.add('hidden');
    if (liveClassTimer) clearInterval(liveClassTimer);

    // Only set status back to scheduled if the teacher didn't stop the class manually
    try {
        const exitLc = await SupabaseDB.getLiveClass(id);
        if (exitLc && exitLc.status === 'live') {
            exitLc.status = 'scheduled';
            await SupabaseDB.saveLiveClass(exitLc);
            UI.showNotification('Teacher left session', 'info');
        }
    } catch (e) { console.error(e); }

    if (jitsiAPI) jitsiAPI.dispose();
    jitsiAPI = null;
    renderLiveClasses();
  });

  // End of class timer
  if (freshLc && freshLc.end_at) {
      startLiveClassTimer(id, freshLc.end_at);
  }
}

async function stopLiveClass(id) {
    if (confirm('Are you sure you want to stop the class? This will disconnect all participants.')) {
        try {
            const liveClass = await SupabaseDB.getLiveClass(id);
            if (liveClass) {
                liveClass.status = 'completed';
                liveClass.actual_end_at = new Date().toISOString();
                await SupabaseDB.saveLiveClass(liveClass);
            }

            // Send signal to students if possible before disposing
            if (jitsiAPI) {
                jitsiAPI.executeCommand('sendChatMessage', 'Teacher has ended the class.', '', true);
                setTimeout(() => {
                    if (jitsiAPI) jitsiAPI.dispose();
                    jitsiAPI = null;
                    document.getElementById('jitsi-container').classList.add('hidden');
                    const stopBtn = document.getElementById('stopClassBtn');
                    if (stopBtn) stopBtn.classList.add('hidden');
                    UI.showNotification('Class ended successfully', 'success');
                    renderLiveClasses();
                }, 1000);
            } else {
                renderLiveClasses();
            }
        } catch (e) {
            UI.showNotification('Error stopping class: ' + e.message, 'error');
        }
    }
}

async function extendLiveClass(id, minutes) {
    try {
        const liveClass = await SupabaseDB.getLiveClass(id);
        if (liveClass) {
            const currentEnd = new Date(liveClass.end_at);
            liveClass.end_at = new Date(currentEnd.getTime() + minutes * 60000).toISOString();
            await SupabaseDB.saveLiveClass(liveClass);
            UI.showNotification(`Class extended by ${minutes} minutes`, 'success');
            renderLiveClasses();
            startLiveClassTimer(id, liveClass.end_at);
        }
    } catch (e) {
        UI.showNotification('Error extending class', 'error');
    }
}

window.stopLiveClass = stopLiveClass;
window.extendLiveClass = extendLiveClass;

function teacherModAction(action) {
    if (!jitsiAPI) return;
    switch(action) {
        case 'muteAll':
            jitsiAPI.executeCommand('muteEveryone');
            UI.showNotification('Muted everyone');
            break;
        case 'toggleLobby':
            jitsiAPI.executeCommand('toggleLobby', true);
            UI.showNotification('Lobby toggled');
            break;
        case 'stopVideoAll':
            // Jitsi API doesn't have a direct "stop all video" but we can suggest
            UI.showNotification('Please use Jitsi security settings for advanced moderation');
            break;
    }
}

window.teacherModAction = teacherModAction;

async function deleteLiveClass(id) {
  if (confirm('Cancel this class?')) {
    await SupabaseDB.deleteLiveClass(id);
    renderLiveClasses();
  }
}

async function viewAttendance(classId) {
  const att = await SupabaseDB.getAttendance(classId);
  alert(`Attendance:\n${att.map(a => `${a.student_email}: ${Math.floor(a.duration / 60)} mins (${a.is_present ? 'Present' : 'Absent'})`).join('\n') || 'No records yet.'}`);
}

window.showLiveClassForm = showLiveClassForm;
window.startTeacherLiveClass = startTeacherLiveClass;
window.deleteLiveClass = deleteLiveClass;
window.viewAttendance = viewAttendance;
window.renderLiveClasses = renderLiveClasses;

async function renderQuizzes() {
  const container = document.getElementById('pageContent');
  if (!container) return;

  try {
    const user = await SessionManager.getCurrentUser();
    const [quizzes, courses] = await Promise.all([
      SupabaseDB.getQuizzes(null, user.email),
      SupabaseDB.getCourses(user.email)
    ]);
    container.innerHTML = `
    <div class="card flex-between">
      <h2 class="m-0">Quizzes</h2>
      <button class="button w-auto" onclick="showQuizForm()">+ Create Quiz</button>
    </div>
    <div class="grid">
      ${quizzes.map(q => {
        const course = courses.find(c => c.id === q.course_id);
        return `
        <div class="card">
          <h3 class="m-0">${escapeHtml(q.title)}</h3>
          <p class="small"><strong>Course:</strong> ${escapeHtml(course?.title || 'None')}</p>
          <p class="small">Status: ${q.status}</p>
          <p class="small">Questions: ${q.questions?.length || 0}</p>
          <div class="flex gap-10 mt-15">
            <button class="button small w-auto" onclick="editQuiz('${q.id}')">Edit</button>
            <button class="button small w-auto success" style="background:var(--ok)" onclick="viewQuizResults('${q.id}')">Results</button>
            <button class="button small w-auto danger" onclick="deleteQuizById('${q.id}')">Delete</button>
          </div>
        </div>
`;}).join('') || '<div class="empty">No quizzes created yet.</div>'}
      </div>
    `;
  } catch (error) {
    console.error('Quizzes error:', error);
    container.innerHTML = `<div class="stat-card danger">
      <h3>Error Loading Quizzes</h3>
      <div class="small danger-text">${escapeHtml(error.message)}</div>
      <button class="button w-auto mt-10" onclick="renderQuizzes()">Retry</button>
    </div>`;
  }
}

async function showQuizForm(quiz = null) {
  const isEdit = !!quiz;
  const container = document.getElementById('pageContent');
  if (!container) return;

  const user = await SessionManager.getCurrentUser();
  const courses = await SupabaseDB.getCourses(user.email);

  container.innerHTML = `
    <div class="card">
      <h2 class="m-0">${isEdit ? 'Edit Quiz' : 'Create Quiz'}</h2>
      <form id="quizForm" class="mt-20">
        <label>Quiz Title</label>
        <input type="text" id="quizTitle" placeholder="Quiz Title" value="${isEdit ? escapeHtml(quiz.title) : ''}" required>
        <label>Description</label>
        <textarea id="quizDesc" placeholder="Description">${isEdit ? escapeHtml(quiz.description) : ''}</textarea>
        <div class="grid-2">
          <div><label class="small">Time Limit (min):</label><input type="number" id="quizLimit" value="${isEdit ? quiz.time_limit : 0}"></div>
          <div><label class="small">Attempts Allowed:</label><input type="number" id="quizAttempts" value="${isEdit ? quiz.attempts_allowed : 1}" min="1"></div>
        </div>
        <div class="grid-2 mt-10">
          <div><label class="small">Passing Score (%):</label><input type="number" id="quizPassingScore" value="${isEdit ? quiz.passing_score : 60}" min="0" max="100"></div>
          <div>
            <label class="small">Shuffle Questions?</label>
            <select id="quizShuffle">
              <option value="false" ${isEdit && !quiz.shuffle_questions ? 'selected' : ''}>No</option>
              <option value="true" ${isEdit && quiz.shuffle_questions ? 'selected' : ''}>Yes</option>
            </select>
          </div>
        </div>
        <div class="mt-10">
          <label>Course</label>
          <select id="quizCourseId" required>
            <option value="">Select Course</option>
            ${courses.map(c => `<option value="${c.id}" ${((isEdit ? quiz.course_id : null) === c.id) ? 'selected' : ''}>${escapeHtml(c.title)}</option>`).join('')}
          </select>
        </div>
        <label>Status</label>
        <select id="quizStatus">
          <option value="draft" ${isEdit && quiz.status === 'draft' ? 'selected' : ''}>Draft</option>
          <option value="published" ${isEdit && quiz.status === 'published' ? 'selected' : ''}>Published</option>
        </select>
        <div class="mt-20">
          <div class="flex-between">
            <h3 class="m-0">Questions</h3>
            <button type="button" class="button secondary w-auto small" onclick="shuffleQuizQuestions()">Shuffle Order</button>
          </div>
          <div id="quizQuestionsContainer" class="mt-15"></div>
          <button type="button" class="button secondary w-auto small" onclick="addQuizQuestionField()">+ Add Question</button>
        </div>
        <div class="flex gap-10 mt-30">
          <button type="submit" class="button w-auto px-40">${isEdit ? 'Update Quiz' : 'Save Quiz'}</button>
          <button type="button" class="button secondary w-auto px-40" onclick="renderQuizzes()">Cancel</button>
        </div>
      </form>
    </div>
  `;
  window.addQuizQuestionField = (q = null) => {
    const container = document.getElementById('quizQuestionsContainer');
    if (!container) return;
    const div = document.createElement('div');
    div.className = 'question mb-20 card';
    div.innerHTML = `
      <div class="flex-between mb-15">
        <h4 class="m-0">Quiz Question</h4>
        <button type="button" class="button danger small w-auto" onclick="this.closest('.question').remove(); window.updateQuizTotalPoints();">Remove Question</button>
      </div>
      <div class="mb-10">
        <label class="bold">Question Text:</label>
        <input type="text" class="q-text" placeholder="Enter quiz question here..." value="${q ? escapeHtml(q.text) : ''}" required>
      </div>
      <div class="grid-2 mt-10">
        <div>
          <label class="small">Question Type:</label>
          <select class="q-type" onchange="toggleQuizOptions(this)">
            <option value="mcq" ${q?.type === 'mcq' ? 'selected' : ''}>Multiple Choice</option>
            <option value="tf" ${q?.type === 'tf' ? 'selected' : ''}>True/False</option>
            <option value="short" ${q?.type === 'short' ? 'selected' : ''}>Short Answer</option>
          </select>
        </div>
        <div>
          <label class="small">Points</label>
          <input type="number" class="q-points" placeholder="Points" value="${q ? q.points : 5}">
        </div>
      </div>
      <div class="q-options mt-10">
        ${renderQuizOptions(q)}
      </div>
      <div class="mt-10">
        <label class="small">Hint (optional)</label>
        <input type="text" class="q-hint" placeholder="Hint..." value="${q?.hint ? escapeHtml(q.hint) : ''}">
        <label class="small">Explanation (optional)</label>
        <textarea class="q-explanation" placeholder="Explanation for correct answer..." rows="2">${q?.explanation ? escapeHtml(q.explanation) : ''}</textarea>
      </div>
    `;
    container.appendChild(div);
    div.querySelector('.q-points').addEventListener('input', window.updateQuizTotalPoints);
    window.updateQuizTotalPoints();
  };

  window.updateQuizTotalPoints = () => {
    // This could be used to show a total points label if needed, or for validation
    const total = Array.from(document.querySelectorAll('#quizQuestionsContainer .q-points'))
        .reduce((sum, input) => sum + (parseInt(input.value) || 0), 0);
  };
  window.renderQuizOptions = (q) => {
    if (q?.type === 'tf') return `<select class="q-correct"><option value="True" ${q.correct === 'True' ? 'selected' : ''}>True</option><option value="False" ${q.correct === 'False' ? 'selected' : ''}>False</option></select>`;
    if (q?.type === 'short') return `<input type="text" class="q-correct" placeholder="Correct Answer (Exact Match)" value="${q.correct || ''}">`;
    const id = Date.now() + Math.random();
    return `<div class="mcq-options">${(q?.options || ['','','','']).map((opt, i) => `<div>Option ${i+1}: <input type="text" class="opt-val" value="${escapeHtml(opt)}"> <input type="radio" name="correct-${id}" ${q?.correct === i.toString() ? 'checked' : ''} value="${i}"> Correct</div>`).join('')}</div>`;
  };
  window.toggleQuizOptions = (select) => {
    const qItem = select.closest('.question');
    const container = qItem.querySelector('.q-options');
    if (container) container.innerHTML = renderQuizOptions({ type: select.value });
  };
window.shuffleQuizQuestions = () => {
  const container = document.getElementById('quizQuestionsContainer');
  const items = Array.from(container.children);
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    container.appendChild(items[j]);
  }
};
  if (isEdit && quiz.questions) { quiz.questions.forEach(q => window.addQuizQuestionField(q)); }
  document.getElementById('quizForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const user = await SessionManager.getCurrentUser();
      const questions = [];
      document.querySelectorAll('#quizQuestionsContainer .question').forEach(item => {
        const type = item.querySelector('.q-type').value;
        const qData = { text: item.querySelector('.q-text').value, type, points: parseInt(item.querySelector('.q-points').value) || 0, hint: item.querySelector('.q-hint').value, explanation: item.querySelector('.q-explanation').value };
        if (type === 'mcq') {
          qData.options = Array.from(item.querySelectorAll('.opt-val')).map(i => i.value);
          const checked = item.querySelector('input[type="radio"]:checked');
          qData.correct = checked ? checked.value : '0';
        } else {
          qData.correct = item.querySelector('.q-correct').value;
        }
        questions.push(qData);
      });
      await SupabaseDB.saveQuiz({
        ...quiz,
        id: isEdit ? quiz.id : crypto.randomUUID(),
        course_id: document.getElementById('quizCourseId').value,
        teacher_email: user.email,
        title: document.getElementById('quizTitle').value,
        description: document.getElementById('quizDesc').value,
        time_limit: parseInt(document.getElementById('quizLimit').value) || 0,
        attempts_allowed: parseInt(document.getElementById('quizAttempts').value) || 1,
        passing_score: parseInt(document.getElementById('quizPassingScore').value) || 60,
        shuffle_questions: document.getElementById('quizShuffle').value === 'true',
        status: document.getElementById('quizStatus').value,
        questions,
        updated_at: new Date().toISOString()
      });
      renderQuizzes();
    } catch (err) {
      alert('Error saving quiz: ' + err.message);
    }
  });
}

async function editQuiz(id) {
  const user = await SessionManager.getCurrentUser();
  const quizzes = await SupabaseDB.getQuizzes(null, user.email);
  const quiz = quizzes.find(q => q.id === id);
  showQuizForm(quiz);
}

async function deleteQuizById(id) {
  if (confirm('Delete Quiz?')) {
    try {
      await SupabaseDB.deleteQuiz(id);
      renderQuizzes();
    } catch (e) {
      alert('Error deleting quiz: ' + e.message);
    }
  }
}

async function viewQuizResults(quizId) {
  const [subs, quiz] = await Promise.all([
    SupabaseDB.getQuizSubmissions(quizId),
    SupabaseDB.getQuiz(quizId)
  ]);
  const container = document.getElementById('pageContent');
  if (!container) return;

  container.innerHTML = `
    <button class="button secondary w-auto mb-10" onclick="renderQuizzes()">← Back</button>
    <div class="card">
      <h2 class="m-0">Results for: ${escapeHtml(quiz.title)}</h2>
      <div class="p-0 mt-15" style="overflow-x:auto">
          <table>
            <thead><tr><th>Student</th><th>Score</th><th>Points</th><th>Submitted</th><th>Action</th></tr></thead>
            <tbody>
              ${subs.filter(s => s.status === 'submitted').map(s => `
                <tr>
                  <td>${escapeHtml(s.student_email)}</td>
                  <td>${s.score !== null ? s.score + '%' : '<span class="warning-text bold">Pending</span>'}</td>
                  <td>${s.total_points || 0}</td>
                  <td>${new Date(s.submitted_at).toLocaleString()}</td>
                  <td><button class="button small w-auto" onclick="gradeQuizSubmission('${s.id}', '${quizId}')">Grade/View</button></td>
                </tr>
              `).join('') || '<tr><td colspan="5" class="empty">No submissions yet.</td></tr>'}
            </tbody>
          </table>
      </div>
    </div>
  `;
}

async function gradeQuizSubmission(submissionId, quizId) {
  const [quiz, submission] = await Promise.all([
    SupabaseDB.getQuiz(quizId),
    SupabaseDB.getQuizSubmissionById(submissionId)
  ]);
  const container = document.getElementById('pageContent');
  if (!container) return;

  container.innerHTML = `
    <button class="button secondary w-auto mb-10" onclick="viewQuizResults('${quizId}')">← Back to Results</button>
    <div class="card">
      <h3 class="m-0">Grading: ${escapeHtml(quiz.title)}</h3>
      <p class="small mt-5"><strong>Student:</strong> ${escapeHtml(submission.student_email)}</p>
      <form id="quizGradingForm" class="mt-20">
        <div>
          ${quiz.questions.map((q, idx) => {
            const studentAnswer = submission.answers[idx] || 'No Answer';
            const isAutoGraded = q.type !== 'short';
            const isCorrect = isAutoGraded && studentAnswer.toString().toLowerCase() === q.correct.toString().toLowerCase();
            const statusColor = isAutoGraded ? (isCorrect ? 'var(--ok)' : 'var(--danger)') : 'var(--warn)';

            let studentDisplay = studentAnswer;
            let correctDisplay = q.correct;
            if (q.type === 'mcq') {
              studentDisplay = q.options[studentAnswer] !== undefined ? q.options[studentAnswer] : studentAnswer;
              correctDisplay = q.options[q.correct] !== undefined ? q.options[q.correct] : q.correct;
            }

            return `
              <div class="question" style="border-left: 5px solid ${statusColor}">
                <div class="bold">Q${idx + 1}: ${escapeHtml(q.text)} (${q.points} pts)</div>
                <div class="mt-5">
                  <span class="small">Type: ${q.type.toUpperCase()} | Correct: ${escapeHtml(correctDisplay)}</span>
                </div>
                <div class="small p-10 mt-10" style="background:white; border:1px solid var(--border); border-radius:4px">
                  <strong class="text-muted">Student Answer:</strong> ${escapeHtml(studentDisplay)}
                </div>
                ${!isAutoGraded ? `
                  <div class="mt-10 flex-center-y gap-10">
                    <label class="small m-0">Points Awarded (0-${q.points}):</label>
                    <input type="number" class="q-manual-points w-auto m-0 p-5" data-q-idx="${idx}" min="0" max="${q.points}" value="${isCorrect ? q.points : 0}" style="width:80px">
                  </div>
                ` : ''}
              </div>
            `;
          }).join('')}
        </div>
        <div class="mt-20 pt-20" style="border-top:1px solid var(--border)">
          <div class="bold mb-10">Final Score Override (%)</div>
          <input type="number" id="finalQuizScore" min="0" max="100" value="${submission.score || 0}" class="w-auto" style="width:100px">
          <p class="small mt-5">Note: Use this to manually adjust the final percentage score.</p>
          <button type="submit" class="button w-auto px-40 mt-15">Save Grade</button>
        </div>
      </form>
    </div>
  `;

  document.getElementById('quizGradingForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const manualScores = Array.from(document.querySelectorAll('.q-manual-points')).map(input => ({
        idx: parseInt(input.dataset.qIdx),
        points: parseInt(input.value) || 0
      }));

      // Calculate total points
      let earnedPoints = 0;
      let totalPossible = 0;
      quiz.questions.forEach((q, idx) => {
        totalPossible += q.points;
        const manual = manualScores.find(m => m.idx === idx);
        if (manual) {
          earnedPoints += manual.points;
        } else {
          const studentAnswer = submission.answers[idx] || '';
          if (studentAnswer.toString().toLowerCase() === q.correct.toString().toLowerCase()) {
            earnedPoints += q.points;
          }
        }
      });

      const autoPercentage = Math.round((earnedPoints / totalPossible) * 100);
      const finalScore = parseInt(document.getElementById('finalQuizScore').value);

      const updatedSubmission = {
        ...submission,
        score: finalScore,
        total_points: totalPossible,
        updated_at: new Date().toISOString()
      };

      await SupabaseDB.saveQuizSubmission(updatedSubmission);
      alert('Quiz graded successfully!');
      viewQuizResults(quizId);
    } catch (err) {
      alert('Error saving grade: ' + err.message);
    }
  });
}

window.gradeQuizSubmission = gradeQuizSubmission;

async function renderGradeBook() {
    const content = document.getElementById('pageContent');
    if (!content) return;

    try {
        const user = await SessionManager.getCurrentUser();
        const [courses, assignments, quizzes, submissions, quizSubs] = await Promise.all([
            SupabaseDB.getCourses(user.email),
            SupabaseDB.getAssignments(user.email),
            SupabaseDB.getQuizzes(null, user.email),
            SupabaseDB.getSubmissions(null, null, user.email),
            SupabaseDB.getQuizSubmissions(null, null, user.email)
        ]);

        content.innerHTML = `
            <div class="card flex-between">
                <h2 class="m-0">Grade Book</h2>
                <div class="flex gap-10">
                    <select id="gbCourseSelect" onchange="filterGradeBook()" style="width:auto; margin:0">
                        <option value="">All Courses</option>
                        ${courses.map(c => `<option value="${c.id}">${escapeHtml(c.title)}</option>`).join('')}
                    </select>
                </div>
            </div>
            <div id="gradeBookArea" class="mt-20"></div>
        `;

        window.filterGradeBook = async () => {
            const courseId = document.getElementById('gbCourseSelect').value;
            const area = document.getElementById('gradeBookArea');

            let filteredCourses = courseId ? courses.filter(c => c.id === courseId) : courses;
            let courseIds = filteredCourses.map(c => c.id);

            const enrollments = await SupabaseDB.getEnrollmentsByCourses(courseIds);

            let html = '';

            for (const course of filteredCourses) {
                const courseAssigns = assignments.filter(a => a.course_id === course.id && a.status === 'published');
                const courseQuizzes = quizzes.filter(q => q.course_id === course.id && q.status === 'published');
                const courseStudents = enrollments.filter(e => e.course_id === course.id).map(e => e.student_email);

                if (courseStudents.length === 0) {
                    html += `<div class="card mb-20"><h3>${escapeHtml(course.title)}</h3><p class="empty small">No students enrolled.</p></div>`;
                    continue;
                }

                html += `
                    <div class="card mb-20" style="padding:0; overflow:hidden">
                        <div class="p-15" style="background:var(--bg)">
                            <h3 class="m-0">${escapeHtml(course.title)}</h3>
                            <p class="tiny text-muted m-0">${courseStudents.length} Students | ${courseAssigns.length} Assignments | ${courseQuizzes.length} Quizzes</p>
                        </div>
                        <div style="overflow-x:auto">
                            <table class="m-0">
                                <thead>
                                    <tr>
                                        <th style="min-width:200px">Student</th>
                                        ${courseAssigns.map(a => `<th class="text-center" style="min-width:120px" title="${escapeAttr(a.title)}">📝 ${escapeHtml(a.title.substring(0,10))}...</th>`).join('')}
                                        ${courseQuizzes.map(q => `<th class="text-center" style="min-width:120px" title="${escapeAttr(q.title)}">❓ ${escapeHtml(q.title.substring(0,10))}...</th>`).join('')}
                                        <th class="text-center" style="min-width:100px; background:#f8fafc">Final Avg</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${courseStudents.map(email => {
                                        let earnedPoints = 0;
                                        let itemsCount = 0;

                                        const assignmentCells = courseAssigns.map(a => {
                                            const sub = submissions.find(s => s.assignment_id === a.id && s.student_email === email);
                                            if (sub && sub.status === 'graded') {
                                                earnedPoints += sub.final_grade;
                                                itemsCount++;
                                                return `
                                                    <td class="text-center">
                                                        <span class="badge ${sub.final_grade >= 70 ? 'badge-active' : 'badge-warn'}">${sub.final_grade}%</span>
                                                        <div class="tiny text-muted mt-5">${sub.grade} / ${a.points_possible}</div>
                                                    </td>`;
                                            }
                                            return `<td class="text-center"><span class="tiny text-muted">-</span></td>`;
                                        }).join('');

                                        const quizCells = courseQuizzes.map(q => {
                                            const sub = quizSubs.filter(s => s.quiz_id === q.id && s.student_email === email && s.status === 'submitted')
                                                               .sort((a,b) => (b.score || 0) - (a.score || 0))[0];
                                            if (sub) {
                                                earnedPoints += sub.score;
                                                itemsCount++;
                                                const rawScore = Math.round((sub.score / 100) * sub.total_points);
                                                return `
                                                    <td class="text-center">
                                                        <span class="badge ${sub.score >= 70 ? 'badge-active' : 'badge-warn'}">${sub.score}%</span>
                                                        <div class="tiny text-muted mt-5">${rawScore} / ${sub.total_points}</div>
                                                    </td>`;
                                            }
                                            return `<td class="text-center"><span class="tiny text-muted">-</span></td>`;
                                        }).join('');

                                        const avg = itemsCount > 0 ? Math.round(earnedPoints / itemsCount) : 0;

                                        return `
                                            <tr>
                                                <td><div class="bold small">${escapeHtml(email)}</div></td>
                                                ${assignmentCells}
                                                ${quizCells}
                                                <td class="text-center" style="background:#f8fafc"><strong class="${avg >= 70 ? 'success-text' : 'danger-text'}">${itemsCount > 0 ? avg + '%' : '-'}</strong></td>
                                            </tr>
                                        `;
                                    }).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                `;
            }
            area.innerHTML = html || '<div class="empty">No data available.</div>';
        };

        filterGradeBook();
    } catch (error) {
        console.error('Grade Book error:', error);
        content.innerHTML = `<div class="card danger-border"><h3>Error Loading Grade Book</h3><p class="small">${escapeHtml(error.message)}</p></div>`;
    }
}

window.renderGradeBook = renderGradeBook;

function initNav() {
  const teacherNav = document.getElementById('teacherNav');
  if (teacherNav) {
    teacherNav.querySelectorAll('button').forEach(button => {
      button.addEventListener('click', (e) => {
        teacherNav.querySelectorAll('button').forEach(b => b.classList.remove('active'));
        button.classList.add('active');
        const page = button.dataset.page;
        if(page === 'dashboard') renderDashboard();
        else if(page === 'courses') renderCourses();
        else if(page === 'materials') renderMaterials();
        else if(page === 'assignments') renderAssignments();
        else if(page === 'grading') renderGrading();
        else if(page === 'gradebook') renderGradeBook();
        else if(page === 'students') renderStudents();
        else if(page === 'discussions') renderDiscussions();
        else if(page === 'badges') renderBadges();
        else if(page === 'quizzes') renderQuizzes();
        else if(page === 'live') renderLiveClasses();
        else if(page === 'calendar') renderCalendar();
        else if(page === 'settings') renderSettings();
      });
    });
  }
}


async function renderMaterials() {
  const content = document.getElementById('pageContent');
  if (!content) return;
  const user = await SessionManager.getCurrentUser();
  const [courses, materials] = await Promise.all([
    SupabaseDB.getCourses(user.email),
    SupabaseDB.getMaterials()
  ]);

  content.innerHTML = `
    <div class="card flex-between">
      <h2 class="m-0">Course Materials</h2>
      <button class="button w-auto" onclick="showMaterialForm()">+ Add Material</button>
    </div>
    <div class="grid">
      ${courses.map(c => {
        const courseMaterials = materials.filter(m => m.course_id === c.id);
        return `
          <div class="card">
            <h3 class="m-0">${escapeHtml(c.title)}</h3>
            <div class="grid mt-10" style="gap:8px">
              ${courseMaterials.map(m => `
                <div class="flex-between list-item">
                  <span class="small">${escapeHtml(m.title)}</span>
                  <div class="flex gap-5">
                    <button class="button secondary tiny" onclick="UI.viewFile('${escapeAttr(m.file_url)}', '${escapeAttr(m.title)}')">View</button>
                    <button class="button danger tiny" onclick="deleteMaterial('${escapeAttr(m.id)}')">Delete</button>
                  </div>
                </div>
              `).join('') || '<p class="small">No materials yet.</p>'}
            </div>
          </div>
        `;
      }).join('')}
    </div>
    <div id="materialFormArea" class="hidden mt-20"></div>
  `;
}

async function showMaterialForm() {
  const user = await SessionManager.getCurrentUser();
  const courses = await SupabaseDB.getCourses(user.email);
  const area = document.getElementById('materialFormArea');
  if (!area) return;
  area.classList.remove('hidden');
  area.innerHTML = `
    <div class="card">
      <h3 class="m-0">Add Course Material</h3>
      <div class="mt-20">
        <label>Course</label>
        <select id="matCourseId">${courses.map(c => `<option value="${c.id}">${escapeHtml(c.title)}</option>`).join('')}</select>
        <label>Material Title</label>
        <input type="text" id="matTitle" placeholder="e.g. Syllabus, Week 1 Slides">
        <div id="materialUploaderContainer" class="mt-10"></div>
        <input type="hidden" id="matFileUrl">
        <div class="flex gap-10 mt-20">
          <button class="button w-auto px-30" id="saveMatBtn" onclick="saveMaterial()" disabled>Save Material</button>
          <button class="button secondary w-auto px-30" onclick="document.getElementById('materialFormArea').classList.add('hidden')">Cancel</button>
        </div>
      </div>
    </div>
  `;

  UI.createFileUploader('materialUploaderContainer', {
    bucket: 'materials',
    pathPrefix: 'course-content',
    onUploadSuccess: (url) => {
      document.getElementById('matFileUrl').value = url;
      document.getElementById('saveMatBtn').disabled = false;
    }
  });
}

async function saveMaterial() {
  const courseId = document.getElementById('matCourseId').value;
  const title = document.getElementById('matTitle').value;
  const url = document.getElementById('matFileUrl').value;
  if (!title || !url) return alert('Title and file required');

  try {
    await SupabaseDB.saveMaterial({
      id: crypto.randomUUID(),
      course_id: courseId,
      title: title,
      file_url: url,
      created_at: new Date().toISOString()
    });
    alert('Material saved!');
    renderMaterials();
  } catch (e) {
    alert('Save failed: ' + e.message);
  }
}

async function deleteMaterial(id) {
  if (confirm('Delete material?')) {
    try {
      await SupabaseDB.deleteMaterial(id);
      renderMaterials();
    } catch (e) {
      alert('Delete failed');
    }
  }
}

window.saveMaterial = saveMaterial;
window.deleteMaterial = deleteMaterial;
window.showMaterialForm = showMaterialForm;

document.addEventListener('DOMContentLoaded', async () => {
  const user = await initDashboard('teacher');
  if (user) {
    initNav();
    renderDashboard();
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
