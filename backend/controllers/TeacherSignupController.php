<?php
declare(strict_types=1);

/* Actions: teacher_register */
    if ($a === 'teacher_register') {

        if (!$post) fail('POST required.', 405);
        need_csrf();
        if (setting('teacher_signup', '1') !== '1') fail('New teacher sign-ups are closed. Please contact the admin.', 403);
        $_SESSION['treg'] = array_values(array_filter($_SESSION['treg'] ?? [], fn($x) => $x > time() - 3600));
        if (count($_SESSION['treg']) >= 5) fail('Too many sign-ups from this device. Try again later.', 429);
        [$c, $err] = teacher_clean(['name' => $_POST['name'] ?? '', 'department' => $_POST['department'] ?? '', 'phone' => $_POST['phone'] ?? '', 'email' => $_POST['email'] ?? '', 'password' => $_POST['password'] ?? '', 'acct_type' => $_POST['acct_type'] ?? '', 'batch' => $_POST['batch'] ?? ''], 0, true);
        if ($err) fail($err);
        $saved = []; $ph = null;
        try { $ph = save_photo('photo', $saved); } catch (RuntimeException $e) { fail($e->getMessage()); }
        try {
            $pdo->prepare('INSERT INTO teachers(name,department,phone,email,password_hash,photo,acct_type,batch) VALUES(?,?,?,?,?,?,?,?)')
                ->execute([$c['name'], $c['department'], $c['phone'], $c['email'], password_hash($c['password'], PASSWORD_DEFAULT), $ph ? $ph['path'] : null, $c['acct_type'], $c['batch'] !== '' ? $c['batch'] : null]);
        } catch (Throwable $e) { foreach ($saved as $f) @unlink($f); fail('Could not create the account. This Gmail may already be registered.'); }
        $tid = (int)$pdo->lastInsertId();
        pw_store($tid, $c['password']);
        $_SESSION['treg'][] = time();
        session_regenerate_id(true);
        $_SESSION['teacher_id'] = $tid;
        $st = $pdo->prepare('SELECT * FROM teachers WHERE id=?'); $st->execute([$tid]);
        out(['ok' => true, 'csrf' => $_SESSION['csrf'], 'teacher' => ['profile' => teacher_pub($st->fetch())]]);
    }
