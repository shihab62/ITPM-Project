<?php
declare(strict_types=1);

/* Assignment / lab-report file helpers. */
const TASK_EXT = ['pdf' => 1, 'doc' => 1, 'docx' => 1, 'ppt' => 1, 'pptx' => 1, 'xls' => 1, 'xlsx' => 1, 'zip' => 1, 'txt' => 1, 'jpg' => 1, 'png' => 1];
function task_dir(): string { $d = DATA_DIR . '/tasks'; if (!is_dir($d)) @mkdir($d, 0755, true); return $d; }
function task_window(array $t): array {
    /* [open, message, late]: switched off = nobody can submit; deadline passed = still accepted but marked Late */
    if (!(int)$t['is_open']) return [false, 'Submission has been closed. Nobody can submit now.', false];
    $d = !empty($t['due_at']) ? strtotime((string)$t['due_at']) : false;
    if ($d !== false && time() >= $d) return [true, 'Deadline passed on ' . date('d M Y, h:i A', $d) . ' (Bangladesh Time). Late submissions are accepted and will be marked Late.', true];
    return [true, $d !== false ? 'Open until ' . date('d M Y, h:i A', $d) . ' (Bangladesh Time).' : 'Open.', false];
}
function task_check(string $tmp, string $ext): bool {
    $h = (string)@file_get_contents($tmp, false, null, 0, 16);
    if ($ext === 'pdf') return strpos($h, '%PDF') !== false;
    if (in_array($ext, ['doc', 'ppt', 'xls'], true)) return strncmp($h, "\xD0\xCF\x11\xE0", 4) === 0;
    if (in_array($ext, ['docx', 'pptx', 'xlsx', 'zip'], true)) return strncmp($h, "PK\x03\x04", 4) === 0;
    if ($ext === 'jpg') return strncmp($h, "\xFF\xD8\xFF", 3) === 0;
    if ($ext === 'png') return strncmp($h, "\x89PNG", 4) === 0;
    if ($ext === 'txt') return strpos((string)@file_get_contents($tmp, false, null, 0, 2048), "\0") === false;
    return false;
}
/* a task row the current teacher/admin may manage, or a 404 */
function task_mine(int $tid, ?array $tch, array $owned): array {
    $q = db()->prepare('SELECT * FROM tasks WHERE id=?'); $q->execute([$tid]); $t = $q->fetch();
    if (!$t || ($tch && !in_array((int)$t['subject_id'], $owned, true))) fail('Not found.', 404);
    return $t;
}
function task_rm_files(string $where, array $args): void {
    $q = db()->prepare("SELECT stored FROM task_subs WHERE $where"); $q->execute($args);
    foreach ($q->fetchAll(PDO::FETCH_COLUMN) as $f) if (preg_match('/^[a-f0-9]{32}\.[a-z]{2,4}$/', (string)$f)) @unlink(task_dir() . '/' . $f);
}
