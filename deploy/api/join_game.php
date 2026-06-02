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
$code = isset($input['roomCode']) ? (string) $input['roomCode'] : '';
$name = isset($input['name']) ? (string) $input['name'] : '';

try {
    $result = v_join_game(v_pdo(), $code, $name);
    v_json_out(['ok' => true] + $result);
} catch (InvalidArgumentException $e) {
    v_json_out(['ok' => false, 'error' => $e->getMessage()], 400);
} catch (RuntimeException $e) {
    $msg = $e->getMessage();
    $code = in_array($msg, ['room_not_found', 'game_already_started', 'lobby_full'], true) ? 409 : 400;
    v_json_out(['ok' => false, 'error' => $msg], $code);
} catch (Throwable $e) {
    error_log('vombat join_game: ' . $e->getMessage());
    v_json_out(['ok' => false, 'error' => 'server'], 500);
}
