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
$name = isset($input['name']) ? (string) $input['name'] : '';
$numPlayers = isset($input['numPlayers']) ? (int) $input['numPlayers'] : 2;

try {
    $result = v_create_game(v_pdo(), $name, $numPlayers);
    v_json_out(['ok' => true] + $result);
} catch (InvalidArgumentException $e) {
    v_json_out(['ok' => false, 'error' => $e->getMessage()], 400);
} catch (Throwable $e) {
    error_log('vombat create_game: ' . $e->getMessage());
    v_json_out(['ok' => false, 'error' => 'server'], 500);
}
