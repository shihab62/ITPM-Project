<?php
declare(strict_types=1);

/* Actions: logout + team-leader login / update / chat */
    if ($a === 'logout') {
        need_csrf();
        $_SESSION = []; session_regenerate_id(true);
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
        out(['ok' => true, 'csrf' => $_SESSION['csrf']]);
    }

    /* ----- team leader ----- */
    if ($a === 'leader_login') {
        if (!$post) fail('POST required.', 405);
        need_csrf();
        leader_locked();
        $in = body();
        rl_guard('acct|L' . strtolower(trim((string)($in['email'] ?? ''))), 8, 900, 'Too many attempts for this login. Wait');
        $ids = leader_find_ids((string)($in['email'] ?? ''));
        if (!$ids) leader_fail('No team leader found with this Gmail or mobile number.');
        session_regenerate_id(true);
        $_SESSION['leader_rids'] = $ids; $_SESSION['leader_rid'] = $ids[0]; $_SESSION['lfails'] = 0;
        out(['ok' => true, 'csrf' => $_SESSION['csrf'], 'leader' => leader_payload($ids[0])]);
    }
    /* a leader who leads several teams (same Gmail or mobile number) can switch between them */
    if ($a === 'leader_switch') {
        if (!$post) fail('POST required.', 405);
        need_csrf();
        $in = body(); $t = (int)($in['id'] ?? 0);
        if (!$t || !in_array($t, array_map('intval', (array)($_SESSION['leader_rids'] ?? [])), true)) fail('Team not found.', 403);
        $_SESSION['leader_rid'] = $t;
        out(['ok' => true, 'leader' => leader_payload($t)]);
    }
    /* v34: a team leader opens the admin chat straight from the leader panel. The chat profile is made from the leader's own details (same Gmail = same profile). */
    if ($a === 'leader_chat') {
        if (!$post) fail('POST required.', 405);
        need_csrf();
        $rid = (int)($_SESSION['leader_rid'] ?? 0);
        if (!$rid) fail('Please sign in again.', 401);
        if (!chat_on()) fail('Chat is switched off right now.', 403);
        $q = db()->prepare('SELECT r.leader_email, m.full_name, m.email, m.batch, m.data FROM registrations r LEFT JOIN team_members m ON m.registration_id=r.id AND m.is_leader=1 WHERE r.id=? LIMIT 1');
        $q->execute([$rid]); $lr = $q->fetch();
        if (!$lr) fail('Team not found.', 404);
        $em = strtolower(cl((string)(($lr['leader_email'] ?? '') !== '' ? $lr['leader_email'] : ($lr['email'] ?? '')), 100));
        if ($em === '' || !filter_var($em, FILTER_VALIDATE_EMAIL)) fail('No valid Gmail is saved for your team. Please create your chat profile on the Chat page.', 422);
        $q = db()->prepare('SELECT id FROM chat_users WHERE email=?'); $q->execute([$em]); $uid = (int)$q->fetchColumn();
        if (!$uid) {
            $nm = cl((string)($lr['full_name'] ?? ''), 80); if (mb_strlen($nm) < 2) $nm = 'Team leader';
            $bt = batch_num(cl((string)($lr['batch'] ?? ''), 10)); if (!batch_valid($bt)) $bt = null;
            $dj = json_decode((string)($lr['data'] ?? ''), true); $pg = is_array($dj) ? prog_full(cl((string)($dj['program'] ?? ''), 40)) : '';
            if (!in_array($pg, chat_programs(), true)) $pg = null;
            db()->prepare('INSERT INTO chat_users(name,email,batch,program) VALUES(?,?,?,?)')->execute([$nm, $em, $bt, $pg]);
            $uid = (int)db()->lastInsertId();
        }
        $_SESSION['chat_uid'] = $uid;
        out(['ok' => true]);
    }
    if ($a === 'leader_update' || $a === 'leader_password') {
        $rid = (int)($_SESSION['leader_rid'] ?? 0);
        if (!$rid) fail('Please sign in again.', 401);
        if (!$post) fail('POST required.', 405);
        need_csrf();
        $st = $pdo->prepare("SELECT * FROM registrations WHERE id=?"); $st->execute([$rid]);
        $reg = $st->fetch();
        if (!$reg) { unset($_SESSION['leader_rid']); fail('Please sign in again.', 401); }
        $lq0 = $pdo->prepare('SELECT * FROM subjects WHERE id=?'); $lq0->execute([$reg['subject_id']]);
        if ($a === 'leader_update' && ($lm = leader_locked_msg((array)$lq0->fetch()))) fail('Registration is closed, so nothing can be changed any more. (' . $lm . ')', 403);

        if ($a === 'leader_password') {
            /* login details belong to the person, not to one team: change them for every team this leader leads (blocked only when ALL their teams are closed) */
            $myIds = array_values(array_unique(array_map('intval', (array)($_SESSION['leader_rids'] ?? [$rid])))); if (!in_array($rid, $myIds, true)) $myIds[] = $rid;
            $allLocked = true;
            foreach ($myIds as $mid0) {
                $q1 = $pdo->prepare('SELECT s.* FROM subjects s JOIN registrations r ON r.subject_id=s.id WHERE r.id=?'); $q1->execute([$mid0]);
                $s1 = $q1->fetch();
                if ($s1 && leader_locked_msg($s1) === null) { $allLocked = false; break; }
            }
            if ($allLocked) fail('Registration is closed for all your subjects, so login details can no longer be changed.', 403);
            $in = body();
            $email = strtolower(cl($in['email'] ?? (string)$reg['leader_email'], 100));
            if (!filter_var($email, FILTER_VALIDATE_EMAIL)) fail('Enter a valid Gmail address.');
            if ($email === strtolower((string)$reg['leader_email'])) fail('Nothing to change.');
            $oldEm = strtolower((string)$reg['leader_email']);
            $ph2 = implode(',', array_fill(0, count($myIds), '?'));
            $pdo->prepare("UPDATE registrations SET leader_email=? WHERE id IN ($ph2) AND LOWER(COALESCE(leader_email,''))=?")
                ->execute(array_merge([$email], $myIds, [$oldEm]));
            out(['ok' => true, 'leader' => leader_payload($rid)]);
        }

        if ($reg['status'] === 'rejected') fail('This registration was rejected, so it can no longer be edited.', 403);
        $sq = $pdo->prepare('SELECT * FROM subjects WHERE id=?'); $sq->execute([$reg['subject_id']]);
        $fields = fields_of((array)$sq->fetch());
        $hasPhoto = false; foreach ($fields as $f) if ($f['type'] === 'photo') $hasPhoto = true;
        $isTeamReg = $reg['reg_type'] === 'team';   /* individuals edit only their own details (no team name / topic) */
        $team = $isTeamReg ? cl($_POST['team_name'] ?? '', 60) : null;
        $topic = cl($_POST['topic'] ?? '', 200); if ($topic === '') $topic = null;   /* optional */
        if ($isTeamReg && mb_strlen((string)$team) < 2) fail('Enter a team name.');
        $ms = json_decode((string)($_POST['members'] ?? '[]'), true);
        if (!is_array($ms) || !$ms) fail('Team data is invalid.');
        $cnt = $pdo->prepare('SELECT COUNT(*) FROM team_members WHERE registration_id=?'); $cnt->execute([$rid]);
        if (count($ms) !== (int)$cnt->fetchColumn()) fail('Team data is out of date. Please refresh the page.');
        $clean = []; $ids = []; $mids = [];
        foreach ($ms as $m) {
            if (!is_array($m)) fail('Team data is invalid.');
            $mid = (int)($m['id'] ?? 0);
            $oq = $pdo->prepare('SELECT * FROM team_members WHERE id=? AND registration_id=?'); $oq->execute([$mid, $rid]);
            $old = $oq->fetch();
            if (!$old || in_array($mid, $mids, true)) fail('Member not found.');
            $mids[] = $mid;
            [$vals, $e] = clean_member($fields, is_array($m['vals'] ?? null) ? $m['vals'] : [], (bool)$old['is_leader'], (string)$old['full_name'], true);
            if ($e) fail($e);
            $vals = array_merge(member_vals($old), $vals);
            [$uid, $nm] = ident($fields, $vals);
            $clean[] = ['id' => $mid, 'vals' => $vals, 'uid' => $uid, 'name' => $nm, 'remove_photo' => !empty($m['remove_photo']), 'leader' => (bool)$old['is_leader']];
            $ids[] = $uid;
        }
        $nb = array_values(array_filter(array_map('strtolower', $ids), fn($x) => $x !== ''));
        if (count(array_unique($nb)) !== count($nb)) fail('The same ID appears more than once in this team.');
        if ($d = dup_ids((int)$reg['subject_id'], $ids, $rid)) fail('Already registered for this subject: ' . implode(', ', $d) . '.');
        $pf = photo_field($fields); $pmax = photo_max($fields);
        foreach ($clean as $m) {
            if (!photo_needed($pf, $m['leader'])) continue;
            $up0 = isset($_FILES['photo_' . $m['id']]) && ($_FILES['photo_' . $m['id']]['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE;
            $hc = $pdo->prepare('SELECT COUNT(*) FROM uploaded_photos WHERE member_id=?'); $hc->execute([$m['id']]);
            if (!$up0 && (!(int)$hc->fetchColumn() || $m['remove_photo'])) fail($m['name'] . ': ' . $pf['label'] . ' is required.');
        }

        $saved = []; $del = []; $inTx = false;
        try {
            $pdo->exec('START TRANSACTION'); $inTx = true;
            $lk = $pdo->prepare('SELECT id FROM subjects WHERE id=? FOR UPDATE'); $lk->execute([(int)$reg['subject_id']]);   /* same lock as registration: no two edits can race */
            if ($d = dup_ids((int)$reg['subject_id'], $ids, $rid)) throw new RuntimeException('Already registered for this subject: ' . implode(', ', $d) . '.');
            $pdo->prepare('UPDATE registrations SET team_name=?,topic=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$team, $topic, $rid]);
            $up = $pdo->prepare('UPDATE team_members SET student_id=?,full_name=?,department=?,batch=?,email=?,phone=?,gender=?,data=? WHERE id=? AND registration_id=?');
            $ip = $pdo->prepare('INSERT INTO uploaded_photos(member_id,file_path,mime_type,file_size) VALUES(?,?,?,?)');
            foreach ($clean as $m) {
                $lc = legacy_cols($m['vals']);
                $up->execute([$m['uid'], $m['name'], $lc[0], $lc[1], $lc[2], $lc[3], $lc[4], json_encode($m['vals'], JSON_UNESCAPED_UNICODE), $m['id'], $rid]);
                $newPh = $hasPhoto ? save_photo('photo_' . $m['id'], $saved, $pmax) : null;
                if ($newPh || $m['remove_photo']) {
                    $q = $pdo->prepare('SELECT file_path FROM uploaded_photos WHERE member_id=?'); $q->execute([$m['id']]);
                    $del = array_merge($del, $q->fetchAll(PDO::FETCH_COLUMN));
                    $pdo->prepare('DELETE FROM uploaded_photos WHERE member_id=?')->execute([$m['id']]);
                }
                if ($newPh) $ip->execute([$m['id'], $newPh['path'], $newPh['mime'], $newPh['size']]);
            }
            $pdo->exec('COMMIT'); $inTx = false;
        } catch (Throwable $e) {
            if ($inTx) { try { $pdo->exec('ROLLBACK'); } catch (Throwable $x) {} }
            foreach ($saved as $f) @unlink($f);
            $user = $e instanceof RuntimeException;
            fail($user ? $e->getMessage() : 'Could not save the changes. Please try again.', $user ? 400 : 500);
        }
        rm_files($del);
        out(['ok' => true, 'leader' => leader_payload($rid)]);
    }
