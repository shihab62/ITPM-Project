<?php
declare(strict_types=1);

/* Semester/department/program lists + presentation file storage and signed links. */
/* ---------- semester / department / program lists + presentation files ---------- */
function opt_list(string $k, array $def): array {
    $j = json_decode(setting($k, ''), true);
    return (is_array($j) && $j) ? array_values(array_map('strval', $j)) : $def;
}
function pres_max_mb(): int { $n = (int)setting('pres_max_mb', '20'); return ($n >= 1 && $n <= 200) ? $n : 20; }
function php_upload_limit(): string { return 'upload_max_filesize ' . (string)ini_get('upload_max_filesize') . ' · post_max_size ' . (string)ini_get('post_max_size'); }
function site_options(): array {
    return ['terms' => opt_list('opt_terms', ['Autumn', 'Spring', 'Summer']), 'depts' => opt_list('opt_depts', ['CSE', 'EEE', 'Civil', 'BBA', 'Law', 'English']),
        'programs' => array_values(array_unique(array_map('prog_full', opt_list('opt_programs', PROG_DEFAULT)))), 'pres_max_mb' => pres_max_mb()];
}
/* [can the team still upload?, message]  (admin and the course teacher are never limited by this) */
function pres_window(array $s): array {
    /* No setting, no date: a team leader (signed in with Gmail + password) can upload or replace the presentation file at any time. */
    return [true, 'Upload is open. You can upload or replace your file any time.'];
}
function pres_dir(): string { $d = DATA_DIR . '/pres'; if (!is_dir($d)) @mkdir($d, 0755, true); return $d; }
function pres_sig(int $rid, int $exp, int $dl): string {
    $k = pw_key(); if ($k === '') $k = hash('sha256', __FILE__ . DATA_DIR, true);
    return hash_hmac('sha256', $rid . '|' . $exp . '|' . $dl, $k);
}
function pres_infos(array $rids): array {
    $rids = array_values(array_map('intval', $rids));
    if (!$rids) return [];
    $st = db()->prepare('SELECT registration_id,orig_name,kind,size,updated_at FROM presentations WHERE registration_id IN (' . implode(',', array_fill(0, count($rids), '?')) . ')');
    $st->execute($rids); $o = [];
    foreach ($st->fetchAll() as $p) $o[(int)$p['registration_id']] = ['name' => (string)$p['orig_name'], 'kind' => (string)$p['kind'], 'size' => (int)$p['size'], 'updated_at' => (string)$p['updated_at']];
    return $o;
}
function pres_rm(array $stored): void {
    foreach ($stored as $s) if (is_string($s) && preg_match('/^[a-f0-9]{32}\.[a-z0-9]{1,8}$/', $s)) @unlink(pres_dir() . '/' . $s);
}
/* ANY file type may be attached (PDF / PowerPoint get the full-screen presenter, everything else is download-only). Only script / executable types are refused. */
const PRES_BLOCKED = ['php', 'php3', 'php4', 'php5', 'php7', 'php8', 'phtml', 'phar', 'pht', 'phps', 'exe', 'bat', 'cmd', 'com', 'msi', 'dll', 'scr', 'sh', 'cgi', 'pl', 'py', 'js', 'vbs', 'jar', 'html', 'htm', 'xhtml', 'svg', 'htaccess'];
const PRES_VIEWABLE = ['pdf', 'ppt', 'pptx'];
/* returns [kind, error]: kind = the lower-case extension (stored name is random, so the original name never touches the disk path) */
function pres_kind(string $tmp, string $origName): array {
    $ext = strtolower(pathinfo($origName, PATHINFO_EXTENSION));
    if ($ext === '' || !preg_match('/^[a-z0-9]{1,8}$/', $ext)) return [null, 'The file needs a normal extension (for example .pdf, .pptx, .docx, .zip).'];
    if (in_array($ext, PRES_BLOCKED, true)) return [null, 'For safety, .' . $ext . ' files are not allowed. Zip it or use another file type.'];
    if (in_array($ext, PRES_VIEWABLE, true)) {
        $k = pres_check($tmp, $ext);
        return $k ? [$k, null] : [null, 'This file does not look like a real ' . strtoupper($ext) . ' file.'];
    }
    return [$ext, null];
}
/* Real content check (not just the file name). Returns the kind or null. */
function pres_check(string $tmp, string $ext): ?string {
    $h = (string)@file_get_contents($tmp, false, null, 0, 1024);
    if ($ext === 'pdf') return strpos($h, '%PDF') !== false ? 'pdf' : null;
    if ($ext === 'ppt') return strncmp($h, "\xD0\xCF\x11\xE0\xA1\xB1\x1A\xE1", 8) === 0 ? 'ppt' : null;
    if ($ext === 'pptx') {
        if (strncmp($h, "PK\x03\x04", 4) !== 0) return null;
        if (class_exists('ZipArchive')) {
            $z = new ZipArchive();
            if ($z->open($tmp) !== true) return null;
            $ok = $z->locateName('ppt/presentation.xml') !== false;
            $z->close();
            return $ok ? 'pptx' : null;
        }
        return 'pptx';
    }
    return null;
}
/* Who is acting on this registration's presentation: admin, the subject's teacher, the team leader, or nobody. */
function pres_actor(array $reg): string {
    if (acting_admin()) return 'admin';
    $t = cur_teacher();
    if ($t) {
        $q = db()->prepare('SELECT COUNT(*) FROM subjects WHERE id=? AND teacher_id=?'); $q->execute([(int)$reg['subject_id'], (int)$t['id']]);
        if ((int)$q->fetchColumn()) return 'teacher';
    }
    if (in_array((int)$reg['id'], array_map('intval', (array)$_SESSION['leader_rids'] ?? []), true)) return 'leader';
    return '';
}
function pres_public_ok(array $reg, array $subj): bool {
    return setting('teams_public', '0') === '1' && (int)($subj['pub_teams'] ?? 1) === 1 && (int)($subj['pres_public'] ?? 1) === 1 && $reg['status'] !== 'rejected';
}
