// Supabase Configuration
// Public anon key is safe to expose in client-side code.
const SUPABASE_URL = 'https://hupssocmagotpaoyhezt.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh1cHNzb2NtYWdvdHBhb3loZXp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4NzA2MTAsImV4cCI6MjA5NDQ0NjYxMH0.DiGpIi-yb0YxafLTGPhk1kqH7maD4FtPiC4gvmpYqnA';

// Initialize Supabase client
if (!window.supabase) {
    console.error('Supabase library not loaded. Please check your internet connection or CDN availability.');
}
const createClient = window.supabase?.createClient;

// Standard client options with dynamic header injection via custom fetch
const clientOptions = {
    global: {
        fetch: (url, options) => {
            const sid = sessionStorage.getItem('sessionId');
            // Only inject sid if it matches the activated session to avoid auth regressions
            if (sid && sid === _lastSessionId) {
                options = options || {};
                const headers = new Headers(options.headers || {});
                headers.set('x-session-id', sid);
                options.headers = headers;
            }
            return fetch(url, options);
        }
    },
    auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
    }
};

const supabaseClient = createClient ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, clientOptions) : null;
window.supabaseClient = supabaseClient;

// Track last initialized session
let _lastSessionId = sessionStorage.getItem('sessionId');

/**
 * Updates the Supabase client session context.
 * The custom fetch function will automatically pick up the new ID from sessionStorage.
 */
function setSupabaseSession(sessionId) {
    if (sessionId === _lastSessionId) return;

    if (sessionId) {
        sessionStorage.setItem('sessionId', sessionId);
    } else {
        sessionStorage.removeItem('sessionId');
    }

    _lastSessionId = sessionId;
}
window.setSupabaseSession = setSupabaseSession;

const _stats = {
    totalRequests: 0,
    failedRequests: 0,
    lastRequestTime: 0
};

const _cache = {
    data: {},
    ttl: 30000, // 30 seconds
    async fetch(key, fn) {
        const now = Date.now();
        // Append current user email to key if available to prevent cross-account cache leakage
        let userEmail = '';
        try {
            const raw = sessionStorage.getItem('currentUser');
            if (raw) userEmail = JSON.parse(raw).email;
        } catch(e) {}

        const contextualKey = userEmail ? `${key}_${userEmail}` : key;

        if (this.data[contextualKey] && (now - this.data[contextualKey].ts < this.ttl)) {
            return this.data[contextualKey].val;
        }
        const val = await fn();
        this.data[contextualKey] = { val, ts: now };
        return val;
    },
    invalidate(key) {
        if (key) delete this.data[key];
        else this.data = {};
    }
};

// Supabase Database Operations
class SupabaseDB {
    static async _request(fn) {
        if (!supabaseClient) {
            throw new Error('Supabase client not initialized. Check your connection or CDN availability.');
        }
        _stats.totalRequests++;
        try {
            const start = performance.now();
            const res = await fn();
            _stats.lastRequestTime = Math.round(performance.now() - start);
            return res;
        } catch (e) {
            _stats.failedRequests++;
            throw e;
        }
    }

    static getStats() {
        const successRate = _stats.totalRequests ? ((_stats.totalRequests - _stats.failedRequests) / _stats.totalRequests * 100).toFixed(1) : 100;
        return { ..._stats, successRate };
    }

    // Generic count operation
    static async getCount(table, filterFn = null, select = '*') {
        return this._request(async () => {
            let query = supabaseClient.from(table).select(select, { count: 'exact', head: true });
            if (filterFn) query = filterFn(query);
            const { count, error } = await query;
            if (error) throw error;
            return count || 0;
        });
    }

    // User operations
    static async getUsers(options = {}) {
        const { searchTerm = '', role = null, resetStatus = null } = options;
        return this._request(async () => {
            let query = supabaseClient.from('users').select('*', { count: 'exact' });
            if (role) query = query.eq('role', role);
            if (resetStatus) query = query.eq('reset_request->>status', resetStatus);
            if (searchTerm) {
                query = query.or(`full_name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`);
            }
            const { data, count, error } = await query
                .order('full_name', { ascending: true });
            if (error) throw error;
            return { data: data || [], total: count || 0 };
        });
    }

    /**
     * Retrieves all users with a specific role.
     */
    static async getUsersByRole(role) {
        return this._request(async () => {
            const { data, count, error } = await supabaseClient
                .from('users')
                .select('*', { count: 'exact' })
                .eq('role', role);
            if (error) throw error;
            return { data: data || [], total: count || 0 };
        });
    }

    static async getEnrolledStudents(courseIds) {
        if (!courseIds || courseIds.length === 0) return { data: [], total: 0 };
        return this._request(async () => {
            const { data, count, error } = await supabaseClient
                .from('users')
                .select('*, enrollments!inner(*)', { count: 'exact' })
                .in('enrollments.course_id', courseIds);
            if (error) throw error;
            return { data: data || [], total: count || 0 };
        });
    }

    static async getEnrollmentsByCourses(courseIds, options = {}) {
        if (!courseIds || courseIds.length === 0) return { data: [], total: 0 };
        const { searchTerm = '' } = options;

        return this._request(async () => {
            let query = supabaseClient
                .from('enrollments')
                .select('*, users!inner(*), courses(title)', { count: 'exact' })
                .in('course_id', courseIds);

            if (searchTerm) {
                query = query.or(`users.full_name.ilike.%${searchTerm}%,users.email.ilike.%${searchTerm}%`);
            }

            const { data, count, error } = await query
                .order('enrolled_at', { ascending: false });

            if (error) throw error;
            return { data: data || [], total: count || 0 };
        });
    }

    static async saveUser(user) {
        // Handle User Creation via Secure RPC
        const isNewUser = !user.created_at;
        if (isNewUser) {
            return this.createUserSecure(user);
        }

        // Handle User Update
        const payload = {
            email: user.email,
            full_name: user.full_name,
            phone: user.phone,
            role: user.role,
            last_login: user.last_login,
            failed_attempts: user.failed_attempts,
            locked_until: user.locked_until,
            lockouts: user.lockouts,
            flagged: user.flagged,
            reset_request: user.reset_request,
            active: user.active,
            notification_preferences: user.notification_preferences,
            metadata: user.metadata
        };

        const { data, error } = await supabaseClient
            .from('users')
            .update(payload)
            .eq('email', user.email)
            .select();
        if (error) throw error;

        // Update secrets via secure RPC if provided
        if (user.password || user.session_id) {
            try {
                await supabaseClient.rpc('update_user_secret_secure', {
                    p_email: user.email,
                    p_password_hash: user.password || null,
                    p_session_id: user.session_id || (user.password ? 'invalidated_' + Date.now() : null)
                });
            } catch (e) {
                console.warn('Failed to update user secrets:', e);
            }
        }

        _cache.invalidate('users');
        _cache.invalidate(`user_${user.email}`);
        return this.getUser(user.email, true);
    }

