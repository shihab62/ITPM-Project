<?php
declare(strict_types=1);

/* Actions: backup_* */
switch ($a) {
    case 'backup_list':
        out(['ok' => true, 'backups' => bk_list(), 'limit' => php_upload_limit(), 'zip' => class_exists('ZipArchive'), 'driver' => bk_driver($pdo)]);

    case 'backup_create':
        if (!$post) fail('POST required.', 405);
        need_csrf();
        bk_lock();
        try { $r = bk_create($pdo); } catch (Throwable $e) { fail('Backup failed: ' . mb_substr($e->getMessage(), 0, 200), 500); }
        out(['ok' => true] + $r);

    case 'backup_download':
        need_csrf((string)($_GET['t'] ?? ''));
        $bn = (string)($_GET['name'] ?? '');
        $bf = bk_dir() . '/' . $bn;
        if (!bk_name_ok($bn) || !is_file($bf)) fail('Backup not found.', 404);
        while (ob_get_level()) @ob_end_clean();
        @ini_set('zlib.output_compression', '0');
        header('Content-Type: application/zip');
        header('Content-Disposition: attachment; filename="' . $bn . '"');
        header('Content-Length: ' . (string)filesize($bf));
        header('Cache-Control: no-store');
        readfile($bf);
        exit;

    case 'backup_delete':
        if (!$post) fail('POST required.', 405);
        need_csrf();
        $in = body(); $bn = (string)($in['name'] ?? '');
        if (!bk_name_ok($bn) || !is_file(bk_dir() . '/' . $bn)) fail('Backup not found.', 404);
        @unlink(bk_dir() . '/' . $bn);
        out(['ok' => true]);

    case 'backup_restore':
        if (!$post) fail('POST required.', 405);
        need_csrf();
        $opt = ['db' => !empty($_POST['db']), 'data' => !empty($_POST['data']), 'code' => !empty($_POST['code']), 'mirror' => !empty($_POST['mirror'])];
        if (!$opt['db'] && !$opt['data'] && !$opt['code']) fail('Tick at least one thing to restore.');
        $zp = '';
        if (isset($_FILES['zip']) && is_array($_FILES['zip']) && ($_FILES['zip']['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE) {
            $zf = $_FILES['zip'];
            if ($zf['error'] === UPLOAD_ERR_INI_SIZE || $zf['error'] === UPLOAD_ERR_FORM_SIZE) fail('The file is larger than the server allows (' . php_upload_limit() . '). Upload the zip into the data/backups folder with cPanel File Manager instead, then restore it from the list.');
            if ($zf['error'] !== UPLOAD_ERR_OK || !is_uploaded_file($zf['tmp_name'])) fail('Upload failed. Please try again.');
            $zp = (string)$zf['tmp_name'];
        } else {
            $bn = (string)($_POST['name'] ?? '');
            if (!bk_name_ok($bn) || !is_file(bk_dir() . '/' . $bn)) fail('Choose a backup file first.');
            $zp = bk_dir() . '/' . $bn;
        }
        bk_lock();
        try { $r = bk_restore($pdo, $zp, $opt); } catch (Throwable $e) { fail('Restore failed: ' . mb_substr($e->getMessage(), 0, 200), 500); }
        if ($opt['db']) { @session_start(); $_SESSION = []; @session_destroy(); }   /* admin accounts came from the backup -> sign in again */
        out(['ok' => true, 'relogin' => $opt['db']] + $r);
}
