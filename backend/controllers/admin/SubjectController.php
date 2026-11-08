<?php
declare(strict_types=1);

/* Actions: stats, subjects_admin, subject_save/extend/toggle/delete */
switch ($a) {
    case 'stats':
        $t = $pdo->query("SELECT COUNT(*) AS total, COALESCE(SUM(reg_type='individual'),0) AS ind, COALESCE(SUM(reg_type='team'),0) AS teams,
            COALESCE(SUM(status='pending'),0) AS pend, COALESCE(SUM(status='approved'),0) AS appr, COALESCE(SUM(status='rejected'),0) AS rej FROM registrations")->fetch();
        $by = $pdo->query("SELECT s.id,s.name,COALESCE(a.regs,0) AS regs,COALESCE(b.students,0) AS students FROM subjects s
            LEFT JOIN (SELECT subject_id,COUNT(*) AS regs FROM registrations GROUP BY subject_id) a ON a.subject_id=s.id
            LEFT JOIN (SELECT r.subject_id,COUNT(*) AS students FROM team_members m JOIN registrations r ON r.id=m.registration_id WHERE r.status!='rejected' GROUP BY r.subject_id) b ON b.subject_id=s.id
            ORDER BY s.name")->fetchAll();
        foreach ($by as &$b0) { $b0['id'] = (int)$b0['id']; $b0['regs'] = (int)$b0['regs']; $b0['students'] = (int)$b0['students']; } unset($b0);
        out(['ok' => true, 'total' => (int)$t['total'], 'individual' => (int)$t['ind'], 'teams' => (int)$t['teams'],
            'students' => array_sum(array_column($by, 'students')),
            'pending' => (int)$t['pend'], 'approved' => (int)$t['appr'], 'rejected' => (int)$t['rej'], 'bySubject' => $by]);

    case 'subjects_admin':
        if ($tch) { $rq = $pdo->prepare('SELECT * FROM subjects WHERE teacher_id=? ORDER BY name'); $rq->execute([(int)$tch['id']]); $rows = $rq->fetchAll(); }
        else $rows = $pdo->query('SELECT * FROM subjects ORDER BY name')->fetchAll();
        prime_subjects(array_column($rows, 'id'));
        out(['ok' => true, 'server_now' => time(), 'options' => site_options(), 'subjects' => array_map('subj_admin', $rows)]);

    case 'subject_save':
        $id = (int)($in['id'] ?? 0);
        $name = cl($in['name'] ?? '', 120);
        if (mb_strlen($name) < 2) fail('Enter a subject name.');
        /* batch + programs are accepted by both branches */
        $batchIn = cl($in['batch'] ?? '', 20);
        if ($batchIn !== '' && !batch_valid($batchIn)) fail('Enter the batch as a number only, e.g. 32.');
        $rawProg = $in['program'] ?? '';
        if (is_array($rawProg)) $rawProg = implode(',', array_map('strval', $rawProg));
        $progList = array_values(array_filter(array_map(fn($x) => prog_full(cl(trim($x), 30)), explode(',', (string)$rawProg)), fn($x) => $x !== ''));
        $progList = array_values(array_unique($progList));
        $progOut = count($progList) >= 2 ? 'Both' : ($progList[0] ?? '');
        if (!empty($in['basic'])) {   /* subject only (no presentation / assignment / lab report) */
            $term = cl($in['semester_term'] ?? '', 30); $year = (int)($in['semester_year'] ?? 0);
            $dept = cl($in['department'] ?? '', 40);
            if ($term === '') fail('Select the semester (Autumn, Spring ...).');
            if ($year < 2000 || $year > 2100) fail('Enter a valid semester year, e.g. ' . date('Y') . '.');
            if ($dept === '') fail('Select the department.');
            if ($progOut === '') fail('Select the program.');
            $code = cl($in['code'] ?? '', 30);
            if ($code !== '' && !preg_match('/^[\p{L}\p{M}\p{N}\s._\/\-]{1,30}$/u', $code)) fail('Subject code can only contain letters, numbers, spaces and . _ / -');
            $tidIn = $tch ? (int)$tch['id'] : (int)($in['teacher_id'] ?? -1);
            if ($tidIn > 0) { $tc = $pdo->prepare('SELECT COUNT(*) FROM teachers WHERE id=?'); $tc->execute([$tidIn]); if (!(int)$tc->fetchColumn()) fail('Teacher not found.'); }
            if ($id) {
                $c = $pdo->prepare('SELECT COUNT(*) FROM subjects WHERE id=?'); $c->execute([$id]);
                if (!(int)$c->fetchColumn()) fail('Subject not found.', 404);
                $pdo->prepare('UPDATE subjects SET name=?,code=?,semester_term=?,semester_year=?,department=?,program=? WHERE id=?')->execute([$name, $code, $term, (string)$year, $dept, $progOut, $id]);
                if ($batchIn !== '') apply_batch_default($id, $batchIn);
            } else {
                $defFields = default_fields();
                if ($batchIn !== '') foreach ($defFields as &$df) if (($df['key'] ?? '') === 'batch') { $df['def'] = $batchIn; }
                unset($df);
                $pdo->prepare("INSERT INTO subjects(name,is_open,allow_individual,allow_team,min_team,max_team,code,form_fields,guidelines,semester_term,semester_year,department,program,pres_upload,pres_public,pres_on,batch_lock) VALUES(?,0,1,1,2,5,?,?,'[]',?,?,?,?,1,1,0,?)")
                    ->execute([$name, $code, json_encode($defFields, JSON_UNESCAPED_UNICODE), $term, (string)$year, $dept, $progOut, $batchIn !== '' ? $batchIn : null]);
                $id = (int)$pdo->lastInsertId();
            }
            if ($tch && ($tch['acct_type'] ?? '') === 'cr') {
                apply_batch_lock($id, (string)$tch['batch']);
                $pdo->prepare('UPDATE subjects SET course_teacher=? WHERE id=?')->execute([cl($in['course_teacher'] ?? '', 80), $id]);
            }
            if ($tidIn > 0) { $pdo->prepare('UPDATE subjects SET teacher_id=? WHERE id=?')->execute([$tidIn, $id]); sync_teacher($tidIn); }
            elseif ($tidIn === 0) $pdo->prepare('UPDATE subjects SET teacher_id=NULL,teacher_name=NULL,teacher_email=NULL,teacher_phone=NULL,teacher_photo=NULL,teacher_dept=NULL WHERE id=?')->execute([$id]);
            out(['ok' => true, 'id' => $id]);
        }
        $open = !empty($in['is_open']) ? 1 : 0;
        $ai = !empty($in['allow_individual']) ? 1 : 0; $at = !empty($in['allow_team']) ? 1 : 0;
        if (!$ai && !$at) fail('Enable individual or team registration (or both).');
        $min = (int)($in['min_team'] ?? 2); $max = (int)($in['max_team'] ?? 5);
        if ($min < 1 || $max > 30 || $min > $max) fail('Team size limits are invalid (min 1, max 30, min ≤ max).');
        $od = cl($in['open_date'] ?? '', 10);
        if ($od !== '' && !valid_date($od)) fail('Opening date is invalid.');
        $ca = norm_close((string)($in['close_at'] ?? ''));
        if ($ca === null) fail('Closing date & time is invalid.');
        if ($od !== '' && $ca !== '' && $od > substr($ca, 0, 10)) fail('Closing date must be after the opening date.');
        $cd = $ca !== '' ? substr($ca, 0, 10) : '';
        $term = cl($in['semester_term'] ?? '', 30); $year = (int)($in['semester_year'] ?? 0);
        $dept = cl($in['department'] ?? '', 40);
        if ($term === '') fail('Select the semester (Autumn, Spring ...).');
        if ($year < 2000 || $year > 2100) fail('Enter a valid semester year, e.g. ' . date('Y') . '.');
        if ($dept === '') fail('Select the department.');
        if ($progOut === '') fail('Select the program.');
        $pup = 1;   /* presentation upload is always allowed */
        $ppub = array_key_exists('pres_public', $in) ? (!empty($in['pres_public']) ? 1 : 0) : 1;
        $pcl = norm_close((string)($in['pres_close_at'] ?? ''));
        if ($pcl === null) fail('Presentation upload deadline is invalid.');
        $code = cl($in['code'] ?? '', 30);
        if ($code !== '' && !preg_match('/^[\p{L}\p{M}\p{N}\s._\/\-]{1,30}$/u', $code)) fail('Subject code can only contain letters, numbers, spaces and . _ / -');
        $tidIn = $tch ? (int)$tch['id'] : (int)($in['teacher_id'] ?? -1);
        if ($tidIn > 0) { $tc = $pdo->prepare('SELECT COUNT(*) FROM teachers WHERE id=?'); $tc->execute([$tidIn]); if (!(int)$tc->fetchColumn()) fail('Teacher not found.'); }
        $fieldsJson = null;
        if (array_key_exists('fields', $in)) {
            $fx = sanitize_fields(is_array($in['fields']) ? $in['fields'] : []);
            if (is_string($fx)) fail($fx);
            $fieldsJson = json_encode($fx, JSON_UNESCAPED_UNICODE);
        }
        $glJson = array_key_exists('guidelines', $in) ? json_encode(sanitize_guidelines($in['guidelines']), JSON_UNESCAPED_UNICODE) : null;
        $slots = is_array($in['slots'] ?? null) ? $in['slots'] : [];
        $isNew = !$id;
        $pdo->exec('START TRANSACTION');
        try {
            if ($id) {
                $c = $pdo->prepare('SELECT COUNT(*) FROM subjects WHERE id=?'); $c->execute([$id]);
                if (!(int)$c->fetchColumn()) throw new RuntimeException('Subject not found.');
                $pdo->prepare('UPDATE subjects SET name=?,is_open=?,open_date=?,close_date=?,close_at=?,allow_individual=?,allow_team=?,min_team=?,max_team=?,code=?,form_fields=COALESCE(?,form_fields),guidelines=COALESCE(?,guidelines),semester_term=?,semester_year=?,department=?,program=?,pres_upload=?,pres_public=?,pres_close_at=?,pres_on=1 WHERE id=?')
                    ->execute([$name, $open, $od ?: null, $cd ?: null, $ca ?: null, $ai, $at, $min, $max, $code, $fieldsJson, $glJson, $term, (string)$year, $dept, $progOut, $pup, $ppub, $pcl ?: null, $id]);
                if ($batchIn !== '') apply_batch_default($id, $batchIn);
            } else {
                $defFields2 = default_fields();
                if ($batchIn !== '') foreach ($defFields2 as &$df2) if (($df2['key'] ?? '') === 'batch') { $df2['def'] = $batchIn; }
                unset($df2);
                $pdo->prepare('INSERT INTO subjects(name,is_open,open_date,close_date,close_at,allow_individual,allow_team,min_team,max_team,code,form_fields,guidelines,semester_term,semester_year,department,program,pres_upload,pres_public,pres_close_at,pres_on,batch_lock) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?)')
                    ->execute([$name, $open, $od ?: null, $cd ?: null, $ca ?: null, $ai, $at, $min, $max, $code, $fieldsJson ?? json_encode($defFields2, JSON_UNESCAPED_UNICODE), $glJson ?? '[]', $term, (string)$year, $dept, $progOut, $pup, $ppub, $pcl ?: null, $batchIn !== '' ? $batchIn : null]);
                $id = (int)$pdo->lastInsertId();
            }
            $keep = [];
            foreach ($slots as $sl) {
                if (!is_array($sl)) continue;
                $d = cl($sl['date'] ?? '', 10); $lab = cl($sl['label'] ?? '', 60);
                $cap = max(1, min(500, (int)($sl['capacity'] ?? 1)));
                if ($d === '' && $lab === '') continue;
                if ($d !== '' && !valid_date($d)) throw new RuntimeException('A slot date is invalid.');
                $sid = (int)($sl['id'] ?? 0);
                if ($sid) {
                    $u = $pdo->prepare('UPDATE presentation_slots SET slot_date=?,slot_label=?,capacity=? WHERE id=? AND subject_id=?');
                    $u->execute([$d, $lab, $cap, $sid, $id]);
                    if ($u->rowCount()) { $keep[] = $sid; continue; }
                }
                $pdo->prepare('INSERT INTO presentation_slots(subject_id,slot_date,slot_label,capacity) VALUES(?,?,?,?)')->execute([$id, $d, $lab, $cap]);
                $keep[] = (int)$pdo->lastInsertId();
            }
            if ($keep) {
                $ph = implode(',', array_fill(0, count($keep), '?'));
                $pdo->prepare("DELETE FROM presentation_slots WHERE subject_id=? AND id NOT IN ($ph)")->execute(array_merge([$id], $keep));
            } else {
                $pdo->prepare('DELETE FROM presentation_slots WHERE subject_id=?')->execute([$id]);
            }
            $pdo->exec('COMMIT');
        } catch (Throwable $e) {
            try { $pdo->exec('ROLLBACK'); } catch (Throwable $x) {}
            fail($e instanceof RuntimeException ? $e->getMessage() : 'Could not save the subject.', $e instanceof RuntimeException ? 400 : 500);
        }
        if ($tch && ($tch['acct_type'] ?? '') === 'cr') {
            apply_batch_lock($id, (string)$tch['batch']);
            $pdo->prepare('UPDATE subjects SET course_teacher=? WHERE id=?')->execute([cl($in['course_teacher'] ?? '', 80), $id]);
            if (CR_NEEDS_APPROVAL) {
                if ($isNew) $pdo->prepare('UPDATE subjects SET cr_pending=1 WHERE id=?')->execute([$id]);
                $pdo->prepare('UPDATE subjects SET is_open=0 WHERE id=? AND cr_pending=1')->execute([$id]);
            }
        }
        if ($tidIn > 0) { $pdo->prepare('UPDATE subjects SET teacher_id=? WHERE id=?')->execute([$tidIn, $id]); sync_teacher($tidIn); }
        elseif ($tidIn === 0) $pdo->prepare('UPDATE subjects SET teacher_id=NULL,teacher_name=NULL,teacher_email=NULL,teacher_phone=NULL,teacher_photo=NULL,teacher_dept=NULL WHERE id=?')->execute([$id]);
        out(['ok' => true, 'id' => $id]);

    case 'subject_extend':
        $id = (int)($in['id'] ?? 0);
        $st = $pdo->prepare('SELECT * FROM subjects WHERE id=?'); $st->execute([$id]);
        $sj = $st->fetch();
        if (!$sj) fail('Subject not found.', 404);
        if (!empty($in['close_at'])) {
            $ca = norm_close((string)$in['close_at']);
            if ($ca === null || $ca === '') fail('Closing date & time is invalid.');
            $ts = (int)strtotime($ca);
        } else {
            $mins = (int)($in['minutes'] ?? 0);
            if ($mins < 1 || $mins > 525600) fail('Choose a valid extension.');
            $now = time();
            $ts = (int)(ceil((max(close_ts($sj) ?? $now, $now) + $mins * 60) / 60) * 60);
            $ca = date('Y-m-d H:i', $ts);
        }
        $pdo->prepare('UPDATE subjects SET close_at=?, close_date=? WHERE id=?')->execute([$ca, substr($ca, 0, 10), $id]);
        out(['ok' => true, 'close_at' => date('Y-m-d\TH:i', $ts), 'close_ts' => $ts, 'disabled' => !(int)$sj['is_open']]);
    case 'subject_toggle':

        $pdo->prepare('UPDATE subjects SET is_open=1-is_open, cr_pending=0 WHERE id=?')->execute([(int)($in['id'] ?? 0)]);
        out(['ok' => true]);

    case 'subject_delete':
        $id = (int)($in['id'] ?? 0);
        $st = $pdo->prepare('SELECT u.file_path FROM uploaded_photos u JOIN team_members m ON m.id=u.member_id JOIN registrations r ON r.id=m.registration_id WHERE r.subject_id=?');
        $st->execute([$id]); $files = $st->fetchAll(PDO::FETCH_COLUMN);
        $pq = $pdo->prepare('SELECT p.stored FROM presentations p JOIN registrations r ON r.id=p.registration_id WHERE r.subject_id=?'); $pq->execute([$id]); $presFiles = $pq->fetchAll(PDO::FETCH_COLUMN);
        $tq = $pdo->prepare('SELECT teacher_photo FROM subjects WHERE id=? AND teacher_id IS NULL'); $tq->execute([$id]);
        $tp = (string)$tq->fetchColumn(); if ($tp !== '') $files[] = $tp;
        $pdo->prepare('DELETE FROM subjects WHERE id=?')->execute([$id]);
        rm_files($files); pres_rm($presFiles);
        out(['ok' => true]);
}
