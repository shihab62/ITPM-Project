<?php
declare(strict_types=1);

/* Action: export (CSV / Excel) */
    if ($a === 'export') {
        need_csrf((string)($_GET['t'] ?? ''));
        $fmt = ($_GET['fmt'] ?? 'csv') === 'xls' ? 'xls' : 'csv';
        @set_time_limit(120);
        $regs = load_regs($_GET, 5000);
        $subjF = []; $subjM = []; $cols = [];
        foreach ($regs as $r) {
            if (isset($subjF[$r['subject_id']])) continue;
            $q = $pdo->prepare('SELECT * FROM subjects WHERE id=?'); $q->execute([$r['subject_id']]);
            $sr = $q->fetch(); $subjM[$r['subject_id']] = $sr ?: []; $subjF[$r['subject_id']] = $sr ? fields_of($sr) : [];
            foreach ($subjF[$r['subject_id']] as $f) if ($f['type'] !== 'photo' && !in_array($f['label'], $cols, true)) $cols[] = $f['label'];
        }
        $head = array_merge(['Reference', 'Type', 'Team name', 'Presentation topic', 'Subject', 'Semester', 'Department', 'Program', 'Slot', 'Status', 'Presentation file', 'Role'], $cols, ['Registered at']);
        $rows = [];
        foreach ($regs as $r) foreach ($r['members'] as $m) {
            $slot = trim(($r['slot_date'] ?? '') . ' ' . ($r['slot_label'] ?? ''));
            $sm = $subjM[$r['subject_id']] ?? [];
            $line = [$r['ref_code'], $r['reg_type'], (string)$r['team_name'], (string)($r['topic'] ?? ''), $r['subject_name'], trim((string)($sm['semester_term'] ?? '') . ' ' . (string)($sm['semester_year'] ?? '')), (string)($sm['department'] ?? ''), prog_label((string)($sm['program'] ?? '')),
                $slot, $r['status'], $r['pres'] ? (string)$r['pres']['name'] : '', $m['is_leader'] ? 'Leader' : 'Member'];
            foreach ($cols as $c) {
                $val = '';
                foreach ($subjF[$r['subject_id']] as $f) if ($f['label'] === $c && $f['type'] !== 'photo') { $val = (string)($m['vals'][$f['key']] ?? ''); break; }
                $line[] = $val;
            }
            $line[] = (string)$r['created_at'];
            $rows[] = $line;
        }
        $fn = 'registrations-' . date('Ymd-His');
        if ($fmt === 'csv') {
            header('Content-Type: text/csv; charset=utf-8');
            header("Content-Disposition: attachment; filename=\"$fn.csv\"");
            $o = fopen('php://output', 'w'); fwrite($o, "\xEF\xBB\xBF");
            fputcsv($o, $head);
            foreach ($rows as $r) fputcsv($o, array_map('csv_safe', array_map('strval', $r)));
            fclose($o); exit;
        }
        header('Content-Type: application/vnd.ms-excel; charset=utf-8');
        header("Content-Disposition: attachment; filename=\"$fn.xls\"");
        echo "\xEF\xBB\xBF<html><head><meta charset=\"utf-8\"></head><body><table border=\"1\"><tr>";
        foreach ($head as $h) echo '<th>' . htmlspecialchars($h, ENT_QUOTES, 'UTF-8') . '</th>';
        echo '</tr>';
        foreach ($rows as $r) { echo '<tr>'; foreach ($r as $c) echo '<td style="mso-number-format:\'\\@\'">' . htmlspecialchars((string)$c, ENT_QUOTES, 'UTF-8') . '</td>'; echo '</tr>'; }
        echo '</table></body></html>'; exit;
    }
