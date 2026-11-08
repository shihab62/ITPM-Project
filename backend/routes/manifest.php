<?php
declare(strict_types=1);

/* GET /api?manifest=1  ->  web-app manifest (installed-app name follows the site name). */
session_write_close();
$nm = site_name(); $m = [];
$mf = FRONTEND_DIR . '/manifest.json';
if (is_file($mf)) { $j = json_decode((string)@file_get_contents($mf), true); if (is_array($j)) $m = $j; }
$m['name'] = $nm; $m['short_name'] = mb_substr($nm, 0, 12);
if (empty($m['start_url'])) $m['start_url'] = './';
if (empty($m['scope'])) $m['scope'] = './';
if (empty($m['display'])) $m['display'] = 'standalone';
if (empty($m['background_color'])) $m['background_color'] = '#f3f5f9';
if (empty($m['theme_color'])) $m['theme_color'] = '#10243e';
if (empty($m['icons']) || !is_array($m['icons'])) {
    $m['icons'] = [];
    foreach ([192, 512] as $sz) if (is_file(FRONTEND_DIR . '/images/icon-' . $sz . '.png')) $m['icons'][] = ['src' => '/images/icon-' . $sz . '.png', 'sizes' => $sz . 'x' . $sz, 'type' => 'image/png', 'purpose' => 'any maskable'];
}
header('Content-Type: application/manifest+json; charset=utf-8');
header('Cache-Control: no-cache');
echo json_encode($m, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
exit;
