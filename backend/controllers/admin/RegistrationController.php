<?php
declare(strict_types=1);

/* Actions: regs, reg_status/delete/update, subject_public_set */
switch ($a) {
    case 'regs':
        $lim = max(10, min(200, (int)($_GET['limit'] ?? 40))); $off = max(0, (int)($_GET['offset'] ?? 0));
        $regs = load_regs($_GET, $lim + 1, $off);
        $more = count($regs) > $lim; if ($more) array_pop($regs);
        $total = null;
        if ($off === 0) { [$w0, $p0] = reg_where($_GET); $tq = $pdo->prepare("SELECT COUNT(*) FROM registrations r WHERE $w0"); $tq->execute($p0); $total = (int)$tq->fetchColumn(); }
        out(['ok' => true, 'regs' => $regs, 'more' => $more, 'total' => $total]);

    case 'reg_status':
        $s = (string)($in['status'] ?? '');
        if (!in_array($s, ['pending', 'approved', 'rejected'], true)) fail('Invalid status.');
        if ($s !== 'rejected') {
            $st = $pdo->prepare('SELECT subject_id FROM registrations WHERE id=?'); $st->execute([(int)($in['id'] ?? 0)]);
            $sub = (int)$st->fetchColumn();
            $ms = $pdo->prepare('SELECT student_id FROM team_members WHERE registration_id=?'); $ms->execute([(int)$in['id']]);
            $d = dup_ids($sub, $ms->fetchAll(PDO::FETCH_COLUMN), (int)$in['id']);
            if ($d) fail('Cannot restore: ' . implode(', ', $d) . ' is registered again for this subject.');
        }
        $pdo->prepare("UPDATE registrations SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?")->execute([$s, (int)($in['id'] ?? 0)]);
        out(['ok' => true]);

    case 'reg_delete':
        $id = (int)($in['id'] ?? 0);
        $st = $pdo->prepare('SELECT u.file_path FROM uploaded_photos u JOIN team_members m ON m.id=u.member_id WHERE m.registration_id=?');
        $st->execute([$id]); $files = $st->fetchAll(PDO::FETCH_COLUMN);
        $pq = $pdo->prepare('SELECT stored FROM presentations WHERE registration_id=?'); $pq->execute([$id]); $presFiles = $pq->fetchAll(PDO::FETCH_COLUMN);
        $pdo->prepare('DELETE FROM registrations WHERE id=?')->execute([$id]);
        rm_files($files); pres_rm($presFiles);
        out(['ok' => true]);

    case 'reg_update':
        $id = (int)($in['id'] ?? 0);
        $st = $pdo->prepare('SELECT * FROM registrations WHERE id=?'); $st->execute([$id]);
        $reg = $st->fetch();
        if (!$reg) fail('Registration not found.', 404);
        $status = (string)($in['status'] ?? $reg['status']);
        if (!in_array($status, ['pending', 'approved', 'rejected'], true)) fail('Invalid status.');
        $team = $reg['reg_type'] === 'team' ? cl($in['team_name'] ?? '', 60) : null;
        $topicU = cl($in['topic'] ?? (string)($reg['topic'] ?? ''), 200); if ($topicU === '') $topicU = null;
        if ($reg['reg_type'] === 'team' && mb_strlen($team) < 2) fail('Enter a team name.');
        $slotId = (int)($in['slot_id'] ?? 0) ?: null;
        if ($slotId) {
            $c = $pdo->prepare('SELECT COUNT(*) FROM presentation_slots WHERE id=? AND subject_id=?'); $c->execute([$slotId, $reg['subject_id']]);
            if (!(int)$c->fetchColumn()) fail('Invalid slot.');
        }
        $sq = $pdo->prepare('SELECT * FROM subjects WHERE id=?'); $sq->execute([$reg['subject_id']]);
        $fields = fields_of((array)$sq->fetch());
        $ms = is_array($in['members'] ?? null) ? $in['members'] : [];
        $leaderId = (int)($in['leader_id'] ?? 0);
        $clean = []; $ids = [];
        foreach ($ms as $m) {
            if (!is_array($m)) continue;
            $mid = (int)($m['id'] ?? 0);
            $oq = $pdo->prepare('SELECT * FROM team_members WHERE id=? AND registration_id=?'); $oq->execute([$mid, $id]);
            $old = $oq->fetch();
            if (!$old) fail('Member not found.');
            [$vals, $e] = clean_member($fields, is_array($m['vals'] ?? null) ? $m['vals'] : [], $mid === $leaderId, (string)$old['full_name'], false);
            if ($e) fail($e);
            $vals = array_merge(member_vals($old), $vals);
            [$uid, $nm] = ident($fields, $vals);
            $clean[] = ['id' => $mid, 'vals' => $vals, 'uid' => $uid, 'name' => $nm, 'remove_photo' => !empty($m['remove_photo']), 'leader' => (bool)$old['is_leader']];
            $ids[] = $uid;
        }
        if (!$clean) fail('At least one member is required.');
        $lpw = (string)($in['leader_password'] ?? '');
        if ($lpw !== '') {
            if (!strong_pw($lpw)) fail('Leader password needs 8+ characters with letters and numbers.');
        }
        $lem = null;
        if (array_key_exists('leader_email', $in)) {
            $lem = strtolower(cl((string)$in['leader_email'], 100));
            if ($lem !== '' && !filter_var($lem, FILTER_VALIDATE_EMAIL)) fail('Team leader Gmail is not a valid email address.');
        }
        $nb = array_values(array_filter(array_map('strtolower', $ids), fn($x) => $x !== ''));
        if (count(array_unique($nb)) !== count($nb)) fail('Duplicate IDs in this registration.');
        if ($status !== 'rejected' && ($d = dup_ids((int)$reg['subject_id'], $ids, $id))) fail('Already registered for this subject: ' . implode(', ', $d) . '.');
        $pdo->exec('START TRANSACTION'); $del = [];
        try {
            $lk = $pdo->prepare('SELECT id FROM subjects WHERE id=? FOR UPDATE'); $lk->execute([(int)$reg['subject_id']]);
            if ($status !== 'rejected' && ($d = dup_ids((int)$reg['subject_id'], $ids, $id))) throw new RuntimeException('Already registered for this subject: ' . implode(', ', $d) . '.');
            $pdo->prepare('UPDATE registrations SET team_name=?,topic=?,slot_id=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$team, $topicU, $slotId, $status, $id]);
            if ($lpw !== '') $pdo->prepare('UPDATE registrations SET leader_password_hash=? WHERE id=?')->execute([password_hash($lpw, PASSWORD_DEFAULT), $id]);
            if ($lem !== null) $pdo->prepare('UPDATE registrations SET leader_email=? WHERE id=?')->execute([$lem !== '' ? $lem : null, $id]);
            foreach ($clean as $m) {
                $lc = legacy_cols($m['vals']);
                $u = $pdo->prepare('UPDATE team_members SET student_id=?,full_name=?,department=?,batch=?,email=?,phone=?,gender=?,data=? WHERE id=? AND registration_id=?');
                $u->execute([$m['uid'], $m['name'], $lc[0], $lc[1], $lc[2], $lc[3], $lc[4], json_encode($m['vals'], JSON_UNESCAPED_UNICODE), $m['id'], $id]);
                if ($m['remove_photo']) {
                    $q = $pdo->prepare('SELECT file_path FROM uploaded_photos WHERE member_id=?'); $q->execute([$m['id']]);
                    $del = array_merge($del, $q->fetchAll(PDO::FETCH_COLUMN));
                    $pdo->prepare('DELETE FROM uploaded_photos WHERE member_id=?')->execute([$m['id']]);
                }
            }
            $lead = false;
            foreach ($clean as $m) if ($m['id'] === $leaderId) $lead = true;
            if ($lead) {
                $pdo->prepare('UPDATE team_members SET is_leader=0 WHERE registration_id=?')->execute([$id]);
                $pdo->prepare('UPDATE team_members SET is_leader=1 WHERE id=? AND registration_id=?')->execute([$leaderId, $id]);
            }
            $pdo->exec('COMMIT');
        } catch (Throwable $e) {
            try { $pdo->exec('ROLLBACK'); } catch (Throwable $x) {}
            fail($e instanceof RuntimeException ? $e->getMessage() : 'Could not update the registration.', $e instanceof RuntimeException ? 400 : 500);
        }
        rm_files($del);
        out(['ok' => true]);

    case 'subject_public_set':
        $u = $pdo->prepare('UPDATE subjects SET pub_teams=?, pub_individuals=? WHERE id=?');
        $pv = !empty($in['public']) ? 1 : 0;
        $u->execute([$pv, $pv, (int)($in['id'] ?? 0)]);
        if (!$u->rowCount()) fail('Subject not found.', 404);
        out(['ok' => true]);
}
