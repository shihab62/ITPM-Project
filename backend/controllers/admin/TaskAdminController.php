<?php
declare(strict_types=1);

/* Actions: tasks_admin, task_save/toggle/delete, subs_list, sub_delete */
switch ($a) {
    case 'tasks_admin':
        $rows = $pdo->query('SELECT t.*,s.name AS subject,(SELECT COUNT(*) FROM task_subs x WHERE x.task_id=t.id) AS sub_count FROM tasks t JOIN subjects s ON s.id=t.subject_id' . ($tch ? ' WHERE t.subject_id IN (' . implode(',', $owned ?: [0]) . ')' : '') . ' ORDER BY t.id DESC')->fetchAll();
        $tkSub = [];
        foreach ($rows as &$r) {
            $tsid = (int)$r['subject_id'];
            if (!isset($tkSub[$tsid])) { $sq0 = $pdo->prepare('SELECT * FROM subjects WHERE id=?'); $sq0->execute([$tsid]); $sr0 = $sq0->fetch() ?: []; $tkSub[$tsid] = ['code' => (string)($sr0['code'] ?? ''), 'program' => (string)($sr0['program'] ?? ''), 'department' => (string)($sr0['department'] ?? ''), 'batches' => $sr0 ? subject_batches($sr0) : []]; }
            $r['subject_code'] = $tkSub[$tsid]['code']; $r['program'] = $tkSub[$tsid]['program']; $r['department'] = $tkSub[$tsid]['department']; $r['batches'] = $tkSub[$tsid]['batches'];
            [$r['open'], $r['msg'], $r['late']] = task_window($r); $r['due_local'] = !empty($r['due_at']) ? date('Y-m-d\TH:i', (int)strtotime((string)$r['due_at'])) : ''; $r['due_ts'] = !empty($r['due_at']) ? (int)strtotime((string)$r['due_at']) : null; }
        unset($r);
        out(['ok' => true, 'tasks' => $rows]);
    case 'task_save':
        $sid = (int)($in['subject_id'] ?? 0);
        $sq = $pdo->prepare('SELECT id FROM subjects WHERE id=?'); $sq->execute([$sid]);
        if (!$sq->fetchColumn() || ($tch && !in_array($sid, $owned, true))) fail('Choose one of your subjects.');
        $title = cl($in['title'] ?? '', 150); if (mb_strlen($title) < 3) fail('Enter a title.');
        $kind = ($in['kind'] ?? '') === 'lab' ? 'lab' : 'assignment';
        $mode = in_array($in['mode'] ?? '', ['individual', 'team', 'both'], true) ? $in['mode'] : 'both';
        $dd = trim((string)($in['due_at'] ?? '')); $ts = $dd !== '' ? strtotime($dd) : false;
        if ($dd !== '' && $ts === false) fail('Enter a valid deadline.');
        $due = $ts !== false ? date('Y-m-d H:i:s', $ts) : null;
        $mb = max(1, min(50, (int)($in['max_mb'] ?? 10)));
        $details = cl($in['details'] ?? '', 2000);
        $tid = (int)($in['id'] ?? 0);
        $io = array_key_exists('is_open', $in) ? (empty($in['is_open']) ? 0 : 1) : null;
        if ($tid) { task_mine($tid, $tch, $owned); $pdo->prepare('UPDATE tasks SET subject_id=?,kind=?,title=?,details=?,mode=?,due_at=?,max_mb=?,is_open=COALESCE(?,is_open) WHERE id=?')->execute([$sid, $kind, $title, $details, $mode, $due, $mb, $io, $tid]); }
        else $pdo->prepare('INSERT INTO tasks(subject_id,kind,title,details,mode,due_at,max_mb,is_open) VALUES(?,?,?,?,?,?,?,?)')->execute([$sid, $kind, $title, $details, $mode, $due, $mb, $io ?? 1]);
        out(['ok' => true]);
    case 'task_toggle':
        $t = task_mine((int)($in['id'] ?? 0), $tch, $owned);
        $pdo->prepare('UPDATE tasks SET is_open=1-is_open WHERE id=?')->execute([(int)$t['id']]);
        out(['ok' => true]);
    case 'task_delete':
        $t = task_mine((int)($in['id'] ?? 0), $tch, $owned);
        task_rm_files('task_id=?', [(int)$t['id']]);
        $pdo->prepare('DELETE FROM task_subs WHERE task_id=?')->execute([(int)$t['id']]);
        $pdo->prepare('DELETE FROM tasks WHERE id=?')->execute([(int)$t['id']]);
        out(['ok' => true]);
    case 'subs_list':
        $t = task_mine((int)($_GET['task_id'] ?? 0), $tch, $owned);
        $q = $pdo->prepare('SELECT id,ref,sub_type,name,student_id,team_name,members,email,orig_name,size,is_late,created_at FROM task_subs WHERE task_id=? ORDER BY id DESC'); $q->execute([(int)$t['id']]);
        out(['ok' => true, 'task' => ['id' => (int)$t['id'], 'title' => $t['title']], 'subs' => $q->fetchAll()]);
    case 'sub_delete':
        $q = $pdo->prepare('SELECT task_id FROM task_subs WHERE id=?'); $q->execute([(int)($in['id'] ?? 0)]); $tid = (int)$q->fetchColumn();
        if (!$tid) fail('Not found.', 404);
        task_mine($tid, $tch, $owned);
        task_rm_files('id=?', [(int)$in['id']]);
        $pdo->prepare('DELETE FROM task_subs WHERE id=?')->execute([(int)$in['id']]);
        out(['ok' => true]);
}
