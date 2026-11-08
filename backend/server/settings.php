<?php
declare(strict_types=1);

/* Site settings (name, logo ...) and password-strength helper. */
function settings_all(bool $reset = false): array {
    static $c = null;
    if ($reset || $c === null) { $c = []; foreach (db()->query('SELECT k,v FROM settings')->fetchAll() as $r) $c[(string)$r['k']] = (string)$r['v']; }
    return $c;
}
function setting(string $k, string $d = ''): string { $all = settings_all(); return array_key_exists($k, $all) ? $all[$k] : $d; }
function site_name(): string { $n = trim(setting('site_name', '')); return $n !== '' ? $n : 'Presentation Registration'; }
function site_logo(): string {
    $p = trim(setting('site_logo', ''));
    return ($p !== '' && preg_match('#^uploads/[a-f0-9]{32}\.(jpg|png|webp)$#', $p) && is_file(APP_ROOT . '/' . $p)) ? $p : '';
}
function set_setting(string $k, string $v): void { db()->prepare('INSERT INTO settings(k,v) VALUES(?,?) ON DUPLICATE KEY UPDATE v=VALUES(v)')->execute([$k, $v]); settings_all(true); }
/* Subject row as seen by the admin / its own teacher (never includes the password hash). */
function subj_admin(array $s): array {
    $s['id'] = (int)$s['id'];
    $s['slots'] = slots_of($s['id']);
    [$s['state'], $s['message'], $s['late']] = subject_state($s, $s['slots']);
    $S = &prime_store();
    if (isset($S['regc'][$s['id']])) $s['reg_count'] = $S['regc'][$s['id']];
    else { $c = db()->prepare('SELECT COUNT(*) FROM registrations WHERE subject_id=?'); $c->execute([$s['id']]); $s['reg_count'] = (int)$c->fetchColumn(); }
    $ct = close_ts($s); $s['close_ts'] = $ct; $s['close_at'] = $ct !== null ? date('Y-m-d\TH:i', $ct) : '';
    $s['teacher_pw_set'] = !empty($s['teacher_id']);
    $s['teacher_id'] = (int)($s['teacher_id'] ?? 0);
    $s['code'] = (string)($s['code'] ?? '');
    $s['batch_lock'] = (string)($s['batch_lock'] ?? '');
    $s['fields'] = fields_of($s);
    $s['guidelines'] = guidelines_of($s);
    $s['pub_teams'] = (int)($s['pub_teams'] ?? 1);
    $s['pub_individuals'] = (int)($s['pub_individuals'] ?? 0);
    $s['semester_term'] = (string)($s['semester_term'] ?? ''); $s['semester_year'] = (int)($s['semester_year'] ?? 0);
    $s['department'] = (string)($s['department'] ?? ''); $s['program'] = (string)($s['program'] ?? '');
    $s['pres_upload'] = (int)($s['pres_upload'] ?? 1); $s['pres_public'] = (int)($s['pres_public'] ?? 1);
    [$s['pres_open'], $s['pres_msg']] = pres_window($s);
    $pc = !empty($s['pres_close_at']) ? strtotime((string)$s['pres_close_at']) : false;
    $s['pres_close_at'] = $pc !== false ? date('Y-m-d\TH:i', $pc) : '';
    $s['pres_max_mb'] = pres_max_mb();
    if (isset($S['presc'][$s['id']])) $s['pres_count'] = $S['presc'][$s['id']];
    else { $pq = db()->prepare('SELECT COUNT(*) FROM presentations p JOIN registrations r ON r.id=p.registration_id WHERE r.subject_id=?'); $pq->execute([$s['id']]); $s['pres_count'] = (int)$pq->fetchColumn(); }
    unset($s['teacher_password_hash'], $s['form_fields']);
    return $s;
}
function strong_pw(string $p): bool { return strlen($p) >= 8 && preg_match('/[A-Za-z]/', $p) && preg_match('/\d/', $p); }
