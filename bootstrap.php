<?php

/**
 * Načte config.php (volitelně). Konstanta SITE_URL se použije např. v index.php.
 * Bez config.php platí výchozí produkční URL.
 */

$configPath = __DIR__ . '/config.php';

if (is_file($configPath)) {
    require $configPath;
}

if (!defined('SITE_URL')) {
    define('SITE_URL', 'https://vombat.pisecnici.cz');
}
