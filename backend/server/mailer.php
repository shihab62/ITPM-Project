<?php
declare(strict_types=1);

/* Gmail SMTP sender (password-reset codes). */
/* ---------- Gmail SMTP (used for password-reset codes). The admin saves the Gmail + App Password in Settings -> Email. ---------- */
/* App Password as Google shows it: "abcd efgh ijkl mnop". Removes every kind of space (also the hidden non-breaking ones from copy/paste). */
function smtp_clean_pw(string $p): string { return preg_replace('/[\s\x{00A0}\x{200B}-\x{200D}\x{2060}\x{FEFF}\x{202F}]+/u', '', $p) ?? ''; }
function smtp_cfg(): ?array {
    $n = trim(setting('smtp_name', ''));
    $u = trim(setting('smtp_user', '')); $p = pw_open(setting('smtp_pass_enc', ''));
    if ($u !== '' && $p !== '') return ['user' => $u, 'pass' => $p, 'name' => $n !== '' ? $n : site_name(), 'src' => 'panel'];
    if (trim(SMTP_USER) !== '' && trim(SMTP_PASS) !== '') return ['user' => trim(SMTP_USER), 'pass' => smtp_clean_pw(SMTP_PASS), 'name' => $n !== '' ? $n : site_name(), 'src' => 'file'];
    return null;
}
function smtp_state(): array {
    $c = smtp_cfg();
    return ['ok' => true, 'configured' => $c !== null, 'src' => $c['src'] ?? '', 'user' => $c ? $c['user'] : trim(setting('smtp_user', '')), 'name' => trim(setting('smtp_name', '')), 'site' => site_name(), 'last_err' => trim(setting('smtp_last_err', '')), 'last_err_at' => setting('smtp_last_err_at', '')];
}
/* Returns '' when the mail was accepted, otherwise a short error text. */
function smtp_send(string $to, string $toName, string $subject, string $html): string {
    $c = smtp_cfg(); if (!$c) return 'Email is not set up yet.';
    $to = str_replace(["\r", "\n"], '', $to);
    if (!filter_var($to, FILTER_VALIDATE_EMAIL)) return 'Invalid recipient address.';
    $hdr = fn(string $s): string => '=?UTF-8?B?' . base64_encode(str_replace(["\r", "\n"], ' ', $s)) . '?=';
    $last = 'Could not connect to the mail server. Your hosting may block outgoing mail ports (587 / 465). Ask your hosting support to allow smtp.gmail.com.';
    foreach ([['tcp://smtp.gmail.com:587', true], ['ssl://smtp.gmail.com:465', false]] as [$addr, $tls]) {
        $en = 0; $es = '';
        $fp = @stream_socket_client($addr, $en, $es, 12);
        if (!$fp) continue;
        stream_set_timeout($fp, 15);
        $rd = function () use ($fp): string {
            $r = '';
            while (($l = fgets($fp, 515)) !== false) { $r .= $l; if (strlen($l) < 4 || $l[3] === ' ') break; }
            return $r;
        };
        $cmd = function (string $line, string $ok) use ($fp, $rd): string {
            fwrite($fp, $line . "\r\n"); $r = $rd();
            return strpos($r, $ok) === 0 ? '' : (trim($r) !== '' ? trim($r) : 'No reply from the mail server.');
        };
        $err = '';
        do {
            if (strpos($rd(), '220') !== 0) { $err = 'The mail server did not respond.'; break; }
            if ($cmd('EHLO localhost', '250') !== '') { $err = 'The mail server refused the connection.'; break; }
            if ($tls) {
                if ($cmd('STARTTLS', '220') !== '') { $err = 'The mail server does not allow a secure connection.'; break; }
                if (!@stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) { $err = 'Secure (TLS) connection failed.'; break; }
                if ($cmd('EHLO localhost', '250') !== '') { $err = 'The mail server refused the secure connection.'; break; }
            }
            if ($cmd('AUTH LOGIN', '334') !== '' || $cmd(base64_encode($c['user']), '334') !== '' || $cmd(base64_encode($c['pass']), '235') !== '') {
                @fclose($fp);
                return 'Gmail rejected the login. Check the Gmail address and use a 16-character App Password (not your normal Gmail password). 2-Step Verification must be ON in that Google account.';
            }
            if ($cmd('MAIL FROM:<' . $c['user'] . '>', '250') !== '') { $err = 'The sender address was refused.'; break; }
            if ($cmd('RCPT TO:<' . $to . '>', '250') !== '') { $err = 'The recipient address was refused.'; break; }
            if ($cmd('DATA', '354') !== '') { $err = 'The mail server did not accept the message.'; break; }
            $host = parse_url('http://' . ($_SERVER['HTTP_HOST'] ?? 'localhost'), PHP_URL_HOST) ?: 'localhost';
            $msg = 'Date: ' . date('r') . "\r\n"
                . 'From: ' . $hdr($c['name']) . ' <' . $c['user'] . ">\r\n"
                . 'To: ' . ($toName !== '' ? $hdr($toName) . ' ' : '') . '<' . $to . ">\r\n"
                . 'Subject: ' . $hdr($subject) . "\r\n"
                . 'Message-ID: <' . bin2hex(random_bytes(12)) . '@' . $host . ">\r\n"
                . "MIME-Version: 1.0\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n"
                . chunk_split(base64_encode($html));
            fwrite($fp, $msg . "\r\n.\r\n");
            if (strpos($rd(), '250') !== 0) { $err = 'The mail server did not accept the message.'; break; }
            $cmd('QUIT', '221');
        } while (false);
        @fclose($fp);
        if ($err === '') return '';
        $last = $err;
    }
    return $last;
}
function reset_mail(string $name, string $code): string {
    $n = htmlspecialchars($name !== '' ? $name : 'there', ENT_QUOTES, 'UTF-8'); $s = htmlspecialchars(site_name(), ENT_QUOTES, 'UTF-8');
    return '<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:auto;border:1px solid #dde3ec;border-radius:14px;overflow:hidden">'
        . '<div style="background:#10243e;color:#fff;padding:16px 20px;font-size:18px;font-weight:bold">' . $s . '</div>'
        . '<div style="padding:22px 20px;color:#10243e;line-height:1.5"><p style="margin:0 0 12px">Hello ' . $n . ',</p>'
        . '<p style="margin:0 0 14px">Use this code to reset your password:</p>'
        . '<p style="font-size:32px;letter-spacing:8px;font-weight:bold;background:#f3f5f9;border-radius:10px;padding:12px;text-align:center;margin:0 0 14px">' . $code . '</p>'
        . '<p style="margin:0 0 8px;color:#5d6b7f;font-size:14px">The code works for 15 minutes. If you did not ask for it, you can ignore this email — your password stays the same.</p></div></div>';
}
