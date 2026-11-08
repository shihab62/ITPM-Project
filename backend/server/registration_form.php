<?php
declare(strict_types=1);

/* Dynamic registration form fields, validation and member saving. */
const FIELD_TYPES = ['text', 'number', 'tel', 'email', 'date', 'select', 'photo'];
/* Starter form used for new subjects (and for older subjects that were created before dynamic fields). The admin can edit or delete every one of these. */
function default_fields(): array {
    return [
        ['key' => 'student_id', 'label' => 'Student ID', 'type' => 'text', 'req' => 'yes', 'role' => 'id', 'opts' => [], 'def' => '', 'max' => 40],
        ['key' => 'full_name', 'label' => 'Full name', 'type' => 'text', 'req' => 'yes', 'role' => 'name', 'opts' => [], 'def' => '', 'max' => 80],
        ['key' => 'gender', 'label' => 'Gender', 'type' => 'select', 'req' => 'yes', 'role' => '', 'opts' => ['Male', 'Female'], 'def' => '', 'max' => 200],
        ['key' => 'department', 'label' => 'Department', 'type' => 'text', 'req' => 'yes', 'role' => '', 'opts' => [], 'def' => FIXED_DEPT, 'max' => 40],
        ['key' => 'batch', 'label' => 'Batch', 'type' => 'text', 'req' => 'yes', 'role' => '', 'opts' => [], 'def' => FIXED_BATCH, 'max' => 4],
        ['key' => 'program', 'label' => 'Program', 'type' => 'select', 'req' => 'yes', 'role' => '', 'opts' => PROG_DEFAULT, 'def' => '', 'max' => 200],
        ['key' => 'phone', 'label' => 'Phone number', 'type' => 'tel', 'req' => 'leader', 'role' => '', 'opts' => [], 'def' => '', 'max' => 24],
        ['key' => 'email', 'label' => 'Email', 'type' => 'email', 'req' => 'no', 'role' => '', 'opts' => [], 'def' => '', 'max' => 100],
        ['key' => 'photo', 'label' => 'Photo', 'type' => 'photo', 'req' => 'no', 'role' => '', 'opts' => [], 'def' => '', 'max' => 200, 'mb' => 2],
    ];
}
/* The (single) photo-upload field of a subject's form, if the admin has switched it on. */
function photo_field(array $fields): ?array { foreach ($fields as $f) if ($f['type'] === 'photo') return $f; return null; }
function photo_max(array $fields): int { $p = photo_field($fields); return (($p['mb'] ?? 2) > 0 ? (int)($p['mb'] ?? 2) : 2) * 1048576; }
function photo_needed(?array $pf, bool $leader): bool { return $pf && ($pf['req'] === 'yes' || ($pf['req'] === 'leader' && $leader)); }
/* Every registration form MUST ask for the student's Full name. If a subject's field list has no 'Display name' field, add one (after the ID field). Also heals old subjects. */
function ensure_name_field(array $fs): array {
    $fs = array_values($fs);
    foreach ($fs as $f) if (is_array($f) && ($f['role'] ?? '') === 'name') return $fs;
    foreach ($fs as $i => $f) if (is_array($f) && ($f['key'] ?? '') === 'full_name' && ($f['type'] ?? '') !== 'photo') { $fs[$i]['role'] = 'name'; $fs[$i]['req'] = 'yes'; return $fs; }
    $nf = ['key' => 'full_name', 'label' => 'Full name', 'type' => 'text', 'req' => 'yes', 'role' => 'name', 'opts' => [], 'def' => '', 'max' => 80];
    $pos = 0;
    foreach ($fs as $i => $f) if (is_array($f) && ($f['role'] ?? '') === 'id') { $pos = $i + 1; break; }
    array_splice($fs, $pos, 0, [$nf]);
    return $fs;
}
function fields_of(array $s): array {
    $j = json_decode((string)($s['form_fields'] ?? ''), true);
    return ensure_name_field((is_array($j) && $j) ? $j : default_fields());
}
/* Validates + normalises the field list sent by the admin. Returns the clean array, or an error string. */
function sanitize_fields(array $in) {
    if (count($in) < 1) return 'Add at least one registration field.';
    if (count($in) > 25) return 'A form can have at most 25 fields.';
    $out = []; $keys = []; $roles = ['id' => 0, 'name' => 0]; $photos = 0; $hasData = false;
    foreach ($in as $f) {
        if (!is_array($f)) continue;
        $label = cl($f['label'] ?? '', 60);
        if ($label === '') return 'Every registration field needs a label.';
        $type = (string)($f['type'] ?? 'text');
        if (!in_array($type, FIELD_TYPES, true)) return "Field “$label”: invalid field type.";
        $key = strtolower(cl($f['key'] ?? '', 30));
        if (!preg_match('/^[a-z0-9_]{1,30}$/', $key) || isset($keys[$key])) $key = 'f' . bin2hex(random_bytes(4));
        $keys[$key] = 1;
        $req = (string)($f['req'] ?? 'no');
        if (!in_array($req, ['yes', 'leader', 'no'], true)) $req = 'no';
        $role = (string)($f['role'] ?? '');
        if (!in_array($role, ['', 'id', 'name'], true)) $role = '';
        $opts = []; $def = cl($f['def'] ?? '', 60);
        if ($type === 'photo') {
            if (++$photos > 1) return 'Only one photo field is allowed per form.';
            $role = ''; $def = '';
        } else {
            $hasData = true;
        }
        if ($role !== '' && ++$roles[$role] > 1) return $role === 'id' ? 'Only one field can be the Unique ID.' : 'Only one field can be the Display name.';
        if ($key === 'batch' && $type !== 'photo') { $type = 'text'; $def = substr(preg_replace('/\D/', '', $def) ?? '', 0, 4); }   /* batch = digits only */
        if ($type === 'select') {
            $raw = $f['opts'] ?? [];
            if (is_string($raw)) $raw = explode(',', $raw);
            foreach ((array)$raw as $o) { $o = cl((string)$o, 60); if ($o !== '' && !in_array($o, $opts, true)) $opts[] = $o; }
            if (count($opts) < 2) return "Field “$label”: a dropdown needs at least two options.";
            if (count($opts) > 40) return "Field “$label”: a dropdown can have at most 40 options.";
            if ($def !== '' && !in_array($def, $opts, true)) $def = '';
        }
        $out[] = ['key' => $key, 'label' => $label, 'type' => $type, 'req' => $req, 'role' => $role, 'opts' => $opts, 'def' => $def,
                  'max' => $role === 'id' ? 40 : ($key === 'batch' ? 4 : ($type === 'tel' ? 24 : 200))]
                  + ($type === 'photo' ? ['mb' => max(1, min(5, (int)($f['mb'] ?? 2)))] : []);
    }
    if (!$hasData) return 'Add at least one information field (a photo field alone is not enough).';
    $out = ensure_name_field($out);
    return $out;
}
/* Guidelines shown to students: a list of sections [{title, items[]}] written by the admin for each subject. */
function guidelines_of(array $s): array {
    $j = json_decode((string)($s['guidelines'] ?? ''), true);
    return is_array($j) ? array_values($j) : [];
}
function sanitize_guidelines($in): array {
    if (!is_array($in)) return [];
    $out = [];
    foreach ($in as $b) {
        if (!is_array($b)) continue;
        $title = cl($b['title'] ?? '', 80);
        $raw = $b['items'] ?? [];
        if (is_string($raw)) $raw = preg_split('/\r\n|\r|\n/', $raw);
        $items = [];
        foreach ((array)$raw as $x) {
            $x = cl(is_string($x) ? $x : '', 500);
            if ($x !== '') $items[] = $x;
            if (count($items) >= 40) break;
        }
        if ($title === '' && !$items) continue;
        if ($title === '') $title = 'Guidelines';
        $out[] = ['title' => $title, 'items' => $items];
        if (count($out) >= 12) break;
    }
    return $out;
}
/* Validates one member's answers against the subject's fields. Returns [values, null] or [null, error]. $strict=false (admin/teacher edits) skips "required". */
function clean_member(array $fields, array $raw, bool $leader, string $who, bool $strict): array {
    $vals = [];
    foreach ($fields as $f) {
        if ($f['type'] === 'photo') continue;
        $k = $f['key']; $v = $raw[$k] ?? '';
        $v = (is_string($v) || is_int($v) || is_float($v)) ? cl((string)$v, (int)($f['max'] ?? 200)) : '';
        $lab = $f['label'];
        $req = $f['req'] === 'yes' || ($f['req'] === 'leader' && $leader);
        if ($v === '') {
            if ($req && $strict) return [null, "$who: $lab is required."];
            $vals[$k] = ''; continue;
        }
        if ($k === 'batch') {   /* batch: numbers only (admin edits may still carry an old '32 UG' value -> converted to 32) */
            if (!$strict) $v = batch_num($v);
            if (!batch_valid($v)) return [null, "$who: $lab must be a number (digits only, e.g. 32)."];
            $vals[$k] = $v; continue;
        }
        switch ($f['type']) {
            case 'tel':
                $v = preg_replace('/[\s\-]/', '', $v) ?? '';
                if (!preg_match('/^\+?\d{10,14}$/', $v)) return [null, "$who: $lab must be 10-14 digits."];
                break;
            case 'email':
                if (!filter_var($v, FILTER_VALIDATE_EMAIL)) return [null, "$who: $lab is not a valid email address."];
                break;
            case 'number':
                if (!is_numeric($v)) return [null, "$who: $lab must be a number."];
                break;
            case 'date':
                if (!valid_date($v)) return [null, "$who: $lab is not a valid date."];
                break;
            case 'select':
                if (!in_array($v, $f['opts'] ?? [], true)) return [null, "$who: choose a valid option for $lab."];
                break;
            default:
                if (($f['role'] ?? '') === 'id' && !preg_match('/^[\p{L}\p{N}\-_\/. ]{1,40}$/u', $v)) return [null, "$who: enter a valid $lab."];
                if (($f['role'] ?? '') === 'name' && mb_strlen($v) < 2) return [null, "$who: enter a valid $lab."];
        }
        $vals[$k] = $v;
    }
    return [$vals, null];
}
/* [unique id, display name] of a member, derived from the fields flagged "Unique ID" / "Display name". */
function ident(array $fields, array $vals): array {
    $id = ''; $name = '';
    foreach ($fields as $f) {
        if ($f['type'] === 'photo') continue;
        $v = (string)($vals[$f['key']] ?? '');
        if (($f['role'] ?? '') === 'id' && $id === '') $id = $v;
        if (($f['role'] ?? '') === 'name' && $name === '') $name = $v;
    }
    if ($name === '') foreach ($fields as $f) {
        if ($f['type'] !== 'photo' && ($f['role'] ?? '') !== 'id' && (string)($vals[$f['key']] ?? '') !== '') { $name = (string)$vals[$f['key']]; break; }
    }
    return [$id, $name !== '' ? $name : 'Member'];
}
/* Older columns kept filled for backwards compatibility (matched by the default field keys). */
function legacy_cols(array $v): array {
    return [(string)($v['department'] ?? ''), (string)($v['batch'] ?? ''), (string)($v['email'] ?? ''), (string)($v['phone'] ?? ''), strtolower((string)($v['gender'] ?? ''))];
}
/* Stored answers of a member; rows saved before dynamic fields existed are rebuilt from the old columns. */
function member_vals(array $m): array {
    $d = json_decode((string)($m['data'] ?? ''), true);
    if (is_array($d)) return $d;
    $o = ['student_id' => $m['student_id'] ?? '', 'full_name' => $m['full_name'] ?? '', 'gender' => ucfirst((string)($m['gender'] ?? '')),
          'department' => $m['department'] ?? '', 'batch' => $m['batch'] ?? '', 'phone' => $m['phone'] ?? '', 'email' => $m['email'] ?? ''];
    return array_filter($o, fn($x) => $x !== null && $x !== '');
}
function insert_member(PDO $pdo, int $rid, array $m, int $isLeader): int {
    $lc = legacy_cols($m['vals']);
    $pdo->prepare('INSERT INTO team_members(registration_id,student_id,full_name,department,batch,email,phone,is_leader,gender,data) VALUES(?,?,?,?,?,?,?,?,?,?)')
        ->execute([$rid, $m['uid'], $m['name'], $lc[0], $lc[1], $lc[2], $lc[3], $isLeader, $lc[4], json_encode($m['vals'], JSON_UNESCAPED_UNICODE)]);
    return (int)$pdo->lastInsertId();
}
