<?php
declare(strict_types=1);

/* Actions: public reviews & feedback */
    /* ===== public reviews & feedback (v33): anyone can write one, everyone can read them; the admin moderates and can reply ===== */
    if (strncmp($a, 'fb_', 3) === 0) {
        $fbOn = setting('fb_on', '1') === '1';
        $fin = [];
        try { $pdo->query('SELECT 1 FROM app_reviews LIMIT 1')->fetchAll(); } catch (Throwable $e) { fb_ensure_table($pdo); }
        /* v35: reviews written by a signed-in teacher / CR / student / team leader remember who wrote them (name, role and photo are filled in automatically) */
        try { $pdo->query('SELECT user_type,user_id FROM app_reviews LIMIT 1')->fetchAll(); }
        catch (Throwable $e) { foreach (['ALTER TABLE app_reviews ADD COLUMN user_type VARCHAR(10) NULL', 'ALTER TABLE app_reviews ADD COLUMN user_id INT NULL'] as $alt) { try { $pdo->exec($alt); } catch (Throwable $x) {} } }
        $fbPh = "CASE a.user_type WHEN 'teacher' THEN (SELECT t.photo FROM teachers t WHERE t.id=a.user_id) WHEN 'student' THEN (SELECT c.photo FROM chat_users c WHERE c.id=a.user_id) WHEN 'leader' THEN (SELECT u.file_path FROM uploaded_photos u WHERE u.member_id=a.user_id ORDER BY u.id DESC LIMIT 1) END AS photo";
        $fbMe = function (string $as) use ($pdo): ?array {
            $order = in_array($as, ['teacher', 'leader', 'student'], true) ? [$as] : ['teacher', 'leader', 'student'];
            foreach ($order as $k) {
                if ($k === 'teacher') {
                    $t = cur_teacher(); if (!$t) continue;
                    return ['type' => 'teacher', 'id' => (int)$t['id'], 'name' => (string)$t['name'], 'role' => (($t['acct_type'] ?? '') === 'cr') ? 'CR' : 'Teacher', 'photo' => (string)($t['photo'] ?? '')];
                }
                if ($k === 'leader') {
                    $rid = (int)($_SESSION['leader_rid'] ?? 0); if (!$rid) continue;
                    $q = $pdo->prepare('SELECT m.id, m.full_name, (SELECT u.file_path FROM uploaded_photos u WHERE u.member_id=m.id ORDER BY u.id DESC LIMIT 1) AS photo FROM team_members m WHERE m.registration_id=? AND m.is_leader=1 LIMIT 1');
                    $q->execute([$rid]); $m = $q->fetch(); if (!$m) continue;
                    return ['type' => 'leader', 'id' => (int)$m['id'], 'name' => (string)$m['full_name'], 'role' => 'Team leader', 'photo' => (string)($m['photo'] ?? '')];
                }
                $uid = (int)($_SESSION['chat_uid'] ?? 0); if (!$uid) continue;
                $q = $pdo->prepare('SELECT id,name,photo FROM chat_users WHERE id=?'); $q->execute([$uid]); $u = $q->fetch(); if (!$u) continue;
                return ['type' => 'student', 'id' => (int)$u['id'], 'name' => (string)$u['name'], 'role' => 'Student', 'photo' => (string)($u['photo'] ?? '')];
            }
            return null;
        };
        if ($post) { need_csrf(); $fin = body(); }
        $fbOut = function (array $r) {
            return ['id' => (int)$r['id'], 'name' => (string)$r['name'], 'role' => (string)$r['role'], 'kind' => (string)$r['kind'], 'stars' => (int)$r['stars'],
                'body' => (string)$r['body'], 'reply' => (string)($r['reply'] ?? ''), 'status' => (string)$r['status'], 'ts' => (int)$r['ts'], 'rts' => (int)($r['rts'] ?? 0), 'photo' => (string)($r['photo'] ?? ''), 'ut' => (string)($r['user_type'] ?? '')];
        };

        if ($a === 'fb_list') {   /* public: only published items */
            session_write_close();
            $kind = (string)($_GET['kind'] ?? ''); $before = (int)($_GET['before'] ?? 0);
            $sum = $pdo->query("SELECT COUNT(*) AS n, COALESCE(AVG(stars),0) AS av, COALESCE(SUM(stars=1),0) AS s1, COALESCE(SUM(stars=2),0) AS s2, COALESCE(SUM(stars=3),0) AS s3,
                COALESCE(SUM(stars=4),0) AS s4, COALESCE(SUM(stars=5),0) AS s5 FROM app_reviews WHERE status='pub' AND kind='review' AND stars>0")->fetch();
            $cnt = ['review' => 0, 'feedback' => 0, 'idea' => 0];
            foreach ($pdo->query("SELECT kind, COUNT(*) AS n FROM app_reviews WHERE status='pub' GROUP BY kind")->fetchAll() as $c) if (isset($cnt[$c['kind']])) $cnt[$c['kind']] = (int)$c['n'];
            $where = "status='pub'"; $args = [];
            if (in_array($kind, ['review', 'feedback', 'idea'], true)) { $where .= ' AND kind=?'; $args[] = $kind; }
            if ($before > 0) { $where .= ' AND id<?'; $args[] = $before; }
            $q = $pdo->prepare("SELECT a.id,a.name,a.role,a.kind,a.stars,a.body,a.reply,a.status,a.user_type,UNIX_TIMESTAMP(a.created_at) AS ts,UNIX_TIMESTAMP(a.reply_at) AS rts,$fbPh FROM app_reviews a WHERE $where ORDER BY a.id DESC LIMIT 31");
            $q->execute($args);
            $rows = $q->fetchAll();
            $more = count($rows) > 30; if ($more) array_pop($rows);
            out(['ok' => true, 'on' => $fbOn, 'moderate' => setting('fb_moderate', '0') === '1',
                'sum' => ['n' => (int)$sum['n'], 'avg' => round((float)$sum['av'], 2), 'dist' => [(int)$sum['s1'], (int)$sum['s2'], (int)$sum['s3'], (int)$sum['s4'], (int)$sum['s5']]],
                'counts' => $cnt, 'items' => array_map($fbOut, $rows), 'more' => $more]);
        }

        if ($a === 'fb_me') {   /* who is signed in on this browser (teacher / CR / team leader / student chat profile)? Their name, role and photo are used for the review automatically */
            $me = $fbMe(cl((string)($_GET['as'] ?? ''), 10));
            session_write_close();
            out(['ok' => true, 'me' => $me ? ['type' => $me['type'], 'name' => $me['name'], 'role' => $me['role'], 'photo' => $me['photo']] : null]);
        }
        if ($a === 'fb_add') {   /* public: nobody needs an account */
            if (!$fbOn) fail('Reviews are switched off right now.', 403);
            if (trim((string)($fin['website'] ?? '')) !== '') out(['ok' => true, 'status' => 'pub']);   /* hidden "website" box: only bots fill it - they get "ok" and nothing is saved */
            $me = empty($fin['guest']) ? $fbMe(cl((string)($fin['as'] ?? ''), 10)) : null;   /* signed-in person: name / role / photo come from the account, not from the form */
            if ($me) { $name = mb_substr($me['name'], 0, 60); $role = $me['role']; $utype = $me['type']; $uidr = $me['id']; }
            else {
                $utype = null; $uidr = null;
                $name = trim(preg_replace('/\s+/u', ' ', (string)($fin['name'] ?? '')) ?? '');
                if (mb_strlen($name) < 2) fail('Please write your name (at least 2 letters).');
                $name = mb_substr($name, 0, 60);
                $role = in_array($fin['role'] ?? '', ['Student', 'Teacher', 'Other'], true) ? (string)$fin['role'] : 'Other';
            }
            $kind = in_array($fin['kind'] ?? '', ['review', 'feedback', 'idea'], true) ? (string)$fin['kind'] : 'review';
            $stars = (int)($fin['stars'] ?? 0);
            if ($stars < 0 || $stars > 5) $stars = 0;
            if ($kind === 'review' && $stars < 1) fail('Please choose a star rating.');
            $body = str_replace("\r\n", "\n", (string)($fin['body'] ?? ''));
            $body = trim(preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $body) ?? '');
            if (mb_strlen($body) < 3) fail('Please write a few words.');
            if (mb_strlen($body) > 600) $body = mb_substr($body, 0, 600);
            if (preg_match_all('~https?://|www\.~i', $body) > 1) fail('Please remove the links from your message.');
            $iph = hash('sha256', (string)($_SERVER['REMOTE_ADDR'] ?? '') . '|fb-salt');
            $q = $pdo->prepare('SELECT COUNT(*) FROM app_reviews WHERE ip_hash=? AND created_at > NOW() - INTERVAL 1 HOUR'); $q->execute([$iph]);
            if ((int)$q->fetchColumn() >= 10) fail('Too many messages from this connection. Please try again later.', 429);
            $q = $pdo->prepare('SELECT COUNT(*) FROM app_reviews WHERE ip_hash=? AND created_at > NOW() - INTERVAL 1 DAY'); $q->execute([$iph]);
            if ((int)$q->fetchColumn() >= 30) fail('Daily limit reached. Please try again tomorrow.', 429);
            $status = setting('fb_moderate', '0') === '1' ? 'pending' : 'pub';
            $pdo->prepare('INSERT INTO app_reviews(name,role,kind,stars,body,status,ip_hash,user_type,user_id) VALUES(?,?,?,?,?,?,?,?,?)')->execute([$name, $role, $kind, $stars, $body, $status, $iph, $utype, $uidr]);
            out(['ok' => true, 'status' => $status]);
        }

        need_admin();   /* everything below is for the admin panel */

        if ($a === 'fb_admin_list') {
            session_write_close();
            $rows = $pdo->query('SELECT a.id,a.name,a.role,a.kind,a.stars,a.body,a.reply,a.status,a.user_type,UNIX_TIMESTAMP(a.created_at) AS ts,UNIX_TIMESTAMP(a.reply_at) AS rts,' . $fbPh . ' FROM app_reviews a ORDER BY a.id DESC LIMIT 2000')->fetchAll();
            out(['ok' => true, 'on' => $fbOn, 'moderate' => setting('fb_moderate', '0') === '1', 'items' => array_map($fbOut, $rows)]);
        }
        if ($a === 'fb_admin_status') {
            $st = (string)($fin['status'] ?? '');
            if (!in_array($st, ['pub', 'pending', 'hidden'], true)) fail('Bad status.');
            $pdo->prepare('UPDATE app_reviews SET status=? WHERE id=?')->execute([$st, (int)($fin['id'] ?? 0)]);
            out(['ok' => true]);
        }
        if ($a === 'fb_admin_reply') {
            $t = trim(mb_substr((string)($fin['reply'] ?? ''), 0, 400));
            $pdo->prepare("UPDATE app_reviews SET reply=?, reply_at=IF(?='', NULL, NOW()) WHERE id=?")->execute([$t === '' ? null : $t, $t, (int)($fin['id'] ?? 0)]);
            out(['ok' => true]);
        }
        if ($a === 'fb_admin_delete') {
            $pdo->prepare('DELETE FROM app_reviews WHERE id=?')->execute([(int)($fin['id'] ?? 0)]);
            out(['ok' => true]);
        }
        if ($a === 'fb_admin_setting') {
            if (isset($fin['on'])) set_setting('fb_on', !empty($fin['on']) ? '1' : '0');
            if (isset($fin['moderate'])) set_setting('fb_moderate', !empty($fin['moderate']) ? '1' : '0');
            out(['ok' => true]);
        }
        fail('Unknown action.', 404);
    }
