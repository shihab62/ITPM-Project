<?php
declare(strict_types=1);

/* Teacher / CR account helpers. */
function sync_teacher(int $tid): void {
    $st = db()->prepare('SELECT * FROM teachers WHERE id=?'); $st->execute([$tid]);
    $t = $st->fetch();
    if (!$t) return;
    $cr = ($t['acct_type'] ?? '') === 'cr';
    db()->prepare('UPDATE subjects SET teacher_name=?,teacher_dept=?,teacher_phone=?,teacher_email=?,teacher_photo=? WHERE teacher_id=?' . ($cr ? " AND COALESCE(course_teacher,'')=''" : ''))
        ->execute([$t['name'] . ($cr ? ' (CR, Batch ' . $t['batch'] . ')' : ''), (string)$t['department'], (string)$t['phone'], $t['email'], ($t['photo'] ?? '') !== '' ? $t['photo'] : null, $tid]);
    /* CR gave a course teacher: show that name (listed with the CR), without the CR's own contact details */
    if ($cr) db()->prepare("UPDATE subjects SET teacher_name=CONCAT(course_teacher,' (via CR ',?,')'),teacher_dept=?,teacher_phone=NULL,teacher_email=NULL,teacher_photo=NULL WHERE teacher_id=? AND COALESCE(course_teacher,'')!=''")->execute([$t['name'], (string)$t['department'], $tid]);
}
function cur_teacher(): ?array {
    if (empty($_SESSION['teacher_id'])) return null;
    $st = db()->prepare('SELECT * FROM teachers WHERE id=?'); $st->execute([(int)$_SESSION['teacher_id']]);
    $t = $st->fetch();
    if (!$t || $t['status'] !== 'active') { unset($_SESSION['teacher_id']); return null; }
    return $t;
}
/* CR forms are locked to the CR's batch: the batch field is pre-filled and required, and registration rejects any other batch (see submit). */
function apply_batch_lock(int $sid, string $batch): void {
    $batch = batch_num($batch);
    $st = db()->prepare('SELECT form_fields FROM subjects WHERE id=?'); $st->execute([$sid]);
    $fs = json_decode((string)$st->fetchColumn(), true); if (!is_array($fs) || !$fs) $fs = default_fields();
    $found = false;
    foreach ($fs as &$f) if (($f['key'] ?? '') === 'batch') { $f['def'] = $batch; $f['req'] = 'yes'; $found = true; }
    unset($f);
    if (!$found) foreach (default_fields() as $d) if (($d['key'] ?? '') === 'batch') { $d['def'] = $batch; $fs[] = $d; }
    db()->prepare('UPDATE subjects SET batch_lock=?, form_fields=? WHERE id=?')->execute([$batch, json_encode($fs, JSON_UNESCAPED_UNICODE), $sid]);
}
/* NEW: stamp a batch onto a subject's form fields + batch_lock (used by subject_save) */
function apply_batch_default(int $sid, string $batch): void {
    $st = db()->prepare('SELECT form_fields FROM subjects WHERE id=?'); $st->execute([$sid]);
    $fs = json_decode((string)$st->fetchColumn(), true); if (!is_array($fs) || !$fs) $fs = default_fields();
    $found = false;
    foreach ($fs as &$f) if (($f['key'] ?? '') === 'batch') { $f['def'] = $batch; $found = true; }
    unset($f);
    if (!$found) foreach (default_fields() as $d) if (($d['key'] ?? '') === 'batch') { $d['def'] = $batch; $fs[] = $d; }
    db()->prepare('UPDATE subjects SET batch_lock=?, form_fields=? WHERE id=?')->execute([$batch !== '' ? $batch : null, json_encode($fs, JSON_UNESCAPED_UNICODE), $sid]);
}
function teacher_pub(array $t): array {
    $c = db()->prepare('SELECT COUNT(*) FROM subjects WHERE teacher_id=?'); $c->execute([(int)$t['id']]);
    return ['id' => (int)$t['id'], 'name' => (string)$t['name'], 'department' => (string)($t['department'] ?? ''), 'phone' => (string)($t['phone'] ?? ''),
        'acct_type' => (string)($t['acct_type'] ?? 'teacher'), 'batch' => (string)($t['batch'] ?? ''), 'email' => (string)$t['email'], 'photo' => (string)($t['photo'] ?? ''), 'status' => (string)$t['status'], 'created_at' => (string)$t['created_at'], 'subject_count' => (int)$c->fetchColumn()];
}
/* Validates teacher details. Returns [clean, null] or [null, error]. */
function teacher_clean(array $in, int $exId, bool $needPw): array {
    $name = cl($in['name'] ?? '', 80);
    if (!preg_match('/^[\p{L}\p{M}\p{N}\s.,\'\-()]{2,80}$/u', $name)) return [null, 'Enter the teacher name.'];
    $dept = cl($in['department'] ?? '', 80);
    if (mb_strlen($dept) < 2) return [null, 'Enter the department.'];
    $phone = preg_replace('/[\s\-]/', '', cl($in['phone'] ?? '', 24)) ?? '';
    if (!preg_match('/^\+?\d{10,14}$/', $phone)) return [null, 'Mobile number must be 10-14 digits.'];
    $email = strtolower(cl($in['email'] ?? '', 100));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) return [null, 'Enter a valid Gmail address.'];
    $d = db()->prepare('SELECT COUNT(*) FROM teachers WHERE email=? AND id!=?'); $d->execute([$email, $exId]);
    if ((int)$d->fetchColumn()) return [null, 'A teacher with this Gmail already exists.'];
    $pw = (string)($in['password'] ?? '');
    if (($needPw || $pw !== '') && !strong_pw($pw)) return [null, 'Password needs 8+ characters with letters and numbers.'];
    $acct = ($in['acct_type'] ?? '') === 'cr' ? 'cr' : 'teacher'; $batch = '';
    if ($acct === 'cr') {
        $batch = cl($in['batch'] ?? '', 20);
        if (!batch_valid($batch)) return [null, 'Enter your batch as a number only, e.g. 32.'];
    }
    return [['name' => $name, 'department' => $dept, 'phone' => $phone, 'email' => $email, 'password' => $pw, 'acct_type' => $acct, 'batch' => $batch], null];
}
/* Replace (or remove) a teacher's photo from $_FILES['photo']. Returns an error text or ''. */
function teacher_photo_apply(int $tid, bool $remove): string {
    $st = db()->prepare('SELECT photo FROM teachers WHERE id=?'); $st->execute([$tid]);
    $old = (string)$st->fetchColumn();
    if ($remove) {
        db()->prepare('UPDATE teachers SET photo=NULL WHERE id=?')->execute([$tid]);
        if ($old !== '') rm_files([$old]);
    } else {
        $saved = [];
        try { $ph = save_photo('photo', $saved); } catch (RuntimeException $e) { return $e->getMessage(); }
        if (!$ph) return 'No photo received.';
        db()->prepare('UPDATE teachers SET photo=? WHERE id=?')->execute([$ph['path'], $tid]);
        if ($old !== '') rm_files([$old]);
    }
    sync_teacher($tid);
    return '';
}