    static async createUserSecure(user) {
        const { data, error } = await supabaseClient.rpc('create_user_secure', {
            p_email: user.email,
            p_full_name: user.full_name,
            p_phone: user.phone,
            p_password_hash: user.password,
            p_role: user.role,
            p_session_id: user.session_id,
            p_invite_token: user.invite_token || null,
            p_active: user.active !== undefined ? user.active : true,
            p_metadata: user.metadata || {}
        });
        if (error) throw error;
        if (!data.success) throw new Error(data.message);

        _cache.invalidate('users');
        _cache.invalidate(`user_${user.email}`);
        return data.user;
    }

    static async updateUserEmail(oldEmail, newEmail, userData) {
        const { data, error } = await supabaseClient
            .from('users')
            .update({ ...userData, email: newEmail })
            .eq('email', oldEmail)
            .select();
        if (error) throw error;
        _cache.invalidate('users');
        _cache.invalidate(`user_${oldEmail}`);
        _cache.invalidate(`user_${newEmail}`);
        return data?.[0];
    }

    static async deleteDiscussion(id) {
        const { error } = await supabaseClient
            .from('discussions')
            .delete()
            .eq('id', id);
        if (error) throw error;
        _cache.invalidate();
    }

    static async getUser(email, bypassCache = false) {
        if (bypassCache) _cache.invalidate(`user_${email}`);
        return _cache.fetch(`user_${email}`, async () => {
            const { data, error } = await supabaseClient.rpc('get_user_secure', { p_email: email });
            if (error) throw error;
            return data || null;
        });
    }

    static async deleteUser(email) {
        try {
            // Cleanup files before deleting user record
            const [{ data: certs }, { data: submissions }] = await Promise.all([
                this.getCertificates(email),
                this.getSubmissions(null, email)
            ]);

            for (const cert of certs) {
                if (cert.certificate_url) await this.deleteFileByUrl(cert.certificate_url);
            }

            for (const sub of submissions) {
                await this.deleteSubmission(sub.assignment_id, email);
            }
        } catch (e) {
            console.warn('User file cleanup partially failed:', e);
        }

        const { error } = await supabaseClient
            .from('users')
            .delete()
            .eq('email', email);
        if (error) throw error;
        _cache.invalidate('users');
        _cache.invalidate(`user_${email}`);
    }

    // Assignment operations
    static async getAssignments(teacherEmail = null, courseId = null, courseIds = null, options = {}) {
        if (courseIds && courseIds.length === 0) return { data: [], total: 0 };
        const { searchTerm = '' } = options;

        return this._request(async () => {
            let query = supabaseClient.from('assignments').select('*', { count: 'exact' });
            if (teacherEmail) query = query.eq('teacher_email', teacherEmail);
            if (courseId) query = query.eq('course_id', courseId);
            if (courseIds && courseIds.length > 0) query = query.in('course_id', courseIds);
            if (searchTerm) query = query.ilike('title', `%${searchTerm}%`);

            const { data, count, error } = await query
                .order('due_date', { ascending: false });
            if (error) throw error;
            return { data: data || [], total: count || 0 };
        });
    }

    static async getEnrolledCourses(studentEmail, options = {}) {
        return this._request(async () => {
            const { data: enrollments, error: eError } = await supabaseClient
                .from('enrollments')
                .select('course_id')
                .eq('student_email', studentEmail);

            if (eError) throw eError;
            const courseIds = (enrollments || []).map(e => e.course_id);
            if (courseIds.length === 0) return { data: [], total: 0 };

            const { data, count, error } = await supabaseClient
                .from('courses')
                .select('*', { count: 'exact' })
                .in('id', courseIds)
                .order('title', { ascending: true });

            if (error) throw error;
            return { data: data || [], total: count || 0 };
        });
    }

    /**
     * Retrieves a single course by its ID.
     */
    static async getCourse(id) {
        return this._request(async () => {
            const { data, error } = await supabaseClient
                .from('courses')
                .select('*')
                .eq('id', id);
            if (error) throw error;
            return data?.[0] || null;
        });
    }

    static async getAssignment(id) {
        return this._request(async () => {
            const { data, error } = await supabaseClient
                .from('assignments')
                .select('*')
                .eq('id', id)
                .single();
            if (error) throw error;
            return data;
        });
    }

    static async reconcileQuizAttempts(quizId = null, studentEmail = null) {
        return this._request(async () => {
            const { error } = await supabaseClient.rpc('reconcile_quiz_attempts', {
                p_quiz_id: quizId,
                p_student_email: studentEmail
            });
            if (error) throw error;
            return true;
        });
    }

    static async startQuizAttempt(quizId) {
        return this._request(async () => {
            const { data, error } = await supabaseClient.rpc('start_quiz_attempt', {
                p_quiz_id: quizId
            });
            if (error) throw error;
            return data;
        });
    }

    static async submitQuizAttempt(submissionId, answers, timeSpent) {
        return this._request(async () => {
            const { data, error } = await supabaseClient.rpc('submit_quiz_attempt', {
                p_submission_id: submissionId,
                p_answers: answers,
                p_time_spent: timeSpent
            });
            if (error) throw error;
            return data;
        });
    }

    static async saveAssignment(assignment) {
        // Sanitize payload to avoid 400 error from extra fields (e.g. from joins)
        const payload = {
            course_id: assignment.course_id,
            title: assignment.title,
            description: assignment.description,
            teacher_email: assignment.teacher_email,
            start_at: assignment.start_at,
            due_date: assignment.due_date,
            points_possible: assignment.points_possible,
            allow_late_submissions: assignment.allow_late_submissions,
            late_penalty_per_day: assignment.late_penalty_per_day,
            allowed_extensions: assignment.allowed_extensions,
            questions: assignment.questions,
            attachments: assignment.attachments,
            status: assignment.status,
            anti_cheat_config: assignment.anti_cheat_config
        };
        if (assignment.id) payload.id = assignment.id;
        if (assignment.created_at) payload.created_at = assignment.created_at;

        const { data, error } = await supabaseClient
            .from('assignments')
            .upsert(payload, { onConflict: 'id' })
            .select();
        if (error) throw error;
        _cache.invalidate('assignments');
        return data?.[0];
    }

    static async deleteAssignment(id) {
        try {
            const [assignment, { data: submissions }] = await Promise.all([
                this.getAssignment(id),
                this.getSubmissions(id)
            ]);

            // Cleanup all submissions for this assignment (handles storage)
            for (const sub of submissions) {
                await this.deleteSubmission(id, sub.student_email);
            }

            // Cleanup assignment attachments
            if (assignment && assignment.attachments && Array.isArray(assignment.attachments)) {
                for (const att of assignment.attachments) {
                    if (att.url) await this.deleteFileByUrl(att.url);
                }
            }
        } catch (e) { console.warn('Failed to cleanup assignment files:', e); }

        const { error } = await supabaseClient
            .from('assignments')
            .delete()
            .eq('id', id);
        if (error) throw error;
        _cache.invalidate('assignments');
    }

    static async deleteSupportTicket(id) {
        const { error } = await supabaseClient
            .from('support_tickets')
            .delete()
            .eq('id', id);
        if (error) throw error;
        _cache.invalidate('support_tickets');
    }

    static async updateSupportTicket(id, updates) {
        const { data, error } = await supabaseClient
            .from('support_tickets')
            .update(updates)
            .eq('id', id)
            .select();
        if (error) throw error;
        _cache.invalidate('support_tickets');
        return data?.[0];
    }

