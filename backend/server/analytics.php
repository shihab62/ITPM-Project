<?php
declare(strict_types=1);

/* Visitor analytics helpers (admin only). */
/* ---------- v34: VISITOR ANALYTICS (admin only) - visitors, IP, place, device, activity ---------- */
const AN_ACTIONS = ['register', 'teacher_register', 'login', 'teacher_login', 'leader_login', 'chat_start', 'chat_send', 'task_submit', 'pres_upload', 'fb_add', 'forgot_request', 'leader_update'];
function an_ensure(): void {
    static $done = false; if ($done) return; $done = true;
    if (setting('an_schema', '') === '3') return;
    $T = ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';
    $pdo = db();
    $pdo->exec("CREATE TABLE IF NOT EXISTS an_visitors(
      vid CHAR(32) NOT NULL PRIMARY KEY, first_seen DATETIME NOT NULL, last_seen DATETIME NOT NULL,
      visits INT NOT NULL DEFAULT 0, hits INT NOT NULL DEFAULT 0, active_secs INT NOT NULL DEFAULT 0,
      ip VARCHAR(45) NOT NULL DEFAULT '', country VARCHAR(80) NOT NULL DEFAULT '', cc CHAR(2) NOT NULL DEFAULT '', region VARCHAR(80) NOT NULL DEFAULT '',
      city VARCHAR(80) NOT NULL DEFAULT '', isp VARCHAR(120) NOT NULL DEFAULT '',
      device_type VARCHAR(12) NOT NULL DEFAULT '', device_name VARCHAR(120) NOT NULL DEFAULT '', os VARCHAR(60) NOT NULL DEFAULT '', browser VARCHAR(60) NOT NULL DEFAULT '',
      screen VARCHAR(20) NOT NULL DEFAULT '', lang VARCHAR(20) NOT NULL DEFAULT '', tz VARCHAR(60) NOT NULL DEFAULT '', pwa TINYINT NOT NULL DEFAULT 0, conn VARCHAR(12) NOT NULL DEFAULT '',
      role VARCHAR(12) NOT NULL DEFAULT 'guest', who VARCHAR(120) NOT NULL DEFAULT '', last_page VARCHAR(80) NOT NULL DEFAULT '', ua VARCHAR(300) NOT NULL DEFAULT '',
      KEY idx_av_last (last_seen), KEY idx_av_first (first_seen), KEY idx_av_ip (ip))$T");
    $pdo->exec("CREATE TABLE IF NOT EXISTS an_events(
      id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, vid CHAR(32) NOT NULL DEFAULT '', ts DATETIME NOT NULL, ip VARCHAR(45) NOT NULL DEFAULT '',
      kind VARCHAR(10) NOT NULL DEFAULT 'view', page VARCHAR(80) NOT NULL DEFAULT '', action VARCHAR(40) NOT NULL DEFAULT '', res VARCHAR(8) NOT NULL DEFAULT '',
      who VARCHAR(120) NOT NULL DEFAULT '', ref VARCHAR(120) NOT NULL DEFAULT '',
      KEY idx_ae_ts (ts), KEY idx_ae_vid (vid, ts), KEY idx_ae_kind (kind, ts), KEY idx_ae_ip (ip))$T");
    $pdo->exec("CREATE TABLE IF NOT EXISTS an_geo(
      ip VARCHAR(45) NOT NULL PRIMARY KEY, country VARCHAR(80) NOT NULL DEFAULT '', cc CHAR(2) NOT NULL DEFAULT '', region VARCHAR(80) NOT NULL DEFAULT '',
      city VARCHAR(80) NOT NULL DEFAULT '', isp VARCHAR(120) NOT NULL DEFAULT '', ts DATETIME NOT NULL)$T");
    if (!$pdo->query("SHOW COLUMNS FROM an_visitors LIKE 'extra'")->fetch()) $pdo->exec("ALTER TABLE an_visitors ADD COLUMN extra VARCHAR(500) NOT NULL DEFAULT ''");
    set_setting('an_schema', '3');
}
function an_private_ip(string $ip): bool {
    return $ip === '' || $ip === '0' || !filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE);
}
function an_http_get(string $url, int $timeout = 3): string {
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => $timeout, CURLOPT_CONNECTTIMEOUT => $timeout, CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_USERAGENT => 'Mozilla/5.0 (site analytics)', CURLOPT_HTTPHEADER => ['Accept: application/json']]);
        $r = curl_exec($ch); unset($ch);
        return is_string($r) ? $r : '';
    }
    $ctx = stream_context_create(['http' => ['timeout' => $timeout, 'header' => "Accept: application/json\r\nUser-Agent: Mozilla/5.0\r\n"]]);
    $r = @file_get_contents($url, false, $ctx);
    return is_string($r) ? $r : '';
}
/* approximate place of an IP address (country / region / city / network). Cached in MySQL, so every IP is looked up only once. */
function an_geo(string $ip, bool $remote = true): array {
    $e = ['country' => '', 'cc' => '', 'region' => '', 'city' => '', 'isp' => ''];
    if (an_private_ip($ip)) { $e['country'] = 'Local network'; return $e; }
    $pdo = db();
    $st = $pdo->prepare('SELECT country,cc,region,city,isp,ts FROM an_geo WHERE ip=?'); $st->execute([$ip]); $r = $st->fetch();
    if ($r) {
        $g = ['country' => (string)$r['country'], 'cc' => (string)$r['cc'], 'region' => (string)$r['region'], 'city' => (string)$r['city'], 'isp' => (string)$r['isp']];
        $age = time() - (int)strtotime($r['ts'] . ' UTC');
        if ($age < ($g['country'] !== '' ? 30 * 86400 : 3600)) return $g;
    }
    if (!$remote) return $e;
    $g = $e;
    $j = json_decode(an_http_get('https://ipwho.is/' . rawurlencode($ip) . '?fields=success,country,country_code,region,city,connection'), true);
    if (is_array($j) && !empty($j['success'])) {
        $g = ['country' => cl((string)($j['country'] ?? ''), 80), 'cc' => strtoupper(substr(cl((string)($j['country_code'] ?? ''), 2), 0, 2)), 'region' => cl((string)($j['region'] ?? ''), 80),
            'city' => cl((string)($j['city'] ?? ''), 80), 'isp' => cl((string)(($j['connection']['isp'] ?? '') ?: ($j['connection']['org'] ?? '')), 120)];
    } else {
        $j = json_decode(an_http_get('http://ip-api.com/json/' . rawurlencode($ip) . '?fields=status,country,countryCode,regionName,city,isp'), true);
        if (is_array($j) && ($j['status'] ?? '') === 'success') {
            $g = ['country' => cl((string)($j['country'] ?? ''), 80), 'cc' => strtoupper(substr(cl((string)($j['countryCode'] ?? ''), 2), 0, 2)), 'region' => cl((string)($j['regionName'] ?? ''), 80),
                'city' => cl((string)($j['city'] ?? ''), 80), 'isp' => cl((string)($j['isp'] ?? ''), 120)];
        }
    }
    try {
        $pdo->prepare('INSERT INTO an_geo(ip,country,cc,region,city,isp,ts) VALUES(?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE country=VALUES(country),cc=VALUES(cc),region=VALUES(region),city=VALUES(city),isp=VALUES(isp),ts=VALUES(ts)')
            ->execute([$ip, $g['country'], $g['cc'], $g['region'], $g['city'], $g['isp'], gmdate('Y-m-d H:i:s')]);
    } catch (Throwable $x) {}
    return $g;
}
/* the place lookup runs AFTER the answer is sent, so a visitor never waits for it */
function an_geo_later(string $vid, string $ip): void {
    register_shutdown_function(function () use ($vid, $ip) {
        if (function_exists('fastcgi_finish_request')) @fastcgi_finish_request();
        elseif (function_exists('litespeed_finish_request')) @litespeed_finish_request();
        @set_time_limit(25);
        try {
            $g = an_geo($ip, true);
            if ($g['country'] !== '') db()->prepare('UPDATE an_visitors SET country=?,cc=?,region=?,city=?,isp=? WHERE vid=? AND ip=?')->execute([$g['country'], $g['cc'], $g['region'], $g['city'], $g['isp'], $vid, $ip]);
        } catch (Throwable $e) {}
    });
}
function an_brand(string $m): string {
    $m = trim($m);
    if ($m === '' || preg_match('/^(K|Android|wv|Linux|Mobile)$/i', $m)) return 'Android phone';
    $b = '';
    if (preg_match('/^(SM-|GT-|SCH-|SGH-|Galaxy)/i', $m)) $b = 'Samsung';
    elseif (preg_match('/^(Redmi|POCO|Xiaomi|Mi\s|MI\s|M\d{4}[A-Z]\d|2[0-9]{5,7}[A-Z0-9]{1,4}$)/', $m)) $b = 'Xiaomi';
    elseif (preg_match('/^(RMX|realme)/i', $m)) $b = 'Realme';
    elseif (preg_match('/^(CPH|OPPO|PEU|PGJ|PHM)/i', $m)) $b = 'Oppo';
    elseif (preg_match('/^(vivo|V\d{4}|PD\d{4})/i', $m)) $b = 'Vivo';
    elseif (preg_match('/^Infinix/i', $m) || preg_match('/^X\d{3,4}[A-Z]?$/', $m)) $b = 'Infinix';
    elseif (preg_match('/^TECNO/i', $m)) $b = 'Tecno';
    elseif (preg_match('/^itel/i', $m)) $b = 'itel';
    elseif (preg_match('/^(HUAWEI|HONOR)/i', $m) || preg_match('/^[A-Z]{3}-(L|AL|LX|TL)\d{2}/', $m)) $b = 'Huawei';
    elseif (preg_match('/^(moto|XT\d{4})/i', $m)) $b = 'Motorola';
    elseif (preg_match('/^(Nokia|TA-\d{4})/i', $m)) $b = 'Nokia';
    elseif (preg_match('/^(OnePlus|(IN|KB|LE|HD|GM|NE)\d{4}$)/i', $m)) $b = 'OnePlus';
    elseif (preg_match('/^Pixel/i', $m)) $b = 'Google';
    elseif (preg_match('/^(Symphony|Walton|Lava)/i', $m)) $b = '';
    return ($b !== '' && stripos($m, $b) !== 0) ? $b . ' ' . $m : $m;
}
/* device type, device name, OS and browser from the User-Agent (+ the browser's own model hint when it gives one) */
function an_ua(string $ua, array $h = []): array {
    $os = ''; $dev = ''; $type = 'desktop'; $br = '';
    $model = trim((string)($h['model'] ?? ''));
    if (stripos($ua, 'iPhone') !== false) { $type = 'mobile'; $dev = 'iPhone'; $os = 'iOS' . (preg_match('/OS (\d+)[_.]/', $ua, $m) ? ' ' . $m[1] : ''); }
    elseif (stripos($ua, 'iPad') !== false) { $type = 'tablet'; $dev = 'iPad'; $os = 'iPadOS' . (preg_match('/OS (\d+)[_.]/', $ua, $m) ? ' ' . $m[1] : ''); }
    elseif (stripos($ua, 'Android') !== false) {
        $os = 'Android' . (preg_match('/Android (\d+)/', $ua, $m) ? ' ' . $m[1] : '');
        $type = stripos($ua, 'Mobile') !== false ? 'mobile' : 'tablet';
        $mm = $model;
        if ($mm === '' && preg_match('/Android [^;)]*;\s*([^;)]+?)(?:\s+Build\/|\s*[;)])/', $ua, $m)) $mm = trim($m[1]);
        $dev = an_brand($mm);
        if ($type === 'tablet' && $dev === 'Android phone') $dev = 'Android tablet';
    }
    elseif (preg_match('/Windows NT (\d+\.\d+)/', $ua, $m)) {
        $dev = 'Windows PC';
        $pv = (int)($h['platv'] ?? 0);
        $os = $m[1] === '10.0' ? ($pv >= 13 ? 'Windows 11' : 'Windows 10') : ($m[1] === '6.3' ? 'Windows 8.1' : ($m[1] === '6.1' ? 'Windows 7' : 'Windows'));
    }
    elseif (stripos($ua, 'CrOS') !== false) { $dev = 'Chromebook'; $os = 'ChromeOS'; }
    elseif (stripos($ua, 'Macintosh') !== false) { $dev = 'Mac'; $os = 'macOS'; }
    elseif (stripos($ua, 'Linux') !== false || stripos($ua, 'X11') !== false) { $dev = 'Linux PC'; $os = 'Linux'; }
    else { $dev = 'Unknown device'; }
    $v = function (string $re) use ($ua): string { return preg_match($re, $ua, $x) ? ' ' . $x[1] : ''; };
    if (preg_match('/FBAN|FBAV|FB_IAB/i', $ua)) $br = 'Facebook app';
    elseif (stripos($ua, 'Instagram') !== false) $br = 'Instagram app';
    elseif (preg_match('/Messenger|Orca-Android/i', $ua)) $br = 'Messenger app';
    elseif (preg_match('/EdgA?\/|Edg\//', $ua)) $br = 'Edge' . $v('/Edg[A]?\/(\d+)/');
    elseif (preg_match('/OPR\/|Opera/', $ua)) $br = 'Opera' . $v('/OPR\/(\d+)/');
    elseif (stripos($ua, 'SamsungBrowser') !== false) $br = 'Samsung Internet' . $v('/SamsungBrowser\/(\d+)/');
    elseif (stripos($ua, 'UCBrowser') !== false) $br = 'UC Browser';
    elseif (preg_match('/Firefox\/|FxiOS\//', $ua)) $br = 'Firefox' . $v('/(?:Firefox|FxiOS)\/(\d+)/');
    elseif (preg_match('/CriOS\/|Chrome\//', $ua)) $br = (strpos($ua, '; wv)') !== false ? 'Android WebView' : 'Chrome') . $v('/(?:CriOS|Chrome)\/(\d+)/');
    elseif (stripos($ua, 'Safari/') !== false) $br = 'Safari' . $v('/Version\/(\d+)/');
    else $br = 'Other';
    return ['device_type' => $type, 'device_name' => mb_substr($dev, 0, 120), 'os' => mb_substr($os, 0, 60), 'browser' => mb_substr($br, 0, 60)];
}
/* who is signed in on this browser: [role, label] */
function an_who(): array {
    try {
        $pdo = db();
        if (!empty($_SESSION['admin_id'])) return ['admin', 'Admin'];
        if (!empty($_SESSION['teacher_id'])) {
            $q = $pdo->prepare('SELECT name,acct_type FROM teachers WHERE id=?'); $q->execute([(int)$_SESSION['teacher_id']]); $r = $q->fetch();
            if ($r) return [($r['acct_type'] ?? '') === 'cr' ? 'cr' : 'teacher', cl((string)$r['name'], 100)];
        }
        if (!empty($_SESSION['leader_rid'])) {
            $q = $pdo->prepare('SELECT ref_code,team_name,reg_type FROM registrations WHERE id=?'); $q->execute([(int)$_SESSION['leader_rid']]); $r = $q->fetch();
            if ($r) return ['leader', cl(trim(((string)($r['team_name'] ?? '') !== '' ? $r['team_name'] : ($r['reg_type'] === 'team' ? 'Team' : 'Individual')) . ' · ' . $r['ref_code']), 110)];
        }
        if (!empty($_SESSION['chat_uid'])) {
            $q = $pdo->prepare('SELECT name FROM chat_users WHERE id=?'); $q->execute([(int)$_SESSION['chat_uid']]); $r = $q->fetch();
            if ($r) return ['student', cl((string)$r['name'], 100)];
        }
    } catch (Throwable $e) {}
    return ['guest', ''];
}
function an_cookie_vid(): string {
    $c = (string)($_COOKIE['vid'] ?? '');
    return preg_match('/^[a-f0-9]{32}$/', $c) ? $c : '';
}
function an_is_bot(string $ua): bool {
    return $ua === '' || (bool)preg_match('/bot\b|crawl|spider|slurp|headless|lighthouse|pingdom|uptime|monitor|curl\/|wget|python-|java\/|facebookexternalhit|preview|scanner/i', $ua);
}
function an_purge(): void {
    try {
        $keep = max(7, min(365, (int)setting('an_keep_days', '90')));
        $lim = gmdate('Y-m-d H:i:s', time() - $keep * 86400);
        $pdo = db();
        $pdo->prepare('DELETE FROM an_events WHERE ts < ?')->execute([$lim]);
        $pdo->prepare('DELETE FROM an_visitors WHERE last_seen < ?')->execute([$lim]);
        $pdo->prepare('DELETE FROM an_geo WHERE ts < ?')->execute([gmdate('Y-m-d H:i:s', time() - 120 * 86400)]);
    } catch (Throwable $e) {}
}
/* one page view / heartbeat sent by the browser */
function an_track(array $in): void {
    if (setting('an_on', '1') !== '1') return;
    $ua = substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 300);
    if (an_is_bot($ua)) return;
    if (!empty($_SESSION['admin_id']) && setting('an_skip_admin', '1') === '1') return;
    an_ensure();
    $vid = an_cookie_vid();
    if ($vid === '') {
        $vid = bin2hex(random_bytes(16));
        global $https;
        @setcookie('vid', $vid, ['expires' => time() + 63072000, 'path' => '/', 'secure' => (bool)$https, 'httponly' => true, 'samesite' => 'Lax']);
    }
    if (rl_wait('trk|' . $vid, 3000, 86400) > 0) return;
    rl_hit('trk|' . $vid, 86400);
    $kind = ($in['kind'] ?? '') === 'ping' ? 'ping' : 'view';
    $page = preg_replace('/[^#A-Za-z0-9_\-\/.]/', '', (string)($in['page'] ?? '')) ?? '';
    $page = substr($page === '' ? '#home' : $page, 0, 80);
    $ip = client_ip();
    $info = an_ua($ua, ['model' => cl($in['model'] ?? '', 60), 'platv' => cl($in['platv'] ?? '', 20)]);
    [$role, $who] = an_who();
    $screen = preg_match('/^\d{2,5}x\d{2,5}$/', (string)($in['screen'] ?? '')) ? (string)$in['screen'] : '';
    $lang = cl($in['lang'] ?? '', 20); $tz = cl($in['tz'] ?? '', 60);
    $pwa = !empty($in['pwa']) ? 1 : 0;
    $conn = preg_match('/^[a-z0-9-]{2,10}$/', (string)($in['conn'] ?? '')) ? (string)$in['conn'] : '';
    $ex = [];
    if (preg_match('/^\d{2,5}x\d{2,5}$/', (string)($in['vp'] ?? ''))) $ex['vp'] = (string)$in['vp'];
    foreach (['dpr' => 10, 'cores' => 128, 'mem' => 64, 'down' => 10000, 'load' => 600000, 'touch' => 20] as $xk => $xm) if (isset($in[$xk]) && is_numeric($in[$xk]) && $in[$xk] >= 0 && $in[$xk] <= $xm) $ex[$xk] = $in[$xk] + 0;
    foreach (['dark', 'save', 'ck'] as $xk) if (isset($in[$xk])) $ex[$xk] = !empty($in[$xk]) ? 1 : 0;
    if (isset($in['tzo']) && is_numeric($in['tzo']) && abs((float)$in['tzo']) <= 840) $ex['tzo'] = (int)$in['tzo'];
    $pdo = db(); $now = gmdate('Y-m-d H:i:s');
    $st = $pdo->prepare('SELECT * FROM an_visitors WHERE vid=?'); $st->execute([$vid]); $v = $st->fetch();
    if ($v && $v['ip'] === $ip && $v['country'] !== '') $g = ['country' => $v['country'], 'cc' => $v['cc'], 'region' => $v['region'], 'city' => $v['city'], 'isp' => $v['isp']];
    else $g = an_geo($ip, false);
    $gap = $v ? max(0, time() - (int)strtotime($v['last_seen'] . ' UTC')) : 999999;
    $newVisit = !$v || ($kind !== 'ping' && $gap > 1800);
    if ($v && $kind === 'view' && $page === $v['last_page'] && $gap < 3) $kind = 'ping';   /* double send: count once */
    if (!$v) $kind = 'view';
    $act = ($v && $gap <= 90) ? $gap : 0;
    $extra = '';
    if ($v) { $old = json_decode((string)($v['extra'] ?? ''), true); $ex = array_merge(is_array($old) ? $old : [], $ex); }
    if ($ex) $extra = substr((string)json_encode($ex), 0, 480);
    if ($role === 'guest' && $v) { $role = (string)$v['role']; $who = (string)$v['who']; }   /* once identified, the browser stays linked to that person */
    if ($v && $info['device_name'] === 'Android phone' && $v['device_name'] !== '') $info['device_name'] = (string)$v['device_name'];
    if (!$v) {
        $pdo->prepare('INSERT INTO an_visitors(vid,first_seen,last_seen,visits,hits,active_secs,ip,country,cc,region,city,isp,device_type,device_name,os,browser,screen,lang,tz,pwa,conn,role,who,last_page,ua,extra)
            VALUES(?,?,?,1,1,0,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
            ->execute([$vid, $now, $now, $ip, $g['country'], $g['cc'], $g['region'], $g['city'], $g['isp'], $info['device_type'], $info['device_name'], $info['os'], $info['browser'], $screen, $lang, $tz, $pwa, $conn, $role, $who, $kind === 'ping' ? '' : $page, $ua, $extra]);
    } else {
        $pdo->prepare('UPDATE an_visitors SET last_seen=?, visits=visits+?, hits=hits+?, active_secs=active_secs+?, ip=?, country=?, cc=?, region=?, city=?, isp=?, device_type=?, device_name=?, os=?, browser=?,
            screen=IF(?<>\'\',?,screen), lang=IF(?<>\'\',?,lang), tz=IF(?<>\'\',?,tz), pwa=?, conn=IF(?<>\'\',?,conn), role=?, who=?, last_page=IF(?=\'view\',?,last_page), ua=?, extra=IF(?<>\'\',?,extra) WHERE vid=?')
            ->execute([$now, $newVisit ? 1 : 0, $kind === 'ping' ? 0 : 1, $act, $ip, $g['country'], $g['cc'], $g['region'], $g['city'], $g['isp'], $info['device_type'], $info['device_name'], $info['os'], $info['browser'],
                $screen, $screen, $lang, $lang, $tz, $tz, $pwa, $conn, $conn, $role, $who, $kind, $page, $ua, $extra, $extra, $vid]);
    }
    if ($kind !== 'ping') {
        $ref = '';
        if ($newVisit && !empty($in['ref'])) { $rh = (string)parse_url((string)$in['ref'], PHP_URL_HOST); if ($rh !== '' && strcasecmp($rh, (string)($_SERVER['HTTP_HOST'] ?? '')) !== 0) $ref = substr($rh, 0, 120); }
        $pdo->prepare('INSERT INTO an_events(vid,ts,ip,kind,page,action,res,who,ref) VALUES(?,?,?,?,?,?,?,?,?)')->execute([$vid, $now, $ip, $newVisit ? 'visit' : 'view', $page, '', '', $who, $ref]);
    }
    if ($g['country'] === '' && !an_private_ip($ip)) an_geo_later($vid, $ip);
    if (random_int(1, 150) === 1) an_purge();
}
/* server side: what a visitor DID (register, sign in, upload, chat ...) - runs when the request ends */
function an_log_action(string $a): void {
    try {
        if (setting('an_on', '1') !== '1') return;
        $code = (int)http_response_code();
        $auth = in_array($a, ['login', 'teacher_login', 'leader_login', 'chat_start'], true);
        if ($code < 400) $res = 'ok';
        elseif ($auth && in_array($code, [401, 403, 429], true)) $res = 'fail';
        else return;
        if ($res === 'ok' && !empty($_SESSION['admin_id']) && setting('an_skip_admin', '1') === '1') return;
        if (an_is_bot((string)($_SERVER['HTTP_USER_AGENT'] ?? ''))) return;
        an_ensure();
        $vid = an_cookie_vid(); [$role, $who] = an_who();
        $pdo = db();
        $pdo->prepare('INSERT INTO an_events(vid,ts,ip,kind,page,action,res,who,ref) VALUES(?,?,?,?,?,?,?,?,?)')->execute([$vid, gmdate('Y-m-d H:i:s'), client_ip(), 'action', '', $a, $res, $who, '']);
        if ($vid !== '' && $role !== 'guest' && $role !== 'admin') $pdo->prepare('UPDATE an_visitors SET role=?, who=? WHERE vid=?')->execute([$role, $who, $vid]);
    } catch (Throwable $e) {}
}
function an_dashboard(int $days): array {
    $pdo = db();
    $since = gmdate('Y-m-d H:i:s', strtotime('today') - ($days - 1) * 86400);
    $today = gmdate('Y-m-d H:i:s', strtotime('today'));
    $on5 = gmdate('Y-m-d H:i:s', time() - 300);
    $all = function (string $sql, array $p = []) use ($pdo): array { $s = $pdo->prepare($sql); $s->execute($p); return $s->fetchAll(); };
    $one = function (string $sql, array $p = []) use ($pdo) { $s = $pdo->prepare($sql); $s->execute($p); return $s->fetchColumn(); };
    $pv = "kind IN ('visit','view')";
    $o = ['ok' => true, 'days' => $days];
    $o['cfg'] = ['on' => setting('an_on', '1') === '1', 'skip_admin' => setting('an_skip_admin', '1') === '1', 'keep_days' => max(7, min(365, (int)setting('an_keep_days', '90')))];
    $o['k'] = [
        'online' => (int)$one('SELECT COUNT(*) FROM an_visitors WHERE last_seen>=?', [$on5]),
        'today' => (int)$one("SELECT COUNT(DISTINCT vid) FROM an_events WHERE $pv AND ts>=?", [$today]),
        'visitors' => (int)$one("SELECT COUNT(DISTINCT vid) FROM an_events WHERE $pv AND ts>=?", [$since]),
        'views' => (int)$one("SELECT COUNT(*) FROM an_events WHERE $pv AND ts>=?", [$since]),
        'sessions' => (int)$one("SELECT COUNT(*) FROM an_events WHERE kind='visit' AND ts>=?", [$since]),
        'newv' => (int)$one('SELECT COUNT(*) FROM an_visitors WHERE first_seen>=?', [$since]),
        'total' => (int)$one('SELECT COUNT(*) FROM an_visitors'),
        'avg_secs' => (int)round((float)$one('SELECT COALESCE(AVG(active_secs),0) FROM an_visitors WHERE last_seen>=?', [$since])),
        'ips' => (int)$one('SELECT COUNT(DISTINCT ip) FROM an_visitors WHERE last_seen>=?', [$since]),
        'identified' => (int)$one("SELECT COUNT(*) FROM an_visitors WHERE last_seen>=? AND role<>'guest'", [$since]),
    ];
    $byDay = []; foreach ($all("SELECT DATE(ts + INTERVAL 6 HOUR) AS d, COUNT(DISTINCT vid) AS u, COUNT(*) AS v FROM an_events WHERE $pv AND ts>=? GROUP BY d", [$since]) as $r) $byDay[(string)$r['d']] = [(int)$r['u'], (int)$r['v']];
    $series = [];
    for ($i = $days - 1; $i >= 0; $i--) { $d = date('Y-m-d', strtotime('today') - $i * 86400); $series[] = ['d' => $d, 'u' => $byDay[$d][0] ?? 0, 'v' => $byDay[$d][1] ?? 0]; }
    $o['series'] = $series;
    $hrs = array_fill(0, 24, 0);
    foreach ($all("SELECT HOUR(ts + INTERVAL 6 HOUR) AS h, COUNT(*) AS c FROM an_events WHERE $pv AND ts>=? GROUP BY h", [$since]) as $r) $hrs[(int)$r['h']] = (int)$r['c'];
    $o['hours'] = $hrs;
    $top = function (string $col, int $lim = 10) use ($all, $since): array {
        return array_map(function ($r) { return ['k' => (string)$r['k'], 'c' => (int)$r['c']]; }, $all("SELECT $col AS k, COUNT(*) AS c FROM an_visitors WHERE last_seen>=? AND $col<>'' GROUP BY $col ORDER BY c DESC LIMIT $lim", [$since]));
    };
    $o['pages'] = array_map(function ($r) { return ['k' => (string)$r['k'], 'c' => (int)$r['c'], 'u' => (int)$r['u']]; }, $all("SELECT page AS k, COUNT(*) AS c, COUNT(DISTINCT vid) AS u FROM an_events WHERE $pv AND ts>=? GROUP BY page ORDER BY c DESC LIMIT 15", [$since]));
    $o['actions'] = array_map(function ($r) { return ['k' => (string)$r['k'], 'c' => (int)$r['c'], 'f' => (int)$r['f']]; }, $all("SELECT action AS k, SUM(res='ok') AS c, SUM(res='fail') AS f FROM an_events WHERE kind='action' AND ts>=? GROUP BY action ORDER BY c DESC", [$since]));
    $o['refs'] = array_map(function ($r) { return ['k' => (string)$r['k'], 'c' => (int)$r['c']]; }, $all("SELECT ref AS k, COUNT(*) AS c FROM an_events WHERE kind='visit' AND ref<>'' AND ts>=? GROUP BY ref ORDER BY c DESC LIMIT 8", [$since]));
    $o['countries'] = array_map(function ($r) { return ['k' => (string)$r['k'], 'cc' => (string)$r['cc'], 'c' => (int)$r['c']]; }, $all("SELECT country AS k, cc, COUNT(*) AS c FROM an_visitors WHERE last_seen>=? AND country<>'' GROUP BY country, cc ORDER BY c DESC LIMIT 12", [$since]));
    $o['cities'] = array_map(function ($r) { return ['k' => (string)$r['k'], 'c' => (int)$r['c']]; }, $all("SELECT CONCAT(city, IF(region<>'', CONCAT(', ', region), ''), IF(country<>'', CONCAT(', ', country), '')) AS k, COUNT(*) AS c FROM an_visitors WHERE last_seen>=? AND city<>'' GROUP BY k ORDER BY c DESC LIMIT 12", [$since]));
    $o['types'] = $top('device_type', 5); $o['devices'] = $top('device_name', 12); $o['os'] = $top('os', 8); $o['browsers'] = $top('browser', 8);
    $o['isps'] = $top('isp', 10); $o['roles'] = $top('role', 6); $o['langs'] = $top('lang', 6); $o['screens'] = $top('screen', 8); $o['tzs'] = $top('tz', 5);
    $o['online'] = array_map('an_row', $all('SELECT * FROM an_visitors WHERE last_seen>=? ORDER BY last_seen DESC LIMIT 40', [$on5]));
    $o['fails'] = array_map(function ($r) { return ['ip' => (string)$r['ip'], 'c' => (int)$r['c'], 'last' => (string)$r['l'], 'place' => (string)$r['place']]; },
        $all("SELECT e.ip, COUNT(*) AS c, MAX(e.ts) AS l, COALESCE(MAX(CONCAT_WS(', ', NULLIF(v.city,''), NULLIF(v.country,''))),'') AS place FROM an_events e LEFT JOIN an_visitors v ON v.vid=e.vid WHERE e.res='fail' AND e.ts>=? GROUP BY e.ip ORDER BY c DESC LIMIT 8", [$since]));
    return $o;
}
function an_row(array $r): array {
    return ['vid' => (string)$r['vid'], 'first' => (string)$r['first_seen'], 'last' => (string)$r['last_seen'], 'visits' => (int)$r['visits'], 'hits' => (int)$r['hits'], 'secs' => (int)$r['active_secs'],
        'ip' => (string)$r['ip'], 'country' => (string)$r['country'], 'cc' => (string)$r['cc'], 'region' => (string)$r['region'], 'city' => (string)$r['city'], 'isp' => (string)$r['isp'],
        'type' => (string)$r['device_type'], 'device' => (string)$r['device_name'], 'os' => (string)$r['os'], 'browser' => (string)$r['browser'], 'screen' => (string)$r['screen'],
        'lang' => (string)$r['lang'], 'tz' => (string)$r['tz'], 'pwa' => (int)$r['pwa'], 'conn' => (string)$r['conn'], 'role' => (string)$r['role'], 'who' => (string)$r['who'], 'page' => (string)$r['last_page'],
        'extra' => (array)json_decode((string)($r['extra'] ?? ''), true), 'online' => strtotime($r['last_seen'] . ' UTC') >= time() - 300];
}
