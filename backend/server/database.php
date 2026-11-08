<?php
declare(strict_types=1);

/* MySQL connection (db()), schema creation / migration, one-time SQLite import. */
function db(): PDO {
    static $pdo = null;
    if ($pdo) return $pdo;
    if (!is_dir(DATA_DIR)) @mkdir(DATA_DIR, 0755, true);
    if (!is_dir(UPLOAD_DIR)) @mkdir(UPLOAD_DIR, 0755, true);
    if (!is_file(DATA_DIR . '/.htaccess')) @file_put_contents(DATA_DIR . '/.htaccess', "Require all denied\n<IfModule !mod_authz_core.c>\nOrder allow,deny\nDeny from all\n</IfModule>\n");
    $uht = "<IfModule mod_php.c>\nphp_flag engine off\n</IfModule>\n<IfModule mod_php7.c>\nphp_flag engine off\n</IfModule>\n<IfModule mod_php8.c>\nphp_flag engine off\n</IfModule>\nOptions -Indexes\n<FilesMatch \"\\.(php|phtml|phps|php[0-9]|pl|py|cgi|sh)$\">\nRequire all denied\n</FilesMatch>\n<IfModule mod_headers.c>\nHeader set Cache-Control \"public, max-age=2592000, immutable\"\n</IfModule>\n<IfModule mod_expires.c>\nExpiresActive On\nExpiresDefault \"access plus 30 days\"\n</IfModule>\n";
    $ucur = is_file(UPLOAD_DIR . '/.htaccess') ? (string)@file_get_contents(UPLOAD_DIR . '/.htaccess') : '';
    if ($ucur !== $uht && ($ucur === '' || strpos($ucur, 'IfModule mod_php') === false || strpos($ucur, 'max-age') === false)) @file_put_contents(UPLOAD_DIR . '/.htaccess', $uht);
    if (!is_file(UPLOAD_DIR . '/index.html')) @file_put_contents(UPLOAD_DIR . '/index.html', '');

    /* ---- MySQL connection (a few quick retries when the host is out of connections, e.g. many students at the same moment) ---- */
    $opts = [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,       /* real prepared statements + real integer types */
        PDO::ATTR_STRINGIFY_FETCHES => false,
        PDO::MYSQL_ATTR_FOUND_ROWS => true,         /* rowCount() = matched rows (same as SQLite) */
        PDO::ATTR_TIMEOUT => 10,
        PDO::MYSQL_ATTR_INIT_COMMAND => "SET time_zone = '+00:00', sql_mode = 'STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION,ERROR_FOR_DIVISION_BY_ZERO,NO_ZERO_IN_DATE', innodb_lock_wait_timeout = 8",   /* created_at/updated_at stay in UTC like before */
    ];
    $dsn = 'mysql:host=' . DB_HOST . ';port=' . DB_PORT . ';dbname=' . DB_NAME . ';charset=utf8mb4';
    $last = null; $dbMade = false;
    for ($try = 0; $try < 4; $try++) {
        try { $pdo = new PDO($dsn, DB_USER, DB_PASS, $opts); $last = null; break; }
        catch (PDOException $e) {
            $last = $e; $c = (int)($e->errorInfo[1] ?? 0);
            if ($c === 1049 && !$dbMade) {   /* local convenience: the database does not exist yet -> create it once and retry */
                $dbMade = true;
                try {
                    $tmp = new PDO('mysql:host=' . DB_HOST . ';port=' . DB_PORT . ';charset=utf8mb4', DB_USER, DB_PASS, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
                    $tmp->exec('CREATE DATABASE IF NOT EXISTS `' . str_replace('`', '', DB_NAME) . '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
                    $tmp = null; $try = -1; continue;
                } catch (Throwable $x) { /* fall through to the normal error */ }
            }
            if (!in_array($c, [1040, 1203, 2002, 2006, 2013], true)) break;   /* only "busy" type errors are retried */
            usleep(200000 * ($try + 1));
        }
    }
    if ($last !== null) {
        $pdo = null;
        log_err(date('c') . ' DB CONNECT ' . $last->getMessage() . "\n");
        throw new RuntimeException('Cannot connect to the MySQL database. Make sure MySQL is running and check DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASS in backend/server/config.php (or config.local.php).');
    }
    /* tables are created automatically the first time (and again only if SCHEMA_V is raised) */
    $ver = 0;
    try { $ver = (int)$pdo->query("SELECT v FROM settings WHERE k='schema_v'")->fetchColumn(); } catch (Throwable $e) { $ver = 0; }
    if ($ver < SCHEMA_V) {
        $mp = $pdo;
        $mp->query("SELECT GET_LOCK('prsys_migrate', 60)")->fetchAll();   /* only ONE request builds the tables; the others wait here, then skip */
        try {
            try { $ver = (int)$mp->query("SELECT v FROM settings WHERE k='schema_v'")->fetchColumn(); } catch (Throwable $e) { $ver = 0; }
            if ($ver < SCHEMA_V) db_migrate($mp);
        } catch (Throwable $e) {
            try { $mp->query("SELECT RELEASE_LOCK('prsys_migrate')")->fetchAll(); } catch (Throwable $x) {}
            $pdo = null; throw $e;
        }
        $mp->query("SELECT RELEASE_LOCK('prsys_migrate')")->fetchAll();
    }
    return $pdo;
}
/* ---------- MySQL schema (created automatically on the first visit) ---------- */
const SCHEMA_V = 7;
/* v33: the public reviews table is also created on demand, so it exists even if the stored schema version was already raised by an earlier upload */
function fb_ensure_table(PDO $pdo): void {
    $T = ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';
    $pdo->exec("CREATE TABLE IF NOT EXISTS app_reviews(
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, name VARCHAR(80) NOT NULL, role VARCHAR(20) NOT NULL DEFAULT 'Student', kind VARCHAR(12) NOT NULL DEFAULT 'review',
      stars TINYINT NOT NULL DEFAULT 0, body TEXT NOT NULL, status VARCHAR(10) NOT NULL DEFAULT 'pub', reply TEXT NULL, reply_at DATETIME NULL, ip_hash VARCHAR(64) NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP, KEY idx_ar_status (status, id), KEY idx_ar_ip (ip_hash, created_at))$T");
}
function db_migrate(PDO $pdo): void {
    $T = ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';
    $ddl = [
    "CREATE TABLE IF NOT EXISTS admins(
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, username VARCHAR(100) NOT NULL, password_hash VARCHAR(255) NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE KEY uq_admin_user (username))$T",
    "CREATE TABLE IF NOT EXISTS settings(k VARCHAR(100) NOT NULL PRIMARY KEY, v LONGTEXT NULL)$T",
    "CREATE TABLE IF NOT EXISTS teachers(
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, name VARCHAR(255) NOT NULL, department VARCHAR(255) NULL, phone VARCHAR(60) NULL,
      email VARCHAR(190) NOT NULL, password_hash VARCHAR(255) NOT NULL, photo VARCHAR(255) NULL, status VARCHAR(20) NOT NULL DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP, pw_enc TEXT NULL, acct_type VARCHAR(20) NOT NULL DEFAULT 'teacher', batch VARCHAR(20) NULL,
      UNIQUE KEY uq_teacher_email (email))$T",
    "CREATE TABLE IF NOT EXISTS subjects(
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, name VARCHAR(255) NOT NULL, is_open TINYINT NOT NULL DEFAULT 1,
      open_date VARCHAR(40) NULL, close_date VARCHAR(40) NULL, allow_individual TINYINT NOT NULL DEFAULT 1, allow_team TINYINT NOT NULL DEFAULT 1,
      min_team INT NOT NULL DEFAULT 2, max_team INT NOT NULL DEFAULT 5, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      teacher_name VARCHAR(255) NULL, teacher_photo VARCHAR(255) NULL, close_at VARCHAR(40) NULL, teacher_email VARCHAR(190) NULL,
      teacher_phone VARCHAR(60) NULL, teacher_password_hash VARCHAR(255) NULL, form_fields LONGTEXT NULL, guidelines LONGTEXT NULL,
      teacher_id INT NULL, code VARCHAR(100) NULL, teacher_dept VARCHAR(255) NULL, pub_teams TINYINT NOT NULL DEFAULT 1, pub_individuals TINYINT NOT NULL DEFAULT 0,
      semester_term VARCHAR(60) NULL, semester_year VARCHAR(12) NULL, department VARCHAR(255) NULL, program VARCHAR(100) NULL, pres_close_at VARCHAR(40) NULL,
      pres_upload TINYINT NOT NULL DEFAULT 1, pres_public TINYINT NOT NULL DEFAULT 1, pres_on TINYINT NOT NULL DEFAULT 0,
      course_teacher VARCHAR(255) NULL, cr_pending TINYINT NOT NULL DEFAULT 0, batch_lock VARCHAR(20) NULL,
      KEY idx_subj_teacher (teacher_id), KEY idx_subj_name (name))$T",
    "CREATE TABLE IF NOT EXISTS presentation_slots(
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, subject_id INT NOT NULL, slot_date VARCHAR(40) NULL, slot_label VARCHAR(255) NULL, capacity INT NOT NULL DEFAULT 1,
      KEY idx_slot_subject (subject_id), CONSTRAINT fk_slot_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE)$T",
    "CREATE TABLE IF NOT EXISTS registrations(
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, ref_code VARCHAR(40) NOT NULL, subject_id INT NOT NULL, slot_id INT NULL,
      reg_type VARCHAR(20) NOT NULL, team_name VARCHAR(255) NULL, status VARCHAR(20) NOT NULL DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, is_late TINYINT NOT NULL DEFAULT 0,
      leader_password_hash VARCHAR(255) NULL, leader_phone VARCHAR(60) NULL, leader_email VARCHAR(190) NULL,
      UNIQUE KEY uq_reg_ref (ref_code), KEY idx_reg_subj_status (subject_id, status), KEY idx_reg_slot (slot_id, status), KEY idx_reg_status (status),
      KEY idx_reg_type (reg_type), KEY idx_reg_lemail (leader_email),
      CONSTRAINT fk_reg_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
      CONSTRAINT fk_reg_slot FOREIGN KEY (slot_id) REFERENCES presentation_slots(id) ON DELETE SET NULL)$T",
    "CREATE TABLE IF NOT EXISTS team_members(
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, registration_id INT NOT NULL, student_id VARCHAR(190) NOT NULL, full_name VARCHAR(255) NOT NULL,
      department VARCHAR(255) NOT NULL, batch VARCHAR(40) NOT NULL, email VARCHAR(190) NULL, phone VARCHAR(60) NULL, is_leader TINYINT NOT NULL DEFAULT 0,
      data LONGTEXT NULL, gender VARCHAR(30) NULL,
      KEY idx_mem_lead (registration_id, is_leader), KEY idx_mem_sid (student_id), KEY idx_mem_batch (batch),
      CONSTRAINT fk_mem_reg FOREIGN KEY (registration_id) REFERENCES registrations(id) ON DELETE CASCADE)$T",
    "CREATE TABLE IF NOT EXISTS uploaded_photos(
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, member_id INT NOT NULL, file_path VARCHAR(255) NOT NULL, mime_type VARCHAR(100) NULL, file_size INT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP, KEY idx_photo_member (member_id, id),
      CONSTRAINT fk_photo_member FOREIGN KEY (member_id) REFERENCES team_members(id) ON DELETE CASCADE)$T",
    "CREATE TABLE IF NOT EXISTS pw_resets(
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, role VARCHAR(20) NOT NULL, email VARCHAR(190) NOT NULL, code_hash VARCHAR(255) NOT NULL,
      expires_at BIGINT NOT NULL, attempts INT NOT NULL DEFAULT 0, created_at BIGINT NOT NULL, KEY idx_pw_reset (role, email))$T",
    "CREATE TABLE IF NOT EXISTS presentations(
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, registration_id INT NOT NULL, orig_name VARCHAR(255) NOT NULL, stored VARCHAR(255) NOT NULL,
      kind VARCHAR(20) NOT NULL, size BIGINT NOT NULL DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_pres_reg (registration_id), CONSTRAINT fk_pres_reg FOREIGN KEY (registration_id) REFERENCES registrations(id) ON DELETE CASCADE)$T",
    "CREATE TABLE IF NOT EXISTS tasks(
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, subject_id INT NOT NULL, kind VARCHAR(20) NOT NULL DEFAULT 'assignment', title VARCHAR(255) NOT NULL,
      details TEXT NULL, mode VARCHAR(20) NOT NULL DEFAULT 'both', due_at VARCHAR(40) NULL, max_mb INT NOT NULL DEFAULT 10, is_open TINYINT NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP, KEY idx_task_subject (subject_id),
      CONSTRAINT fk_task_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE)$T",
    "CREATE TABLE IF NOT EXISTS task_subs(
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, task_id INT NOT NULL, ref VARCHAR(60) NOT NULL, sub_type VARCHAR(20) NOT NULL, name VARCHAR(255) NOT NULL,
      student_id VARCHAR(190) NOT NULL, team_name VARCHAR(255) NULL, members TEXT NULL, email VARCHAR(190) NULL, orig_name VARCHAR(255) NOT NULL,
      stored VARCHAR(255) NOT NULL, size BIGINT NOT NULL DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, is_late TINYINT NOT NULL DEFAULT 0,
      KEY idx_sub_task (task_id), CONSTRAINT fk_sub_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE)$T",
    "CREATE TABLE IF NOT EXISTS chat_users(
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100) NOT NULL, phone VARCHAR(24) NULL, pkey VARCHAR(10) NULL, email VARCHAR(190) NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_cu_pkey (pkey), UNIQUE KEY uq_cu_email (email))$T",
    "CREATE TABLE IF NOT EXISTS chat_rooms(
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, kind VARCHAR(10) NOT NULL, subject_id INT NULL, teacher_id INT NULL, student_id INT NULL,
      last_at DATETIME DEFAULT CURRENT_TIMESTAMP, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_room_subj (subject_id), UNIQUE KEY uq_room_direct (teacher_id, student_id), KEY idx_room_last (last_at),
      CONSTRAINT fk_room_subj FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
      CONSTRAINT fk_room_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
      CONSTRAINT fk_room_student FOREIGN KEY (student_id) REFERENCES chat_users(id) ON DELETE CASCADE)$T",
    "CREATE TABLE IF NOT EXISTS chat_members(
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, room_id INT NOT NULL, ptype VARCHAR(10) NOT NULL, pid INT NOT NULL, status VARCHAR(10) NOT NULL DEFAULT 'active',
      last_read BIGINT NOT NULL DEFAULT 0, joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_cm (room_id, ptype, pid), KEY idx_cm_p (ptype, pid),
      CONSTRAINT fk_cm_room FOREIGN KEY (room_id) REFERENCES chat_rooms(id) ON DELETE CASCADE)$T",
    "CREATE TABLE IF NOT EXISTS chat_messages(
      id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, room_id INT NOT NULL, sender_type VARCHAR(10) NOT NULL, sender_id INT NOT NULL,
      sender_name VARCHAR(100) NOT NULL, sender_tag VARCHAR(12) NOT NULL DEFAULT '', body TEXT NOT NULL, deleted TINYINT NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP, KEY idx_cmsg_room (room_id, id), KEY idx_cmsg_sender (sender_type, sender_id, id),
      CONSTRAINT fk_cmsg_room FOREIGN KEY (room_id) REFERENCES chat_rooms(id) ON DELETE CASCADE)$T",
    "CREATE TABLE IF NOT EXISTS app_reviews(
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, name VARCHAR(80) NOT NULL, role VARCHAR(20) NOT NULL DEFAULT 'Student', kind VARCHAR(12) NOT NULL DEFAULT 'review',
      stars TINYINT NOT NULL DEFAULT 0, body TEXT NOT NULL, status VARCHAR(10) NOT NULL DEFAULT 'pub', reply TEXT NULL, reply_at DATETIME NULL, ip_hash VARCHAR(64) NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP, KEY idx_ar_status (status, id), KEY idx_ar_ip (ip_hash, created_at))$T",
    ];
    foreach ($ddl as $q) $pdo->exec($q);
    /* v23: chat profile now also keeps batch, program, semester and an optional photo (added to existing installs too) */
    $have = array_column($pdo->query('SHOW COLUMNS FROM chat_users')->fetchAll(), 'Field');
    foreach (['batch' => 'VARCHAR(10) NULL', 'program' => 'VARCHAR(40) NULL', 'sem_term' => 'VARCHAR(40) NULL', 'sem_year' => 'VARCHAR(4) NULL', 'photo' => 'VARCHAR(255) NULL'] as $col => $def)
        if (!in_array($col, $have, true)) $pdo->exec("ALTER TABLE chat_users ADD COLUMN `$col` $def");

    /* first run: if the old SQLite file is still in data/, copy everything from it once */
    if ((int)$pdo->query('SELECT COUNT(*) FROM admins')->fetchColumn() === 0 && !db_import_sqlite($pdo)) {
        $pdo->prepare('INSERT INTO admins(username,password_hash) VALUES(?,?)')->execute([DEFAULT_ADMIN_USER, password_hash(DEFAULT_ADMIN_PASS, PASSWORD_DEFAULT)]);
    }
    /* v7: one presentation topic per team (shown on the public team page) */
    $haveR = array_column($pdo->query('SHOW COLUMNS FROM registrations')->fetchAll(), 'Field');
    if (!in_array('topic', $haveR, true)) $pdo->exec('ALTER TABLE registrations ADD COLUMN `topic` VARCHAR(200) NULL');
    /* v6: extra indexes for speed under many users (each is added only if missing, so running twice is harmless) + the rate-limit table */
    $addIdx = function (string $tbl, string $name, string $cols) use ($pdo) {
        try {
            $q = $pdo->prepare('SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND INDEX_NAME=?'); $q->execute([$tbl, $name]);
            if (!(int)$q->fetchColumn()) $pdo->exec("ALTER TABLE `$tbl` ADD INDEX `$name` ($cols)");
        } catch (Throwable $e) { log_err(date('c') . " INDEX $name skipped: " . $e->getMessage() . "\n"); }
    };
    $addIdx('team_members', 'idx_mem_reg_sid', 'registration_id, student_id');
    $addIdx('registrations', 'idx_reg_created', 'created_at');
    $addIdx('pw_resets', 'idx_pw_exp', 'expires_at');
    $addIdx('task_subs', 'idx_sub_task_sid', 'task_id, student_id');
    rl_table();
    $pdo->prepare("INSERT INTO settings(k,v) VALUES('schema_v',?) ON DUPLICATE KEY UPDATE v=VALUES(v)")->execute([(string)SCHEMA_V]);
}