    // Submission operations
    static async getSubmissions(assignmentId = null, studentEmail = null, teacherEmail = null, options = {}) {
        const { status = null, pendingGradingOnly = false } = options;
        return this._request(async () => {
            let selectStr = '*, assignments(*)';
            if (teacherEmail) selectStr = '*, assignments!inner(*)';

            let query = supabaseClient.from('submissions').select(selectStr, { count: 'exact' });
            if (assignmentId) query = query.eq('assignment_id', assignmentId);
            if (studentEmail) query = query.eq('student_email', studentEmail);
            if (teacherEmail) query = query.eq('assignments.teacher_email', teacherEmail);

            if (pendingGradingOnly) {
                query = query.or('status.eq.submitted,regrade_request.not.is.null');
            } else if (status) {
                query = query.eq('status', status);
            }

            const { data, count, error } = await query
                .order('submitted_at', { ascending: false });
            if (error) throw error;
            return { data: data || [], total: count || 0 };
        });
    }

    static async getSubmission(assignmentId, studentEmail) {
        return this._request(async () => {
            const { data, error } = await supabaseClient
                .from('submissions')
                .select('*')
                .eq('assignment_id', assignmentId)
                .eq('student_email', studentEmail);
            if (error) throw error;
            return data?.[0] || null;
        });
    }

    static async saveSubmission(submission) {
        // Sanitize payload
        const payload = {
            assignment_id: submission.assignment_id,
            student_email: submission.student_email,
            submitted_at: submission.submitted_at,
            answers: submission.answers,
            question_scores: submission.question_scores,
            question_feedback: submission.question_feedback,
            late_penalty_applied: submission.late_penalty_applied,
            attachments: submission.attachments,
            grade: submission.grade,
            final_grade: submission.final_grade,
            feedback: submission.feedback,
            regrade_request: submission.regrade_request,
            graded_at: submission.graded_at,
            status: submission.status
        };
        if (submission.id) payload.id = submission.id;

        const { data, error } = await supabaseClient
            .from('submissions')
            .upsert(payload, { onConflict: 'assignment_id,student_email' })
            .select();
        if (error) throw error;
        _cache.invalidate('submissions');
        return data?.[0];
    }

    static async deleteSubmission(assignmentId, studentEmail) {
        try {
            const sub = await this.getSubmission(assignmentId, studentEmail);
            if (sub && sub.answers) {
                for (const key in sub.answers) {
                    const val = sub.answers[key];
                    if (typeof val === 'string' && (val.includes('assignments/submissions') || val.includes('assignment_submissions'))) {
                        await this.deleteFileByUrl(val);
                    }
                }
            }
            if (sub && sub.attachments && Array.isArray(sub.attachments)) {
                for (const att of sub.attachments) {
                    if (att.url) await this.deleteFileByUrl(att.url);
                }
            }
        } catch (e) { console.warn('Failed to cleanup submission files:', e); }

        const { error } = await supabaseClient
            .from('submissions')
            .delete()
            .eq('assignment_id', assignmentId)
            .eq('student_email', studentEmail);
        if (error) throw error;
        _cache.invalidate('submissions');
    }

    // Enrollment operations
    static async getEnrollments(studentEmail) {
        return _cache.fetch(`enrollments_${studentEmail}`, async () => {
            const { data, count, error } = await supabaseClient
                .from('enrollments')
                .select('*', { count: 'exact' })
                .eq('student_email', studentEmail);
            if (error) throw error;
            return { data: data || [], total: count || 0 };
        });
    }

    static async saveEnrollment(enrollment) {
        const payload = {
            course_id: enrollment.course_id,
            student_email: enrollment.student_email,
            enrolled_at: enrollment.enrolled_at,
            progress: enrollment.progress,
            completed: enrollment.completed,
            completed_lessons: enrollment.completed_lessons
        };
        const { data, error } = await supabaseClient
            .from('enrollments')
            .upsert(payload, { onConflict: 'course_id,student_email' })
            .select();
        if (error) throw error;
        _cache.invalidate(`enrollments_${enrollment.student_email}`);
        return data?.[0];
    }

    static async enrollInCourse(courseId, studentEmail, enrollmentId = null) {
        const { error } = await supabaseClient.rpc('enroll_in_course', {
            p_course_id: courseId,
            p_student_email: studentEmail,
            p_enrollment_id: enrollmentId
        });
        if (error) throw error;
        _cache.invalidate(`enrollments_${studentEmail}`);
        _cache.invalidate(`enrolled_courses_${studentEmail}`);
    }

    static async deleteEnrollment(courseId, studentEmail) {
        // Thorough cleanup: Delete all related student history for this course
        try {
            const [{ data: assignments }, { data: quizzes }] = await Promise.all([
                this.getAssignments(null, courseId),
                this.getQuizzes(courseId)
            ]);

            const assignIds = assignments.map(a => a.id);
            const quizIds = quizzes.map(q => q.id);

            // Delete submissions (with storage cleanup)
            if (assignIds.length > 0) {
                for (const aid of assignIds) {
                    await this.deleteSubmission(aid, studentEmail);
                }
            }

            // Delete quiz submissions
            if (quizIds.length > 0) {
                await supabaseClient
                    .from('quiz_submissions')
                    .delete()
                    .eq('student_email', studentEmail)
                    .in('quiz_id', quizIds);
            }

            // Delete study sessions
            await supabaseClient
                .from('study_sessions')
                .delete()
                .match({ course_id: courseId, user_email: studentEmail });

            // Delete attendance
            const { data: liveClasses } = await this.getLiveClasses(courseId);
            const classIds = liveClasses.map(lc => lc.id);
            if (classIds.length > 0) {
                await supabaseClient
                    .from('attendance')
                    .delete()
                    .eq('student_email', studentEmail)
                    .in('live_class_id', classIds);
            }

            // Delete discussions
            await supabaseClient
                .from('discussions')
                .delete()
                .match({ course_id: courseId, user_email: studentEmail });

            // Delete violations
            await supabaseClient
                .from('violations')
                .delete()
                .match({ course_id: courseId, user_email: studentEmail });
        } catch (e) {
            console.warn('History cleanup during unenrollment partially failed:', e);
        }

        const { error } = await supabaseClient
            .from('enrollments')
            .delete()
            .match({ course_id: courseId, student_email: studentEmail });
        if (error) throw error;

        // Invalidate relevant caches
        _cache.invalidate(`enrollments_${studentEmail}`);
        _cache.invalidate(`enrolled_courses_${studentEmail}`);
        _cache.invalidate('submissions');
        _cache.invalidate('violations');
        _cache.invalidate('study_sessions');
        _cache.invalidate('attendance');
        _cache.invalidate(); // Broad invalidation for quizzes/discussions
    }

