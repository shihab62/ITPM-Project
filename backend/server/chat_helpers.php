<?php
declare(strict_types=1);

/* Chat: profiles, rooms, messages helpers. */
/* ================= CHAT: student profiles, course groups, personal chats (v22) ================= */
function chat_on(): bool { return setting('chat_on', '1') === '1'; }
function chat_phone_key(string $p): string { $d = preg_replace('/\D/', '', $p) ?? ''; return strlen($d) >= 10 ? substr($d, -10) : ''; }
/* Validates the student's chat profile (v24). Required: name, Gmail, batch (number) and program (Undergraduate / Diploma). Photo is optional. Returns [clean, null] or [null, error]. */
function chat_programs(): array {
    $o = array_values(array_filter(site_options()['programs'], fn($p) => strcasecmp($p, 'Both') !== 0));
    return $o ?: PROG_DEFAULT;
}
function chat_clean(array $in): array {
    $name = cl($in['name'] ?? '', 80);
    if (!preg_match('/^[\p{L}\p{M}\p{N}\s.,\'\-()]{2,80}$/u', $name)) return [null, 'Enter your name (2-80 letters).'];
    $email = strtolower(cl($in['email'] ?? '', 100));
    if ($email === '') return [null, 'Enter your Gmail.'];
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) return [null, 'Enter a valid Gmail address.'];
    $batch = batch_num(cl($in['batch'] ?? '', 10));
    if (!batch_valid($batch)) return [null, 'Enter your batch number (for example 32).'];
    $prog = prog_full(cl($in['program'] ?? '', 40));
    if (!in_array($prog, chat_programs(), true)) return [null, 'Choose your program: Undergraduate (UG) or Diploma (DH).'];
    /* v24: the profile is only name + Gmail + batch + program (+ optional photo). Mobile number and semester are no longer asked. */
    return [['name' => $name, 'phone' => '', 'pk' => '', 'email' => $email, 'batch' => $batch, 'program' => $prog, 'sem_term' => '', 'sem_year' => ''], null];
}
function chat_user_pub(array $u): array {
    $o = ['id' => (int)$u['id'], 'name' => (string)$u['name'], 'phone' => (string)($u['phone'] ?? ''), 'email' => (string)($u['email'] ?? ''),
        'batch' => (string)($u['batch'] ?? ''), 'program' => (string)($u['program'] ?? ''), 'sem_term' => (string)($u['sem_term'] ?? ''), 'sem_year' => (string)($u['sem_year'] ?? ''),
        'photo' => (string)($u['photo'] ?? '')];
    $o['complete'] = $o['email'] !== '' && $o['batch'] !== '' && $o['program'] !== '';
    return $o;
}
/* "Batch 32 · Undergraduate · Autumn 2026" */
function chat_user_info(array $u): string {
    $p = [];
    if ((string)($u['batch'] ?? '') !== '') $p[] = 'Batch ' . $u['batch'];
    if ((string)($u['program'] ?? '') !== '') $p[] = prog_full((string)$u['program']);
    return implode(' · ', $p);
}
/* Who is chatting. who = student (name + mobile/Gmail profile) | staff (teacher or CR panel) | admin (admin panel). Returns null when not signed in. */
function chat_actor(string $who): ?array {
    if ($who === 'admin') {
        if (empty($_SESSION['admin_id'])) return null;
        return ['type' => 'admin', 'id' => (int)$_SESSION['admin_id'], 'name' => 'Admin', 'tag' => 'Admin'];
    }
    if ($who === 'staff') {
        $t = cur_teacher(); if (!$t) return null;
        return ['type' => 'staff', 'id' => (int)$t['id'], 'name' => (string)$t['name'], 'tag' => ($t['acct_type'] ?? '') === 'cr' ? 'CR' : 'Teacher'];
    }
    $uid = (int)($_SESSION['chat_uid'] ?? 0); if (!$uid) return null;
    $st = db()->prepare('SELECT * FROM chat_users WHERE id=?'); $st->execute([$uid]); $u = $st->fetch();
    if (!$u) { unset($_SESSION['chat_uid']); return null; }
    return ['type' => 'student', 'id' => (int)$u['id'], 'name' => (string)$u['name'], 'tag' => '', 'row' => $u];
}
/* the room, if this person may use it (student = active member, teacher/CR = owner of the subject or of the personal chat, admin = all) */
function chat_room_for(int $rid, array $act): ?array {
    $st = db()->prepare('SELECT r.*, s.teacher_id AS s_tid FROM chat_rooms r LEFT JOIN subjects s ON s.id=r.subject_id WHERE r.id=?');
    $st->execute([$rid]); $r = $st->fetch();
    if (!$r) return null;
    if ($act['type'] === 'admin') return $r;
    if ($act['type'] === 'staff') {
        $own = ($r['kind'] === 'direct' || $r['kind'] === 'support') ? (int)$r['teacher_id'] : (int)$r['s_tid'];
        return $own === (int)$act['id'] ? $r : null;
    }
    $m = db()->prepare("SELECT 1 FROM chat_members WHERE room_id=? AND ptype='student' AND pid=? AND status='active'");
    $m->execute([$rid, (int)$act['id']]);
    return $m->fetchColumn() ? $r : null;
}
function chat_mark_read(int $rid, array $act, int $upto): void {
    db()->prepare('INSERT INTO chat_members(room_id,ptype,pid,last_read) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE last_read=GREATEST(last_read,VALUES(last_read))')
        ->execute([$rid, $act['type'], (int)$act['id'], $upto]);
}
/* every subject of a teacher / CR gets its course group (created empty, students join it later) */
function chat_ensure_groups(int $tid): void {
    db()->prepare("INSERT IGNORE INTO chat_rooms(kind,subject_id) SELECT 'group', id FROM subjects WHERE teacher_id=?")->execute([$tid]);
}
/* v24: avatar of a message sender (student chat photo or teacher/CR photo), cached per request */
function chat_sender_photo(string $t, int $id): string {
    static $c = [];
    $k = $t . ':' . $id; if (isset($c[$k])) return $c[$k];
    $ph = '';
    if ($t === 'student') { $q = db()->prepare('SELECT photo FROM chat_users WHERE id=?'); $q->execute([$id]); $ph = (string)($q->fetchColumn() ?: ''); }
    elseif ($t === 'staff') { $q = db()->prepare('SELECT photo FROM teachers WHERE id=?'); $q->execute([$id]); $ph = (string)($q->fetchColumn() ?: ''); }
    return $c[$k] = $ph;
}
function chat_msg_out(array $m, array $act): array {
    $del = (int)$m['deleted'] === 1;
    return ['id' => (int)$m['id'], 'mine' => $m['sender_type'] === $act['type'] && (int)$m['sender_id'] === (int)$act['id'], 'name' => (string)$m['sender_name'],
        'tag' => (string)$m['sender_tag'], 'text' => $del ? '' : (string)$m['body'], 'deleted' => $del ? 1 : 0, 'ts' => (int)$m['ts'],
        'photo' => chat_sender_photo((string)$m['sender_type'], (int)$m['sender_id'])];
}
/* the chat list of one person: title, last message, unread count */
function chat_rooms_for(array $act): array {
    $pdo = db(); $type = (string)$act['type']; $id = (int)$act['id'];
    $sel = "SELECT r.id,r.kind,r.subject_id,r.teacher_id,r.student_id,UNIX_TIMESTAMP(r.last_at) AS last_ts,s.name AS subj_name,s.code AS subj_code,
        cu.name AS stu_name,cu.phone AS stu_phone,cu.email AS stu_email,cu.batch AS stu_batch,cu.program AS stu_prog,cu.sem_term AS stu_term,cu.sem_year AS stu_year,cu.photo AS stu_photo,t.name AS t_name,t.photo AS t_photo,t.acct_type AS t_type,
        (SELECT COUNT(*) FROM chat_members z WHERE z.room_id=r.id AND z.ptype='student' AND z.status='active') AS n_students,
        (SELECT COUNT(*) FROM chat_messages x WHERE x.room_id=r.id AND x.deleted=0 AND x.id>COALESCE(m.last_read,0) AND NOT (x.sender_type=? AND x.sender_id=?)) AS unread,
        (SELECT MAX(q.id) FROM chat_messages q WHERE q.room_id=r.id) AS last_id
        FROM chat_rooms r LEFT JOIN subjects s ON s.id=r.subject_id LEFT JOIN teachers t ON t.id=COALESCE(r.teacher_id,s.teacher_id)
        LEFT JOIN chat_users cu ON cu.id=r.student_id ";
    if ($type === 'student') {
        $sql = $sel . "JOIN chat_members m ON m.room_id=r.id AND m.ptype='student' AND m.pid=? AND m.status='active'";
        $args = [$type, $id, $id];
    } elseif ($type === 'staff') {
        $sql = $sel . "LEFT JOIN chat_members m ON m.room_id=r.id AND m.ptype='staff' AND m.pid=? WHERE (r.kind='direct' AND r.teacher_id=?) OR (r.kind='group' AND s.teacher_id=?) OR (r.kind='support' AND r.teacher_id=?)";
        $args = [$type, $id, $id, $id, $id, $id];
    } else {
        $sql = $sel . "LEFT JOIN chat_members m ON m.room_id=r.id AND m.ptype='admin' AND m.pid=?";
        $args = [$type, $id, $id];
    }
    $st = $pdo->prepare($sql . ' ORDER BY r.last_at DESC, r.id DESC LIMIT 300'); $st->execute($args);
    $rows = $st->fetchAll();
    $ids = [];
    foreach ($rows as $r) if ((int)$r['last_id'] > 0) $ids[] = (int)$r['last_id'];
    $last = [];
    if ($ids) {
        $q = $pdo->query('SELECT id,sender_type,sender_id,sender_name,body,deleted,UNIX_TIMESTAMP(created_at) AS ts FROM chat_messages WHERE id IN (' . implode(',', $ids) . ')');
        foreach ($q->fetchAll() as $m) $last[(int)$m['id']] = $m;
    }
    $o = [];
    foreach ($rows as $r) {
        $grp = $r['kind'] === 'group';
        $tt = ($r['t_type'] ?? '') === 'cr' ? 'CR' : 'Teacher';
        $n = (int)$r['n_students'];
        $phone = ''; $email = ''; $photo = '';
        if ($r['kind'] === 'support') {   /* v33: a person (student / teacher / CR) talking with the admin */
            if ($type === 'admin') {
                $isT = (int)($r['teacher_id'] ?? 0) > 0;
                $title = $isT ? (string)$r['t_name'] : (string)$r['stu_name'];
                $sub = ($isT ? $tt : 'Student') . ' · asked the admin';
                $phone = (string)($r['stu_phone'] ?? ''); $email = (string)($r['stu_email'] ?? '');
            } else { $title = 'Admin Support'; $sub = 'Ask a question, report a problem or share an idea'; }
        } elseif ($grp) {
            $title = (string)$r['subj_name'] . ((string)($r['subj_code'] ?? '') !== '' ? ' (' . $r['subj_code'] . ')' : '');
            $sub = ((string)($r['t_name'] ?? '') !== '' ? $tt . ': ' . $r['t_name'] . ' · ' : '') . $n . ' student' . ($n === 1 ? '' : 's');
        } elseif ($type === 'student') {
            $title = (string)$r['t_name']; $sub = $tt; $photo = (string)($r['t_photo'] ?? '');
        } elseif ($type === 'staff') {
            $title = (string)$r['stu_name']; $phone = (string)($r['stu_phone'] ?? ''); $email = (string)($r['stu_email'] ?? ''); $photo = (string)($r['stu_photo'] ?? '');
            $inf = chat_user_info(['batch' => $r['stu_batch'], 'program' => $r['stu_prog'], 'sem_term' => $r['stu_term'], 'sem_year' => $r['stu_year']]);
            $sub = 'Student' . ($inf !== '' ? ' · ' . $inf : '');
        } else {
            $title = (string)$r['stu_name'] . ' ↔ ' . (string)$r['t_name']; $sub = 'Personal chat'; $phone = (string)($r['stu_phone'] ?? ''); $email = (string)($r['stu_email'] ?? '');
        }
        $lm = $last[(int)$r['last_id']] ?? null;
        $o[] = ['id' => (int)$r['id'], 'kind' => (string)$r['kind'], 'subject_id' => (int)($r['subject_id'] ?? 0), 'title' => $title, 'sub' => $sub, 'photo' => $photo,
            'phone' => $phone, 'email' => $email, 'unread' => (int)$r['unread'], 'n_students' => $n, 'last_ts' => (int)($lm['ts'] ?? 0),
            'last' => $lm ? ['text' => (int)$lm['deleted'] ? '' : (string)$lm['body'], 'deleted' => (int)$lm['deleted'], 'ts' => (int)$lm['ts'], 'name' => (string)$lm['sender_name'],
                'mine' => $lm['sender_type'] === $type && (int)$lm['sender_id'] === $id] : null];
    }
    /* newest activity first (an empty group sorts after the active ones) */
    usort($o, fn($a, $b) => $b['last_ts'] <=> $a['last_ts'] ?: $b['id'] <=> $a['id']);
    return $o;
}
/* all courses that have a teacher / CR, with this student's membership state. 'match' = the course fits the student's batch + program + semester
   (a course that leaves batch / program / semester empty fits everyone). A profile without these details yet sees every course as a match. */
