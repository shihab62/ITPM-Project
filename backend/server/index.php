<?php
declare(strict_types=1);

/*
 * Backend entry point. The browser talks to it as  /api  (see router.php):
 *   /api?api=<action>   JSON actions (controllers/)
 *   /api?boot=1         JavaScript bootstrap (CSRF token, site name, logo)
 *   /api?manifest=1     PWA manifest          /api?sw=1   PWA service worker
 */
require __DIR__ . '/config.php';

if (isset($_GET['sw'])) { require BACKEND_DIR . '/routes/service_worker.php'; exit; }

require __DIR__ . '/bootstrap.php';
require __DIR__ . '/helpers.php';
require __DIR__ . '/database.php';
require __DIR__ . '/teachers.php';
require __DIR__ . '/presentation_files.php';
require __DIR__ . '/task_files.php';
require __DIR__ . '/subjects.php';
require __DIR__ . '/registration_form.php';
require __DIR__ . '/settings.php';
require __DIR__ . '/mailer.php';
require __DIR__ . '/registrations.php';
require __DIR__ . '/leader_helpers.php';
require __DIR__ . '/backup.php';
require __DIR__ . '/chat_helpers.php';
require __DIR__ . '/analytics.php';

if (isset($_GET['manifest'])) require BACKEND_DIR . '/routes/manifest.php';
if (isset($_GET['boot']))     require BACKEND_DIR . '/routes/boot.php';
if (isset($_GET['api']))      require BACKEND_DIR . '/routes/api.php';

http_response_code(404);
header('Content-Type: text/plain; charset=utf-8');
echo "Backend is running. Open the website at / (frontend), not this URL.\n";