    static async markLessonComplete(courseId, studentEmail, lessonId) {
        const { data: enrollment, error: fetchError } = await supabaseClient
            .from('enrollments')
            .select('completed_lessons')
            .match({ course_id: courseId, student_email: studentEmail })
            .maybeSingle();

        if (fetchError) throw fetchError;

        let completed = enrollment?.completed_lessons || [];
        if (!completed.includes(lessonId)) {
            completed.push(lessonId);
            const { error: updateError } = await supabaseClient
                .from('enrollments')
                .update({ completed_lessons: completed })
                .match({ course_id: courseId, student_email: studentEmail });
            if (updateError) throw updateError;
            _cache.invalidate(`enrollments_${studentEmail}`);
            await this.updateCourseProgress(courseId, studentEmail);
        }
    }

    static async updateCourseProgress(courseId, studentEmail) {
        try {
            const [{ data: lessons }, { data: courseAssignments }, { data: courseQuizzes }, { data: submissions }, { data: quizSubs }] = await Promise.all([
                this.getLessons(courseId),
                this.getAssignments(null, courseId),
                this.getQuizzes(courseId),
                this.getSubmissions(null, studentEmail),
                this.getQuizSubmissions(null, studentEmail)
            ]);

            // Filter for published only as they count towards progress
            const activeAssignments = courseAssignments.filter(a => a.status === 'published');
            const activeQuizzes = courseQuizzes.filter(q => q.status === 'published');

            const totalItems = lessons.length + activeAssignments.length + activeQuizzes.length;
            if (totalItems === 0) return;

            let completedItems = 0;

            // Lessons: Use completed_lessons tracker
            const { data: enrollment } = await supabaseClient
                .from('enrollments')
                .select('completed_lessons')
                .match({ course_id: courseId, student_email: studentEmail })
                .maybeSingle();

            const completedLessonIds = enrollment?.completed_lessons || [];
            completedItems += lessons.filter(l => completedLessonIds.includes(l.id)).length;

            // Assignments
            activeAssignments.forEach(a => {
                if (submissions.some(s => s.assignment_id === a.id && (s.status === 'submitted' || s.status === 'graded'))) {
                    completedItems++;
                }
            });

            // Quizzes
            activeQuizzes.forEach(q => {
                if (quizSubs.some(s => s.quiz_id === q.id && s.status === 'submitted')) {
                    completedItems++;
                }
            });

            const progress = Math.min(100, Math.round((completedItems / totalItems) * 100));

            await supabaseClient
                .from('enrollments')
                .update({ progress: progress, completed: progress === 100 })
                .match({ course_id: courseId, student_email: studentEmail });

            _cache.invalidate(`enrollments_${studentEmail}`);
        } catch (e) {
            console.error('Failed to update progress:', e);
        }
    }

    // Course operations
    static async getCourses(teacherEmail = null, status = null, options = {}) {
        const { searchTerm = '' } = options;
        return this._request(async () => {
            let query = supabaseClient.from('courses').select('*', { count: 'exact' });
            if (teacherEmail) query = query.eq('teacher_email', teacherEmail);
            if (status) query = query.eq('status', status);
            if (searchTerm) query = query.ilike('title', `%${searchTerm}%`);

            const { data, count, error } = await query
                .order('title', { ascending: true });
            if (error) throw error;
            return { data: data || [], total: count || 0 };
        });
    }

    /**
     * Creates or updates a course record.
     */
    static async saveCourse(course) {
        // Sanitize payload to avoid 400 error from extra fields
        const payload = {
            title: course.title,
            description: course.description,
            teacher_email: course.teacher_email,
            created_by: course.created_by,
            enrollment_id: course.enrollment_id,
            status: course.status,
            metadata: course.metadata
        };
        if (course.id) payload.id = course.id;
        if (course.created_at) payload.created_at = course.created_at;

        const { data, error } = await supabaseClient
            .from('courses')
            .upsert(payload, { onConflict: 'id' })
            .select();
        if (error) throw error;
        _cache.invalidate('courses_all');
        if (course.teacher_email) _cache.invalidate(`courses_${course.teacher_email}`);
        return data?.[0];
    }

    static async deleteCourse(id) {
        try {
            const [{ data: materials }, { data: assignments }, { data: liveClasses }, certs] = await Promise.all([
                this.getMaterials(id),
                this.getAssignments(null, id),
                this.getLiveClasses(id),
                supabaseClient.from('certificates').select('certificate_url').eq('course_id', id)
            ]);

            // Recursive cleanup for all course content
            for (const m of materials) {
                await this.deleteMaterial(m.id);
            }

            for (const a of assignments) {
                await this.deleteAssignment(a.id);
            }

            for (const lc of liveClasses) {
                await this.deleteLiveClass(lc.id);
            }

            if (certs.data) {
                for (const cert of certs.data) {
                    if (cert.certificate_url) await this.deleteFileByUrl(cert.certificate_url);
                }
            }
        } catch (e) { console.warn('Course content cleanup failed:', e); }

        const { error } = await supabaseClient
            .from('courses')
            .delete()
            .eq('id', id);
        if (error) throw error;
        _cache.invalidate(); // Broad invalidation to be safe
    }

    // Topic operations
    static async getTopics(courseId) {
        return this._request(async () => {
            const { data, count, error } = await supabaseClient
                .from('topics')
                .select('*', { count: 'exact' })
                .eq('course_id', courseId)
                .order('order_index', { ascending: true });
            if (error) throw error;
            return { data: data || [], total: count || 0 };
        });
    }

    static async saveTopic(topic) {
        const payload = {
            course_id: topic.course_id,
            teacher_email: topic.teacher_email,
            title: topic.title,
            description: topic.description,
            order_index: topic.order_index
        };
        if (topic.id) payload.id = topic.id;
        const { data, error } = await supabaseClient
            .from('topics')
            .upsert(payload, { onConflict: 'id' })
            .select();
        if (error) throw error;
        _cache.invalidate('lessons'); // Invalidate lessons cache as they are related to topics
        return data?.[0];
    }

    static async deleteTopic(id) {
        const { error } = await supabaseClient
            .from('topics')
            .delete()
            .eq('id', id);
        if (error) throw error;
        _cache.invalidate('lessons');
    }

    // Lesson operations
    static async getLessons(courseId) {
        return this._request(async () => {
            const { data, count, error } = await supabaseClient
                .from('lessons')
                .select('*', { count: 'exact' })
                .eq('course_id', courseId)
                .order('order_index', { ascending: true });
            if (error) throw error;
            return { data: data || [], total: count || 0 };
        });
    }

    static async saveLesson(lesson) {
        const payload = {
            course_id: lesson.course_id,
            topic_id: lesson.topic_id,
            title: lesson.title,
            content: lesson.content,
            video_url: lesson.video_url,
            order_index: lesson.order_index
        };
        if (lesson.id) payload.id = lesson.id;
        if (lesson.created_at) payload.created_at = lesson.created_at;

        const { data, error } = await supabaseClient
            .from('lessons')
            .upsert(payload, { onConflict: 'id' })
            .select();
        if (error) throw error;
        return data?.[0];
    }

    static async deleteLesson(id) {
        const { error } = await supabaseClient
            .from('lessons')
            .delete()
            .eq('id', id);
        if (error) throw error;
        _cache.invalidate('lessons');
    }

