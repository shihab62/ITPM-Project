<?php
declare(strict_types=1);

/*
 * GET /api?boot=1  ->  tiny JavaScript file loaded in <head> by every page.
 * It hands the static frontend the things the old single-file index.php used to print into the HTML:
 * CSRF token, site name, site logo and the default form fields.
 */
$csrf = $_SESSION['csrf'];
session_write_close();
$boot = ['apiUrl' => API_URL, 'csrf' => $csrf, 'siteName' => 'Presentation Registration', 'logo' => '', 'defFields' => [], 'error' => null];
try {
    $boot['defFields'] = default_fields();
    $boot['siteName']  = site_name();
    $boot['logo']      = site_logo();
} catch (Throwable $e) {
    $boot['error'] = $e->getMessage();
}
$flags = JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT;
header('Content-Type: application/javascript; charset=utf-8');
header('Cache-Control: no-store');
echo 'window.__BOOT=' . json_encode($boot, $flags) . ";\n";
echo "(function(){var B=window.__BOOT,d=document;try{var m=d.createElement('meta');m.name='csrf';m.content=B.csrf||'';d.head.appendChild(m);"
   . "if(!d.documentElement.hasAttribute('data-keep-title'))d.title=B.siteName;"
   . "var a=d.querySelector('meta[name=application-name]');if(a)a.content=String(B.siteName).slice(0,30);"
   . "var t=d.querySelector('meta[name=apple-mobile-web-app-title]');if(t)t.content=String(B.siteName).slice(0,14);}catch(e){}})();\n";
exit;
