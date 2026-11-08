<?php
declare(strict_types=1);

/* Actions: account (change admin username / password) */
switch ($a) {
    case 'account':
        $st = $pdo->prepare('SELECT * FROM admins WHERE id=?'); $st->execute([$_SESSION['admin_id']]);
        $ad = $st->fetch();
        if (!password_verify((string)($in['current'] ?? ''), $ad['password_hash'])) fail('Current password is wrong.');
        $user = cl($in['username'] ?? '', 30);
        if (!preg_match('/^[A-Za-z0-9_.\-]{3,30}$/', $user)) fail('Username must be 3-30 letters, numbers or _ . -');
        $new = (string)($in['new_password'] ?? '');
        if ($new !== '' && (strlen($new) < 8 || !preg_match('/[A-Za-z]/', $new) || !preg_match('/\d/', $new))) fail('New password needs 8+ characters with letters and numbers.');
        $dupe = $pdo->prepare('SELECT COUNT(*) FROM admins WHERE username=? AND id!=?'); $dupe->execute([$user, $ad['id']]);
        if ((int)$dupe->fetchColumn()) fail('That username is taken.');
        $hash = $new !== '' ? password_hash($new, PASSWORD_DEFAULT) : $ad['password_hash'];
        $pdo->prepare('UPDATE admins SET username=?, password_hash=? WHERE id=?')->execute([$user, $hash, $ad['id']]);
        session_regenerate_id(true);
        $_SESSION['defpw'] = password_verify(DEFAULT_ADMIN_PASS, $hash);
        out(['ok' => true, 'user' => $user, 'default_pw' => $_SESSION['defpw']]);
}
