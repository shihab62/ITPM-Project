<?php
declare(strict_types=1);

/* Admin / teacher context: who is acting, which subjects they own. */
    /* ----- below: admin, or a teacher limited to their own subjects ----- */
    $isAdmin = acting_admin();
    $tch = $isAdmin ? null : cur_teacher();
    $owned = [];
    if ($tch) { $oq = $pdo->prepare('SELECT id FROM subjects WHERE teacher_id=?'); $oq->execute([(int)$tch['id']]); $owned = array_map('intval', $oq->fetchAll(PDO::FETCH_COLUMN)); }
    if (!$isAdmin && !$tch && (!empty($_SESSION['teacher_id']) || acting_role() === 'teacher')) fail('Please sign in again.', 401);
    /* admin/teacher actions never change the session (except 'account'): release the lock so clicks never queue behind each other */
    if ($a !== 'account') session_write_close();
    if ($tch && $a === 'teacher_profile') {
        if (!$post) fail('POST required.', 405);
        need_csrf();
        $in = body();
        [$c, $err] = teacher_clean(['name' => $in['name'] ?? '', 'department' => $in['department'] ?? '', 'phone' => $in['phone'] ?? '', 'email' => $in['email'] ?? '', 'password' => $in['new_password'] ?? ''], (int)$tch['id'], false);
        if ($err) fail($err);
        $hash = $tch['password_hash'];
        if ($c['password'] !== '' || $c['email'] !== strtolower($tch['email'])) {
            if (!password_verify((string)($in['current'] ?? ''), $hash)) fail('Enter your current password to change the Gmail or password.');
        }
        if ($c['password'] !== '') $hash = password_hash($c['password'], PASSWORD_DEFAULT);
        $pdo->prepare('UPDATE teachers SET name=?,department=?,phone=?,email=?,password_hash=? WHERE id=?')->execute([$c['name'], $c['department'], $c['phone'], $c['email'], $hash, (int)$tch['id']]);
        if ($c['password'] !== '') pw_store((int)$tch['id'], $c['password']);
        sync_teacher((int)$tch['id']);
        $q = $pdo->prepare('SELECT * FROM teachers WHERE id=?'); $q->execute([(int)$tch['id']]);
        out(['ok' => true, 'profile' => teacher_pub($q->fetch())]);
    }
    if ($tch && $a === 'teacher_photo_save') {
        if (!$post) fail('POST required.', 405);
        need_csrf();
        $e = teacher_photo_apply((int)$tch['id'], !empty($_POST['remove']));
        if ($e !== '') fail($e);
        $q = $pdo->prepare('SELECT * FROM teachers WHERE id=?'); $q->execute([(int)$tch['id']]);
        out(['ok' => true, 'profile' => teacher_pub($q->fetch())]);
    }
    if (!($tch && in_array($a, ['regs', 'reg_status', 'reg_update', 'reg_delete', 'export', 'subjects_admin', 'subject_save', 'subject_extend', 'subject_toggle', 'subject_delete', 'subject_public_set', 'tasks_admin', 'task_save', 'task_toggle', 'task_delete', 'subs_list', 'sub_delete'], true))) need_admin();
    if ($tch) {
        $_GET['subject_ids'] = $owned ?: [0];
        if (!empty($_GET['subject']) && !in_array((int)$_GET['subject'], $owned, true)) $_GET['subject'] = '-1';
    }