    // Discussion operations
    static async getMaterials(courseId = null, courseIds = null, options = {}) {
        if (courseIds && courseIds.length === 0) return { data: [], total: 0 };
        return this._request(async () => {
            let query = supabaseClient.from('materials').select('*', { count: 'exact' });
            if (courseId) query = query.eq('course_id', courseId);
            if (courseIds && courseIds.length > 0) query = query.in('course_id', courseIds);

            const { data, count, error } = await query
                .order('created_at', { ascending: false });
            if (error) throw error;
            return { data: data || [], total: count || 0 };
        });
    }

    static async saveMaterial(material) {
        const payload = {
            course_id: material.course_id,
            teacher_email: material.teacher_email,
            title: material.title,
            description: material.description,
            file_url: material.file_url,
            file_type: material.file_type
        };
        if (material.id) payload.id = material.id;
        const { data, error } = await supabaseClient
            .from('materials')
            .upsert(payload, { onConflict: 'id' })
            .select();
        if (error) throw error;
        _cache.invalidate('lessons');
        return data?.[0];
    }

    static async deleteMaterial(id) {
        try {
            const { data: material } = await supabaseClient.from('materials').select('file_url').eq('id', id).single();
            if (material && material.file_url) {
                await this.deleteFileByUrl(material.file_url);
            }
        } catch (e) { console.warn('Failed to cleanup material file:', e); }

        const { error } = await supabaseClient
            .from('materials')
            .delete()
            .eq('id', id);
        if (error) throw error;
    }

    // Discussion operations
    static async getDiscussions(courseId, options = {}) {
        return this._request(async () => {
            const { data, count, error } = await supabaseClient
                .from('discussions')
                .select('*', { count: 'exact' })
                .eq('course_id', courseId)
                .order('created_at', { ascending: true });
            if (error) throw error;
            return { data: data || [], total: count || 0 };
        });
    }

    static async saveDiscussion(discussion) {
        const payload = {
            course_id: discussion.course_id,
            user_email: discussion.user_email,
            parent_id: discussion.parent_id,
            title: discussion.title,
            content: discussion.content
        };
        if (discussion.id) payload.id = discussion.id;
        if (discussion.created_at) payload.created_at = discussion.created_at;

        const { data, error } = await supabaseClient
            .from('discussions')
            .upsert(payload, { onConflict: 'id' })
            .select();
        if (error) throw error;
        _cache.invalidate('materials');
        return data?.[0];
    }

    // Quiz operations
    static async getQuizzes(courseId = null, teacherEmail = null, courseIds = null, options = {}) {
        if (courseIds && courseIds.length === 0) return { data: [], total: 0 };
        const { searchTerm = '' } = options;

        return this._request(async () => {
            let query = supabaseClient.from('quizzes').select('*', { count: 'exact' });
            if (courseId) query = query.eq('course_id', courseId);
            if (teacherEmail) query = query.eq('teacher_email', teacherEmail);
            if (courseIds && courseIds.length > 0) query = query.in('course_id', courseIds);
            if (searchTerm) query = query.ilike('title', `%${searchTerm}%`);

            const { data, count, error } = await query
                .order('created_at', { ascending: false });
            if (error) throw error;
            return { data: data || [], total: count || 0 };
        });
    }

    static async getQuiz(id) {
        return this._request(async () => {
            const { data, error } = await supabaseClient
                .from('quizzes')
                .select('*')
                .eq('id', id)
                .single();
            if (error) throw error;
            return data;
        });
    }

    static async saveQuiz(quiz) {
        // Sanitize payload to avoid 400 error from extra fields
        const payload = {
            course_id: quiz.course_id,
            teacher_email: quiz.teacher_email,
            title: quiz.title,
            description: quiz.description,
            time_limit: quiz.time_limit,
            start_at: quiz.start_at,
            end_at: quiz.end_at,
            attempts_allowed: quiz.attempts_allowed,
            passing_score: quiz.passing_score,
            questions: quiz.questions,
            shuffle_questions: quiz.shuffle_questions,
            status: quiz.status,
            anti_cheat_config: quiz.anti_cheat_config
        };
        if (quiz.id) payload.id = quiz.id;
        if (quiz.created_at) payload.created_at = quiz.created_at;

        const { data, error } = await supabaseClient
            .from('quizzes')
            .upsert(payload, { onConflict: 'id' })
            .select();
        if (error) throw error;
        _cache.invalidate(); // Quizzes have complex keys, simpler to clear all
        return data?.[0];
    }

    static async deleteQuiz(id) {
        const { error } = await supabaseClient
            .from('quizzes')
            .delete()
            .eq('id', id);
        if (error) throw error;
        _cache.invalidate('materials');
    }

    static async getQuizSubmissions(quizId = null, studentEmail = null, teacherEmail = null, options = {}) {
        const { status = null } = options;
        return this._request(async () => {
            let query = supabaseClient.from('quiz_submissions').select('*, quizzes!quiz_id(*)', { count: 'exact' });
            if (quizId) query = query.eq('quiz_id', quizId);
            if (studentEmail) query = query.eq('student_email', studentEmail);
            if (teacherEmail) query = query.eq('quizzes.teacher_email', teacherEmail);
            if (status) query = query.eq('status', status);

            const { data, count, error } = await query
                .order('started_at', { ascending: false });
            if (error) throw error;
            return { data: data || [], total: count || 0 };
        });
    }

    static async saveQuizSubmission(submission) {
        // Sanitize payload to avoid 400 error from extra fields
        const payload = {
            quiz_id: submission.quiz_id,
            student_email: submission.student_email,
            attempt_number: submission.attempt_number,
            score: submission.score,
            total_points: submission.total_points,
            answers: submission.answers,
            analytics: submission.analytics,
            status: submission.status,
            time_spent: submission.time_spent,
            started_at: submission.started_at,
            submitted_at: submission.submitted_at
        };
        // Only include ID if it is a valid UUID/truthy
        if (submission.id) payload.id = submission.id;

        const { data, error } = await supabaseClient
            .from('quiz_submissions')
            .upsert(payload, { onConflict: 'id' })
            .select();
        if (error) throw error;
        return data?.[0];
    }

    static async getQuizSubmissionById(id) {
        return this._request(async () => {
            const { data, error } = await supabaseClient
                .from('quiz_submissions')
                .select('*')
                .eq('id', id)
                .single();
            if (error) throw error;
            return data;
        });
    }

    static async authenticateUser(email, passwordHash, sessionId) {
        const { data, error } = await supabaseClient.rpc('authenticate_user', {
            p_email: email,
            p_password_hash: passwordHash,
            p_session_id: sessionId
        });
        if (error) throw error;
        return data;
    }

    static async invokeFunction(name, payload) {
        const { data, error } = await supabaseClient.functions.invoke(name, {
            body: payload
        });
        if (error) throw error;
        return data;
    }

    // Notification operations
    static async createNotification(userEmail, title, message, link = null, type = 'system') {
        const { data, error } = await supabaseClient
            .from('notifications')
            .insert([{ user_email: userEmail, title, message, link, type }])
            .select();
        if (error) throw error;
        _cache.invalidate(`notifications_${userEmail}`);
        return data?.[0];
    }

