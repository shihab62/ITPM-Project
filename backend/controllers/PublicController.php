<?php
declare(strict_types=1);

/* Actions: track, subjects, teams_public, register */
    if ($a === 'track') {
        if (!$post) fail('POST required.', 405);
        need_csrf();
        session_write_close();
        try { an_track(body()); } catch (Throwable $e) { log_err(date('c') . ' track ' . $e->getMessage() . "\n"); }
        out(['ok' => true]);
    }

    if ($a === 'subjects') {
        $c = cache_get('subjects', 5);
        if ($c === null) {
            $rows = $pdo->query('SELECT * FROM subjects WHERE pres_on=1 ORDER BY name')->fetchAll();
            prime_subjects(array_column($rows, 'id'));
            $c = ['ok' => true, 'options' => site_options(), 'subjects' => array_map('subj_public', $rows)];
            cache_put('subjects', $c);
        }
        $c['server_now'] = time();
        out($c);
    }

    if ($a === 'teams_public') {
        if (setting('teams_public', '0') !== '1') out(['ok' => true, 'public' => false, 'subjects' => []]);
        $c = cache_get('teams_public', 5);
        if ($c !== null) out($c);
        $o = [];
        $allS = $pdo->query('SELECT * FROM subjects WHERE pres_on=1 ORDER BY name')->fetchAll();
        prime_subjects(array_column($allS, 'id'));
        foreach ($allS as $s) {
            $showT = $showI = (int)($s['pub_teams'] ?? 1) === 1;   /* one switch per subject: public => every team AND individual of that subject */
            if (!$showT && !$showI) continue;   /* admin did not publish this subject */
            $teams = []; $inds = []; $showP = (int)($s['pres_public'] ?? 1) === 1;
            foreach (array_reverse(load_regs(['subject' => (int)$s['id']], 2000)) as $r) {
                if ($r['status'] === 'rejected') continue;
                if ($r['reg_type'] === 'team') {
                    if (!$showT) continue;
                    $teams[] = ['rid' => (int)$r['id'], 'pres' => $showP && !empty($r['pres']) && in_array($r['pres']['kind'] ?? '', PRES_VIEWABLE, true), 'team' => (string)$r['team_name'], 'topic' => (string)($r['topic'] ?? ''), 'status' => $r['status'], 'slot_date' => $r['slot_date'], 'slot_label' => $r['slot_label'],
                        'members' => array_map(fn($m) => ['name' => $m['full_name'], 'uid' => $m['student_id'], 'leader' => (int)$m['is_leader']], $r['members'])];
                } else {
                    $m = $r['members'][0] ?? null;
                    if (!$showI || !$m) continue;
                    $inds[] = ['rid' => (int)$r['id'], 'pres' => $showP && !empty($r['pres']) && in_array($r['pres']['kind'] ?? '', PRES_VIEWABLE, true), 'name' => $m['full_name'], 'uid' => $m['student_id'], 'topic' => (string)($r['topic'] ?? ''), 'status' => $r['status'], 'slot_date' => $r['slot_date'], 'slot_label' => $r['slot_label']];
                }
            }
            $o[] = ['id' => (int)$s['id'], 'name' => $s['name'], 'teacher_name' => (string)($s['teacher_name'] ?? ''), 'teacher_phone' => (string)($s['teacher_phone'] ?? ''), 'teacher_dept' => (string)($s['teacher_dept'] ?? ''), 'code' => (string)($s['code'] ?? ''),
                'semester_term' => (string)($s['semester_term'] ?? ''), 'semester_year' => (int)($s['semester_year'] ?? 0), 'department' => (string)($s['department'] ?? ''), 'program' => (string)($s['program'] ?? ''),
                'batches' => subject_batches($s), 'teams' => $teams, 'individuals' => $inds];
        }
        $res = ['ok' => true, 'public' => true, 'subjects' => $o];
        cache_put('teams_public', $res);
        out($res);
    }

    if ($a === 'register') {
        if (!$post) fail('POST required.', 405);
        need_csrf();
        /* a too-big upload (bigger than PHP post_max_size) arrives with an EMPTY $_POST: say so instead of 'Registration data is invalid' */
        if (empty($_POST) && empty($_FILES) && (int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 0) fail('The upload is too big for this server (' . php_upload_limit() . '). Remove the presentation file (you can upload it later from your panel) or choose a smaller one.');
        $sid = (int)($_POST['subject_id'] ?? 0);
        $type = (string)($_POST['type'] ?? '');
        if (!in_array($type, ['individual', 'team'], true)) fail('Choose a registration type.');
        $sq = $pdo->prepare('SELECT * FROM subjects WHERE id=?'); $sq->execute([$sid]);
        $subj0 = $sq->fetch();
        if (!$subj0) fail('Subject not found.');
        $fields = fields_of($subj0);
        $hasPhoto = false; foreach ($fields as $f) if ($f['type'] === 'photo') $hasPhoto = true;
        $arr = json_decode((string)($_POST['members'] ?? '[]'), true);
        if (!is_array($arr) || !$arr) fail('Registration data is invalid.');
        $arr = array_values($arr);
        $topic = cl($_POST['topic'] ?? '', 200); if ($topic === '') $topic = null;   /* optional, team or individual */
        $leader = 0; $teamName = null; $leaderEmail = null; $leaderPhone = null;
        if ($type === 'individual') {
            $arr = [$arr[0]];
        } else {
            $teamName = cl($_POST['team_name'] ?? '', 60);
            if (mb_strlen($teamName) < 2) fail('Enter a team name.');

            $leader = (int)($_POST['leader_index'] ?? -1);
            if ($leader < 0 || $leader >= count($arr)) fail('Select one team leader from the team members.');
        }
        {   /* team leader AND individual: only a Gmail is needed (no password). Later they sign in with this Gmail OR their mobile number. */
            $loginId = trim(cl($_POST['leader_email'] ?? '', 100));
            if (strpos($loginId, '@') !== false) {
                $leaderEmail = strtolower($loginId);
                if (!filter_var($leaderEmail, FILTER_VALIDATE_EMAIL)) fail('Enter a valid Gmail address or mobile number for your login.');
            } else {
                $leaderPhone = preg_replace('/[\s\-]/', '', $loginId) ?? '';
                if (!preg_match('/^\+?\d{10,14}$/', $leaderPhone)) fail('Enter a valid Gmail address or mobile number for your login.');
                $leaderEmail = null;
            }
        }
        $members = [];
        foreach ($arr as $i => $raw) {
            $who = $type === 'individual' ? 'Your details' : 'Member ' . ($i + 1);
            [$vals, $e] = clean_member($fields, is_array($raw) ? $raw : [], $i === $leader, $who, true);
            if ($e) fail($e);
            $bl = trim((string)($subj0['batch_lock'] ?? ''));
            if ($bl !== '' && strcasecmp(batch_num(trim((string)($vals['batch'] ?? ''))), batch_num($bl)) !== 0) fail($who . ': this registration form is only for batch ' . batch_num($bl) . '.');
            $spg = prog_full(trim((string)($subj0['program'] ?? '')));
            if ($spg !== '' && strcasecmp($spg, 'Both') !== 0 && trim((string)($vals['program'] ?? '')) !== '' && strcasecmp(prog_full((string)$vals['program']), $spg) !== 0) fail($who . ': this registration form is only for the ' . $spg . ' program.');
            [$uid, $nm] = ident($fields, $vals);
            $members[] = ['vals' => $vals, 'uid' => $uid, 'name' => $nm];
        }
        $lc = array_values(array_filter(array_map(fn($m) => strtolower($m['uid']), $members), fn($x) => $x !== ''));
        if (count(array_unique($lc)) !== count($lc)) fail('The same ID appears more than once in this team.');
        $pf = photo_field($fields); $pmax = photo_max($fields);
        foreach ($members as $i => $m) {
            if (photo_needed($pf, $i === $leader) && (!isset($_FILES['photo_' . $i]) || ($_FILES['photo_' . $i]['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE))
                fail(($type === 'individual' ? 'Your details' : 'Member ' . ($i + 1)) . ': ' . $pf['label'] . ' is required.');
        }

        /* OPTIONAL presentation file sent together with the registration. It is fully checked here, BEFORE anything is saved, so a bad file never leaves a half-made registration. */
        $presUp = null;
        if (isset($_FILES['pres']) && is_array($_FILES['pres']) && ($_FILES['pres']['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE) {
            $pf0 = $_FILES['pres'];
            [$pok0, $pmsg0] = pres_window($subj0);
            if (!$pok0) fail('Presentation file: ' . $pmsg0 . ' Remove the file to register without it.');
            if (in_array($pf0['error'], [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true)) fail('The presentation file is larger than the server allows (' . php_upload_limit() . '). Choose a smaller file, or register without it and upload it later from your panel.');
            if ($pf0['error'] !== UPLOAD_ERR_OK) fail('The presentation upload failed. Please try again, or register without it and upload it later from your panel.');
            if ($pf0['size'] <= 0 || $pf0['size'] > pres_max_mb() * 1048576) fail('The presentation file must be ' . pres_max_mb() . ' MB or smaller.');
            if (!is_uploaded_file($pf0['tmp_name'])) fail('Invalid presentation upload.');
            $porig = cl(basename(str_replace('\\', '/', (string)$pf0['name'])), 120);
            [$pkind, $pkerr] = pres_kind($pf0['tmp_name'], $porig);
            if (!$pkind) fail('Presentation file: ' . $pkerr);
            $presUp = ['tmp' => $pf0['tmp_name'], 'orig' => $porig, 'kind' => $pkind, 'size' => (int)$pf0['size']];
        }

        $leaderHash = null;   /* leader login has no password any more */
        session_write_close();   /* the session is not needed any more: other requests of this browser are not blocked */
        $saved = []; $inTx = false;
        try {
            $pdo->exec('START TRANSACTION'); $inTx = true;
            $st = $pdo->prepare('SELECT * FROM subjects WHERE id=? FOR UPDATE'); $st->execute([$sid]);   /* locks this subject: slot capacity / duplicate checks cannot race */
            $subj = $st->fetch();
            if (!$subj) throw new RuntimeException('Subject not found.');
            $slots = slots_of($sid);
            [$state, $msg, $regLate] = subject_state($subj, $slots);
            if ($state !== 'open') throw new RuntimeException($msg);
            if ($type === 'individual' && !$subj['allow_individual']) throw new RuntimeException('Individual registration is not available for this subject.');
            if ($type === 'team') {
                if (!$subj['allow_team']) throw new RuntimeException('Team registration is not available for this subject.');
                if (count($members) < (int)$subj['min_team'] || count($members) > (int)$subj['max_team'])
                    throw new RuntimeException('Team size must be between ' . $subj['min_team'] . ' and ' . $subj['max_team'] . ' members.');
            }
            $slotId = null;
            if ($slots) {
                $want = (int)($_POST['slot_id'] ?? 0); $found = null;
                foreach ($slots as $sl) if ($sl['id'] === $want) $found = $sl;
                if (!$found) throw new RuntimeException('Please select a presentation slot.');
                if ($found['left'] <= 0) throw new RuntimeException('The selected slot is full. Choose another one.');
                $slotId = $found['id'];
            }
            $dups = dup_ids($sid, array_column($members, 'uid'));
            if ($dups) throw new RuntimeException('Already registered for this subject: ' . implode(', ', $dups) . '.');
            $ref = 'PR-' . strtoupper(bin2hex(random_bytes(4)));
            $pdo->prepare('INSERT INTO registrations(ref_code,subject_id,slot_id,reg_type,team_name,topic,leader_password_hash,leader_email,leader_phone,is_late) VALUES(?,?,?,?,?,?,?,?,?,?)')
                ->execute([$ref, $sid, $slotId, $type, $teamName, $topic, $leaderHash, $leaderEmail, $leaderPhone, $regLate ? 1 : 0]);
            $rid = (int)$pdo->lastInsertId();
            $ip = $pdo->prepare('INSERT INTO uploaded_photos(member_id,file_path,mime_type,file_size) VALUES(?,?,?,?)');
            foreach ($members as $i => $m) {
                $mid = insert_member($pdo, $rid, $m, $i === $leader ? 1 : 0);
                if ($hasPhoto && ($ph = save_photo('photo_' . $i, $saved, $pmax))) $ip->execute([$mid, $ph['path'], $ph['mime'], $ph['size']]);
            }
            $pdo->exec('COMMIT'); $inTx = false;
        } catch (Throwable $e) {
            if ($inTx) { try { $pdo->exec('ROLLBACK'); } catch (Throwable $x) {} }
            foreach ($saved as $f) @unlink($f);
            $user = $e instanceof RuntimeException;
            fail($user ? $e->getMessage() : 'Server error. Please try again.', $user ? 400 : 500);
        }
        /* store the optional presentation (the registration itself is already saved; if only the file fails the person is told to upload it from the panel) */
        $presSaved = false; $presWarn = '';
        if ($presUp) {
            $pst = bin2hex(random_bytes(16)) . '.' . $presUp['kind'];
            if (@move_uploaded_file($presUp['tmp'], pres_dir() . '/' . $pst)) {
                @chmod(pres_dir() . '/' . $pst, 0644);
                try {
                    $pdo->prepare('INSERT INTO presentations(registration_id,orig_name,stored,kind,size) VALUES(?,?,?,?,?)')->execute([$rid, $presUp['orig'], $pst, $presUp['kind'], $presUp['size']]);
                    $presSaved = true;
                } catch (Throwable $e) { @unlink(pres_dir() . '/' . $pst); }
            }
            if (!$presSaved) $presWarn = 'Your registration is saved, but the presentation file could not be stored. Please upload it again from your panel.';
        }
        $row = null; foreach (load_regs(['id' => $rid], 1) as $r) if ($r['ref_code'] === $ref) $row = $r;
        /* auto sign-in: the registrant (team leader or individual) lands straight in their panel and can submit the presentation there */
        $lead = null; $csrfNew = null;
        try {
            @session_start();
            session_regenerate_id(true);
            $ids = leader_ids_for_reg($rid);
            $_SESSION['leader_rids'] = $ids; $_SESSION['leader_rid'] = $rid; $_SESSION['lfails'] = 0;
            $lead = leader_payload($rid); $csrfNew = (string)($_SESSION['csrf'] ?? '');
        } catch (Throwable $e) { $lead = null; }
        out(['ok' => true, 'ref' => $ref, 'registration' => $row, 'leader' => $lead, 'csrf' => $csrfNew, 'pres_saved' => $presSaved, 'pres_warn' => $presWarn]);
    }
