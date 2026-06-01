<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/includes/v_json.php';
require_once dirname(__DIR__) . '/includes/v_init.php';

if (defined('V_API_DISABLED') && V_API_DISABLED) {
    v_json_out(['ok' => false, 'error' => 'db_not_configured'], 503);
}

// Poll je GET (cache-busting přes ?since=N), aby ho šlo cachovat na úrovni klienta.
$gameId = isset($_GET['gameId']) ? (int) $_GET['gameId'] : 0;
$since = isset($_GET['since']) ? (int) $_GET['since'] : 0;
$token = isset($_GET['playerToken']) ? (string) $_GET['playerToken'] : '';

if ($gameId <= 0) {
    v_json_out(['ok' => false, 'error' => 'bad_input'], 400);
}

try {
    $result = v_poll(v_pdo(), $gameId, $since, $token !== '' ? $token : null);
    v_json_out($result);
} catch (RuntimeException $e) {
    v_json_out(['ok' => false, 'error' => $e->getMessage()], 404);
} catch (Throwable $e) {
    error_log('vombat poll: ' . $e->getMessage());
    v_json_out(['ok' => false, 'error' => 'server'], 500);
}
