<?php
declare(strict_types=1);

/* Subjects: slots, state, public/admin shapes, photo saving. */
function slots_of(int $sid): array {
    $S = &prime_store(); if (isset($S['slots'][$sid])) return $S['slots'][$sid];
    $st = db()->prepare("SELECT p.id,p.slot_date AS date,p.slot_label AS label,p.capacity,
        (SELECT COUNT(*) FROM registrations r WHERE r.slot_id=p.id AND r.status!='rejected') AS used
        FROM presentation_slots p WHERE p.subject_id=? ORDER BY p.slot_date, p.id");
    $st->execute([$sid]);
    $o = [];
    foreach ($st->fetchAll() as $r) {
        $o[] = ['id' => (int)$r['id'], 'date' => $r['date'], 'label' => $r['label'], 'capacity' => (int)$r['capacity'],
                'left' => max(0, (int)$r['capacity'] - (int)$r['used'])];
    }
    return $o;
}
/* Closing moment as a Unix timestamp (all times are Asia/Dhaka, UTC+6). Falls back to the legacy date-only column. */
function close_ts(array $s): ?int {
    if (!empty($s['close_at'])) { $t = strtotime((string)$s['close_at']); if ($t !== false) return $t; }
    if (!empty($s['close_date'])) { $t = strtotime($s['close_date'] . ' 23:59:59'); if ($t !== false) return $t; }
    return null;
}
/* '' = no deadline, null = invalid, otherwise 'Y-m-d H:i' */
function norm_close(string $v): ?string {
    $v = str_replace('T', ' ', cl($v, 19));
    if ($v === '') return '';
    if (!preg_match('/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})(:\d{2})?$/', $v, $m)) return null;
    if (!checkdate((int)$m[2], (int)$m[3], (int)$m[1]) || (int)$m[4] > 23 || (int)$m[5] > 59) return null;
    return "$m[1]-$m[2]-$m[3] $m[4]:$m[5]";
}
function subject_state(array $s, array $slots): array {
    /* returns [state, message, late]. Deadline passed = still open but LATE (accepted + marked Late). Switched off (is_open=0) = closed for everyone. */
    $now = time();
    if (isset($s['pres_on']) && !(int)$s['pres_on']) return ['closed', 'The presentation has not been created for this subject yet.', false];
    if (!(int)$s['is_open']) return ['closed', 'Registration has been closed for this subject. Nobody can register now.', false];
    $ct = close_ts($s);
    $late = $ct !== null && $now >= $ct;
    if ($slots) { $any = false; foreach ($slots as $sl) if ($sl['left'] > 0) $any = true; if (!$any) return ['full', 'All presentation slots are full.', false]; }
    if ($late) return ['open', 'Deadline passed on ' . date('d M Y, h:i A', $ct) . ' (Bangladesh Time). Late registration is still accepted and will be marked Late.', true];
    return ['open', 'Registration is open.', false];
}
/* batches of a subject: the default batch value of its form + every batch that has registered (used by the search / filter bars) */
function subject_batches(array $s): array {
    $set = [];
    foreach (fields_of($s) as $f) if (($f['key'] ?? '') === 'batch' && trim((string)($f['def'] ?? '')) !== '') $set[trim((string)$f['def'])] = 1;
    $S = &prime_store();
    if (isset($S['batches'][(int)$s['id']])) $bl = $S['batches'][(int)$s['id']];
    else {
        $q = db()->prepare("SELECT DISTINCT m.batch FROM team_members m JOIN registrations r ON r.id=m.registration_id WHERE r.subject_id=? AND m.batch IS NOT NULL AND m.batch!=''");
        $q->execute([(int)$s['id']]);
        $bl = $q->fetchAll(PDO::FETCH_COLUMN);
    }
    foreach ($bl as $b) $set[trim((string)$b)] = 1;
    return array_slice(array_map('strval', array_keys($set)), 0, 30);
}
/* the form fields a student sees: when the subject is only Undergraduate (or only Diploma) the Program dropdown shows just that one */
function public_fields(array $s): array {
    $fs = fields_of($s); $p = prog_full(trim((string)($s['program'] ?? '')));
    if ($p === '' || strcasecmp($p, 'Both') === 0) return $fs;
    foreach ($fs as &$f) if (($f['key'] ?? '') === 'program' && ($f['type'] ?? '') === 'select') {
        $o = array_values(array_filter((array)($f['opts'] ?? []), fn($x) => strcasecmp(prog_full((string)$x), $p) === 0));
        if ($o) { $f['opts'] = $o; $f['def'] = $o[0]; }
    }
    unset($f);
    return $fs;
}
function subj_public(array $s): array {
    $slots = slots_of((int)$s['id']);
    [$state, $msg, $slate] = subject_state($s, $slots);
    [$pok, $pmsg] = pres_window($s);
    $pct = !empty($s['pres_close_at']) ? strtotime((string)$s['pres_close_at']) : false;
    return ['id' => (int)$s['id'], 'name' => $s['name'], 'state' => $state, 'message' => $msg, 'late' => (bool)$slate,
        'semester_term' => (string)($s['semester_term'] ?? ''), 'semester_year' => (int)($s['semester_year'] ?? 0), 'department' => (string)($s['department'] ?? ''), 'program' => (string)($s['program'] ?? ''),
        'pres_open' => $pok, 'pres_msg' => $pmsg, 'pres_close_ts' => null, 'pres_max_mb' => pres_max_mb(),
        'allow_individual' => (bool)$s['allow_individual'], 'allow_team' => (bool)$s['allow_team'],
        'min_team' => (int)$s['min_team'], 'max_team' => (int)$s['max_team'],
        'open_date' => $s['open_date'], 'close_date' => $s['close_date'], 'slots' => $slots,
        'close_ts' => close_ts($s), 'close_at' => close_ts($s) !== null ? date('Y-m-d\TH:i', close_ts($s)) : '',
        'teacher_name' => (string)($s['teacher_name'] ?? ''), 'teacher_photo' => (string)($s['teacher_photo'] ?? ''), 'teacher_phone' => (string)($s['teacher_phone'] ?? ''),
        'teacher_dept' => (string)($s['teacher_dept'] ?? ''), 'teacher_id' => (int)($s['teacher_id'] ?? 0), 'code' => (string)($s['code'] ?? ''),
        'fields' => public_fields($s), 'guidelines' => guidelines_of($s), 'batches' => subject_batches($s)];
}
function rm_files(array $rels): void {
    $root = realpath(UPLOAD_DIR);
    foreach ($rels as $r) {
        $p = realpath(APP_ROOT . '/' . $r);
        if ($root && $p && strpos($p, $root . DIRECTORY_SEPARATOR) === 0) @unlink($p);
    }
}
function save_photo(string $key, array &$saved, int $max = MAX_PHOTO): ?array {
    if (!isset($_FILES[$key]) || !is_array($_FILES[$key])) return null;
    $f = $_FILES[$key];
    if ($f['error'] === UPLOAD_ERR_NO_FILE) return null;
    if ($f['error'] !== UPLOAD_ERR_OK) throw new RuntimeException('Photo upload failed. Try a smaller image.');
    if ($f['size'] <= 0 || $f['size'] > $max) throw new RuntimeException('Each photo must be ' . (int)round($max / 1048576) . ' MB or smaller.');
    if (!is_uploaded_file($f['tmp_name'])) throw new RuntimeException('Invalid upload.');
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($f['tmp_name']);
    $map = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
    if (!isset($map[$mime]) || @getimagesize($f['tmp_name']) === false) throw new RuntimeException('Only JPG, JPEG, PNG and WEBP images are allowed.');
    $name = bin2hex(random_bytes(16)) . '.' . $map[$mime];
    $dest = UPLOAD_DIR . '/' . $name;
    if (!move_uploaded_file($f['tmp_name'], $dest)) throw new RuntimeException('Could not store the photo.');
    @chmod($dest, 0644);
    $saved[] = $dest;
    return ['path' => 'uploads/' . $name, 'mime' => $mime, 'size' => (int)$f['size']];
}