    static async getNotifications(userEmail, options = {}) {
        return _cache.fetch(`notifications_${userEmail}`, async () => {
            return this._request(async () => {
                const { data, count, error } = await supabaseClient
                    .from('notifications')
                    .select('*', { count: 'exact' })
                    .eq('user_email', userEmail)
                    .order('created_at', { ascending: false });
                if (error) throw error;
                return { data: data || [], total: count || 0 };
            });
        });
    }

    static async getBroadcasts(options = {}) {
        return _cache.fetch(`broadcasts_active`, async () => {
            return this._request(async () => {
                const { data, count, error } = await supabaseClient
                    .from('broadcasts')
                    .select('*', { count: 'exact' })
                    .gt('expires_at', new Date().toISOString())
                    .order('created_at', { ascending: false });
                if (error) throw error;
                return { data: data || [], total: count || 0 };
            });
        });
    }

    static async deleteExpiredBroadcasts() {
        const { error } = await supabaseClient
            .from('broadcasts')
            .delete()
            .lt('expires_at', new Date().toISOString());
        if (error) throw error;
    }

    static async saveBroadcast(broadcast) {
        const payload = {
            course_id: broadcast.course_id,
            target_role: broadcast.target_role,
            title: broadcast.title,
            message: broadcast.message,
            link: broadcast.link,
            type: broadcast.type,
            expires_at: broadcast.expires_at,
            created_at: broadcast.created_at || new Date().toISOString()
        };
        if (broadcast.id) payload.id = broadcast.id;
        const { data, error } = await supabaseClient
            .from('broadcasts')
            .upsert(payload, { onConflict: 'id' })
            .select();
        if (error) throw error;
        _cache.invalidate('broadcasts_active');
        return data?.[0];
    }

    static async markNotificationsAsRead(userEmail, id = null) {
        const query = supabaseClient
            .from('notifications')
            .update({ is_read: true })
            .eq('user_email', userEmail);

        if (id) {
            query.eq('id', id);
        } else {
            query.eq('is_read', false);
        }

        const { error } = await query;
        if (error) throw error;
        _cache.invalidate(`notifications_${userEmail}`);
        _cache.invalidate('notifications');
    }

    static async deleteNotifications(userEmail) {
        const { error } = await supabaseClient
            .from('notifications')
            .delete()
            .eq('user_email', userEmail);
        if (error) throw error;
        _cache.invalidate(`notifications_${userEmail}`);
    }

    static async invalidateCache(key = null) {
        _cache.invalidate(key);
    }

    // Certificate operations
    static async issueCertificate(certificate) {
        const payload = {
            course_id: certificate.course_id,
            student_email: certificate.student_email,
            issued_at: certificate.issued_at,
            certificate_url: certificate.certificate_url,
            metadata: certificate.metadata
        };
        if (certificate.id) payload.id = certificate.id;
        const { data, error } = await supabaseClient
            .from('certificates')
            .upsert(payload, { onConflict: 'id' })
            .select();
        if (error) throw error;
        _cache.invalidate('certificates');
        return data?.[0];
    }

    static async getCertificates(studentEmail, options = {}) {
        return this._request(async () => {
            const { data, count, error } = await supabaseClient
                .from('certificates')
                .select('*, courses(*)', { count: 'exact' })
                .eq('student_email', studentEmail);
            if (error) throw error;
            return { data: data || [], total: count || 0 };
        });
    }

    // Planner operations
    static async getPlannerItems(email, options = {}) {
        return this._request(async () => {
            const { data, count, error } = await supabaseClient
                .from('planner')
                .select('*', { count: 'exact' })
                .eq('user_email', email)
                .order('due_date', { ascending: true });
            if (error) throw error;
            return { data: data || [], total: count || 0 };
        });
    }

    static async savePlannerItem(item) {
        const payload = {
            user_email: item.user_email,
            title: item.title,
            description: item.description,
            due_date: item.due_date,
            priority: item.priority,
            completed: item.completed,
            created_at: item.created_at || new Date().toISOString()
        };
        if (item.id) payload.id = item.id;
        const { data, error } = await supabaseClient
            .from('planner')
            .upsert(payload, { onConflict: 'id' })
            .select();
        if (error) throw error;
        _cache.invalidate('planner');
        return data?.[0];
    }

    static async deletePlannerItem(id) {
        const { error } = await supabaseClient
            .from('planner')
            .delete()
            .eq('id', id);
        if (error) throw error;
        _cache.invalidate('planner');
    }

    // Backup helper
    static async getAllTableData(table) {
        return this._request(async () => {
            const { data, error } = await supabaseClient
                .from(table)
                .select('*')
                .order('created_at', { ascending: true, nullsFirst: true });
            if (error) throw error;
            return data || [];
        });
    }

    // Study session operations
    static async saveStudySession(session) {
        const payload = {
            user_email: session.user_email,
            course_id: session.course_id,
            duration: session.duration,
            started_at: session.started_at,
            ended_at: session.ended_at
        };
        if (session.id) payload.id = session.id;
        const { data, error } = await supabaseClient
            .from('study_sessions')
            .upsert(payload, { onConflict: 'id' })
            .select();
        if (error) throw error;
        _cache.invalidate('study_sessions');
        return data?.[0];
    }

    static async getStudySessions(email, options = {}) {
        return this._request(async () => {
            const { data, count, error } = await supabaseClient
                .from('study_sessions')
                .select('*', { count: 'exact' })
                .eq('user_email', email)
                .order('started_at', { ascending: false });
            if (error) throw error;
            return { data: data || [], total: count || 0 };
        });
    }

    // Live Class operations
    static async getLiveClasses(courseId = null, teacherEmail = null, courseIds = null, options = {}) {
        if (courseIds && courseIds.length === 0) return { data: [], total: 0 };
        return this._request(async () => {
            let query = supabaseClient.from('live_classes').select('*', { count: 'exact' });
            if (courseId) query = query.eq('course_id', courseId);
            if (teacherEmail) query = query.eq('teacher_email', teacherEmail);
            if (courseIds && courseIds.length > 0) query = query.in('course_id', courseIds);

            const { data, count, error } = await query
                .order('start_at', { ascending: true });
            if (error) throw error;
            return { data: data || [], total: count || 0 };
        });
    }

    static async getLiveClass(id) {
        const { data, error } = await supabaseClient
            .from('live_classes')
            .select('*')
            .eq('id', id)
            .single();
        if (error && error.code !== 'PGRST116') throw error;
        return data;
    }

    static async saveLiveClass(liveClass) {
        // Sanitize payload
        const payload = {
            course_id: liveClass.course_id,
            teacher_email: liveClass.teacher_email,
            title: liveClass.title,
            description: liveClass.description,
            start_at: liveClass.start_at,
            end_at: liveClass.end_at,
            room_name: liveClass.room_name,
            meeting_url: liveClass.meeting_url,
            recording_url: liveClass.recording_url,
            recurring_config: liveClass.recurring_config,
            metadata: liveClass.metadata,
            status: liveClass.status,
            actual_end_at: liveClass.actual_end_at
        };
        if (liveClass.id) payload.id = liveClass.id;

        const { data, error } = await supabaseClient
            .from('live_classes')
            .upsert(payload, { onConflict: 'id' })
            .select();
        if (error) throw error;
        _cache.invalidate('live_classes');
        return data?.[0];
    }

