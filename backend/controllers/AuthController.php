<?php
declare(strict_types=1);

/* Actions: admin login / me / forgot password / teacher login */
    /* ----- admin auth ----- */
    if ($a === 'login') {
        if (!$post) fail('POST required.', 405);
        need_csrf();
        $in = body();
        $now = time();
        if (($_SESSION['lock_until'] ?? 0) > $now) fail('Too many attempts. Wait ' . ($_SESSION['lock_until'] - $now) . ' seconds.', 429);
        $st = $pdo->prepare('SELECT * FROM admins WHERE username=?'); $st->execute([cl($in['username'] ?? '', 40)]);
        $ad = $st->fetch();
        rl_guard('acct|' . strtolower(cl($in['username'] ?? '', 40)), 8, 900, 'This account is temporarily locked. Wait');
        $ok = password_verify((string)($in['password'] ?? ''), $ad ? $ad['password_hash'] : '$2y$10$usesomesillystringforsaleeOpGyQ8v0p5XUkqzG1G5H0oJ4q7y2');   /* same timing whether the user exists or not */
        $ok = $ok && $ad;
        if (!$ok) {
            $_SESSION['fails'] = ($_SESSION['fails'] ?? 0) + 1;
            if ($_SESSION['fails'] >= 5) { $_SESSION['lock_until'] = $now + 60; $_SESSION['fails'] = 0; }
            rl_hit('auth|' . client_ip(), 600); rl_hit('acct|' . strtolower(cl($in['username'] ?? '', 40)), 900);
            session_write_close(); usleep(random_int(600000, 1100000));
            fail('Wrong username or password.', 401);
        }
        session_regenerate_id(true);
        $_SESSION['admin_id'] = (int)$ad['id']; $_SESSION['fails'] = 0;
        $_SESSION['defpw'] = password_verify(DEFAULT_ADMIN_PASS, $ad['password_hash']);
        out(['ok' => true, 'csrf' => $_SESSION['csrf'], 'user' => $ad['username'], 'default_pw' => $_SESSION['defpw']]);
    }
    if ($a === 'me') {
        $res = ['ok' => true, 'admin' => false, 'teacher' => null, 'leader' => null];
        if (!empty($_SESSION['admin_id'])) {
            $st = $pdo->prepare('SELECT * FROM admins WHERE id=?'); $st->execute([$_SESSION['admin_id']]);
            $ad = $st->fetch();
            if ($ad) { $res['admin'] = true; $res['user'] = $ad['username']; if (!isset($_SESSION['defpw'])) $_SESSION['defpw'] = password_verify(DEFAULT_ADMIN_PASS, $ad['password_hash']); $res['default_pw'] = (bool)$_SESSION['defpw']; }
            else unset($_SESSION['admin_id']);
        }
        $tc = cur_teacher();
        if ($tc) $res['teacher'] = ['profile' => teacher_pub($tc)];
        $res['teacher_signup'] = setting('teacher_signup', '1') === '1';
        if (!empty($_SESSION['leader_rid'])) {
            $lp = leader_payload((int)$_SESSION['leader_rid']);
            if ($lp) $res['leader'] = $lp; else unset($_SESSION['leader_rid']);
        }
        out($res);
    }
    if ($a === 'forgot_request') {
        if (!$post) fail('POST required.', 405);
        need_csrf();
        $in = body();
        $role = ($in['role'] ?? '') === 'leader' ? 'leader' : 'teacher';
        $email = strtolower(cl($in['email'] ?? '', 100));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) fail('Enter a valid Gmail address.');
        if (!smtp_cfg()) fail('Password reset by email is not set up yet. Please contact your admin.', 503);
        $generic = ['ok' => true, 'message' => 'If this Gmail is registered, a 6-digit code has been sent. It works for 15 minutes.'];
        $now = time();
        if (($_SESSION['fp_next'] ?? 0) > $now) fail('Please wait ' . ($_SESSION['fp_next'] - $now) . ' seconds before asking for another code.', 429);
        $_SESSION['fp_next'] = $now + 30;
        $pdo->prepare('DELETE FROM pw_resets WHERE expires_at < ?')->execute([$now]);
        $q = $pdo->prepare('SELECT created_at FROM pw_resets WHERE role=? AND email=? ORDER BY id DESC LIMIT 1'); $q->execute([$role, $email]);
        $lastAt = (int)$q->fetchColumn();
        if ($lastAt > $now - 60) out($generic);
        $name = ''; $exists = false;
        if ($role === 'teacher') {
            $st = $pdo->prepare('SELECT name, status FROM teachers WHERE email=?'); $st->execute([$email]); $row = $st->fetch();
            if ($row && $row['status'] === 'active') { $exists = true; $name = (string)$row['name']; }
        } else {
            $st = $pdo->prepare("SELECT team_name FROM registrations WHERE LOWER(leader_email)=? AND leader_password_hash IS NOT NULL AND leader_password_hash!='' ORDER BY id DESC LIMIT 1"); $st->execute([$email]); $row = $st->fetch();
            if ($row) { $exists = true; $name = (string)($row['team_name'] ?? ''); }
        }
        if ($exists) {
            $code = str_pad((string)random_int(0, 999999), 6, '0', STR_PAD_LEFT);
            $pdo->prepare('DELETE FROM pw_resets WHERE role=? AND email=?')->execute([$role, $email]);
            $pdo->prepare('INSERT INTO pw_resets(role,email,code_hash,expires_at,created_at) VALUES(?,?,?,?,?)')->execute([$role, $email, password_hash($code, PASSWORD_DEFAULT), $now + 900, $now]);
            $err = smtp_send($email, $name, site_name() . ' - password reset code', reset_mail($name, $code));
            if ($err !== '') {
                error_log('Password reset mail failed: ' . $err);
                $pdo->prepare('DELETE FROM pw_resets WHERE role=? AND email=?')->execute([$role, $email]);
                set_setting('smtp_last_err', $err); set_setting('smtp_last_err_at', date('d M Y, H:i'));
            } else { set_setting('smtp_last_err', ''); }
        }
        out($generic);
    }
    if ($a === 'forgot_reset') {
        if (!$post) fail('POST required.', 405);
        need_csrf();
        $in = body();
        $role = ($in['role'] ?? '') === 'leader' ? 'leader' : 'teacher';
        $email = strtolower(cl($in['email'] ?? '', 100));
        $code = preg_replace('/\D/', '', (string)($in['code'] ?? '')) ?? '';
        $new = (string)($in['new_password'] ?? '');
        if (!strong_pw($new)) fail('New password needs 8+ characters with letters and numbers.');
        $now = time();
        $st = $pdo->prepare('SELECT * FROM pw_resets WHERE role=? AND email=? ORDER BY id DESC LIMIT 1'); $st->execute([$role, $email]); $row = $st->fetch();
        $bad = 'This code is wrong or has expired. Ask for a new one.';
        if (!$row || (int)$row['expires_at'] < $now) fail($bad);
        if ((int)$row['attempts'] >= 5) { $pdo->prepare('DELETE FROM pw_resets WHERE id=?')->execute([(int)$row['id']]); fail('Too many wrong attempts. Ask for a new code.', 429); }
        if (strlen($code) !== 6 || !password_verify($code, (string)$row['code_hash'])) {
            $pdo->prepare('UPDATE pw_resets SET attempts=attempts+1 WHERE id=?')->execute([(int)$row['id']]);
            session_write_close(); sleep(1);
            fail($bad);
        }
        $hash = password_hash($new, PASSWORD_DEFAULT);
        if ($role === 'teacher') {
            $t = $pdo->prepare("SELECT id FROM teachers WHERE email=? AND status='active'"); $t->execute([$email]); $tid = (int)$t->fetchColumn();
            if (!$tid) fail($bad);
            $pdo->prepare('UPDATE teachers SET password_hash=? WHERE id=?')->execute([$hash, $tid]);
            pw_store($tid, $new);
        } else {
            $u = $pdo->prepare("UPDATE registrations SET leader_password_hash=? WHERE LOWER(leader_email)=? AND leader_password_hash IS NOT NULL AND leader_password_hash!=''");
            $u->execute([$hash, $email]);
            if (!$u->rowCount()) fail($bad);
        }
        $pdo->prepare('DELETE FROM pw_resets WHERE role=? AND email=?')->execute([$role, $email]);
        out(['ok' => true]);
    }
    if ($a === 'teacher_login') {
        if (!$post) fail('POST required.', 405);
        need_csrf();
        $in = body();
        $now = time();
        if (($_SESSION['tlock_until'] ?? 0) > $now) fail('Too many attempts. Wait ' . ($_SESSION['tlock_until'] - $now) . ' seconds.', 429);
        $email = strtolower(cl($in['email'] ?? '', 100)); $pw = (string)($in['password'] ?? ''); $found = null; $blocked = false;
        rl_guard('acct|' . $email, 8, 900, 'This account is temporarily locked. Wait');
        if ($email !== '' && $pw !== '') {
            $st = $pdo->prepare('SELECT * FROM teachers WHERE email=?'); $st->execute([$email]);
            $t = $st->fetch();
            if ($t && password_verify($pw, $t['password_hash'])) { if ($t['status'] === 'active') $found = $t; else $blocked = true; }
        }
        if ($blocked) fail('This teacher account is blocked. Please contact the admin.', 403);
        if (!$found) {
            $_SESSION['tfails'] = ($_SESSION['tfails'] ?? 0) + 1;
            if ($_SESSION['tfails'] >= 5) { $_SESSION['tlock_until'] = $now + 60; $_SESSION['tfails'] = 0; }
            rl_hit('auth|' . client_ip(), 600); rl_hit('acct|' . $email, 900);
            session_write_close(); usleep(random_int(600000, 1100000));
            fail('Wrong Gmail or password.', 401);
        }
        if (pw_open($found['pw_enc'] ?? '') !== $pw) pw_store((int)$found['id'], $pw);
        session_regenerate_id(true);
        $_SESSION['teacher_id'] = (int)$found['id']; $_SESSION['tfails'] = 0;
        out(['ok' => true, 'csrf' => $_SESSION['csrf'], 'teacher' => ['profile' => teacher_pub($found)]]);
    }
