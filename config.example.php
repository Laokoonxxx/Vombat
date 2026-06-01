<?php

/**
 * Zkopíruj jako config.php a vyplň údaje (stejný styl jako v projektu slepemapy).
 * Pro multiplayer importuj také sql/schema_vombat.sql do téže databáze.
 */

define('SITE_URL', 'https://vombat.pisecnici.cz');

// --- Databáze (vzor jako v slepemapy / Web4U) ---
define('DB_HOST', 'sql23.web4u.cz');
define('DB_NAME', 'doplň_název_databáze');
define('DB_USER', 'doplň_uživatele');
define('DB_PASS', 'doplň_heslo');
define('DB_CHARSET', 'utf8mb4');

/** Prefix tabulek Vombatu ve sdílené DB (např. vombat_games). Musí sedět se sql/schema_vombat.sql. */
define('VOMBAT_TABLE_PREFIX', 'vombat_');

// Volitelné: pokud chceš DSN zadat ručně místo DB_HOST + DB_NAME, zakomentuj řádky výše
// a použij např.:
// define('V_DB_DSN', 'mysql:host=localhost;dbname=jmeno_db;charset=utf8mb4');
// define('V_DB_USER', 'uzivatel');
// define('V_DB_PASS', 'heslo');

return [];
