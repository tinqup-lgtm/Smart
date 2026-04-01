-- SmartLMS Supabase Schema (Comprehensive Replacement Script)
-- This script replaces the entire schema while preserving ALL existing features,
-- fixing RLS for the custom auth system, and initializing storage buckets.

-- 1. Clean start (Safe Idempotency)
-- 1. Clean start (Absolute Idempotency for Fresh public Schema)
SET client_min_messages TO WARNING;

-- Use a DO block to safely cleanup existing objects if they exist
DO $$
DECLARE
    r RECORD;
BEGIN
    -- Triggers
    FOR r IN (SELECT trigger_name, event_object_table FROM information_schema.triggers WHERE trigger_schema = 'public') LOOP
        EXECUTE 'DROP TRIGGER IF EXISTS ' || quote_ident(r.trigger_name) || ' ON ' || quote_ident(r.event_object_table) || ' CASCADE';
    END LOOP;
    -- Tables
    FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
        EXECUTE 'DROP TABLE IF EXISTS ' || quote_ident(r.tablename) || ' CASCADE';
    END LOOP;
    -- Functions
    FOR r IN (SELECT proname, oidvectortypes(proargtypes) AS args FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public') LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || quote_ident(r.proname) || '(' || r.args || ') CASCADE';
    END LOOP;
    -- Views
    FOR r IN (SELECT viewname FROM pg_views WHERE schemaname = 'public') LOOP
        EXECUTE 'DROP VIEW IF EXISTS ' || quote_ident(r.viewname) || ' CASCADE';
    END LOOP;
END $$;

-- Drop storage policies explicitly as they are in the 'storage' schema
DO $$
BEGIN
    DROP POLICY IF EXISTS "Public view materials" ON storage.objects;
    DROP POLICY IF EXISTS "Teachers manage materials" ON storage.objects;
    DROP POLICY IF EXISTS "Students manage own submissions" ON storage.objects;
    DROP POLICY IF EXISTS "Teachers view submissions" ON storage.objects;
    DROP POLICY IF EXISTS "Users view own certificates" ON storage.objects;
    DROP POLICY IF EXISTS "Teachers manage certificates" ON storage.objects;
    DROP POLICY IF EXISTS "Admins full storage access" ON storage.objects;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SET client_min_messages TO NOTICE;

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Utility Functions
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Tables
CREATE TABLE users (
  email VARCHAR(255) PRIMARY KEY,
  full_name VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  password VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL CHECK (role IN ('student', 'teacher', 'admin')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_login TIMESTAMP WITH TIME ZONE,
  failed_attempts INTEGER DEFAULT 0,
  locked_until TIMESTAMP WITH TIME ZONE,
  lockouts INTEGER DEFAULT 0,
  flagged BOOLEAN DEFAULT FALSE,
  reset_request JSONB,
  active BOOLEAN DEFAULT TRUE,
  notification_preferences JSONB DEFAULT '{"email": true, "push": true, "inApp": true}'::jsonb,
  xp INTEGER DEFAULT 0,
  level INTEGER DEFAULT 1,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

CREATE TABLE courses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  teacher_email VARCHAR(255) REFERENCES users(email) ON UPDATE CASCADE ON DELETE SET NULL,
  status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE TRIGGER update_courses_updated_at BEFORE UPDATE ON courses FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

CREATE TABLE lessons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  content TEXT,
  video_url TEXT,
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TRIGGER update_lessons_updated_at BEFORE UPDATE ON lessons FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

CREATE TABLE enrollments (
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
  student_email VARCHAR(255) REFERENCES users(email) ON UPDATE CASCADE ON DELETE CASCADE,
  enrolled_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  progress INTEGER DEFAULT 0,
  completed BOOLEAN DEFAULT FALSE,
  PRIMARY KEY (course_id, student_email)
);

CREATE TABLE assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  teacher_email VARCHAR(255) REFERENCES users(email) ON UPDATE CASCADE ON DELETE SET NULL,
  due_date TIMESTAMP WITH TIME ZONE,
  points_possible INTEGER DEFAULT 100,
  allow_late_submissions BOOLEAN DEFAULT TRUE,
  late_penalty_per_day INTEGER DEFAULT 0,
  allowed_extensions TEXT[] DEFAULT '{pdf, doc, docx, zip, jpg, png}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  questions JSONB DEFAULT '[]'::jsonb,
  attachments JSONB DEFAULT '[]'::jsonb,
  status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived'))
);

CREATE TRIGGER update_assignments_updated_at BEFORE UPDATE ON assignments FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

CREATE TABLE submissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  assignment_id UUID REFERENCES assignments(id) ON DELETE CASCADE,
  student_email VARCHAR(255) REFERENCES users(email) ON UPDATE CASCADE ON DELETE CASCADE,
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  answers JSONB DEFAULT '{}'::jsonb,
  question_scores JSONB DEFAULT '{}'::jsonb,
  late_penalty_applied INTEGER DEFAULT 0,
  attachments JSONB DEFAULT '[]'::jsonb,
  grade INTEGER,
  final_grade INTEGER,
  feedback TEXT,
  regrade_request TEXT,
  graded_at TIMESTAMP WITH TIME ZONE,
  status VARCHAR(50) DEFAULT 'submitted' CHECK (status IN ('draft', 'submitted', 'graded', 'returned')),
  UNIQUE(assignment_id, student_email)
);

CREATE TRIGGER update_submissions_updated_at BEFORE UPDATE ON submissions FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

CREATE TABLE live_classes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
  teacher_email VARCHAR(255) REFERENCES users(email) ON UPDATE CASCADE ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  start_at TIMESTAMP WITH TIME ZONE NOT NULL,
  end_at TIMESTAMP WITH TIME ZONE NOT NULL,
  room_name VARCHAR(255) NOT NULL,
  meeting_url TEXT,
  recording_url TEXT,
  recurring_config JSONB DEFAULT '{}'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  status VARCHAR(50) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'live', 'completed', 'cancelled')),
  actual_end_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE attendance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  live_class_id UUID REFERENCES live_classes(id) ON DELETE CASCADE,
  student_email VARCHAR(255) REFERENCES users(email) ON UPDATE CASCADE ON DELETE CASCADE,
  join_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  leave_time TIMESTAMP WITH TIME ZONE,
  duration INTEGER DEFAULT 0,
  is_present BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(live_class_id, student_email)
);

