<?php
declare(strict_types=1);

/* CSRF check, request body and teacher-ownership guards for the admin actions below. */
    if ($post) need_csrf();
    $in = $post ? body() : [];
    if ($tch) {
        if (in_array($a, ['reg_status', 'reg_update', 'reg_delete'], true)) {
            $oc = $pdo->prepare('SELECT subject_id FROM registrations WHERE id=?'); $oc->execute([(int)($in['id'] ?? 0)]);
            if (!in_array((int)$oc->fetchColumn(), $owned, true)) fail('Registration not found.', 404);
        }
        if (in_array($a, ['subject_extend', 'subject_toggle', 'subject_delete', 'subject_public_set'], true) && !in_array((int)($in['id'] ?? 0), $owned, true)) fail('Subject not found.', 404);
        if ($a === 'subject_save' && (int)($in['id'] ?? 0) && !in_array((int)$in['id'], $owned, true)) fail('Subject not found.', 404);
        if (in_array($a, ['subject_toggle', 'subject_extend'], true) && ($tch['acct_type'] ?? '') === 'cr') {
            $pq = $pdo->prepare('SELECT cr_pending FROM subjects WHERE id=?'); $pq->execute([(int)($in['id'] ?? 0)]);
            if ((int)$pq->fetchColumn()) fail('This form is waiting for admin approval.', 403);
        }
    }
