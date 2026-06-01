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
$gameId = isset($input['gameId']) ? (int) $input['gameId'] : 0;
$token = isset($input['playerToken']) ? (string) $input['playerToken'] : '';

if ($gameId <= 0 || $token === '') {
    v_json_out(['ok' => false, 'error' => 'bad_input'], 400);
}

try {
    v_start_game(v_pdo(), $gameId, $token);
    v_json_out(['ok' => true]);
} catch (RuntimeException $e) {
    $msg = $e->getMessage();
    $code = in_array($msg, ['game_not_found', 'not_in_lobby', 'not_host', 'lobby_not_full'], true) ? 409 : 400;
    v_json_out(['ok' => false, 'error' => $msg], $code);
} catch (Throwable $e) {
    error_log('vombat start_game: ' . $e->getMessage());
    v_json_out(['ok' => false, 'error' => 'server'], 500);
}