/* One-time copy of data/app.sqlite -> MySQL (same ids, so photos / files / links keep working). Returns true when data was imported. */
function db_import_sqlite(PDO $pdo): bool {
    $file = DATA_DIR . '/app.sqlite';
    if (!is_file($file) || filesize($file) < 1024) return false;
    if (!in_array('sqlite', PDO::getAvailableDrivers(), true)) {
        log_err(date('c') . " IMPORT skipped: pdo_sqlite is not enabled, so data/app.sqlite could not be read\n");
        return false;
    }
    $lite = new PDO('sqlite:' . $file, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
    $have = array_column($lite->query("SELECT name FROM sqlite_master WHERE type='table'")->fetchAll(), 'name');
    $order = ['admins', 'settings', 'teachers', 'subjects', 'presentation_slots', 'registrations', 'team_members', 'uploaded_photos', 'pw_resets', 'presentations', 'tasks', 'task_subs'];
    $pdo->exec('SET FOREIGN_KEY_CHECKS=0');
    $pdo->beginTransaction();
    try {
        foreach ($order as $t) {
            if (!in_array($t, $have, true)) continue;
            $src = array_column($lite->query("PRAGMA table_info($t)")->fetchAll(), 'name');
            $dst = array_column($pdo->query("SHOW COLUMNS FROM `$t`")->fetchAll(), 'Field');
            $cols = array_values(array_intersect($src, $dst));
            if (!$cols) continue;
            $sql = "INSERT INTO `$t`(" . implode(',', array_map(fn($c) => "`$c`", $cols)) . ') VALUES(' . implode(',', array_fill(0, count($cols), '?')) . ')';
            $ins = $pdo->prepare($sql);
            $rs = $lite->query('SELECT ' . implode(',', array_map(fn($c) => "\"$c\"", $cols)) . " FROM \"$t\"");
            while ($r = $rs->fetch(PDO::FETCH_NUM)) $ins->execute($r);
        }
        $pdo->commit();
    } catch (Throwable $e) {
        try { $pdo->rollBack(); } catch (Throwable $x) {}
        $pdo->exec('SET FOREIGN_KEY_CHECKS=1');
        log_err(date('c') . ' IMPORT FAILED ' . $e->getMessage() . "\n");
        throw new RuntimeException('Could not copy the old SQLite data into MySQL: ' . mb_substr($e->getMessage(), 0, 200));
    }
    $pdo->exec('SET FOREIGN_KEY_CHECKS=1');
    if ((int)$pdo->query('SELECT COUNT(*) FROM admins')->fetchColumn() === 0) return false;   /* empty old database: start fresh */
    db_fix_imported($pdo);
    $pdo->prepare("INSERT INTO settings(k,v) VALUES('sqlite_imported',?) ON DUPLICATE KEY UPDATE v=VALUES(v)")->execute([date('c')]);
    return true;
}

/* the same clean-ups the old SQLite upgrade did (program names, numeric batch, teacher accounts) - run once on imported data */
function db_fix_imported(PDO $pdo): void {
    try {
        $pdo->exec("UPDATE subjects SET program='Undergraduate' WHERE UPPER(TRIM(program))='UG'");
        $pdo->exec("UPDATE subjects SET program='Diploma' WHERE UPPER(TRIM(program))='DH'");
        $pv = $pdo->query("SELECT v FROM settings WHERE k='opt_programs'")->fetchColumn();
        if ($pv !== false) {
            $pj = json_decode((string)$pv, true);
            if (is_array($pj)) $pdo->prepare("UPDATE settings SET v=? WHERE k='opt_programs'")->execute([json_encode(array_values(array_unique(array_map(fn($x) => prog_full((string)$x), $pj))), JSON_UNESCAPED_UNICODE)]);
        }
        foreach ($pdo->query('SELECT id,batch_lock,form_fields FROM subjects')->fetchAll() as $sr) {
            $bl0 = (string)($sr['batch_lock'] ?? ''); $bl1 = $bl0 !== '' ? batch_num($bl0) : '';
            $fj = json_decode((string)($sr['form_fields'] ?? ''), true); $fch = false;
            if (is_array($fj) && $fj) {
                $hasProg = false; $bpos = -1;
                foreach ($fj as $i => $f) {
                    if (!is_array($f)) continue;
                    if (($f['key'] ?? '') === 'batch') { $d0 = batch_num((string)($f['def'] ?? '')); $fj[$i]['def'] = batch_valid($d0) ? $d0 : ''; $fj[$i]['type'] = 'text'; $fj[$i]['max'] = 4; $bpos = $i; $fch = true; }
                    if (($f['key'] ?? '') === 'program') {
                        $hasProg = true;
                        $fj[$i]['opts'] = array_values(array_unique(array_map(fn($x) => prog_full((string)$x), (array)($f['opts'] ?? PROG_DEFAULT)))); $fch = true;
                    } elseif (strcasecmp(trim((string)($f['label'] ?? '')), 'Program') === 0) $hasProg = true;
                }
                if (!$hasProg) {
                    $pf = ['key' => 'program', 'label' => 'Program', 'type' => 'select', 'req' => 'no', 'role' => '', 'opts' => PROG_DEFAULT, 'def' => '', 'max' => 200];
                    if ($bpos >= 0) array_splice($fj, $bpos + 1, 0, [$pf]); else $fj[] = $pf;
                    $fch = true;
                }
            }
            if ($fch || $bl1 !== $bl0) $pdo->prepare('UPDATE subjects SET batch_lock=?, form_fields=? WHERE id=?')->execute([$bl1 !== '' ? $bl1 : null, ($fch && is_array($fj)) ? json_encode(array_values($fj), JSON_UNESCAPED_UNICODE) : ($sr['form_fields'] ?? null), $sr['id']]);
        }
        foreach ($pdo->query("SELECT id,batch,data FROM team_members WHERE batch IS NOT NULL AND batch!='' AND batch REGEXP '[^0-9]'")->fetchAll() as $mr) {
            $nb = batch_num((string)$mr['batch']); if (!batch_valid($nb)) continue;
            $dj = json_decode((string)($mr['data'] ?? ''), true);
            if (is_array($dj) && isset($dj['batch'])) $dj['batch'] = $nb;
            $pdo->prepare('UPDATE team_members SET batch=?, data=? WHERE id=?')->execute([$nb, is_array($dj) ? json_encode($dj, JSON_UNESCAPED_UNICODE) : ($mr['data'] ?? null), $mr['id']]);
        }
        foreach ($pdo->query("SELECT id,batch FROM teachers WHERE batch IS NOT NULL AND batch!='' AND batch REGEXP '[^0-9]'")->fetchAll() as $tr) {
            $nb = batch_num((string)$tr['batch']); if (batch_valid($nb)) $pdo->prepare('UPDATE teachers SET batch=? WHERE id=?')->execute([$nb, $tr['id']]);
        }
    } catch (Throwable $e) {}
}
