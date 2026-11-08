<?php
declare(strict_types=1);

/* Team-leader helpers. */
/* ---------- team leader helpers ---------- */
/* Everything the leader dashboard needs: the team, its subject (public view) and whether it can still be edited. */
/* Registration closed (deadline passed or switched off) => team leaders can no longer change anything. Returns the reason, or null while open. */
function leader_locked_msg(array $s): ?string {
    [$state, $msg] = subject_state($s, slots_of((int)$s['id']));
    if ($state === 'closed') return $msg;
    /* FIX: once the subject's registration deadline has passed, the team leader can no longer change anything (new late registrations are still accepted by subject_state). */
    $ct = close_ts($s);
    if ($ct !== null && time() >= $ct) return 'Deadline passed on ' . date('d M Y, h:i A', $ct) . ' (Bangladesh Time).';
    return null;
}
function leader_payload(int $rid): ?array {
    $rows = load_regs(['id' => $rid], 1);
    if (!$rows) return null;
    $r = $rows[0];
    $sq = db()->prepare('SELECT * FROM subjects WHERE id=?'); $sq->execute([$r['subject_id']]);
    $s = $sq->fetch();
    if (!$s) return null;
    $lock = leader_locked_msg($s);
    $rids = array_values(array_unique(array_map('intval', (array)($_SESSION['leader_rids'] ?? [$rid]))));
    if (!in_array($rid, $rids, true)) $rids[] = $rid;
    /* every team this leader leads, with its subject details (shown subject-wise on the leader profile) */
    $ids = $rids; rsort($ids);
    $teams = [];
    foreach ($ids as $tid) {
        $rr = load_regs(['id' => $tid], 1);
        if (!$rr) continue;
        $t = $rr[0];
        $tsq = db()->prepare('SELECT * FROM subjects WHERE id=?'); $tsq->execute([$t['subject_id']]);
        $ts = $tsq->fetch();
        if (!$ts) continue;
        $tl = leader_locked_msg($ts);
        $teams[] = ['id' => (int)$t['id'], 'reg_type' => (string)$t['reg_type'], 'team_name' => (string)$t['team_name'], 'ref_code' => (string)$t['ref_code'], 'status' => (string)$t['status'],
            'subject_id' => (int)$ts['id'], 'subject_name' => (string)$ts['name'], 'code' => (string)($ts['code'] ?? ''),
            'semester_term' => (string)($ts['semester_term'] ?? ''), 'semester_year' => (int)($ts['semester_year'] ?? 0),
            'department' => (string)($ts['department'] ?? ''), 'program' => (string)($ts['program'] ?? ''), 'batches' => subject_batches($ts),
            'teacher_name' => (string)($ts['teacher_name'] ?? ''),
            'slot_date' => $t['slot_date'], 'slot_label' => $t['slot_label'], 'pres' => !empty($t['pres']) ? (string)$t['pres']['name'] : null,
            'members' => count($t['members']), 'locked' => $tl !== null, 'lock_msg' => $tl, 'close_ts' => close_ts($ts),
            'editable' => $t['status'] !== 'rejected' && $tl === null];
    }
    return ['reg' => $r, 'subject' => subj_public($s), 'locked' => $lock !== null, 'lock_msg' => $lock,
            'editable' => $r['status'] !== 'rejected' && $lock === null, 'teams' => $teams, 'email' => (string)($r['leader_email'] ?? '')];
}
function leader_fail(string $m): void {
    $_SESSION['lfails'] = ($_SESSION['lfails'] ?? 0) + 1;
    if ($_SESSION['lfails'] >= 5) { $_SESSION['llock_until'] = time() + 60; $_SESSION['lfails'] = 0; }
    rl_hit('auth|' . client_ip(), 600);
    session_write_close(); usleep(random_int(600000, 1100000));
    fail($m, 401);
}
/* Password-less team leader login: the leader types the Gmail OR the mobile number they gave at registration.
   Returns the ids of every registration (team / individual) that this Gmail or mobile number leads. */
function leader_find_ids(string $login): array {
    $login = trim($login);
    if ($login === '') return [];
    $pdo = db();
    if (strpos($login, '@') !== false) {
        $st = $pdo->prepare("SELECT id FROM registrations WHERE LOWER(leader_email)=? ORDER BY id DESC");
        $st->execute([strtolower($login)]);
        return array_map('intval', $st->fetchAll(PDO::FETCH_COLUMN));
    }
    $d = preg_replace('/\D/', '', $login) ?? '';
    if (strlen($d) < 10) return [];
    $d = substr($d, -10);   /* +8801712345678, 8801712345678 and 01712345678 all match */
    $norm = fn(string $c) => "substr(replace(replace(replace(replace(replace(COALESCE($c,''),' ',''),'-',''),'+',''),'(',''),')',''),-10)";
    $st = $pdo->prepare("SELECT DISTINCT r.id FROM registrations r LEFT JOIN team_members m ON m.registration_id=r.id AND m.is_leader=1
        WHERE " . $norm('m.phone') . "=? OR " . $norm('r.leader_phone') . "=? ORDER BY r.id DESC");
    $st->execute([$d, $d]);
    return array_map('intval', $st->fetchAll(PDO::FETCH_COLUMN));
}
/* the freshly registered team + every other team the same leader (same Gmail or same mobile) already leads */
function leader_ids_for_reg(int $rid): array {
    $ids = [$rid];
    $st = db()->prepare("SELECT COALESCE(r.leader_email,'') AS e, COALESCE(NULLIF(r.leader_phone,''),(SELECT m.phone FROM team_members m WHERE m.registration_id=r.id AND m.is_leader=1 LIMIT 1),'') AS p FROM registrations r WHERE r.id=?");
    $st->execute([$rid]); $row = $st->fetch();
    if ($row) foreach ([(string)$row['e'], (string)$row['p']] as $k) if ($k !== '') foreach (leader_find_ids($k) as $x) if (!in_array($x, $ids, true)) $ids[] = $x;
    return $ids;
}
function leader_locked(): void {
    $now = time();
    if (($_SESSION['llock_until'] ?? 0) > $now) fail('Too many attempts. Wait ' . ($_SESSION['llock_until'] - $now) . ' seconds.', 429);
}
