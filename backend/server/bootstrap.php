<?php
declare(strict_types=1);

/* Session + security headers (runs for every backend request). */
/* ---------- session + headers ---------- */
$https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
ini_set('session.use_strict_mode', '1');
ini_set('session.use_only_cookies', '1');
ini_set('session.use_trans_sid', '0');
ini_set('session.sid_length', '48');
ini_set('session.sid_bits_per_character', '6');
ini_set('session.gc_maxlifetime', '28800');
ini_set('display_errors', '0');   /* never show PHP errors/paths to visitors (they are logged instead) */
session_name('PRSESSID');
session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'secure' => $https, 'httponly' => true, 'samesite' => 'Lax']);
session_start();
if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(32));
/* hardening: a signed-in session that is idle for 8 hours is dropped, and a session is tied to the browser that created it */
$__ua = hash('sha256', (string)($_SERVER['HTTP_USER_AGENT'] ?? ''));
if (!empty($_SESSION['__ua']) && !hash_equals($_SESSION['__ua'], $__ua)) { $_SESSION = []; session_regenerate_id(true); $_SESSION['csrf'] = bin2hex(random_bytes(32)); }
if (!empty($_SESSION['__seen']) && time() - (int)$_SESSION['__seen'] > 28800) { $_SESSION = []; session_regenerate_id(true); $_SESSION['csrf'] = bin2hex(random_bytes(32)); }
$_SESSION['__ua'] = $__ua;
if (!isset($_SESSION['__seen']) || time() - (int)$_SESSION['__seen'] > 300) $_SESSION['__seen'] = time();
header('X-Frame-Options: SAMEORIGIN');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: strict-origin-when-cross-origin');
header('Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()');
header('Cross-Origin-Opener-Policy: same-origin');
header_remove('X-Powered-By');
if ($https) header('Strict-Transport-Security: max-age=31536000; includeSubDomains');
header("Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; font-src 'self' data: https://fonts.gstatic.com https://cdnjs.cloudflare.com; img-src 'self' data: blob: https:; media-src 'self' blob:; connect-src 'self'; frame-src 'self' https://view.officeapps.live.com; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'");