function chat_courses(int $uid, array $u = []): array {
    $st = db()->prepare("SELECT s.id,s.name,s.code,s.semester_term,s.semester_year,s.department,s.program,s.batch_lock,t.name AS t_name,t.acct_type AS t_type,t.batch AS t_batch,
        (SELECT COUNT(*) FROM chat_rooms r JOIN chat_members m ON m.room_id=r.id AND m.ptype='student' AND m.status='active' WHERE r.subject_id=s.id) AS n,
        (SELECT m2.status FROM chat_rooms r2 JOIN chat_members m2 ON m2.room_id=r2.id AND m2.ptype='student' AND m2.pid=? WHERE r2.subject_id=s.id LIMIT 1) AS my
        FROM subjects s JOIN teachers t ON t.id=s.teacher_id AND t.status='active' ORDER BY s.id DESC LIMIT 400");
    $st->execute([$uid]);
    $ub = batch_num((string)($u['batch'] ?? '')); $up = prog_full((string)($u['program'] ?? ''));
    if ($ub === '') return [];   /* v24: a profile without a batch sees no course at all */
    $o = [];
    foreach ($st->fetchAll() as $r) {
        $sb = batch_num((string)($r['batch_lock'] ?? '')); $sp = prog_full((string)($r['program'] ?? '')); $stt = strtolower(trim((string)($r['semester_term'] ?? ''))); $sy = (string)($r['semester_year'] ?? '');
        if ($sb === '' && ($r['t_type'] ?? '') === 'cr') $sb = batch_num((string)($r['t_batch'] ?? ''));   /* a CR's course belongs to the CR's batch */
        /* v24: a course of another batch / program is NEVER sent to this student */
        if ($sb !== '' && $sb !== $ub) continue;
        if ($up !== '' && $sp !== '' && strcasecmp($sp, 'Both') !== 0 && strcasecmp($sp, $up) !== 0) continue;
        $match = true;
        $o[] = ['id' => (int)$r['id'], 'name' => (string)$r['name'], 'code' => (string)($r['code'] ?? ''), 'semester_term' => (string)($r['semester_term'] ?? ''),
            'semester_year' => (string)($r['semester_year'] ?? ''), 'department' => (string)($r['department'] ?? ''), 'batch' => (string)($r['batch_lock'] ?? ''), 'program' => $sp !== '' ? prog_label($sp) : '',
            't_name' => (string)$r['t_name'], 't_type' => ($r['t_type'] ?? '') === 'cr' ? 'CR' : 'Teacher', 'n' => (int)$r['n'], 'my' => $r['my'] !== null ? (string)$r['my'] : '', 'match' => $match];
    }
    return $o;
}
function chat_staff(array $u = []): array {
    $o = []; $ub = batch_num((string)($u['batch'] ?? ''));
    foreach (db()->query("SELECT id,name,department,photo,acct_type,batch FROM teachers WHERE status='active' ORDER BY CASE WHEN COALESCE(acct_type,'teacher')='cr' THEN 1 ELSE 0 END, name")->fetchAll() as $r) {
        if (($r['acct_type'] ?? '') === 'cr' && batch_num((string)($r['batch'] ?? '')) !== '' && batch_num((string)($r['batch'] ?? '')) !== $ub) continue;   /* v24: a CR of another batch is not shown */
        $o[] = ['id' => (int)$r['id'], 'name' => (string)$r['name'], 'department' => (string)($r['department'] ?? ''), 'photo' => (string)($r['photo'] ?? ''),
            'type' => ($r['acct_type'] ?? '') === 'cr' ? 'CR' : 'Teacher', 'batch' => (string)($r['batch'] ?? '')];
    }
    return $o;
}