    static async deleteLiveClass(id) {
        try {
            const lc = await this.getLiveClass(id);
            if (lc && lc.recording_url) {
                await this.deleteFileByUrl(lc.recording_url);
            }
        } catch (e) { console.warn('Failed to cleanup live class recording:', e); }

        const { error } = await supabaseClient
            .from('live_classes')
            .delete()
            .eq('id', id);
        if (error) throw error;
        _cache.invalidate('live_classes');
    }

    static async saveAttendance(attendance) {
        const payload = {
            live_class_id: attendance.live_class_id,
            student_email: attendance.student_email,
            join_time: attendance.join_time,
            leave_time: attendance.leave_time,
            duration: attendance.duration,
            is_present: attendance.is_present,
            created_at: attendance.created_at || new Date().toISOString()
        };
        if (attendance.id) payload.id = attendance.id;
        const { data, error } = await supabaseClient
            .from('attendance')
            .upsert(payload, { onConflict: 'live_class_id,student_email' })
            .select();
        if (error) throw error;
        _cache.invalidate('attendance');
        return data?.[0];
    }

    static async getAttendance(classId, studentEmail = null, options = {}) {
        return this._request(async () => {
            let query = supabaseClient
                .from('attendance')
                .select('*', { count: 'exact' })
                .eq('live_class_id', classId);
            if (studentEmail) query = query.eq('student_email', studentEmail);

            const { data, count, error } = await query
                .order('join_time', { ascending: true });
            if (error) throw error;
            return { data: data || [], total: count || 0 };
        });
    }

    // Maintenance operations
    static async getMaintenance(bypassCache = false) {
        if (bypassCache) _cache.invalidate('maintenance');
        return _cache.fetch('maintenance', async () => {
            return this._request(async () => {
                const { data, error } = await supabaseClient
                    .from('maintenance')
                    .select('*')
                    .maybeSingle();
                if (error && error.code !== 'PGRST116') throw error;
                return data || { enabled: false, schedules: [] };
            });
        });
    }

    static async saveMaintenance(maintenance) {
        const payload = {
            enabled: maintenance.enabled,
            manual_until: maintenance.manual_until,
            message: maintenance.message,
            schedules: maintenance.schedules
        };
        if (maintenance.id) payload.id = maintenance.id;
        if (maintenance.created_at) payload.created_at = maintenance.created_at;

        const { data, error } = await supabaseClient
            .from('maintenance')
            .upsert(payload, { onConflict: 'id' })
            .select();
        if (error) throw error;
        _cache.invalidate('maintenance');
        return data?.[0];
    }

    // Invite operations
    static async saveInvite(invite) {
        const payload = {
            token: invite.token,
            email: invite.email,
            role: invite.role,
            expires_at: invite.expires_at,
            used_at: invite.used_at,
            created_by: invite.created_by,
            created_at: invite.created_at || new Date().toISOString()
        };
        if (invite.id) payload.id = invite.id;
        const { data, error } = await supabaseClient
            .from('invites')
            .upsert(payload, { onConflict: 'token' })
            .select();
        if (error) throw error;
        _cache.invalidate('invites');
        return data?.[0];
    }

    static async getInvite(token) {
        const { data, error } = await supabaseClient
            .from('invites')
            .select('*')
            .eq('token', token)
            .maybeSingle();
        if (error) throw error;
        return data;
    }

    static async markInviteUsed(token) {
        const { error } = await supabaseClient
            .from('invites')
            .update({ used_at: new Date().toISOString() })
            .eq('token', token);
        if (error) throw error;
        _cache.invalidate('invites');
    }

    static async deleteInvite(token) {
        const { error } = await supabaseClient
            .from('invites')
            .delete()
            .eq('token', token);
        if (error) throw error;
        _cache.invalidate('invites');
    }

    // Support Ticket operations
    static async saveSupportTicket(ticket) {
        const payload = {
            user_email: ticket.user_email,
            role: ticket.role,
            subject: ticket.subject,
            message: ticket.message,
            status: ticket.status || 'open',
            resolution_notes: ticket.resolution_notes || null
        };

        if (ticket.id) {
            // Update existing ticket (Admin action)
            const { data, error } = await supabaseClient
                .from('support_tickets')
                .update(payload)
                .eq('id', ticket.id)
                .select();
            if (error) throw error;
            _cache.invalidate('support_tickets');
            return data?.[0];
        } else {
            // Create new ticket (Student/Teacher action)
            // Use insert instead of upsert to avoid unauthorized 401 error on SELECT/ON CONFLICT check caused by strict RLS
            const { data, error } = await supabaseClient
                .from('support_tickets')
                .insert([payload])
                .select();
            if (error) throw error;
            _cache.invalidate('support_tickets');
            return data?.[0];
        }
    }


    static async getSupportTickets(userEmail = null) {
        return this._request(async () => {
            let query = supabaseClient.from('support_tickets').select('*', { count: 'exact' });
            if (userEmail) query = query.eq('user_email', userEmail);

            const { data, count, error } = await query
                .order('created_at', { ascending: false });
            if (error) throw error;
            return { data: data || [], total: count || 0 };
        });
    }

    // Violation operations
    static async saveViolation(violation) {
        return this._request(async () => {
            const payload = {
                user_email: violation.user_email,
                assessment_id: violation.assessment_id,
                assessment_type: violation.assessment_type,
                type: violation.type,
                browser: violation.browser || 'Unknown',
                device: violation.device || 'Unknown',
                os: violation.os || 'Unknown',
                elapsed_time: violation.elapsed_time || 0,
                score: violation.score || 0,
                severity: violation.severity || 'LOW',
                metadata: violation.metadata || {},
                timestamp: violation.timestamp || new Date().toISOString()
            };
            const { data, error } = await supabaseClient
                .from('violations')
                .insert([payload])
                .select();
            if (error) throw error;
            _cache.invalidate('violations');
            return data?.[0];
        });
    }

    static async getViolations(assessmentId = null, userEmail = null, teacherEmail = null, options = {}) {
        return this._request(async () => {
            if (teacherEmail) {
                // Get teacher's course IDs first
                const { data: courses } = await this.getCourses(teacherEmail, null);
                const courseIds = (courses || []).map(c => c.id);
                if (courseIds.length === 0) return { data: [], total: 0 };

                // Get assignments and quizzes for these courses
                const [{ data: assigns }, { data: quizzes }] = await Promise.all([
                    this.getAssignments(null, null, courseIds),
                    this.getQuizzes(null, null, courseIds)
                ]);
                const assessmentIds = [...(assigns || []).map(a => a.id), ...(quizzes || []).map(q => q.id)];
                if (assessmentIds.length === 0) return { data: [], total: 0 };

                const { data, count, error } = await supabaseClient
                    .from('violations')
                    .select('*', { count: 'exact' })
                    .in('assessment_id', assessmentIds)
                    .order('timestamp', { ascending: false });
                if (error) throw error;
                return { data: data || [], total: count || 0 };
            }

            let query = supabaseClient.from('violations').select('*', { count: 'exact' });
            if (assessmentId) query = query.eq('assessment_id', assessmentId);
            if (userEmail) query = query.eq('user_email', userEmail);

            const { data, count, error } = await query
                .order('timestamp', { ascending: false });
            if (error) throw error;
            return { data: data || [], total: count || 0 };
        });
    }