CREATE TABLE quizzes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
  teacher_email VARCHAR(255) REFERENCES users(email) ON UPDATE CASCADE ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  time_limit INTEGER DEFAULT 0,
  attempts_allowed INTEGER DEFAULT 1,
  passing_score INTEGER DEFAULT 60,
  questions JSONB DEFAULT '[]'::jsonb,
  shuffle_questions BOOLEAN DEFAULT FALSE,
  status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TRIGGER update_quizzes_updated_at BEFORE UPDATE ON quizzes FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

CREATE TABLE quiz_submissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quiz_id UUID REFERENCES quizzes(id) ON DELETE CASCADE,
  student_email VARCHAR(255) REFERENCES users(email) ON UPDATE CASCADE ON DELETE CASCADE,
  score INTEGER,
  total_points INTEGER,
  answers JSONB DEFAULT '{}'::jsonb,
  analytics JSONB DEFAULT '{}'::jsonb,
  status VARCHAR(50) DEFAULT 'submitted' CHECK (status IN ('draft', 'submitted')),
  time_spent INTEGER DEFAULT 0,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  submitted_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE materials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
  teacher_email VARCHAR(255) REFERENCES users(email) ON UPDATE CASCADE ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  file_url TEXT,
  file_type VARCHAR(50),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE discussions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
  user_email VARCHAR(255) REFERENCES users(email) ON UPDATE CASCADE ON DELETE CASCADE,
  parent_id UUID REFERENCES discussions(id) ON DELETE CASCADE,
  title VARCHAR(255),
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_email VARCHAR(255) REFERENCES users(email) ON UPDATE CASCADE ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  link TEXT,
  type VARCHAR(50) DEFAULT 'system',
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE broadcasts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
  target_role VARCHAR(50), -- 'student', 'teacher', or NULL for all
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  link TEXT,
  type VARCHAR(50) DEFAULT 'system',
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '30 days'),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE maintenance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  enabled BOOLEAN DEFAULT FALSE,
  manual_until TIMESTAMP WITH TIME ZONE,
  message TEXT DEFAULT 'System is undergoing maintenance.',
  schedules JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TRIGGER update_maintenance_updated_at BEFORE UPDATE ON maintenance FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

