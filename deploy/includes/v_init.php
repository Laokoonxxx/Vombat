<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/bootstrap.php';

/**
 * Prefix tabulek Vombatu ve sdílené DB (např. vombat_games). Výchozí: vombat_
 */
if (!defined('VOMBAT_TABLE_PREFIX')) {
    define('VOMBAT_TABLE_PREFIX', 'vombat_');
}

/**
 * Stejný vzor jako v projektu slepemapy (DB_HOST, DB_NAME, DB_USER, DB_PASS, DB_CHARSET).
 * Pokud už máš ručně V_DB_DSN / V_DB_USER / V_DB_PASS, ty mají přednost.
 */
if (!defined('V_DB_DSN') && defined('DB_HOST') && defined('DB_NAME')) {
    $charset = defined('DB_CHARSET') ? DB_CHARSET : 'utf8mb4';
    define(
        'V_DB_DSN',
        sprintf('mysql:host=%s;dbname=%s;charset=%s', DB_HOST, DB_NAME, $charset)
    );
}
if (!defined('V_DB_USER') && defined('DB_USER')) {
    define('V_DB_USER', DB_USER);
}
if (!defined('V_DB_PASS')) {
    define('V_DB_PASS', defined('DB_PASS') ? DB_PASS : '');
}

if (!defined('V_DB_DSN') || !defined('V_DB_USER')) {
    define('V_API_DISABLED', true);
} else {
    define('V_API_DISABLED', false);
    require_once __DIR__ . '/v_db.php';
    require_once __DIR__ . '/v_game.php';
}
