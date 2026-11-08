<?php
declare(strict_types=1);

/* Actions: settings, options, SMTP, logo, site name, public team page */
switch ($a) {
    case 'settings_get':
        out(['ok' => true, 'teams_public' => setting('teams_public', '0') === '1', 'site_name' => site_name(), 'site_logo' => site_logo(), 'teacher_signup' => setting('teacher_signup', '1') === '1', 'options' => site_options(), 'php_limit' => php_upload_limit()]);

    case 'options_set':
        $clean = function ($v, string $what): array {
            $v = is_array($v) ? $v : preg_split('/\r?\n/', (string)$v);
            $o = [];
            foreach ($v as $x) { $x = cl((string)$x, 30); if ($x !== '' && !in_array($x, $o, true)) $o[] = $x; }
            if (!$o) fail('Add at least one ' . $what . '.');
            if (count($o) > 40) fail('Too many ' . $what . ' entries (max 40).');
            return $o;
        };
        $terms = $clean($in['terms'] ?? [], 'semester'); $depts = $clean($in['depts'] ?? [], 'department'); $progs = $clean($in['programs'] ?? [], 'program');
        $mb = (int)($in['pres_max_mb'] ?? 20);
        if ($mb < 1 || $mb > 200) fail('Presentation file limit must be between 1 and 200 MB.');
        set_setting('opt_terms', json_encode($terms, JSON_UNESCAPED_UNICODE)); set_setting('opt_depts', json_encode($depts, JSON_UNESCAPED_UNICODE));
        set_setting('opt_programs', json_encode($progs, JSON_UNESCAPED_UNICODE)); set_setting('pres_max_mb', (string)$mb);
        out(['ok' => true, 'options' => site_options(), 'php_limit' => php_upload_limit()]);

    case 'teacher_signup_set':
        $on = !empty($in['on']);
        set_setting('teacher_signup', $on ? '1' : '0');
        out(['ok' => true, 'on' => $on]);

    case 'smtp_get':
        out(smtp_state());

    case 'smtp_set':
    case 'smtp_test':
        $u = strtolower(cl($in['user'] ?? '', 100));
        if (!filter_var($u, FILTER_VALIDATE_EMAIL)) fail('Enter the Gmail address used to send emails.');
        $pw = smtp_clean_pw((string)($in['pass'] ?? ''));
        $savedUser = strtolower(trim(setting('smtp_user', '')));
        $hasPw = pw_open(setting('smtp_pass_enc', '')) !== '';
        if ($pw === '' && (!$hasPw || $savedUser !== $u)) fail('Enter the 16-character App Password for this Gmail.');
        if ($pw !== '') {
            if (!preg_match('/^[A-Za-z0-9]{16}$/', $pw)) fail('The App Password must be 16 letters, like abcd efgh ijkl mnop. Create one in your Google Account → Security → App passwords. Your normal Gmail password will not work.');
            $enc = pw_seal($pw);
            if ($enc === '') fail('This server cannot store the password safely (the PHP openssl extension is missing, or the data folder is not writable).');
            set_setting('smtp_pass_enc', $enc);
        }
        set_setting('smtp_user', $u);
        set_setting('smtp_name', cl($in['name'] ?? '', 60));
        if ($a === 'smtp_set') out(smtp_state());
        $err = smtp_send($u, '', site_name() . ' - test email', '<p>This is a test email from <b>' . htmlspecialchars(site_name(), ENT_QUOTES, 'UTF-8') . '</b>. Password-reset emails will work.</p>');
        if ($err !== '') fail('Saved, but the test email failed: ' . $err);
        set_setting('smtp_last_err', '');
        $st = smtp_state(); $st['message'] = 'Saved. Test email sent to ' . $u . ' — check the inbox (and Spam).';
        out($st);

    case 'logo_set':
        $old = setting('site_logo', '');
        if (!empty($in['remove'])) {
            set_setting('site_logo', '');
            if ($old !== '') rm_files([$old]);
            out(['ok' => true, 'logo' => '']);
        }
        $saved = [];
        try { $ph = save_photo('logo', $saved, MAX_PHOTO); } catch (RuntimeException $e) { fail($e->getMessage()); }
        if (!$ph) fail('Choose a logo image first.');
        set_setting('site_logo', $ph['path']);
        if ($old !== '') rm_files([$old]);
        out(['ok' => true, 'logo' => $ph['path']]);

    case 'site_name_set':
        $n = cl($in['site_name'] ?? '', 60);
        if (mb_strlen($n) < 2) fail('Website name must be at least 2 characters.');
        set_setting('site_name', $n);
        out(['ok' => true, 'site_name' => $n]);

    case 'teams_public_set':
        $on = !empty($in['on']);
        set_setting('teams_public', $on ? '1' : '0');
        out(['ok' => true, 'on' => $on]);
}