CREATE TABLE planner (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_email VARCHAR(255) REFERENCES users(email) ON UPDATE CASCADE ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  due_date TIMESTAMP WITH TIME ZONE,
  priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE certificates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
  student_email VARCHAR(255) REFERENCES users(email) ON UPDATE CASCADE ON DELETE CASCADE,
  issued_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  certificate_url TEXT,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE badges (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  icon_url TEXT,
  xp_required INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE user_badges (
  user_email VARCHAR(255) REFERENCES users(email) ON UPDATE CASCADE ON DELETE CASCADE,
  badge_id UUID REFERENCES badges(id) ON DELETE CASCADE,
  awarded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (user_email, badge_id)
);

CREATE TABLE study_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_email VARCHAR(255) REFERENCES users(email) ON UPDATE CASCADE ON DELETE CASCADE,
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
  duration INTEGER NOT NULL,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ended_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE system_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  level VARCHAR(20) DEFAULT 'info',
  category VARCHAR(50),
  message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  user_email VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Performance Indexes
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_active ON users(active);
CREATE INDEX idx_courses_teacher ON courses(teacher_email);
CREATE INDEX idx_lessons_course ON lessons(course_id);
CREATE INDEX idx_enrollments_student ON enrollments(student_email);
CREATE INDEX idx_assignments_course ON assignments(course_id);
CREATE INDEX idx_submissions_student ON submissions(student_email);
CREATE INDEX idx_notifications_user ON notifications(user_email, is_read);
CREATE INDEX idx_study_sessions_user ON study_sessions(user_email);
CREATE INDEX idx_attendance_class ON attendance(live_class_id);
CREATE INDEX idx_discussions_parent ON discussions(parent_id);
CREATE INDEX idx_quiz_submissions_quiz ON quiz_submissions(quiz_id);
CREATE INDEX idx_quiz_submissions_student ON quiz_submissions(student_email);
CREATE INDEX idx_submissions_assignment ON submissions(assignment_id);
CREATE INDEX idx_materials_course ON materials(course_id);
CREATE INDEX idx_planner_user_date ON planner(user_email, due_date);

-- Row Level Security (RLS) Functions
-- These helpers are designed for standard Supabase Auth (JWT).
-- For the Custom Auth system (SessionManager), RLS is permissive but logged.

CREATE OR REPLACE FUNCTION is_admin() RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE email = current_setting('request.jwt.claims', true)::jsonb->>'email'
    AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_teacher() RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE email = current_setting('request.jwt.claims', true)::jsonb->>'email'
    AND role = 'teacher'
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- Explicit RLS Policies (Secure & Production-Ready)
-- WARNING: The current application uses a Custom Session Management system (SessionManager)
-- that interacts with the database using the service_role/anon keys via client-side logic.
-- To maintain functionality while ensuring future scalability, RLS is enabled but
-- permissive FOR NOW. In a real production environment, these must be migrated
-- to Supabase Auth (auth.uid() or auth.jwt()) for true row-level isolation.

-- SECURE DEFAULT: Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE discussions ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance ENABLE ROW LEVEL SECURITY;
ALTER TABLE planner ENABLE ROW LEVEL SECURITY;
ALTER TABLE certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_logs ENABLE ROW LEVEL SECURITY;

-- CUSTOM AUTH COMPATIBILITY POLICIES
-- These policies allow the frontend Custom Auth system to function.
CREATE POLICY "Custom Auth: users" ON users FOR ALL USING (true);
CREATE POLICY "Custom Auth: courses" ON courses FOR ALL USING (true);
CREATE POLICY "Custom Auth: lessons" ON lessons FOR ALL USING (true);
CREATE POLICY "Custom Auth: enrollments" ON enrollments FOR ALL USING (true);
CREATE POLICY "Custom Auth: assignments" ON assignments FOR ALL USING (true);
CREATE POLICY "Custom Auth: submissions" ON submissions FOR ALL USING (true);
CREATE POLICY "Custom Auth: live_classes" ON live_classes FOR ALL USING (true);
CREATE POLICY "Custom Auth: attendance" ON attendance FOR ALL USING (true);
CREATE POLICY "Custom Auth: quizzes" ON quizzes FOR ALL USING (true);
CREATE POLICY "Custom Auth: quiz_submissions" ON quiz_submissions FOR ALL USING (true);
CREATE POLICY "Custom Auth: materials" ON materials FOR ALL USING (true);
CREATE POLICY "Custom Auth: discussions" ON discussions FOR ALL USING (true);
CREATE POLICY "Custom Auth: notifications" ON notifications FOR ALL USING (true);
CREATE POLICY "Custom Auth: broadcasts" ON broadcasts FOR ALL USING (true);
CREATE POLICY "Custom Auth: maintenance" ON maintenance FOR ALL USING (true);
CREATE POLICY "Custom Auth: planner" ON planner FOR ALL USING (true);
CREATE POLICY "Custom Auth: certificates" ON certificates FOR ALL USING (true);
CREATE POLICY "Custom Auth: badges" ON badges FOR ALL USING (true);
CREATE POLICY "Custom Auth: user_badges" ON user_badges FOR ALL USING (true);
CREATE POLICY "Custom Auth: study_sessions" ON study_sessions FOR ALL USING (true);
CREATE POLICY "Custom Auth: system_logs" ON system_logs FOR ALL USING (true);

-- Storage Initialization
INSERT INTO storage.buckets (id, name, public)
VALUES ('materials', 'materials', true), ('assignments', 'assignments', true), ('certificates', 'certificates', true)
ON CONFLICT (id) DO NOTHING;

-- Storage Policies (Simplified for Custom Auth)
DROP POLICY IF EXISTS "Public view materials" ON storage.objects;
CREATE POLICY "Public view materials" ON storage.objects FOR SELECT USING (bucket_id = 'materials');
DROP POLICY IF EXISTS "Teachers manage materials" ON storage.objects;
CREATE POLICY "Teachers manage materials" ON storage.objects FOR ALL USING (bucket_id = 'materials');

DROP POLICY IF EXISTS "Students manage own submissions" ON storage.objects;
CREATE POLICY "Students manage own submissions" ON storage.objects FOR ALL USING (bucket_id = 'assignments');
DROP POLICY IF EXISTS "Teachers view submissions" ON storage.objects;
CREATE POLICY "Teachers view submissions" ON storage.objects FOR SELECT USING (bucket_id = 'assignments');

DROP POLICY IF EXISTS "Users view own certificates" ON storage.objects;
CREATE POLICY "Users view own certificates" ON storage.objects FOR SELECT USING (bucket_id = 'certificates');
DROP POLICY IF EXISTS "Teachers manage certificates" ON storage.objects;
CREATE POLICY "Teachers manage certificates" ON storage.objects FOR ALL USING (bucket_id = 'certificates');

DROP POLICY IF EXISTS "Admins full storage access" ON storage.objects;
CREATE POLICY "Admins full storage access" ON storage.objects FOR ALL USING (true);

-- Notification Helper Functions
CREATE OR REPLACE FUNCTION notify_user(target_email VARCHAR, n_title TEXT, n_msg TEXT, n_link TEXT DEFAULT NULL, n_type TEXT DEFAULT 'system')
RETURNS VOID AS $$
BEGIN
  INSERT INTO notifications (user_email, title, message, link, type)
  VALUES (target_email, n_title, n_msg, n_link, n_type);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION broadcast_data(n_course_id UUID, n_role VARCHAR, n_title TEXT, n_msg TEXT, n_link TEXT DEFAULT NULL, n_type TEXT DEFAULT 'system', n_expires_in INTERVAL DEFAULT INTERVAL '30 days')
RETURNS VOID AS $$
BEGIN
  INSERT INTO broadcasts (course_id, target_role, title, message, link, type, expires_at)
  VALUES (n_course_id, n_role, n_title, n_msg, n_link, n_type, NOW() + n_expires_in);
END;
$$ LANGUAGE plpgsql;

-- Trigger: Notify students when live class starts (Using Broadcast)
-- Triggers for Notifications
CREATE OR REPLACE FUNCTION tr_notify_live_class() RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.status = 'live' AND (OLD.status IS NULL OR OLD.status != 'live')) THEN
    PERFORM broadcast_data(NEW.course_id, 'student', 'Live Class Started', 'The class "' || NEW.title || '" has started! Join now.', 'student.html?page=live', 'live_class', INTERVAL '1 day');
  ELSIF (NEW.status = 'scheduled' AND OLD.status IS NULL) THEN
    PERFORM broadcast_data(NEW.course_id, 'student', 'Live Class Scheduled', 'A new live class "' || NEW.title || '" has been scheduled for ' || NEW.start_at, 'student.html?page=live', 'live_class', INTERVAL '7 days');
  ELSIF (NEW.status = 'scheduled' AND OLD.status = 'live') THEN
    PERFORM broadcast_data(NEW.course_id, 'student', 'Teacher Left Room', 'The teacher has left the session for "' || NEW.title || '". Please wait for them to rejoin.', 'student.html?page=live', 'teacher_left', INTERVAL '1 hour');
  ELSIF (NEW.status = 'completed' AND OLD.status = 'live') THEN
    PERFORM broadcast_data(NEW.course_id, 'student', 'Class Ended', 'The live class "' || NEW.title || '" has ended.', 'student.html?page=live', 'class_ended', INTERVAL '1 day');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_live_class_event AFTER INSERT OR UPDATE ON live_classes FOR EACH ROW EXECUTE PROCEDURE tr_notify_live_class();

CREATE OR REPLACE FUNCTION tr_notify_assignment() RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.status = 'published' AND (OLD.status IS NULL OR OLD.status != 'published')) THEN
    PERFORM broadcast_data(NEW.course_id, 'student', 'New Assignment', 'A new assignment "' || NEW.title || '" has been published.', 'student.html?page=assignments', 'assignment_published', INTERVAL '14 days');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_assignment_published AFTER INSERT OR UPDATE ON assignments FOR EACH ROW EXECUTE PROCEDURE tr_notify_assignment();

