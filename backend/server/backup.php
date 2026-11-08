<?php
declare(strict_types=1);

/* Full backup / restore (admin only). */
/* ---------- v21: full backup / restore (admin only) ----------
 * ZIP = manifest.json + db/<table>.jsonl (+ db/_tables.json, db/raw/app.sqlite when SQLite) + files/<every site file>.
 * The database part is a plain JSON dump of every table, so it restores the same way on SQLite and on MySQL. */
function bk_dir(): string {
    $d = DATA_DIR . '/backups';
    if (!is_dir($d)) @mkdir($d, 0755, true);
    if (!is_file($d . '/.htaccess')) @file_put_contents($d . '/.htaccess', "Require all denied\n<IfModule !mod_authz_core.c>\nOrder allow,deny\nDeny from all\n</IfModule>\n");
    if (!is_file($d . '/index.html')) @file_put_contents($d . '/index.html', '');
    return $d;
}
function bk_lock(): void {
    static $h = null;
    $h = @fopen(bk_dir() . '/.lock', 'c');
    if (!$h || !flock($h, LOCK_EX | LOCK_NB)) fail('Another backup or restore is running. Wait a minute and try again.', 409);
}
function bk_driver(PDO $pdo): string { return (string)$pdo->getAttribute(PDO::ATTR_DRIVER_NAME); }
function bk_q(PDO $pdo, string $n): string { return bk_driver($pdo) === 'mysql' ? '`' . $n . '`' : '"' . $n . '"'; }
function bk_tables(PDO $pdo): array {
    if (bk_driver($pdo) === 'mysql') $t = array_column($pdo->query("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'")->fetchAll(PDO::FETCH_NUM), 0);
    else $t = $pdo->query("SELECT name FROM sqlite_master WHERE type='table' AND substr(name,1,7) <> 'sqlite_' ORDER BY name")->fetchAll(PDO::FETCH_COLUMN);
    return array_values(array_filter($t, fn($n) => (bool)preg_match('/^[A-Za-z0-9_]{1,64}$/', (string)$n)));
}
function bk_cols(PDO $pdo, string $t): array {
    if (bk_driver($pdo) === 'mysql') return array_column($pdo->query('SHOW COLUMNS FROM `' . $t . '`')->fetchAll(), 'Field');
    return array_column($pdo->query('PRAGMA table_info("' . $t . '")')->fetchAll(), 'name');
}
function bk_enc($v) {
    if (is_resource($v)) $v = stream_get_contents($v);
    if (is_string($v) && !mb_check_encoding($v, 'UTF-8')) return ['__b64' => base64_encode($v)];
    return $v;
}
function bk_dec($v) { return (is_array($v) && isset($v['__b64'])) ? (string)base64_decode((string)$v['__b64']) : $v; }
/* paths (relative to the site folder) that are never part of a backup */
function bk_skip(string $rel): bool {
    $r = ltrim($rel, '/');
    if (preg_match('#^data/(backups|cache|tmp)(/|$)#', $r)) return true;
    if (preg_match('#^data/(app\.sqlite(-wal|-shm|-journal)?|error\.log)$#', $r)) return true;
    if (preg_match('#^(\.git|node_modules|cgi-bin|\.well-known)(/|$)#', $r)) return true;
    return basename($r) === 'error_log';
}
/* "data" = what the visitors/admin created (uploads + data folder); everything else is website code */
function bk_is_data(string $rel): bool { return (bool)preg_match('#^(uploads|data)(/|$)#', $rel); }
function bk_name_ok(string $n): bool { return (bool)preg_match('/^[A-Za-z0-9][A-Za-z0-9._\-]{0,120}\.zip$/', $n) && strpos($n, '..') === false; }
function bk_safe_entry(string $n): bool {
    return !($n === '' || strpos($n, "\0") !== false || strpos($n, '\\') !== false || $n[0] === '/' || preg_match('#(^|/)\.\.(/|$)#', $n) || preg_match('#^[A-Za-z]:#', $n));
}
function bk_files(): array {
    $root = APP_ROOT; $out = [];
    $it = new RecursiveIteratorIterator(new RecursiveCallbackFilterIterator(
        new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS),
        function ($f) use ($root) { return !bk_skip(str_replace('\\', '/', substr($f->getPathname(), strlen($root) + 1))); }
    ), RecursiveIteratorIterator::LEAVES_ONLY);
    foreach ($it as $f) {
        if ($f->isLink() || !$f->isFile()) continue;
        $out[] = [$f->getPathname(), str_replace('\\', '/', substr($f->getPathname(), strlen($root) + 1))];
    }
    return $out;
}
function bk_list(): array {
    $o = [];
    foreach (glob(bk_dir() . '/*.zip') ?: [] as $f) {
        if (!bk_name_ok(basename($f))) continue;
        $o[] = ['name' => basename($f), 'size' => (int)filesize($f), 'time' => date('Y-m-d H:i', (int)filemtime($f)), 'ts' => (int)filemtime($f)];
    }
    usort($o, fn($a, $b) => $b['ts'] <=> $a['ts']);
    return $o;
}
function bk_rmtree(string $d): void {
    foreach (glob($d . '/{,.}*', GLOB_BRACE) ?: [] as $f) { if (basename($f) === '.' || basename($f) === '..') continue; is_dir($f) ? bk_rmtree($f) : @unlink($f); }
    @rmdir($d);
}
function bk_create(PDO $pdo, string $prefix = 'backup'): array {
    if (!class_exists('ZipArchive')) throw new RuntimeException('The PHP zip extension (ZipArchive) is not enabled on this server. Ask your host to enable it.');
    @set_time_limit(0); @ini_set('memory_limit', '512M'); ignore_user_abort(true);
    $dir = bk_dir();
    $name = $prefix . '_' . date('Y-m-d_H-i-s') . '_' . bin2hex(random_bytes(2)) . '.zip';
    $path = $dir . '/' . $name;
    $tmpd = $dir . '/_tmp_' . bin2hex(random_bytes(4));
    if (!@mkdir($tmpd, 0755, true)) throw new RuntimeException('Cannot write to data/backups. Check folder permissions.');
    try {
        $tables = []; $rows = 0;
        $unbuf = bk_driver($pdo) === 'mysql' && defined('PDO::MYSQL_ATTR_USE_BUFFERED_QUERY');   /* big tables are streamed row by row, not loaded into memory */
        try {
            if ($unbuf) $pdo->setAttribute(PDO::MYSQL_ATTR_USE_BUFFERED_QUERY, false);
            foreach (bk_tables($pdo) as $t) {
                $fh = fopen($tmpd . '/' . $t . '.jsonl', 'wb'); $n = 0;
                $st = $pdo->query('SELECT * FROM ' . bk_q($pdo, $t));
                while (($row = $st->fetch(PDO::FETCH_ASSOC)) !== false) {
                    $o = []; foreach ($row as $k => $v) $o[$k] = bk_enc($v);
                    fwrite($fh, json_encode($o, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n"); $n++;
                }
                $st->closeCursor(); fclose($fh);
                $tables[$t] = ['rows' => $n, 'columns' => bk_cols($pdo, $t)]; $rows += $n;
            }
        } finally {
            if ($unbuf) $pdo->setAttribute(PDO::MYSQL_ATTR_USE_BUFFERED_QUERY, true);
        }
        $raw = '';
        if (bk_driver($pdo) === 'sqlite') {
            try { $raw = $tmpd . '/app.sqlite'; $pdo->exec("VACUUM INTO '" . str_replace("'", "''", $raw) . "'"); } catch (Throwable $e) { $raw = ''; }
        }
        $files = bk_files(); $skipped = 0;
        $zip = new ZipArchive();
        if ($zip->open($path . '.part', ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) throw new RuntimeException('Cannot create the zip file.');
        $added = 0;
        foreach ($files as [$abs, $rel]) { if (!is_readable($abs)) { $skipped++; continue; } $zip->addFile($abs, 'files/' . $rel); $added++; }
        foreach ($tables as $t => $_) $zip->addFile($tmpd . '/' . $t . '.jsonl', 'db/' . $t . '.jsonl');
        $zip->addFromString('db/_tables.json', json_encode($tables, JSON_UNESCAPED_UNICODE));
        if ($raw !== '' && is_file($raw)) $zip->addFile($raw, 'db/raw/app.sqlite');
        $zip->addFromString('manifest.json', json_encode(['app' => 'presentation-registration', 'format' => 1, 'created_at' => date('c'), 'site' => site_name(),
            'driver' => bk_driver($pdo), 'php' => PHP_VERSION, 'tables' => count($tables), 'rows' => $rows, 'files' => $added], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
        if (!$zip->close()) throw new RuntimeException('Could not finish the zip (disk full?).');
        if (!@rename($path . '.part', $path)) throw new RuntimeException('Could not save the backup file.');
    } catch (Throwable $e) {
        @unlink($path . '.part'); bk_rmtree($tmpd); throw $e;
    }
    bk_rmtree($tmpd);
    return ['name' => $name, 'size' => (int)filesize($path), 'tables' => count($tables), 'rows' => $rows, 'files' => $added, 'skipped' => $skipped];
}
/* $opt: db (database), data (uploads + data folder), code (website code), mirror (also delete data files that are not in the backup) */
function bk_restore(PDO $pdo, string $zipPath, array $opt): array {
    if (!class_exists('ZipArchive')) throw new RuntimeException('The PHP zip extension (ZipArchive) is not enabled on this server.');
    @set_time_limit(0); @ini_set('memory_limit', '512M'); ignore_user_abort(true);
    $zip = new ZipArchive();
    if ($zip->open($zipPath) !== true) throw new RuntimeException('This is not a valid zip file.');
    $mf = json_decode((string)$zip->getFromName('manifest.json'), true);
    if (!is_array($mf) || ($mf['app'] ?? '') !== 'presentation-registration') { $zip->close(); throw new RuntimeException('This zip is not a backup made by this system.'); }
    $meta = null;
    if (!empty($opt['db'])) {
        $meta = json_decode((string)$zip->getFromName('db/_tables.json'), true);
        if (!is_array($meta)) { $zip->close(); throw new RuntimeException('This backup has no database data.'); }
    }
    $safety = bk_create($pdo, 'before-restore');   /* always keep a way back */
    $res = ['tables' => 0, 'rows' => 0, 'files' => 0, 'deleted' => 0, 'skipped' => 0, 'safety' => $safety['name']];
    if ($meta !== null) {
        $my = bk_driver($pdo) === 'mysql';
        $pdo->exec($my ? 'SET FOREIGN_KEY_CHECKS=0' : 'PRAGMA foreign_keys=OFF');
        $pdo->beginTransaction();
        try {
            foreach (bk_tables($pdo) as $t) {
                $pdo->exec('DELETE FROM ' . bk_q($pdo, $t));
                if (!isset($meta[$t]['columns']) || !is_array($meta[$t]['columns'])) continue;
                $use = array_values(array_intersect($meta[$t]['columns'], bk_cols($pdo, $t)));
                $stream = $zip->getStream('db/' . $t . '.jsonl');
                if (!$use || !$stream) continue;
                $ins = $pdo->prepare('INSERT INTO ' . bk_q($pdo, $t) . ' (' . implode(',', array_map(fn($c) => bk_q($pdo, (string)$c), $use)) . ') VALUES (' . implode(',', array_fill(0, count($use), '?')) . ')');
                while (($line = fgets($stream)) !== false) {
                    $line = trim($line); if ($line === '') continue;
                    $row = json_decode($line, true); if (!is_array($row)) continue;
                    $vals = []; foreach ($use as $c) $vals[] = bk_dec($row[$c] ?? null);
                    $ins->execute($vals); $res['rows']++;
                }
                fclose($stream); $res['tables']++;
            }
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            $pdo->exec($my ? 'SET FOREIGN_KEY_CHECKS=1' : 'PRAGMA foreign_keys=ON');
            $zip->close();
            throw $e;
        }
        $pdo->exec($my ? 'SET FOREIGN_KEY_CHECKS=1' : 'PRAGMA foreign_keys=ON');
    }
    if (!empty($opt['data']) || !empty($opt['code'])) {
        $keep = [];
        for ($i = 0; $i < $zip->numFiles; $i++) {
            $en = (string)$zip->getNameIndex($i);
            if (substr($en, -1) === '/' || strncmp($en, 'files/', 6) !== 0) continue;
            if (!bk_safe_entry($en)) { $res['skipped']++; continue; }
            $rel = substr($en, 6);
            if ($rel === '' || bk_skip($rel)) continue;
            $isData = bk_is_data($rel);
            if ($isData && preg_match('/\.(php\d?|phtml|phar)$/i', $rel)) { $res['skipped']++; continue; }   /* never run code from the data folders */
            if ($isData ? empty($opt['data']) : empty($opt['code'])) continue;
            $keep[$rel] = 1;
            $dst = APP_ROOT . '/' . $rel;
            if (!is_dir(dirname($dst))) @mkdir(dirname($dst), 0755, true);
            $src = $zip->getStream($en); if (!$src) { $res['skipped']++; continue; }
            $tmp = $dst . '.rs' . bin2hex(random_bytes(3)) . '.tmp';
            $o = @fopen($tmp, 'wb'); if (!$o) { fclose($src); $res['skipped']++; continue; }
            stream_copy_to_stream($src, $o); fclose($o); fclose($src);
            if (!@rename($tmp, $dst)) { @copy($tmp, $dst); @unlink($tmp); }
            $res['files']++;
        }
        if (!empty($opt['data']) && !empty($opt['mirror']) && $keep) {
            foreach (['uploads', 'data'] as $top) {
                if (!is_dir(APP_ROOT . '/' . $top)) continue;
                $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator(APP_ROOT . '/' . $top, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::LEAVES_ONLY);
                foreach ($it as $f) {
                    if ($f->isLink() || !$f->isFile()) continue;
                    $rel = str_replace('\\', '/', substr($f->getPathname(), strlen(APP_ROOT) + 1));
                    $b = basename($rel);
                    if (isset($keep[$rel]) || bk_skip($rel) || $b[0] === '.' || $b === 'index.html') continue;
                    if (@unlink($f->getPathname())) $res['deleted']++;
                }
            }
        }
    }
    $zip->close();
    return $res;
}
