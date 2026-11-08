<?php
declare(strict_types=1);

/* Actions: presentation file upload / link / download */
    /* ================= presentation files ================= */
    /* signed, short-lived link -> the file itself (this is also what Office Online fetches) */
    if ($a === 'pres_file') {
        $id = (int)($_GET['id'] ?? 0); $exp = (int)($_GET['exp'] ?? 0); $dl = !empty($_GET['dl']) ? 1 : 0; $sig = (string)($_GET['sig'] ?? '');
        if ($exp < time() || !hash_equals(pres_sig($id, $exp, $dl), $sig)) { http_response_code(403); header('Content-Type: text/plain; charset=utf-8'); exit('This link has expired. Close the viewer and open the presentation again.'); }
        $q = $pdo->prepare('SELECT * FROM presentations WHERE registration_id=?'); $q->execute([$id]); $p = $q->fetch();
        $path = $p ? pres_dir() . '/' . $p['stored'] : '';
        if (!$p || !preg_match('/^[a-f0-9]{32}\.[a-z0-9]{1,8}$/', (string)$p['stored']) || !is_file($path)) { http_response_code(404); header('Content-Type: text/plain; charset=utf-8'); exit('File not found.'); }
        $viewable = in_array((string)$p['kind'], PRES_VIEWABLE, true);
        $mt = ['pdf' => 'application/pdf', 'ppt' => 'application/vnd.ms-powerpoint', 'pptx' => 'application/vnd.openxmlformats-officedocument.presentationml.presentation'][$p['kind']] ?? 'application/octet-stream';
        if (!$viewable) $dl = 1;   /* anything the in-browser presenter cannot show is always a download, never rendered by the browser */
        $ascii = preg_replace('/[^A-Za-z0-9._-]+/', '_', (string)$p['orig_name']) ?: 'presentation.' . $p['kind'];
        session_write_close();
        header('Content-Type: ' . $mt);
        header('Content-Length: ' . filesize($path));
        header('Content-Disposition: ' . ($dl ? 'attachment' : 'inline') . '; filename="' . $ascii . '"; filename*=UTF-8\'\'' . rawurlencode((string)$p['orig_name']));
        header('Cache-Control: private, no-cache');
        readfile($path); exit;
    }
    /* who may open / download a team's presentation: admin, its teacher, the team leader, or (if published) anyone */
    if ($a === 'pres_link') {
        $rid = (int)($_GET['rid'] ?? 0);
        $rq = $pdo->prepare('SELECT * FROM registrations WHERE id=?'); $rq->execute([$rid]); $reg = $rq->fetch();
        if (!$reg) fail('Registration not found.', 404);
        $sq = $pdo->prepare('SELECT * FROM subjects WHERE id=?'); $sq->execute([$reg['subject_id']]); $subj = $sq->fetch();
        $actor = pres_actor($reg);
        if ($actor === '' && !($subj && pres_public_ok($reg, $subj))) fail('This presentation is not available.', 403);
        $info = pres_infos([$rid])[$rid] ?? null;
        if (!$info) fail('No presentation has been uploaded yet.', 404);
        if ($actor === '' && !in_array($info['kind'], PRES_VIEWABLE, true)) fail('This file type cannot be previewed.', 403);
        $dl = ($actor !== '' && !empty($_GET['dl'])) ? 1 : 0; $exp = time() + 3600;
        out(['ok' => true, 'url' => '?api=pres_file&id=' . $rid . '&exp=' . $exp . '&dl=' . $dl . '&sig=' . pres_sig($rid, $exp, $dl),
             'name' => $info['name'], 'kind' => $info['kind'], 'size' => $info['size'], 'can_download' => $actor !== '']);
    }
    if ($a === 'pres_upload' || $a === 'pres_delete') {
        if (!$post) fail('POST required.', 405);
        need_csrf();
        $in0 = $a === 'pres_delete' ? body() : [];
        $rid = (int)($a === 'pres_delete' ? ($in0['rid'] ?? 0) : ($_POST['rid'] ?? 0));
        $rq = $pdo->prepare('SELECT * FROM registrations WHERE id=?'); $rq->execute([$rid]); $reg = $rq->fetch();
        if (!$reg) fail('Registration not found.', 404);
        $actor = pres_actor($reg);
        if ($actor === '') fail('Please sign in again.', 401);
        session_write_close();   /* big file uploads must not block the user's other requests */
        $sq = $pdo->prepare('SELECT * FROM subjects WHERE id=?'); $sq->execute([$reg['subject_id']]); $subj = (array)$sq->fetch();
        if ($actor === 'leader') {
            if ($reg['status'] === 'rejected') fail('This registration was rejected, so a presentation cannot be changed.', 403);
            [$pok, $pmsg] = pres_window($subj);
            if (!$pok) fail($pmsg, 403);
        }
        $old = $pdo->prepare('SELECT stored FROM presentations WHERE registration_id=?'); $old->execute([$rid]); $oldStored = (string)$old->fetchColumn();
        if ($a === 'pres_delete') {
            $pdo->prepare('DELETE FROM presentations WHERE registration_id=?')->execute([$rid]);
            if ($oldStored !== '') pres_rm([$oldStored]);
            out(['ok' => true, 'pres' => null]);
        }
        if (!isset($_FILES['pres']) || !is_array($_FILES['pres']) || ($_FILES['pres']['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) fail('Choose a file first.');
        $f = $_FILES['pres'];
        $maxB = pres_max_mb() * 1048576;
        if ($f['error'] === UPLOAD_ERR_INI_SIZE || $f['error'] === UPLOAD_ERR_FORM_SIZE) fail('The file is larger than the server allows (' . php_upload_limit() . '). Use a smaller file or ask the admin to raise the PHP limit.');
        if ($f['error'] !== UPLOAD_ERR_OK) fail('Upload failed. Please try again.');
        if ($f['size'] <= 0 || $f['size'] > $maxB) fail('The file must be ' . pres_max_mb() . ' MB or smaller.');
        if (!is_uploaded_file($f['tmp_name'])) fail('Invalid upload.');
        $orig = cl(basename(str_replace('\\', '/', (string)$f['name'])), 120);
        [$kind, $kerr] = pres_kind($f['tmp_name'], $orig);
        if (!$kind) fail($kerr);
        $stored = bin2hex(random_bytes(16)) . '.' . $kind;
        if (!move_uploaded_file($f['tmp_name'], pres_dir() . '/' . $stored)) fail('Could not store the file.', 500);
        @chmod(pres_dir() . '/' . $stored, 0644);
        try {
            $pdo->prepare('INSERT INTO presentations(registration_id,orig_name,stored,kind,size) VALUES(?,?,?,?,?)
                ON DUPLICATE KEY UPDATE orig_name=VALUES(orig_name),stored=VALUES(stored),kind=VALUES(kind),size=VALUES(size),updated_at=CURRENT_TIMESTAMP')
                ->execute([$rid, $orig, $stored, $kind, (int)$f['size']]);
        } catch (Throwable $e) { @unlink(pres_dir() . '/' . $stored); fail('Could not save the presentation.', 500); }
        if ($oldStored !== '' && $oldStored !== $stored) pres_rm([$oldStored]);
        out(['ok' => true, 'pres' => pres_infos([$rid])[$rid] ?? null]);
    }
