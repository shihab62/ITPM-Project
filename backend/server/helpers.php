<?php
declare(strict_types=1);

/* Small helpers: JSON output, CSRF, password sealing, rate limiting, cache. */
/* v17: program full names + batch is a NUMBER only (e.g. 32). Old values like 'UG' / '32 UG' are converted automatically. */
const PROG_DEFAULT = ['Undergraduate', 'Diploma'];
function prog_full(string $p): string { $p = trim($p); $u = strtoupper($p); return $u === 'UG' ? 'Undergraduate' : ($u === 'DH' ? 'Diploma' : $p); }
function prog_label(string $p): string { $p = prog_full($p); return strcasecmp($p, 'Both') === 0 ? 'Undergraduate & Diploma' : $p; }
function batch_num(string $b): string { $b = trim($b); return preg_match('/^(\d{1,4})(?!\d)/', $b, $m) ? $m[1] : $b; }
function batch_valid(string $b): bool { return (bool)preg_match('/^\d{1,4}$/', $b); }

/* ---------- helpers ---------- */
function out($d, int $c = 200): void {
    http_response_code($c);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    if (!headers_sent() && function_exists('ob_gzhandler') && !ini_get('zlib.output_compression') && !ob_get_level()) @ob_start('ob_gzhandler');
    echo json_encode($d, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
function fail(string $m, int $c = 400): void { out(['ok' => false, 'error' => $m], $c); }
function cl($v, int $max = 255): string {
    $v = is_string($v) ? $v : '';
    $v = preg_replace('/[\x00-\x1F\x7F]/u', '', $v) ?? '';
    return mb_substr(trim($v), 0, $max);
}
function need_csrf(?string $tok = null): void {
    $t = $tok ?? ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
    if (!hash_equals($_SESSION['csrf'], (string)$t)) fail('Security token expired. Please refresh the page.', 419);
}
/* v19 FIX: one browser can hold an admin session AND a teacher session at the same time. Before, the admin session always won, so a teacher panel was
   served ALL data. Now every request says which panel is calling (X-Role header, or ?as= for download links). A teacher panel is never treated as admin. */
function acting_role(): string { $r = strtolower((string)($_SERVER['HTTP_X_ROLE'] ?? ($_GET['as'] ?? ''))); return $r === 'teacher' ? 'teacher' : ($r === 'admin' ? 'admin' : ''); }
function acting_admin(): bool { return !empty($_SESSION['admin_id']) && acting_role() !== 'teacher'; }
function need_admin(): void { if (!acting_admin()) fail('Please sign in as admin.', 401); }
function body(): array { $j = json_decode((string)file_get_contents('php://input'), true); return is_array($j) ? $j : []; }
function valid_date(string $d): bool { return (bool)preg_match('/^\d{4}-\d{2}-\d{2}$/', $d) && strtotime($d) !== false; }

/* Reversible (AES-256-GCM) copy of a teacher's password so the admin can look it up. The key lives in data/.pwkey (web access blocked). */
function pw_key(): string {
    $f = DATA_DIR . '/.pwkey';
    if (!is_file($f)) { @file_put_contents($f, bin2hex(random_bytes(32))); @chmod($f, 0600); }
    $k = @hex2bin(trim((string)@file_get_contents($f)));
    return is_string($k) && strlen($k) === 32 ? $k : '';
}
function pw_seal(string $p): string {
    if ($p === '' || !function_exists('openssl_encrypt')) return '';
    $k = pw_key(); if ($k === '') return '';
    $iv = random_bytes(12); $tag = '';
    $c = openssl_encrypt($p, 'aes-256-gcm', $k, OPENSSL_RAW_DATA, $iv, $tag);
    return $c === false ? '' : base64_encode($iv . $tag . $c);
}
function pw_open(?string $s): string {
    if (!$s || !function_exists('openssl_decrypt')) return '';
    $k = pw_key(); $raw = base64_decode($s, true);
    if ($k === '' || $raw === false || strlen($raw) < 29) return '';
    $r = openssl_decrypt(substr($raw, 28), 'aes-256-gcm', $k, OPENSSL_RAW_DATA, substr($raw, 0, 12), substr($raw, 12, 16));
    return $r === false ? '' : $r;
}
function pw_store(int $tid, string $plain): void {
    $e = pw_seal($plain);
    if ($e !== '') db()->prepare('UPDATE teachers SET pw_enc=? WHERE id=?')->execute([$e, $tid]);
}

/* ---------- speed helpers ---------- */
/* tiny file cache for the public pages (5 s). Any POST flushes it when the request ends, so changes show up immediately. */
/* ---------- rate limiting (per IP / per account, stored in MySQL so it cannot be bypassed by dropping the cookie) ---------- */
function client_ip(): string { return substr((string)($_SERVER['REMOTE_ADDR'] ?? '0'), 0, 45); }
function rl_table(): void {
    static $done = false; if ($done) return; $done = true;
    try { db()->exec("CREATE TABLE IF NOT EXISTS rate_limits(k CHAR(40) NOT NULL PRIMARY KEY, n INT NOT NULL DEFAULT 0, win_start BIGINT NOT NULL, KEY idx_rl_win (win_start)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"); } catch (Throwable $e) {}
}
/* returns seconds to wait (0 = allowed). Does not count. */
function rl_wait(string $bucket, int $max, int $win): int {
    try {
        rl_table();
        $st = db()->prepare('SELECT n,win_start FROM rate_limits WHERE k=?'); $st->execute([sha1($bucket)]); $r = $st->fetch();
        if (!$r) return 0;
        $left = (int)$r['win_start'] + $win - time();
        return ($left > 0 && (int)$r['n'] >= $max) ? $left : 0;
    } catch (Throwable $e) { return 0; }
}
function rl_hit(string $bucket, int $win): void {
    try {
        rl_table(); $now = time();
        $st = db()->prepare('INSERT INTO rate_limits(k,n,win_start) VALUES(?,1,?) ON DUPLICATE KEY UPDATE n=IF(win_start+?<?,1,n+1), win_start=IF(win_start+?<?,?,win_start)');
        $st->execute([sha1($bucket), $now, $win, $now, $win, $now, $now]);
        if (random_int(1, 200) === 1) db()->prepare('DELETE FROM rate_limits WHERE win_start < ?')->execute([$now - 86400]);
    } catch (Throwable $e) {}
}
function rl_guard(string $bucket, int $max, int $win, string $msg = 'Too many attempts. Please wait'): void {
    $w = rl_wait($bucket, $max, $win);
    if ($w > 0) { header('Retry-After: ' . $w); fail($msg . ' ' . $w . ' seconds.', 429); }
}
function log_err(string $line): void {
    $f = DATA_DIR . '/error.log';
    if (is_file($f) && filesize($f) > 1048576) @rename($f, DATA_DIR . '/error.old.log');
    @file_put_contents($f, $line, FILE_APPEND | LOCK_EX);
}
function cache_dir(): string { $d = DATA_DIR . '/cache'; if (!is_dir($d)) @mkdir($d, 0755, true); return $d; }
function cache_get(string $k, int $ttl): ?array {
    $f = cache_dir() . '/' . $k . '.json';
    if (!is_file($f) || filemtime($f) < time() - $ttl) return null;
    $j = json_decode((string)@file_get_contents($f), true);
    return is_array($j) ? $j : null;
}
function cache_put(string $k, array $v): void {
    $f = cache_dir() . '/' . $k . '.json'; $t = $f . '.' . bin2hex(random_bytes(4)) . '.tmp';
    if (@file_put_contents($t, json_encode($v, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)) !== false) @rename($t, $f);
}
function cache_flush_needed(string $a): bool { return strpos($a, 'chat_') !== 0 && !in_array($a, ['login', 'teacher_login', 'leader_login', 'leader_switch', 'forgot_request', 'forgot_reset', 'logout', 'me', 'track'], true); }
function cache_flush(): void { foreach (glob(cache_dir() . '/*.json') ?: [] as $f) @unlink($f); }
/* list pages load slots / counts / batches of ALL subjects with a few grouped queries instead of 3-4 queries per subject */
function &prime_store(): array { static $s = ['slots' => [], 'regc' => [], 'presc' => [], 'batches' => []]; return $s; }
function prime_subjects(array $ids): void {
    $ids = array_values(array_unique(array_map('intval', $ids)));
    if (!$ids) return;
    $S = &prime_store(); $pdo = db();
    $ph = implode(',', array_fill(0, count($ids), '?'));
    foreach ($ids as $i) { $S['slots'][$i] = []; $S['regc'][$i] = 0; $S['presc'][$i] = 0; $S['batches'][$i] = []; }
    $q = $pdo->prepare("SELECT p.id,p.subject_id,p.slot_date AS date,p.slot_label AS label,p.capacity,COALESCE(u.n,0) AS used FROM presentation_slots p
        LEFT JOIN (SELECT slot_id,COUNT(*) AS n FROM registrations WHERE subject_id IN ($ph) AND status!='rejected' AND slot_id IS NOT NULL GROUP BY slot_id) u ON u.slot_id=p.id
        WHERE p.subject_id IN ($ph) ORDER BY p.slot_date, p.id");
    $q->execute(array_merge($ids, $ids));
    foreach ($q->fetchAll() as $r)
        $S['slots'][(int)$r['subject_id']][] = ['id' => (int)$r['id'], 'date' => $r['date'], 'label' => $r['label'], 'capacity' => (int)$r['capacity'], 'left' => max(0, (int)$r['capacity'] - (int)$r['used'])];
    $q = $pdo->prepare("SELECT subject_id,COUNT(*) FROM registrations WHERE subject_id IN ($ph) GROUP BY subject_id"); $q->execute($ids);
    foreach ($q->fetchAll(PDO::FETCH_NUM) as $r) $S['regc'][(int)$r[0]] = (int)$r[1];
    $q = $pdo->prepare("SELECT r.subject_id,COUNT(*) FROM presentations p JOIN registrations r ON r.id=p.registration_id WHERE r.subject_id IN ($ph) GROUP BY r.subject_id"); $q->execute($ids);
    foreach ($q->fetchAll(PDO::FETCH_NUM) as $r) $S['presc'][(int)$r[0]] = (int)$r[1];
    $q = $pdo->prepare("SELECT DISTINCT r.subject_id,m.batch FROM team_members m JOIN registrations r ON r.id=m.registration_id WHERE r.subject_id IN ($ph) AND m.batch IS NOT NULL AND m.batch!=''"); $q->execute($ids);
    foreach ($q->fetchAll(PDO::FETCH_NUM) as $r) $S['batches'][(int)$r[0]][] = (string)$r[1];
}
