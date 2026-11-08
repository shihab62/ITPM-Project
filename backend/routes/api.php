<?php
declare(strict_types=1);

/* All JSON actions: /api?api=<action>. Each controller file handles a group of actions and ends the request with out() / fail(). */
    $a = (string)$_GET['api'];
    /* any unexpected database/PHP error now comes back as a readable message (and is logged in data/error.log) instead of a blank page */
    set_exception_handler(function (Throwable $e) {
        log_err(date('c') . ' ' . (string)($_GET['api'] ?? '') . ' ' . $e->getMessage() . ' @' . basename($e->getFile()) . ':' . $e->getLine() . "\n");
        $m = $e->getMessage();
        fail((stripos($m, 'locked') !== false || stripos($m, 'busy') !== false || stripos($m, 'lock wait') !== false || stripos($m, 'deadlock') !== false || stripos($m, 'too many connections') !== false) ? 'The server is busy right now. Please try again.' : 'Server error: ' . mb_substr($m, 0, 160), 500);
    });
    $post = $_SERVER['REQUEST_METHOD'] === 'POST';
    if (!$post && in_array($a, ['subjects', 'teams_public', 'people_public', 'tasks_public', 'tasks_admin', 'subs_list', 'subjects_admin', 'regs', 'stats', 'settings_get', 'teachers_admin', 'pres_link', 'export', 'task_file', 'smtp_get'], true)) session_write_close();
    $pdo = db();
    if ($post) {
        $ipk = client_ip();
        /* generous for a campus (many students share one IP), but stops scripts */
        if (strpos($a, 'chat_') !== 0 && $a !== 'track') { rl_guard('post|' . $ipk, 240, 60, 'Too many requests. Please wait'); rl_hit('post|' . $ipk, 60); }
        if (in_array($a, ['forgot_request', 'forgot_reset'], true)) { rl_guard('fp|' . $ipk, 12, 3600); rl_hit('fp|' . $ipk, 3600); }
        if (in_array($a, ['register', 'teacher_register', 'fb_add'], true)) { rl_guard('reg|' . $ipk, 80, 600); rl_hit('reg|' . $ipk, 600); }
        if (in_array($a, ['login', 'teacher_login', 'leader_login', 'chat_start'], true)) rl_guard('auth|' . $ipk, 15, 600, 'Too many failed sign-ins from this network. Wait');
    }
    if ($post && cache_flush_needed($a)) register_shutdown_function('cache_flush');   /* any change -> public cache is rebuilt on the next visit */

    /* v34 analytics: the browser's page-view / heartbeat beacon (silent, no answer needed) + server-side activity log */
    if ($post && in_array($a, AN_ACTIONS, true)) register_shutdown_function('an_log_action', $a);

require BACKEND_DIR . '/controllers/PublicController.php';
require BACKEND_DIR . '/controllers/AuthController.php';
require BACKEND_DIR . '/controllers/TaskController.php';
require BACKEND_DIR . '/controllers/TeacherSignupController.php';
require BACKEND_DIR . '/controllers/ReviewController.php';
require BACKEND_DIR . '/controllers/ChatController.php';
require BACKEND_DIR . '/controllers/LeaderController.php';
require BACKEND_DIR . '/controllers/PresentationController.php';

require BACKEND_DIR . '/controllers/admin/_context.php';
require BACKEND_DIR . '/controllers/admin/ExportController.php';
require BACKEND_DIR . '/controllers/admin/_guard.php';

require BACKEND_DIR . '/controllers/admin/AnalyticsController.php';
require BACKEND_DIR . '/controllers/admin/SubjectController.php';
require BACKEND_DIR . '/controllers/admin/TaskAdminController.php';
require BACKEND_DIR . '/controllers/admin/RegistrationController.php';
require BACKEND_DIR . '/controllers/admin/SettingsController.php';
require BACKEND_DIR . '/controllers/admin/TeacherAdminController.php';
require BACKEND_DIR . '/controllers/admin/BackupController.php';
require BACKEND_DIR . '/controllers/admin/AccountController.php';

fail('Unknown action.', 404);
