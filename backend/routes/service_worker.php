<?php
declare(strict_types=1);

/* GET /api?sw=1  ->  PWA service worker (offline page). */
header('Content-Type: application/javascript; charset=utf-8');
header('Cache-Control: no-cache');
echo "const OFF='<!DOCTYPE html><html><head><meta charset=utf-8><meta name=viewport content=\"width=device-width,initial-scale=1\"><title>Offline</title></head><body style=\"font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;text-align:center;background:#f4f7fb;color:#1c2a3a\"><div><div style=font-size:56px>&#128225;</div><h2>You are offline</h2><p>Internet connection is needed. Please connect and try again.</p><button onclick=location.reload() style=\"padding:12px 22px;border:0;border-radius:10px;background:#0d9488;color:#fff;font-size:1rem\">Try again</button></div></body></html>';\n"
   . "self.addEventListener('install',function(e){self.skipWaiting()});\n"
   . "self.addEventListener('activate',function(e){e.waitUntil(self.clients.claim())});\n"
   . "self.addEventListener('fetch',function(e){var r=e.request;if(r.method!=='GET'||r.mode!=='navigate')return;e.respondWith(fetch(r).catch(function(){return new Response(OFF,{headers:{'Content-Type':'text/html; charset=utf-8'}})}))});\n";
exit;
