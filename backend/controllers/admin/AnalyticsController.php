<?php
declare(strict_types=1);

/* Actions: an_* (visitor analytics) */
switch ($a) {
    case 'an_data':
        need_admin(); an_ensure();
        out(an_dashboard(max(1, min(90, (int)($_GET['days'] ?? 7)))));

    case 'an_visitors':
        need_admin(); an_ensure();
        $q = trim((string)($_GET['q'] ?? '')); $flt = (string)($_GET['flt'] ?? ''); $role = (string)($_GET['role'] ?? '');
        $lim = max(10, min(100, (int)($_GET['limit'] ?? 40))); $off = max(0, (int)($_GET['off'] ?? 0));
        $w = ['1=1']; $p = [];
        if ($q !== '') { $like = '%' . str_replace(['%', '_'], ['\\%', '\\_'], $q) . '%'; $w[] = '(ip LIKE ? OR who LIKE ? OR city LIKE ? OR country LIKE ? OR region LIKE ? OR device_name LIKE ? OR os LIKE ? OR browser LIKE ? OR isp LIKE ? OR vid LIKE ?)'; for ($i = 0; $i < 10; $i++) $p[] = $like; }
        if ($flt === 'online') { $w[] = 'last_seen>=?'; $p[] = gmdate('Y-m-d H:i:s', time() - 300); }
        elseif ($flt === 'today') { $w[] = 'last_seen>=?'; $p[] = gmdate('Y-m-d H:i:s', strtotime('today')); }
        elseif ($flt === 'new') { $w[] = 'first_seen>=?'; $p[] = gmdate('Y-m-d H:i:s', strtotime('today') - 6 * 86400); }
        elseif ($flt === 'known') { $w[] = "role<>'guest'"; }
        if (in_array($role, ['guest', 'student', 'teacher', 'cr', 'leader'], true)) { $w[] = 'role=?'; $p[] = $role; }
        $cs = $pdo->prepare('SELECT COUNT(*) FROM an_visitors WHERE ' . implode(' AND ', $w)); $cs->execute($p); $tot = (int)$cs->fetchColumn();
        $st = $pdo->prepare('SELECT * FROM an_visitors WHERE ' . implode(' AND ', $w) . ' ORDER BY last_seen DESC LIMIT ' . $lim . ' OFFSET ' . $off); $st->execute($p);
        $rows = array_map('an_row', $st->fetchAll());
        if ($rows) {
            $vids = array_column($rows, 'vid'); $ph = implode(',', array_fill(0, count($vids), '?'));
            $pq = $pdo->prepare("SELECT vid,page,COUNT(*) AS c FROM an_events WHERE vid IN ($ph) AND kind IN ('visit','view') GROUP BY vid,page ORDER BY c DESC"); $pq->execute($vids);
            $pm = [];
            foreach ($pq->fetchAll() as $x) { if (count($pm[$x['vid']] ?? []) < 8) $pm[$x['vid']][] = ['k' => (string)$x['page'], 'c' => (int)$x['c']]; }
            foreach ($rows as &$rw) $rw['pages'] = $pm[$rw['vid']] ?? [];
            unset($rw);
        }
        out(['ok' => true, 'total' => $tot, 'rows' => $rows]);

    case 'an_page':
        need_admin(); an_ensure();
        $pgx = preg_replace('/[^#A-Za-z0-9_\-\/.]/', '', (string)($_GET['page'] ?? '')) ?? '';
        $dd = max(1, min(90, (int)($_GET['days'] ?? 7)));
        $st = $pdo->prepare("SELECT v.*, COUNT(*) AS n, MAX(e.ts) AS lt FROM an_events e JOIN an_visitors v ON v.vid=e.vid WHERE e.kind IN ('visit','view') AND e.page=? AND e.ts>=? GROUP BY v.vid ORDER BY lt DESC LIMIT 150");
        $st->execute([$pgx, gmdate('Y-m-d H:i:s', strtotime('today') - ($dd - 1) * 86400)]);
        out(['ok' => true, 'rows' => array_map(function ($r) { $o = an_row($r); $o['n'] = (int)$r['n']; $o['lt'] = (string)$r['lt']; return $o; }, $st->fetchAll())]);

    case 'an_visitor':
        need_admin(); an_ensure();
        $vid = (string)($_GET['vid'] ?? '');
        if (!preg_match('/^[a-f0-9]{32}$/', $vid)) fail('Visitor not found.', 404);
        $st = $pdo->prepare('SELECT * FROM an_visitors WHERE vid=?'); $st->execute([$vid]); $r = $st->fetch();
        if (!$r) fail('Visitor not found.', 404);
        $ev = $pdo->prepare('SELECT ts,ip,kind,page,action,res,who,ref FROM an_events WHERE vid=? ORDER BY id DESC LIMIT 250'); $ev->execute([$vid]);
        $ips = $pdo->prepare('SELECT e.ip, COUNT(*) AS c, MIN(e.ts) AS f, MAX(e.ts) AS l, COALESCE(g.country,\'\') AS country, COALESCE(g.city,\'\') AS city, COALESCE(g.isp,\'\') AS isp FROM an_events e LEFT JOIN an_geo g ON g.ip=e.ip WHERE e.vid=? GROUP BY e.ip, g.country, g.city, g.isp ORDER BY l DESC LIMIT 20'); $ips->execute([$vid]);
        $pg = $pdo->prepare("SELECT page AS k, COUNT(*) AS c FROM an_events WHERE vid=? AND kind IN ('visit','view') GROUP BY page ORDER BY c DESC LIMIT 10"); $pg->execute([$vid]);
        out(['ok' => true, 'v' => an_row($r), 'ua' => (string)$r['ua'], 'events' => $ev->fetchAll(), 'ips' => $ips->fetchAll(), 'pages' => $pg->fetchAll()]);

    case 'an_feed':
        need_admin(); an_ensure();
        $st = $pdo->query("SELECT e.id,e.ts,e.ip,e.kind,e.page,e.action,e.res,e.who,e.ref,e.vid, COALESCE(v.country,'') AS country, COALESCE(v.city,'') AS city, COALESCE(v.device_name,'') AS device, COALESCE(v.os,'') AS os, COALESCE(v.browser,'') AS browser, COALESCE(v.role,'guest') AS role FROM an_events e LEFT JOIN an_visitors v ON v.vid=e.vid ORDER BY e.id DESC LIMIT 120");
        out(['ok' => true, 'rows' => $st->fetchAll()]);

    case 'an_set':
        need_admin(); an_ensure();
        if (!$post) fail('POST required.', 405);
        set_setting('an_on', !empty($in['on']) ? '1' : '0');
        set_setting('an_skip_admin', !empty($in['skip_admin']) ? '1' : '0');
        set_setting('an_keep_days', (string)max(7, min(365, (int)($in['keep_days'] ?? 90))));
        an_purge();
        out(['ok' => true]);

    case 'an_clear':
        need_admin(); an_ensure();
        if (!$post) fail('POST required.', 405);
        $pdo->exec('DELETE FROM an_events'); $pdo->exec('DELETE FROM an_visitors');
        out(['ok' => true]);
}