    static async deleteViolations(assessmentId = null, userEmail = null) {
        return this._request(async () => {
            let filters = {};
            if (assessmentId) filters.assessment_id = assessmentId;
            if (userEmail) filters.user_email = userEmail;

            // Security: Add teacher filter if current user is teacher to ensure RLS compliance and safety
            try {
                const currentUser = await SessionManager.getCurrentUser();
                if (currentUser?.role === 'teacher') {
                    filters.teacher_email = currentUser.email;
                }
            } catch(e) {}

            const { error } = await supabaseClient
                .from('violations')
                .delete()
                .match(filters);

            if (error) throw error;
            _cache.invalidate('violations');
        });
    }

    static async getStudentViolationSummary(studentEmail) {
        const { data: violations, error } = await supabaseClient
            .from('violations')
            .select('assessment_id, assessment_type, type, severity, score')
            .eq('user_email', studentEmail);

        if (error) throw error;

        const assessmentIds = [...new Set((violations || []).map(v => v.assessment_id))];
        if (assessmentIds.length === 0) return { data: [], total: 0 };

        const [{ data: assigns }, { data: quizzes }] = await Promise.all([
            supabaseClient.from('assignments').select('id, title').in('id', assessmentIds),
            supabaseClient.from('quizzes').select('id, title').in('id', assessmentIds)
        ]);

        const summaryMap = {};
        (violations || []).forEach(v => {
            const key = v.assessment_id;
            if (!summaryMap[key]) {
                const assessment = [...(assigns || []), ...(quizzes || [])].find(a => a.id === key);
                summaryMap[key] = {
                    id: key,
                    title: assessment?.title || 'Unknown Assessment',
                    type: v.assessment_type,
                    violationCount: 0,
                    totalScore: 0,
                    criticalCount: 0
                };
            }
            summaryMap[key].violationCount++;
            summaryMap[key].totalScore += (v.score || 0);
            if (v.severity === 'CRITICAL') summaryMap[key].criticalCount++;
        });

        const result = Object.values(summaryMap);
        return { data: result, total: result.length };
    }

    static async getViolationSummary(teacherEmail) {
        const { data: courses } = await this.getCourses(teacherEmail, null);
        const courseIds = (courses || []).map(c => c.id);
        if (courseIds.length === 0) return { data: [], total: 0 };

        const [{ data: assigns }, { data: quizzes }] = await Promise.all([
            this.getAssignments(null, null, courseIds),
            this.getQuizzes(null, null, courseIds)
        ]);
        const assessmentIds = [...(assigns || []).map(a => a.id), ...(quizzes || []).map(q => q.id)];
        if (assessmentIds.length === 0) return { data: [], total: 0 };

        // PostgREST doesn't support complex aggregation well, so we fetch and aggregate in JS for now
        // This is safe for thousands of records as it's just the violations table
        const { data, error } = await supabaseClient
            .from('violations')
            .select('assessment_id, assessment_type, user_email, type, severity, score')
            .in('assessment_id', assessmentIds);

        if (error) throw error;

        const summaryMap = {};
        (data || []).forEach(v => {
            const key = v.assessment_id;
            if (!summaryMap[key]) {
                const assessment = [...(assigns || []), ...(quizzes || [])].find(a => a.id === key);
                summaryMap[key] = {
                    id: key,
                    title: assessment?.title || 'Unknown',
                    type: v.assessment_type,
                    violationCount: 0,
                    studentCount: new Set(),
                    totalScore: 0,
                    criticalCount: 0
                };
            }
            summaryMap[key].violationCount++;
            summaryMap[key].studentCount.add(v.user_email);
            summaryMap[key].totalScore += (v.score || 0);
            if (v.severity === 'CRITICAL') summaryMap[key].criticalCount++;
        });

        const result = Object.values(summaryMap).map(s => ({
            ...s,
            studentCount: s.studentCount.size
        }));

        return { data: result, total: result.length };
    }

    // Storage operations
    static async uploadFile(bucket, path, file) {
        const { data, error } = await supabaseClient.storage
            .from(bucket)
            .upload(path, file, { upsert: true });
        if (error) throw error;
        return data;
    }

    static async getPublicUrl(bucket, path) {
        const { data } = supabaseClient.storage
            .from(bucket)
            .getPublicUrl(path);
        return data.publicUrl;
    }

    static async deleteFile(bucket, path) {
        const { error } = await supabaseClient.storage
            .from(bucket)
            .remove([path]);
        if (error) throw error;
    }

    static async deleteFileByUrl(url) {
        if (!url) return;
        try {
            // URL format: https://[project].supabase.co/storage/v1/object/public/[bucket]/[path]
            const parts = url.split('/storage/v1/object/public/');
            if (parts.length < 2) return;
            const pathParts = parts[1].split('/');
            const bucket = pathParts.shift();
            const path = pathParts.join('/');
            if (bucket && path) {
                await this.deleteFile(bucket, path);
            }
        } catch (e) {
            console.warn('Failed to parse and delete file from URL:', url, e);
        }
    }
}

// Session management
class SessionManager {
    static async setCurrentUser(user) {
        sessionStorage.setItem('currentUser', JSON.stringify(user));
    }

    static async getCurrentUser() {
        const raw = sessionStorage.getItem('currentUser');
        return raw ? JSON.parse(raw) : null;
    }

    static async clearCurrentUser(reason = null) {
        const user = await this.getCurrentUser();
        if (reason && user) {
            try {
                // Optimization: Use locally available user data and avoid redundant getUser/saveUser overhead
                const newMetadata = { ...(user.metadata || {}), last_invalidation_reason: reason };
                const newSid = 'invalidated_' + Date.now() + '_' + reason;

                // Update server-side session state in parallel to minimize network delay
                await SupabaseDB._request(async () => {
                    await Promise.all([
                        supabaseClient.from('users').update({ metadata: newMetadata }).eq('email', user.email),
                        supabaseClient.rpc('update_user_secret_secure', {
                            p_email: user.email,
                            p_session_id: newSid
                        })
                    ]);
                });
            } catch (e) {
                console.warn('Failed to set invalidation reason on server:', e);
            }
        }

        sessionStorage.removeItem('currentUser');
        sessionStorage.removeItem('sessionId');
        // Reset the internal guard to allow re-initialization on next login
        if (typeof _lastSessionId !== 'undefined') {
            _lastSessionId = null;
        }
        if (typeof window.setSupabaseSession === 'function') {
            window.setSupabaseSession(null);
        }
        // Purge memory cache to ensure no data leaks to the next session
        if (typeof SupabaseDB !== 'undefined' && SupabaseDB.invalidateCache) {
            SupabaseDB.invalidateCache();
        }
    }

    static getSessionId(force = false) {
        if (force) {
            sessionStorage.removeItem('sessionId');
        }
        let sid = sessionStorage.getItem('sessionId');
        if (!sid) {
            sid = 's_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
            sessionStorage.setItem('sessionId', sid);
        }
        return sid;
    }
}

window.SupabaseDB = SupabaseDB;
window.SessionManager = SessionManager;
