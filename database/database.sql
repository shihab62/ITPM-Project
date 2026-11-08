-- Presentation Registration System - MySQL schema
-- Extracted from the application's own schema code (backend/server/database.php, helpers.php, analytics.php).
--
-- You do NOT have to import this file: the application creates the same tables automatically on the first page
-- load (and also creates the default admin  admin / Admin@12345 ). Import it only if you prefer to prepare the
-- database yourself (phpMyAdmin -> Import), or just to read the schema.
-- Re-importing is safe for tables (IF NOT EXISTS); the ALTER statements at the bottom are for a FRESH database only.

CREATE DATABASE IF NOT EXISTS `presentation_system` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `presentation_system`;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS admins(
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, username VARCHAR(100) NOT NULL, password_hash VARCHAR(255) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE KEY uq_admin_user (username)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS settings(k VARCHAR(100) NOT NULL PRIMARY KEY, v LONGTEXT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS teachers(
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, name VARCHAR(255) NOT NULL, department VARCHAR(255) NULL, phone VARCHAR(60) NULL,
  email VARCHAR(190) NOT NULL, password_hash VARCHAR(255) NOT NULL, photo VARCHAR(255) NULL, status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP, pw_enc TEXT NULL, acct_type VARCHAR(20) NOT NULL DEFAULT 'teacher', batch VARCHAR(20) NULL,
  UNIQUE KEY uq_teacher_email (email)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS subjects(
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, name VARCHAR(255) NOT NULL, is_open TINYINT NOT NULL DEFAULT 1,
  open_date VARCHAR(40) NULL, close_date VARCHAR(40) NULL, allow_individual TINYINT NOT NULL DEFAULT 1, allow_team TINYINT NOT NULL DEFAULT 1,
  min_team INT NOT NULL DEFAULT 2, max_team INT NOT NULL DEFAULT 5, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  teacher_name VARCHAR(255) NULL, teacher_photo VARCHAR(255) NULL, close_at VARCHAR(40) NULL, teacher_email VARCHAR(190) NULL,
  teacher_phone VARCHAR(60) NULL, teacher_password_hash VARCHAR(255) NULL, form_fields LONGTEXT NULL, guidelines LONGTEXT NULL,
  teacher_id INT NULL, code VARCHAR(100) NULL, teacher_dept VARCHAR(255) NULL, pub_teams TINYINT NOT NULL DEFAULT 1, pub_individuals TINYINT NOT NULL DEFAULT 0,
  semester_term VARCHAR(60) NULL, semester_year VARCHAR(12) NULL, department VARCHAR(255) NULL, program VARCHAR(100) NULL, pres_close_at VARCHAR(40) NULL,
  pres_upload TINYINT NOT NULL DEFAULT 1, pres_public TINYINT NOT NULL DEFAULT 1, pres_on TINYINT NOT NULL DEFAULT 0,
  course_teacher VARCHAR(255) NULL, cr_pending TINYINT NOT NULL DEFAULT 0, batch_lock VARCHAR(20) NULL,
  KEY idx_subj_teacher (teacher_id), KEY idx_subj_name (name)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS presentation_slots(
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, subject_id INT NOT NULL, slot_date VARCHAR(40) NULL, slot_label VARCHAR(255) NULL, capacity INT NOT NULL DEFAULT 1,
  KEY idx_slot_subject (subject_id), CONSTRAINT fk_slot_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS registrations(
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, ref_code VARCHAR(40) NOT NULL, subject_id INT NOT NULL, slot_id INT NULL,
  reg_type VARCHAR(20) NOT NULL, team_name VARCHAR(255) NULL, status VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, is_late TINYINT NOT NULL DEFAULT 0,
  leader_password_hash VARCHAR(255) NULL, leader_phone VARCHAR(60) NULL, leader_email VARCHAR(190) NULL,
  UNIQUE KEY uq_reg_ref (ref_code), KEY idx_reg_subj_status (subject_id, status), KEY idx_reg_slot (slot_id, status), KEY idx_reg_status (status),
  KEY idx_reg_type (reg_type), KEY idx_reg_lemail (leader_email),
  CONSTRAINT fk_reg_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
  CONSTRAINT fk_reg_slot FOREIGN KEY (slot_id) REFERENCES presentation_slots(id) ON DELETE SET NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS team_members(
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, registration_id INT NOT NULL, student_id VARCHAR(190) NOT NULL, full_name VARCHAR(255) NOT NULL,
  department VARCHAR(255) NOT NULL, batch VARCHAR(40) NOT NULL, email VARCHAR(190) NULL, phone VARCHAR(60) NULL, is_leader TINYINT NOT NULL DEFAULT 0,
  data LONGTEXT NULL, gender VARCHAR(30) NULL,
  KEY idx_mem_lead (registration_id, is_leader), KEY idx_mem_sid (student_id), KEY idx_mem_batch (batch),
  CONSTRAINT fk_mem_reg FOREIGN KEY (registration_id) REFERENCES registrations(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS uploaded_photos(
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, member_id INT NOT NULL, file_path VARCHAR(255) NOT NULL, mime_type VARCHAR(100) NULL, file_size INT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP, KEY idx_photo_member (member_id, id),
  CONSTRAINT fk_photo_member FOREIGN KEY (member_id) REFERENCES team_members(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pw_resets(
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, role VARCHAR(20) NOT NULL, email VARCHAR(190) NOT NULL, code_hash VARCHAR(255) NOT NULL,
  expires_at BIGINT NOT NULL, attempts INT NOT NULL DEFAULT 0, created_at BIGINT NOT NULL, KEY idx_pw_reset (role, email)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS presentations(
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, registration_id INT NOT NULL, orig_name VARCHAR(255) NOT NULL, stored VARCHAR(255) NOT NULL,
  kind VARCHAR(20) NOT NULL, size BIGINT NOT NULL DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_pres_reg (registration_id), CONSTRAINT fk_pres_reg FOREIGN KEY (registration_id) REFERENCES registrations(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tasks(
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, subject_id INT NOT NULL, kind VARCHAR(20) NOT NULL DEFAULT 'assignment', title VARCHAR(255) NOT NULL,
  details TEXT NULL, mode VARCHAR(20) NOT NULL DEFAULT 'both', due_at VARCHAR(40) NULL, max_mb INT NOT NULL DEFAULT 10, is_open TINYINT NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP, KEY idx_task_subject (subject_id),
  CONSTRAINT fk_task_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS task_subs(
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, task_id INT NOT NULL, ref VARCHAR(60) NOT NULL, sub_type VARCHAR(20) NOT NULL, name VARCHAR(255) NOT NULL,
  student_id VARCHAR(190) NOT NULL, team_name VARCHAR(255) NULL, members TEXT NULL, email VARCHAR(190) NULL, orig_name VARCHAR(255) NOT NULL,
  stored VARCHAR(255) NOT NULL, size BIGINT NOT NULL DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, is_late TINYINT NOT NULL DEFAULT 0,
  KEY idx_sub_task (task_id), CONSTRAINT fk_sub_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chat_users(
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100) NOT NULL, phone VARCHAR(24) NULL, pkey VARCHAR(10) NULL, email VARCHAR(190) NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_cu_pkey (pkey), UNIQUE KEY uq_cu_email (email)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chat_rooms(
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, kind VARCHAR(10) NOT NULL, subject_id INT NULL, teacher_id INT NULL, student_id INT NULL,
  last_at DATETIME DEFAULT CURRENT_TIMESTAMP, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_room_subj (subject_id), UNIQUE KEY uq_room_direct (teacher_id, student_id), KEY idx_room_last (last_at),
  CONSTRAINT fk_room_subj FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
  CONSTRAINT fk_room_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
  CONSTRAINT fk_room_student FOREIGN KEY (student_id) REFERENCES chat_users(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chat_members(
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, room_id INT NOT NULL, ptype VARCHAR(10) NOT NULL, pid INT NOT NULL, status VARCHAR(10) NOT NULL DEFAULT 'active',
  last_read BIGINT NOT NULL DEFAULT 0, joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_cm (room_id, ptype, pid), KEY idx_cm_p (ptype, pid),
  CONSTRAINT fk_cm_room FOREIGN KEY (room_id) REFERENCES chat_rooms(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chat_messages(
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, room_id INT NOT NULL, sender_type VARCHAR(10) NOT NULL, sender_id INT NOT NULL,
  sender_name VARCHAR(100) NOT NULL, sender_tag VARCHAR(12) NOT NULL DEFAULT '', body TEXT NOT NULL, deleted TINYINT NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP, KEY idx_cmsg_room (room_id, id), KEY idx_cmsg_sender (sender_type, sender_id, id),
  CONSTRAINT fk_cmsg_room FOREIGN KEY (room_id) REFERENCES chat_rooms(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_reviews(
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, name VARCHAR(80) NOT NULL, role VARCHAR(20) NOT NULL DEFAULT 'Student', kind VARCHAR(12) NOT NULL DEFAULT 'review',
  stars TINYINT NOT NULL DEFAULT 0, body TEXT NOT NULL, status VARCHAR(10) NOT NULL DEFAULT 'pub', reply TEXT NULL, reply_at DATETIME NULL, ip_hash VARCHAR(64) NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP, KEY idx_ar_status (status, id), KEY idx_ar_ip (ip_hash, created_at)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rate_limits(k CHAR(40) NOT NULL PRIMARY KEY, n INT NOT NULL DEFAULT 0, win_start BIGINT NOT NULL, KEY idx_rl_win (win_start)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS an_visitors(
  vid CHAR(32) NOT NULL PRIMARY KEY, first_seen DATETIME NOT NULL, last_seen DATETIME NOT NULL,
  visits INT NOT NULL DEFAULT 0, hits INT NOT NULL DEFAULT 0, active_secs INT NOT NULL DEFAULT 0,
  ip VARCHAR(45) NOT NULL DEFAULT '', country VARCHAR(80) NOT NULL DEFAULT '', cc CHAR(2) NOT NULL DEFAULT '', region VARCHAR(80) NOT NULL DEFAULT '',
  city VARCHAR(80) NOT NULL DEFAULT '', isp VARCHAR(120) NOT NULL DEFAULT '',
  device_type VARCHAR(12) NOT NULL DEFAULT '', device_name VARCHAR(120) NOT NULL DEFAULT '', os VARCHAR(60) NOT NULL DEFAULT '', browser VARCHAR(60) NOT NULL DEFAULT '',
  screen VARCHAR(20) NOT NULL DEFAULT '', lang VARCHAR(20) NOT NULL DEFAULT '', tz VARCHAR(60) NOT NULL DEFAULT '', pwa TINYINT NOT NULL DEFAULT 0, conn VARCHAR(12) NOT NULL DEFAULT '',
  role VARCHAR(12) NOT NULL DEFAULT 'guest', who VARCHAR(120) NOT NULL DEFAULT '', last_page VARCHAR(80) NOT NULL DEFAULT '', ua VARCHAR(300) NOT NULL DEFAULT '',
  KEY idx_av_last (last_seen), KEY idx_av_first (first_seen), KEY idx_av_ip (ip)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS an_events(
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, vid CHAR(32) NOT NULL DEFAULT '', ts DATETIME NOT NULL, ip VARCHAR(45) NOT NULL DEFAULT '',
  kind VARCHAR(10) NOT NULL DEFAULT 'view', page VARCHAR(80) NOT NULL DEFAULT '', action VARCHAR(40) NOT NULL DEFAULT '', res VARCHAR(8) NOT NULL DEFAULT '',
  who VARCHAR(120) NOT NULL DEFAULT '', ref VARCHAR(120) NOT NULL DEFAULT '',
  KEY idx_ae_ts (ts), KEY idx_ae_vid (vid, ts), KEY idx_ae_kind (kind, ts), KEY idx_ae_ip (ip)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS an_geo(
  ip VARCHAR(45) NOT NULL PRIMARY KEY, country VARCHAR(80) NOT NULL DEFAULT '', cc CHAR(2) NOT NULL DEFAULT '', region VARCHAR(80) NOT NULL DEFAULT '',
  city VARCHAR(80) NOT NULL DEFAULT '', isp VARCHAR(120) NOT NULL DEFAULT '', ts DATETIME NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- columns / indexes the application adds after the first version (fresh database only)
ALTER TABLE chat_users ADD COLUMN `batch` VARCHAR(10) NULL, ADD COLUMN `program` VARCHAR(40) NULL, ADD COLUMN `sem_term` VARCHAR(40) NULL, ADD COLUMN `sem_year` VARCHAR(4) NULL, ADD COLUMN `photo` VARCHAR(255) NULL;
ALTER TABLE registrations ADD COLUMN `topic` VARCHAR(200) NULL;
ALTER TABLE an_visitors ADD COLUMN extra VARCHAR(500) NOT NULL DEFAULT '';
ALTER TABLE app_reviews ADD COLUMN user_type VARCHAR(10) NULL, ADD COLUMN user_id INT NULL;
ALTER TABLE team_members ADD INDEX `idx_mem_reg_sid` (registration_id, student_id);
ALTER TABLE registrations ADD INDEX `idx_reg_created` (created_at);
ALTER TABLE pw_resets ADD INDEX `idx_pw_exp` (expires_at);
ALTER TABLE task_subs ADD INDEX `idx_sub_task_sid` (task_id, student_id);
