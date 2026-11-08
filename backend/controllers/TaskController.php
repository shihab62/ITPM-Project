<?php
declare(strict_types=1);

/* Actions: people_public, tasks_public, task_submit, task_file */
    /* ===== assignments & lab reports ===== */
    if ($a === 'people_public') {
        $rows = $pdo->query("SELECT id,name,department,phone,email,photo,acct_type,batch FROM teachers WHERE status='active' ORDER BY CASE WHEN COALESCE(acct_type,'teacher')='cr' THEN 1 ELSE 0 END, name")->fetchAll();
        $cnt = [];
        foreach ($pdo->query("SELECT s.teacher_id AS tid, COUNT(*) AS c FROM subjects s WHERE s.teacher_id IS NOT NULL AND (s.pres_on=1 OR EXISTS(SELECT 1 FROM tasks t WHERE t.subject_id=s.id)) GROUP BY s.teacher_id")->fetchAll() as $x) $cnt[(int)$x['tid']] = (int)$x['c'];
        $o = [];
        foreach ($rows as $pr) $o[] = ['id' => (int)$pr['id'], 'name' => (string)$pr['name'], 'department' => (string)($pr['department'] ?? ''), 'phone' => (string)($pr['phone'] ?? ''), 'email' => (string)$pr['email'],
            'photo' => (string)($pr['photo'] ?? ''), 'acct_type' => ($pr['acct_type'] ?? '') === 'cr' ? 'cr' : 'teacher', 'batch' => (string)($pr['batch'] ?? ''), 'subject_count' => $cnt[(int)$pr['id']] ?? 0];
        out(['ok' => true, 'people' => $o, 'server_now' => time()]);
    }
    if ($a === 'tasks_public') {
        $rows = $pdo->query("SELECT t.id,t.kind,t.title,t.details,t.mode,t.due_at,t.max_mb,t.is_open,s.id AS subject_id,s.teacher_id,s.name AS subject,s.code AS subject_code,s.teacher_name,s.teacher_photo,s.teacher_dept,s.department,s.program,s.semester_term,s.semester_year,s.batch_lock FROM tasks t JOIN subjects s ON s.id=t.subject_id ORDER BY t.id DESC")->fetchAll();
        foreach ($rows as &$r) { [$r['open'], $r['msg'], $r['late']] = task_window($r); $r['id'] = (int)$r['id']; $r['subject_id'] = (int)$r['subject_id']; $r['teacher_id'] = (int)$r['teacher_id']; $r['due_ts'] = !empty($r['due_at']) ? (strtotime((string)$r['due_at']) ?: null) : null; unset($r['is_open']); }
        unset($r);
        out(['ok' => true, 'tasks' => $rows, 'exts' => array_keys(TASK_EXT), 'server_now' => time()]);
    }
    if ($a === 'task_submit') {
        if (!$post) fail('POST required.', 405);
        need_csrf();
        $_SESSION['tsub'] = array_values(array_filter($_SESSION['tsub'] ?? [], fn($x) => $x > time() - 600));
        if (count($_SESSION['tsub']) >= 8) fail('Too many uploads from this device. Wait a few minutes.', 429);
        $q = $pdo->prepare('SELECT * FROM tasks WHERE id=?'); $q->execute([(int)($_POST['task_id'] ?? 0)]); $t = $q->fetch();
        if (!$t) fail('This assignment was not found.', 404);
        [$ok, $msg, $tLate] = task_window($t); if (!$ok) fail($msg, 403);
        $type = ($_POST['sub_type'] ?? '') === 'team' ? 'team' : 'individual';
        if ($t['mode'] !== 'both' && $t['mode'] !== $type) fail('This one accepts ' . $t['mode'] . ' submissions only.');
        $name = cl($_POST['name'] ?? '', 80); $sid = cl($_POST['student_id'] ?? '', 40); $team = cl($_POST['team_name'] ?? '', 80);
        $members = cl($_POST['members'] ?? '', 1000); $email = cl($_POST['email'] ?? '', 100);
        if (mb_strlen($name) < 2) fail('Enter your name.');
        if ($sid === '') fail('Enter your student ID.');
        if ($type === 'team' && mb_strlen($team) < 2) fail('Enter your team name.');
        if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) fail('Enter a valid email address.');
        $f = $_FILES['file'] ?? null;
        if (!$f || $f['error'] === UPLOAD_ERR_NO_FILE) fail('Choose a file to upload.');
        if ($f['error'] !== UPLOAD_ERR_OK) fail(in_array($f['error'], [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true) ? 'The file is too big for this server (' . php_upload_limit() . ').' : 'Upload failed. Please try again.');
        $mb = max(1, min(50, (int)$t['max_mb']));
        if ($f['size'] > $mb * 1048576) fail('The file is larger than ' . $mb . ' MB.');
        $ext = strtolower(pathinfo((string)$f['name'], PATHINFO_EXTENSION));
        if (!isset(TASK_EXT[$ext]) || !is_uploaded_file($f['tmp_name']) || !task_check($f['tmp_name'], $ext)) fail('Allowed files: ' . implode(', ', array_keys(TASK_EXT)) . '.');
        $stored = bin2hex(random_bytes(16)) . '.' . $ext;
        if (!@move_uploaded_file($f['tmp_name'], task_dir() . '/' . $stored)) fail('Could not save the file. Please try again.', 500);
        $ref = 'SB-' . strtoupper(bin2hex(random_bytes(4)));
        $pdo->prepare('INSERT INTO task_subs(task_id,ref,sub_type,name,student_id,team_name,members,email,orig_name,stored,size,is_late) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
            ->execute([(int)$t['id'], $ref, $type, $name, $sid, $type === 'team' ? $team : null, $type === 'team' ? $members : null, $email !== '' ? $email : null, cl($f['name'], 150), $stored, (int)$f['size'], $tLate ? 1 : 0]);
        $_SESSION['tsub'][] = time();
        out(['ok' => true, 'ref' => $ref]);
    }
    if ($a === 'task_file') {
        $q = $pdo->prepare('SELECT ts.*,t.subject_id FROM task_subs ts JOIN tasks t ON t.id=ts.task_id WHERE ts.id=?'); $q->execute([(int)($_GET['id'] ?? 0)]); $r = $q->fetch();
        $okAcc = acting_admin();
        if (!$okAcc && $r && ($tc = cur_teacher())) { $oq = $pdo->prepare('SELECT COUNT(*) FROM subjects WHERE id=? AND teacher_id=?'); $oq->execute([(int)$r['subject_id'], (int)$tc['id']]); $okAcc = (bool)(int)$oq->fetchColumn(); }
        $path = $r ? task_dir() . '/' . $r['stored'] : '';
        if (!$okAcc || !$r || !preg_match('/^[a-f0-9]{32}\.[a-z]{2,4}$/', (string)$r['stored']) || !is_file($path)) { http_response_code(404); header('Content-Type: text/plain; charset=utf-8'); exit('File not found or access denied.'); }
        $ascii = preg_replace('/[^A-Za-z0-9._-]+/', '_', (string)$r['orig_name']) ?: 'file';
        session_write_close();
        header('Content-Type: application/octet-stream');
        header('X-Content-Type-Options: nosniff');
        header('Content-Length: ' . filesize($path));
        header('Content-Disposition: attachment; filename="' . $ascii . '"; filename*=UTF-8\'\'' . rawurlencode((string)$r['orig_name']));
        readfile($path); exit;
    }
