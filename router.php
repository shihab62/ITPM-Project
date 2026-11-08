<?php
declare(strict_types=1);
/*
 * Router for PHP's built-in web server. It glues  frontend/  and  backend/  together:
 *
 *     php -S localhost:8000 router.php
 *
 *   URL                         served from
 *   /                           frontend/index.html
 *   /about.html, /login.html..  frontend/*.html
 *   /css  /js  /images          frontend/...
 *   /uploads/<photo>            backend/storage/uploads/<photo>      (jpg / png / webp / gif only)
 *   /api                        backend/server/index.php             (JSON actions, boot script, manifest, service worker)
 *
 * Nothing else is reachable: backend code, database/ and backend/storage/data (private files) are never served.
 */
$uri = rawurldecode((string)parse_url((string)($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH));
if ($uri === '' || strpos($uri, "\0") !== false || strpos($uri, '..') !== false || strpos($uri, '\\') !== false) { http_response_code(400); exit('Bad request'); }

if ($uri === '/api' || $uri === '/api/') { require __DIR__ . '/backend/server/index.php'; return true; }

$rel = $uri === '/' ? '/index.html' : $uri;
$file = null;
if (preg_match('#^/uploads/[A-Za-z0-9._-]+\.(jpe?g|png|webp|gif)$#i', $rel)) {
    $file = __DIR__ . '/backend/storage' . $rel;
} elseif (preg_match('#^/(css|js|images)/[A-Za-z0-9._/-]+$#', $rel) || preg_match('#^/[A-Za-z0-9_-]+\.(html|json|ico|txt)$#', $rel)) {
    $file = __DIR__ . '/frontend' . $rel;
}
if ($file === null || !is_file($file)) {
    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    exit("404 Not found: $uri\n");
}

$types = ['html' => 'text/html; charset=utf-8', 'css' => 'text/css; charset=utf-8', 'js' => 'application/javascript; charset=utf-8',
          'json' => 'application/json; charset=utf-8', 'png' => 'image/png', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'gif' => 'image/gif',
          'webp' => 'image/webp', 'svg' => 'image/svg+xml', 'ico' => 'image/x-icon', 'txt' => 'text/plain; charset=utf-8',
          'woff' => 'font/woff', 'woff2' => 'font/woff2'];
$ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
header('Content-Type: ' . ($types[$ext] ?? 'application/octet-stream'));
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-cache');
if ($ext === 'html') {   /* same security headers the original single-file page sent */
    header('X-Frame-Options: SAMEORIGIN');
    header('Referrer-Policy: strict-origin-when-cross-origin');
    header("Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; font-src 'self' data: https://fonts.gstatic.com https://cdnjs.cloudflare.com; img-src 'self' data: blob: https:; media-src 'self' blob:; connect-src 'self'; frame-src 'self' https://view.officeapps.live.com; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'");
}
header('Content-Length: ' . (string)filesize($file));
readfile($file);
return true;