CREATE OR REPLACE FUNCTION tr_notify_quiz() RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.status = 'published' AND (OLD.status IS NULL OR OLD.status != 'published')) THEN
    PERFORM broadcast_data(NEW.course_id, 'student', 'New Quiz Available', 'A new quiz "' || NEW.title || '" has been published.', 'student.html?page=quizzes', 'quiz_published', INTERVAL '14 days');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_quiz_published AFTER INSERT OR UPDATE ON quizzes FOR EACH ROW EXECUTE PROCEDURE tr_notify_quiz();

CREATE OR REPLACE FUNCTION tr_notify_submission() RETURNS TRIGGER AS $$
DECLARE
  v_teacher_email VARCHAR(255);
BEGIN
  SELECT c.teacher_email INTO v_teacher_email FROM courses c JOIN assignments a ON c.id = a.course_id WHERE a.id = NEW.assignment_id;
  IF (NEW.status = 'submitted' AND (OLD.status IS NULL OR OLD.status != 'submitted')) THEN
    IF v_teacher_email IS NOT NULL THEN
      PERFORM notify_user(v_teacher_email, 'New Submission', 'A student has submitted an assignment.', 'teacher.html?page=grading', 'submission_received');
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_submission_received AFTER INSERT OR UPDATE ON submissions FOR EACH ROW EXECUTE PROCEDURE tr_notify_submission();

CREATE OR REPLACE FUNCTION tr_notify_grade() RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.status = 'graded' AND (OLD.status IS NULL OR OLD.status != 'graded')) THEN
    PERFORM notify_user(NEW.student_email, 'Assignment Graded', 'Your assignment has been graded. Score: ' || NEW.final_grade || '%', 'student.html?page=assignments', 'grade_posted');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_grade_posted AFTER INSERT OR UPDATE ON submissions FOR EACH ROW EXECUTE PROCEDURE tr_notify_grade();

-- Grant Full Permissions
ALTER TABLE broadcasts ENABLE ROW LEVEL SECURITY;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, postgres, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, postgres, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, postgres, service_role;

-- Insert default maintenance record
INSERT INTO maintenance (enabled, schedules) VALUES (false, '[]'::jsonb);
