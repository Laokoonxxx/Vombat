<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/includes/v_json.php';
require_once dirname(__DIR__) . '/includes/v_init.php';

if (defined('V_API_DISABLED') && V_API_DISABLED) {
    v_json_out(['ok' => false, 'error' => 'db_not_configured'], 503);
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    v_json_out(['ok' => false, 'error' => 'method'], 405);
}

$input = v_read_json_body();
$token = isset($input['playerToken']) ? (string) $input['playerToken'] : '';
$expectedSeq = isset($input['expectedSeq']) ? (int) $input['expectedSeq'] : 0;
$action = $input['action'] ?? null;

if ($token === '' || $expectedSeq < 1 || $action === null) {
    v_json_out(['ok' => false, 'error' => 'bad_input'], 400);
}

try {
    $result = v_submit_move(v_pdo(), $token, $expectedSeq, $action);
    v_json_out(['ok' => true] + $result);
} catch (InvalidArgumentException $e) {
    v_json_out(['ok' => false, 'error' => $e->getMessage()], 400);
} catch (RuntimeException $e) {
    $msg = $e->getMessage();
    // seq_conflict má v sobě aktuální serverový seq za dvojtečkou
    if (strpos($msg, 'seq_conflict:') === 0) {
        $currentSeq = (int) substr($msg, strlen('seq_conflict:'));
        v_json_out(['ok' => false, 'error' => 'seq_conflict', 'currentSeq' => $currentSeq], 409);
    }
    $http = in_array($msg, ['bad_token', 'game_not_found', 'game_not_active'], true) ? 409 : 400;
    v_json_out(['ok' => false, 'error' => $msg], $http);
} catch (Throwable $e) {
    error_log('vombat submit_move: ' . $e->getMessage());
    v_json_out(['ok' => false, 'error' => 'server'], 500);
}
