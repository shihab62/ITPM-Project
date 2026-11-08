<?php
declare(strict_types=1);

/* Registration queries / filters / CSV helper. */
function dup_ids(int $subjectId, array $ids, int $excludeReg = 0): array {
    $ids = array_values(array_filter($ids, fn($x) => $x !== ''));
    if (!$ids) return [];
    $ph = implode(',', array_fill(0, count($ids), '?'));
    $st = db()->prepare("SELECT DISTINCT m.student_id FROM team_members m JOIN registrations r ON r.id=m.registration_id
        WHERE r.subject_id=? AND r.status!='rejected' AND r.id!=? AND m.student_id IN ($ph)");   /* column collation is case-insensitive: no LOWER() so the student_id index is used */
    $st->execute(array_merge([$subjectId, $excludeReg], array_map('strtolower', $ids)));
    return $st->fetchAll(PDO::FETCH_COLUMN);
}
function reg_where(array $f): array {
    $w = ['1=1']; $p = [];
    if (!empty($f['subject'])) { $w[] = 'r.subject_id=?'; $p[] = (int)$f['subject']; }
    if (!empty($f['code'])) { $w[] = 'r.subject_id IN (SELECT id FROM subjects WHERE code=?)'; $p[] = cl((string)$f['code'], 30); }
    if (isset($f['subject_ids']) && is_array($f['subject_ids'])) { $ids = array_values(array_map('intval', $f['subject_ids'])); $w[] = 'r.subject_id IN (' . ($ids ? implode(',', array_fill(0, count($ids), '?')) : '0') . ')'; foreach ($ids as $i) $p[] = $i; }
    if (!empty($f['id'])) { $w[] = 'r.id=?'; $p[] = (int)$f['id']; }
    if (!empty($f['sem']) && is_string($f['sem']) && strpos($f['sem'], '|') !== false) {
        [$st0, $sy0] = explode('|', $f['sem'], 2);
        $w[] = 'r.subject_id IN (SELECT id FROM subjects WHERE semester_term=? AND semester_year=?)'; $p[] = cl($st0, 30); $p[] = cl($sy0, 6);
    }
    if (!empty($f['dept'])) { $w[] = 'r.subject_id IN (SELECT id FROM subjects WHERE department=?)'; $p[] = cl((string)$f['dept'], 40); }
    /* Program filter: Undergraduate / Diploma = only that program (the student's own Program answer, else the subject's program); Both (or empty) = everything */
    $pg0 = prog_full(trim((string)($f['program'] ?? '')));
    if ($pg0 !== '' && strcasecmp($pg0, 'Both') !== 0) {
        $w[] = "(EXISTS(SELECT 1 FROM team_members pm WHERE pm.registration_id=r.id AND pm.data LIKE ?) OR (r.subject_id IN (SELECT id FROM subjects WHERE program=?) AND NOT EXISTS(SELECT 1 FROM team_members pn WHERE pn.registration_id=r.id AND pn.data LIKE '%\"program\":\"_%')))";
        $p[] = '%"program":"' . $pg0 . '"%'; $p[] = $pg0;
    }
    if (!empty($f['type']) && in_array($f['type'], ['individual', 'team'], true)) { $w[] = 'r.reg_type=?'; $p[] = $f['type']; }
    if (!empty($f['status']) && in_array($f['status'], ['pending', 'approved', 'rejected'], true)) { $w[] = 'r.status=?'; $p[] = $f['status']; }
    if (!empty($f['batch'])) { $w[] = 'EXISTS(SELECT 1 FROM team_members m WHERE m.registration_id=r.id AND m.batch=?)'; $p[] = cl($f['batch'], 20); }
    $q = cl($f['q'] ?? '', 60);
    if ($q !== '') {
        $like = '%' . str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $q) . '%';
        $w[] = "(EXISTS(SELECT 1 FROM team_members m WHERE m.registration_id=r.id AND (m.student_id LIKE ? OR m.full_name LIKE ? OR m.data LIKE ?)) OR r.ref_code LIKE ? OR COALESCE(r.team_name,'') LIKE ?)";
        $p[] = $like; $p[] = $like; $p[] = $like; $p[] = $like; $p[] = $like;
    }
    return [implode(' AND ', $w), $p];
}
function load_regs(array $f, int $limit = 1000, int $offset = 0): array {
    [$w, $p] = reg_where($f);
    $st = db()->prepare("SELECT r.*, s.name AS subject_name, p.slot_date, p.slot_label FROM registrations r
        JOIN subjects s ON s.id=r.subject_id LEFT JOIN presentation_slots p ON p.id=r.slot_id
        WHERE $w ORDER BY r.id DESC LIMIT $limit OFFSET $offset");
    $st->execute($p);
    $regs = $st->fetchAll();
    if (!$regs) return [];
    $ids = array_column($regs, 'id');
    $ph = implode(',', array_fill(0, count($ids), '?'));
    $ms = db()->prepare("SELECT m.*, (SELECT file_path FROM uploaded_photos u WHERE u.member_id=m.id ORDER BY u.id DESC LIMIT 1) AS photo
        FROM team_members m WHERE m.registration_id IN ($ph) ORDER BY m.is_leader DESC, m.id");
    $ms->execute($ids);
    $by = [];
    foreach ($ms->fetchAll() as $m) { $m['id'] = (int)$m['id']; $m['is_leader'] = (int)$m['is_leader']; $m['vals'] = member_vals($m); unset($m['data']); $by[$m['registration_id']][] = $m; }
    $pm = pres_infos(array_map('intval', $ids));
    foreach ($regs as &$r) { $r['pres'] = $pm[(int)$r['id']] ?? null; $r['leader_pw_set'] = !empty($r['leader_password_hash']); unset($r['leader_password_hash']); $r['id'] = (int)$r['id']; $r['subject_id'] = (int)$r['subject_id']; $r['members'] = $by[$r['id']] ?? []; }
    return $regs;
}
function csv_safe(string $v): string { return preg_match('/^[=+\-@\t\r]/', $v) ? "'" . $v : $v; }
