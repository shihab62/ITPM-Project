<?php
declare(strict_types=1);

/* Actions: chat (students, teachers, CR, admin) */
    /* ===== chat (v22): students sign in with name + mobile/Gmail (profile is created automatically, no password); teachers / CRs / admin chat from their panels ===== */
    if (strncmp($a, 'chat_', 5) === 0) {
        $who = (string)($_GET['who'] ?? 'student');
        if (!in_array($who, ['student', 'staff', 'admin'], true)) $who = 'student';
        $cin = [];
        if ($post) { need_csrf(); $cin = !empty($_POST) ? $_POST : body(); }   /* profile forms come as multipart (optional photo), the rest as JSON */
        $act = $a === 'chat_start' ? null : chat_actor($who);
        /* only start / sign-out write to the session; everything else releases the lock so the 4-second polling never queues behind a click */
        if (!in_array($a, ['chat_start', 'chat_signout'], true)) session_write_close();

        if ($a === 'chat_boot') {
            $res = ['ok' => true, 'on' => chat_on(), 'user' => null];
            if ($who === 'student') {
                $so = site_options(); $res['options'] = ['terms' => $so['terms'], 'programs' => chat_programs()];
                if ($act) {
                    $res['user'] = chat_user_pub($act['row']);
                    if ($res['on']) { $res['courses'] = chat_courses((int)$act['id'], (array)$act['row']); $res['staff'] = chat_staff((array)$act['row']); }
                }
                out($res);
            }
            if (!$act) fail('Please sign in again.', 401);
            $res['can_toggle'] = $act['type'] === 'admin';
            out($res);
        }
        if ($a === 'chat_start') {
            if (!$post) fail('POST required.', 405);
            if (!chat_on()) fail('Chat is switched off right now.', 403);
            $now = time();
            if (($_SESSION['cs_lock'] ?? 0) > $now) fail('Too many attempts. Wait a minute and try again.', 429);
            $_SESSION['cs_n'] = ($_SESSION['cs_n'] ?? 0) + 1;
            if ($_SESSION['cs_n'] > 12) { $_SESSION['cs_lock'] = $now + 60; $_SESSION['cs_n'] = 0; fail('Too many attempts. Wait a minute and try again.', 429); }
            if (!empty($cin['signin'])) {
                /* returning student: Gmail or mobile number only (no password) */
                $em = strtolower(cl($cin['email'] ?? '', 100)); $pk = chat_phone_key(cl($cin['phone'] ?? '', 24)); $u = null;
                if ($em === '' && $pk === '') fail('Enter your Gmail or your mobile number.');
                if ($em !== '') { $q = $pdo->prepare('SELECT * FROM chat_users WHERE email=?'); $q->execute([$em]); $u = $q->fetch() ?: null; }
                if (!$u && $pk !== '') { $q = $pdo->prepare('SELECT * FROM chat_users WHERE pkey=?'); $q->execute([$pk]); $u = $q->fetch() ?: null; }
                if (!$u) fail('No chat profile found with this Gmail / mobile number. Create a new profile instead.', 404);
                $uid = (int)$u['id']; $created = false;
            } else {
                [$c, $err] = chat_clean($cin);
                if ($err) fail($err);
                $byPhone = null; $byMail = null;
                if ($c['pk'] !== '') { $q = $pdo->prepare('SELECT * FROM chat_users WHERE pkey=?'); $q->execute([$c['pk']]); $byPhone = $q->fetch() ?: null; }
                $q = $pdo->prepare('SELECT * FROM chat_users WHERE email=?'); $q->execute([$c['email']]); $byMail = $q->fetch() ?: null;
                if ($byPhone && $byMail && (int)$byPhone['id'] !== (int)$byMail['id']) fail('This mobile number and this Gmail belong to two different chat profiles. Use only one of them.');
                $u = $byMail ?: $byPhone;
                $saved = [];
                try { $ph = save_photo('photo', $saved); } catch (RuntimeException $e) { fail($e->getMessage()); }
                if ($u) {
                    /* same Gmail / number = same profile: sign in, and fill in only what the profile did not have yet (nothing is overwritten) */
                    $sets = []; $args = [];
                    if ($c['pk'] !== '' && (string)($u['pkey'] ?? '') === '') { $sets[] = 'phone=?,pkey=?'; $args[] = $c['phone']; $args[] = $c['pk']; }
                    if ((string)($u['email'] ?? '') === '') { $sets[] = 'email=?'; $args[] = $c['email']; }
                    foreach (['batch' => 'batch', 'program' => 'program'] as $col => $k) if ((string)($u[$col] ?? '') === '') { $sets[] = "$col=?"; $args[] = $c[$k]; }
                    if ($ph && (string)($u['photo'] ?? '') === '') { $sets[] = 'photo=?'; $args[] = $ph['path']; $ph = null; }
                    if ($sets) { $args[] = (int)$u['id']; $pdo->prepare('UPDATE chat_users SET ' . implode(',', $sets) . ',updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute($args); }
                    if ($ph) rm_files([$ph['path']]);
                    $uid = (int)$u['id']; $created = false;
                } else {
                    try {
                        $pdo->prepare('INSERT INTO chat_users(name,email,batch,program,photo) VALUES(?,?,?,?,?)')
                            ->execute([$c['name'], $c['email'], $c['batch'], $c['program'], $ph ? $ph['path'] : null]);
                    } catch (Throwable $e) { if ($ph) rm_files([$ph['path']]); throw $e; }
                    $uid = (int)$pdo->lastInsertId(); $created = true;
                }
            }
            session_regenerate_id(true);
            $_SESSION['chat_uid'] = $uid; $_SESSION['cs_n'] = 0;
            $q = $pdo->prepare('SELECT * FROM chat_users WHERE id=?'); $q->execute([$uid]);
            out(['ok' => true, 'csrf' => $_SESSION['csrf'], 'created' => $created, 'user' => chat_user_pub((array)$q->fetch())]);
        }
        if ($a === 'chat_signout') { unset($_SESSION['chat_uid']); out(['ok' => true]); }

        if (!$act) fail($who === 'student' ? 'Please sign in to chat.' : 'Please sign in again.', 401);
        if ($who === 'student' && !chat_on()) fail('Chat is switched off right now.', 403);

        if ($a === 'chat_toggle') {
            if ($act['type'] !== 'admin') fail('Only the admin can switch chat on or off.', 403);
            set_setting('chat_on', !empty($cin['on']) ? '1' : '0');
            out(['ok' => true, 'on' => chat_on()]);
        }
        if ($a === 'chat_profile') {
            if ($act['type'] !== 'student') fail('Not allowed.', 403);
            [$c, $err] = chat_clean($cin);
            if ($err) fail($err);
            if ($c['pk'] !== '') { $q = $pdo->prepare('SELECT COUNT(*) FROM chat_users WHERE pkey=? AND id!=?'); $q->execute([$c['pk'], (int)$act['id']]); if ((int)$q->fetchColumn()) fail('Another chat profile already uses this mobile number.'); }
            $q = $pdo->prepare('SELECT COUNT(*) FROM chat_users WHERE email=? AND id!=?'); $q->execute([$c['email'], (int)$act['id']]); if ((int)$q->fetchColumn()) fail('Another chat profile already uses this Gmail.');
            $old = (string)($act['row']['photo'] ?? ''); $saved = [];
            try { $ph = save_photo('photo', $saved); } catch (RuntimeException $e) { fail($e->getMessage()); }
            $newPhoto = $ph ? $ph['path'] : (!empty($cin['remove_photo']) ? null : ($old !== '' ? $old : null));
            $pdo->prepare('UPDATE chat_users SET name=?,email=?,batch=?,program=?,photo=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')
                ->execute([$c['name'], $c['email'], $c['batch'], $c['program'], $newPhoto, (int)$act['id']]);
            if ($old !== '' && $newPhoto !== $old) rm_files([$old]);
            $q = $pdo->prepare('SELECT * FROM chat_users WHERE id=?'); $q->execute([(int)$act['id']]);
            out(['ok' => true, 'user' => chat_user_pub((array)$q->fetch())]);
        }
        if ($a === 'chat_rooms') {
            if ($act['type'] === 'staff') chat_ensure_groups((int)$act['id']);
            out(['ok' => true, 'rooms' => chat_rooms_for($act)]);
        }
        if ($a === 'chat_join') {
            if ($act['type'] !== 'student') fail('Only students join course groups.', 403);
            $sid = (int)($cin['subject_id'] ?? 0);
            $q = $pdo->prepare('SELECT teacher_id FROM subjects WHERE id=?'); $q->execute([$sid]); $row = $q->fetch();
            if (!$row || !(int)$row['teacher_id']) fail('This course has no teacher account yet, so it has no group.', 404);
            $okc = false;   /* v24: only a course of the student's own batch + program can be joined */
            foreach (chat_courses((int)$act['id'], (array)$act['row']) as $cc) if ($cc['id'] === $sid) { $okc = true; break; }
            if (!$okc) fail('This course is not for your batch / program.', 403);
            $pdo->prepare("INSERT IGNORE INTO chat_rooms(kind,subject_id) VALUES('group',?)")->execute([$sid]);
            $q = $pdo->prepare('SELECT id FROM chat_rooms WHERE subject_id=?'); $q->execute([$sid]); $rid = (int)$q->fetchColumn();
            $q = $pdo->prepare("SELECT status FROM chat_members WHERE room_id=? AND ptype='student' AND pid=?"); $q->execute([$rid, (int)$act['id']]);
            if ($q->fetchColumn() === 'removed') fail('The teacher removed you from this group.', 403);
            $pdo->prepare("INSERT IGNORE INTO chat_members(room_id,ptype,pid) VALUES(?,'student',?)")->execute([$rid, (int)$act['id']]);
            out(['ok' => true, 'room' => $rid]);
        }
        if ($a === 'chat_direct') {
            if ($act['type'] !== 'student') fail('Only students start a personal chat from here.', 403);
            $tid = (int)($cin['teacher_id'] ?? 0);
            $q = $pdo->prepare("SELECT id,acct_type,batch FROM teachers WHERE id=? AND status='active'"); $q->execute([$tid]); $tr = $q->fetch();
            if (!$tr) fail('Teacher not found.', 404);
            if (($tr['acct_type'] ?? '') === 'cr' && batch_num((string)($tr['batch'] ?? '')) !== '' && batch_num((string)$tr['batch']) !== batch_num((string)($act['row']['batch'] ?? ''))) fail('This CR belongs to another batch.', 403);
            $pdo->prepare("INSERT IGNORE INTO chat_rooms(kind,teacher_id,student_id) VALUES('direct',?,?)")->execute([$tid, (int)$act['id']]);
            $q = $pdo->prepare('SELECT id FROM chat_rooms WHERE teacher_id=? AND student_id=?'); $q->execute([$tid, (int)$act['id']]); $rid = (int)$q->fetchColumn();
            $q = $pdo->prepare("SELECT status FROM chat_members WHERE room_id=? AND ptype='student' AND pid=?"); $q->execute([$rid, (int)$act['id']]);
            if ($q->fetchColumn() === 'removed') fail('This teacher has closed the chat with you.', 403);
            $pdo->prepare("INSERT IGNORE INTO chat_members(room_id,ptype,pid) VALUES(?,'student',?)")->execute([$rid, (int)$act['id']]);
            out(['ok' => true, 'room' => $rid]);
        }
        if ($a === 'chat_support') {   /* v33: open (or create) my chat with the admin - students, teachers and CRs */
            if ($act['type'] === 'admin') fail('The admin replies from the chat list.', 403);
            $isS = $act['type'] === 'student';
            $col = $isS ? 'student_id' : 'teacher_id';
            $q = $pdo->prepare("SELECT id FROM chat_rooms WHERE kind='support' AND $col=? ORDER BY id LIMIT 1"); $q->execute([(int)$act['id']]); $rid = (int)$q->fetchColumn();
            if (!$rid) { $pdo->prepare("INSERT INTO chat_rooms(kind,$col) VALUES('support',?)")->execute([(int)$act['id']]); $rid = (int)$pdo->lastInsertId(); }
            if ($isS) {
                $q = $pdo->prepare("SELECT status FROM chat_members WHERE room_id=? AND ptype='student' AND pid=?"); $q->execute([$rid, (int)$act['id']]);
                if ($q->fetchColumn() === 'removed') fail('The admin has closed this chat.', 403);
                $pdo->prepare("INSERT IGNORE INTO chat_members(room_id,ptype,pid) VALUES(?,'student',?)")->execute([$rid, (int)$act['id']]);
            }
            out(['ok' => true, 'room' => $rid]);
        }
        if ($a === 'chat_leave') {
            if ($act['type'] !== 'student') fail('Not allowed.', 403);
            $rid = (int)($cin['room'] ?? 0); $r = chat_room_for($rid, $act);
            if (!$r || $r['kind'] !== 'group') fail('Group not found.', 404);
            $pdo->prepare("DELETE FROM chat_members WHERE room_id=? AND ptype='student' AND pid=?")->execute([$rid, (int)$act['id']]);
            out(['ok' => true]);
        }
        if ($a === 'chat_msgs') {
            $rid = (int)($_GET['room'] ?? 0);
            if (!chat_room_for($rid, $act)) fail('Chat not found.', 404);
            $after = (int)($_GET['after'] ?? 0); $before = (int)($_GET['before'] ?? 0);
            $cols = 'id,sender_type,sender_id,sender_name,sender_tag,body,deleted,UNIX_TIMESTAMP(created_at) AS ts';
            $more = false;
            if ($after > 0) {
                $q = $pdo->prepare("SELECT $cols FROM chat_messages WHERE room_id=? AND id>? ORDER BY id ASC LIMIT 100"); $q->execute([$rid, $after]);
                $rows = $q->fetchAll();
            } else {
                if ($before > 0) { $q = $pdo->prepare("SELECT $cols FROM chat_messages WHERE room_id=? AND id<? ORDER BY id DESC LIMIT 41"); $q->execute([$rid, $before]); }
                else { $q = $pdo->prepare("SELECT $cols FROM chat_messages WHERE room_id=? ORDER BY id DESC LIMIT 41"); $q->execute([$rid]); }
                $rows = $q->fetchAll();
                if (count($rows) > 40) { $more = true; array_pop($rows); }
                $rows = array_reverse($rows);
            }
            $msgs = []; $max = 0;
            foreach ($rows as $m) { $msgs[] = chat_msg_out($m, $act); $max = max($max, (int)$m['id']); }
            if ($before === 0 && $max > 0) chat_mark_read($rid, $act, $max);
            $res = ['ok' => true, 'msgs' => $msgs, 'more' => $more];
            if ($after > 0) {   /* polling also learns which recent messages were deleted */
                $q = $pdo->prepare('SELECT id FROM chat_messages WHERE room_id=? AND deleted=1 ORDER BY id DESC LIMIT 60'); $q->execute([$rid]);
                $res['del'] = array_map('intval', $q->fetchAll(PDO::FETCH_COLUMN));
            }
            out($res);
        }
        if ($a === 'chat_send') {
            $rid = (int)($cin['room'] ?? 0);
            $text = str_replace("\r\n", "\n", (string)($cin['text'] ?? ''));
            $text = trim(preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $text) ?? '');
            if ($text === '') fail('Type a message first.');
            if (mb_strlen($text) > 2000) fail('The message is too long (max 2000 characters).');
            if (!chat_room_for($rid, $act)) fail('Chat not found.', 404);
            $q = $pdo->prepare('SELECT COUNT(*) FROM (SELECT created_at FROM chat_messages WHERE sender_type=? AND sender_id=? ORDER BY id DESC LIMIT 12) t WHERE created_at > NOW() - INTERVAL 10 SECOND');
            $q->execute([$act['type'], (int)$act['id']]);
            if ((int)$q->fetchColumn() >= 12) fail('You are sending too fast. Wait a few seconds.', 429);
            $pdo->prepare('INSERT INTO chat_messages(room_id,sender_type,sender_id,sender_name,sender_tag,body) VALUES(?,?,?,?,?,?)')
                ->execute([$rid, $act['type'], (int)$act['id'], mb_substr((string)$act['name'], 0, 100), (string)$act['tag'], $text]);
            $mid = (int)$pdo->lastInsertId();
            $pdo->prepare('UPDATE chat_rooms SET last_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$rid]);
            chat_mark_read($rid, $act, $mid);
            $q = $pdo->prepare('SELECT id,sender_type,sender_id,sender_name,sender_tag,body,deleted,UNIX_TIMESTAMP(created_at) AS ts FROM chat_messages WHERE id=?'); $q->execute([$mid]);
            out(['ok' => true, 'msg' => chat_msg_out((array)$q->fetch(), $act)]);
        }
        if ($a === 'chat_delete') {
            $q = $pdo->prepare('SELECT * FROM chat_messages WHERE id=?'); $q->execute([(int)($cin['id'] ?? 0)]); $m = $q->fetch();
            if (!$m || !chat_room_for((int)$m['room_id'], $act)) fail('Message not found.', 404);
            $own = $m['sender_type'] === $act['type'] && (int)$m['sender_id'] === (int)$act['id'];
            if ($act['type'] === 'student' && !$own) fail('You can delete only your own messages.', 403);
            $pdo->prepare("UPDATE chat_messages SET deleted=1, body='' WHERE id=?")->execute([(int)$m['id']]);
            out(['ok' => true]);
        }
        if ($a === 'chat_members') {
            $rid = (int)($_GET['room'] ?? 0); $r = chat_room_for($rid, $act);
            if (!$r) fail('Chat not found.', 404);
            $mg = $act['type'] !== 'student';
            $q = $pdo->prepare("SELECT cu.id,cu.name,cu.phone,cu.email,cu.batch,cu.program,cu.sem_term,cu.sem_year,cu.photo,m.status,m.joined_at,(SELECT COUNT(*) FROM chat_messages x WHERE x.room_id=m.room_id AND x.sender_type='student' AND x.sender_id=cu.id AND x.deleted=0) AS msgs FROM chat_members m JOIN chat_users cu ON cu.id=m.pid WHERE m.room_id=? AND m.ptype='student'" . ($mg ? '' : " AND m.status='active'") . ' ORDER BY m.status, cu.name LIMIT 500');
            $q->execute([$rid]);
            $list = [];
            foreach ($q->fetchAll() as $u) $list[] = ['id' => (int)$u['id'], 'name' => (string)$u['name'], 'status' => (string)$u['status'], 'phone' => $mg ? (string)($u['phone'] ?? '') : '', 'email' => $mg ? (string)($u['email'] ?? '') : '', 'info' => chat_user_info($u), 'photo' => (string)($u['photo'] ?? ''), 'msgs' => (int)$u['msgs'], 'joined' => (string)($u['joined_at'] ?? '')];
            out(['ok' => true, 'members' => $list, 'can_manage' => $mg]);
        }
        if ($a === 'chat_kick') {   /* teacher / CR / admin: remove a student from a group (or block a personal chat); undo = allow again */
            if ($act['type'] === 'student') fail('Not allowed.', 403);
            $rid = (int)($cin['room'] ?? 0);
            if (!chat_room_for($rid, $act)) fail('Chat not found.', 404);
            $pdo->prepare("UPDATE chat_members SET status=? WHERE room_id=? AND ptype='student' AND pid=?")->execute([!empty($cin['undo']) ? 'active' : 'removed', $rid, (int)($cin['user'] ?? 0)]);
            out(['ok' => true]);
        }
        fail('Unknown action.', 404);
    }
