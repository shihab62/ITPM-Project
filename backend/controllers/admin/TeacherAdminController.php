<?php
declare(strict_types=1);

/* Actions: teachers_admin, teacher_admin_* */
switch ($a) {
    case 'teachers_admin':
        $o = [];
        foreach ($pdo->query('SELECT * FROM teachers ORDER BY name')->fetchAll() as $t) { $x = teacher_pub($t); $x['password'] = pw_open($t['pw_enc'] ?? ''); $o[] = $x; }
        out(['ok' => true, 'teachers' => $o]);

    case 'teacher_admin_save':
        $id = (int)($in['id'] ?? 0);
        if ($id) { $q = $pdo->prepare('SELECT * FROM teachers WHERE id=?'); $q->execute([$id]); $old = $q->fetch(); if (!$old) fail('Teacher not found.', 404); }
        [$c, $err] = teacher_clean($in, $id, !$id);
        if ($err) fail($err);
        $status = ($in['status'] ?? 'active') === 'blocked' ? 'blocked' : 'active';
        if ($id) {
            $hash = $c['password'] !== '' ? password_hash($c['password'], PASSWORD_DEFAULT) : $old['password_hash'];
            $pdo->prepare('UPDATE teachers SET name=?,department=?,phone=?,email=?,password_hash=?,status=? WHERE id=?')->execute([$c['name'], $c['department'], $c['phone'], $c['email'], $hash, $status, $id]);
        } else {
            $pdo->prepare('INSERT INTO teachers(name,department,phone,email,password_hash,status) VALUES(?,?,?,?,?,?)')->execute([$c['name'], $c['department'], $c['phone'], $c['email'], password_hash($c['password'], PASSWORD_DEFAULT), $status]);
            $id = (int)$pdo->lastInsertId();
        }
        if ($c['password'] !== '') pw_store($id, $c['password']);
        sync_teacher($id);
        if ($status === 'blocked') $pdo->prepare('UPDATE subjects SET is_open=0 WHERE teacher_id=?')->execute([$id]);
        out(['ok' => true, 'id' => $id]);

    case 'teacher_admin_photo':
        $id = (int)($_POST['id'] ?? 0);
        $q = $pdo->prepare('SELECT COUNT(*) FROM teachers WHERE id=?'); $q->execute([$id]);
        if (!(int)$q->fetchColumn()) fail('Teacher not found.', 404);
        $e = teacher_photo_apply($id, !empty($_POST['remove']));
        if ($e !== '') fail($e);
        out(['ok' => true]);

    case 'teacher_admin_delete':
        $id = (int)($in['id'] ?? 0);
        $q = $pdo->prepare('SELECT photo FROM teachers WHERE id=?'); $q->execute([$id]);
        $row = $q->fetch();
        if (!$row) fail('Teacher not found.', 404);
        $pdo->prepare('UPDATE subjects SET teacher_id=NULL,teacher_name=NULL,teacher_email=NULL,teacher_phone=NULL,teacher_photo=NULL,teacher_dept=NULL WHERE teacher_id=?')->execute([$id]);
        $pdo->prepare('DELETE FROM teachers WHERE id=?')->execute([$id]);
        if (!empty($row['photo'])) rm_files([$row['photo']]);
        out(['ok' => true]);
}
