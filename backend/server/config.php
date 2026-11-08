<?php
declare(strict_types=1);

/*
 * Configuration. Everything here can be overridden WITHOUT editing this file:
 *   - create backend/server/config.local.php (see config.local.example.php), or
 *   - set environment variables DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASS, API_URL.
 */
date_default_timezone_set('Asia/Dhaka');

/* ---------- folders ---------- */
define('BACKEND_DIR',  dirname(__DIR__));              /* project/backend */
define('PROJECT_DIR',  dirname(BACKEND_DIR));          /* project */
define('FRONTEND_DIR', PROJECT_DIR . '/frontend');
define('APP_ROOT',     BACKEND_DIR . '/storage');      /* holds data/ (private) and uploads/ (public photos) */
define('DATA_DIR',     APP_ROOT . '/data');
define('UPLOAD_DIR',   APP_ROOT . '/uploads');

if (is_file(__DIR__ . '/config.local.php')) require __DIR__ . '/config.local.php';

function env_or(string $k, string $d): string { $v = getenv($k); return ($v !== false && $v !== '') ? (string)$v : $d; }

/* ---------- MySQL (XAMPP / WAMP / Laragon defaults: user root, empty password). The database is created automatically. ---------- */
defined('DB_HOST') || define('DB_HOST', env_or('DB_HOST', '127.0.0.1'));
defined('DB_PORT') || define('DB_PORT', env_or('DB_PORT', '3306'));
defined('DB_NAME') || define('DB_NAME', env_or('DB_NAME', 'presentation_system'));
defined('DB_USER') || define('DB_USER', env_or('DB_USER', 'root'));
defined('DB_PASS') || define('DB_PASS', env_or('DB_PASS', ''));
/* public URL of backend/server/index.php as the browser sees it (router.php maps /api to it) */
defined('API_URL') || define('API_URL', env_or('API_URL', '/api'));

/* ---------- application constants (unchanged from the original) ---------- */
const DEFAULT_ADMIN_USER = 'admin';
const DEFAULT_ADMIN_PASS = 'Admin@12345';
const FIXED_DEPT  = 'CSE';
const FIXED_BATCH = '32';
/* true: a form created by a CR starts closed and only the admin can open it (Subjects -> Open/Close). false: CR forms go live immediately. */
const CR_NEEDS_APPROVAL = false;
const MAX_PHOTO   = 2 * 1024 * 1024;
/* Gmail for password-reset emails. Easiest: Admin -> Email tab (saved there, it is used first). These two lines are only a fallback if the Email tab is empty (App Password, spaces are fine). */
const SMTP_USER = '';
const SMTP_PASS = '';
