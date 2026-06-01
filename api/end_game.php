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
$winnerSlot = array_key_exists('winnerSlot', $input) && $input['winnerSlot'] !== null ? (int) $input['winnerSlot'] : null;
$reason = isset($input['reason']) ? (string) $input['reason'] : 'ended';

if ($token === '') {
    v_json_out(['ok' => false, 'error' => 'bad_input'], 400);
}

try {
    v_end_game(v_pdo(), $token, $winnerSlot, $reason);
    v_json_out(['ok' => true]);
} catch (RuntimeException $e) {
    $msg = $e->getMessage();
    $code = in_array($msg, ['bad_token', 'game_not_found', 'not_host'], true) ? 409 : 400;
    v_json_out(['ok' => false, 'error' => $msg], $code);
} catch (Throwable $e) {
    error_log('vombat end_game: ' . $e->getMessage());
    v_json_out(['ok' => false, 'error' => 'server'], 500);
}
