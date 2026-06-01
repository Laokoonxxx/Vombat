-- Vombat multiplayer (sdílený hosting): spusť jednou v MariaDB / MySQL.
-- Tabulky mají prefix vombat_ (nastavitelný v config.php jako VOMBAT_TABLE_PREFIX).

SET NAMES utf8mb4;

-- =============================================================================
-- vombat_games — jedna hra = jeden řádek
-- Server NEUKLÁDÁ stav hry; ukládá jen seed + uspořádaný log akcí (vombat_moves).
-- Stav si klient přehraje deterministicky z (seed, moves[]) přes applyAction().
-- =============================================================================
CREATE TABLE IF NOT EXISTS vombat_games (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  room_code     CHAR(6)         NOT NULL,                -- 6-místný kód pro připojení (A-Z, 2-9 bez 0/O/1/I/L)
  seed          INT UNSIGNED    NOT NULL,                -- pro deterministickou generaci mapy + náhodu
  num_players   TINYINT UNSIGNED NOT NULL,               -- 2-4 (zafixováno při start_game)
  host_slot     TINYINT UNSIGNED NOT NULL DEFAULT 0,     -- kdo může start_game / end_game
  status        ENUM('lobby','active','ended') NOT NULL DEFAULT 'lobby',
  winner_slot   TINYINT UNSIGNED NULL,                   -- vyplněno při ended (NULL = remíza / abandoned)
  ended_reason  VARCHAR(32)     NULL,                    -- 'devil_killed','abandoned','left',...
  current_seq   INT UNSIGNED    NOT NULL DEFAULT 0,      -- poslední seq v vombat_moves (= length); duplikováno pro rychlý poll
  created_at    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_room_code (room_code),
  KEY idx_status (status),
  KEY idx_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- vombat_players — kdo sedí v dané hře (slot 0..num_players-1)
-- player_token je klientův secret; nikdy se nevrací cizímu hráči.
-- =============================================================================
CREATE TABLE IF NOT EXISTS vombat_players (
  game_id       INT UNSIGNED    NOT NULL,
  slot          TINYINT UNSIGNED NOT NULL,
  player_token  CHAR(32)        NOT NULL,                -- bin2hex(random_bytes(16))
  name          VARCHAR(32)     NOT NULL,
  color         CHAR(7)         NULL,                    -- hex barva (#rrggbb); přiděleno hostem
  joined_at     TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at  TIMESTAMP       NULL,                    -- aktualizováno při každém polli / submitu
  PRIMARY KEY (game_id, slot),
  UNIQUE KEY uq_token (player_token),
  KEY idx_game (game_id),
  CONSTRAINT fk_vombat_player_game FOREIGN KEY (game_id) REFERENCES vombat_games(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- vombat_moves — append-only log akcí (Action JSON)
-- Klient si stav přehraje z (game.seed, moves ORDER BY seq).
-- =============================================================================
CREATE TABLE IF NOT EXISTS vombat_moves (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  game_id       INT UNSIGNED    NOT NULL,
  seq           INT UNSIGNED    NOT NULL,                -- 1..N, monotónně rostoucí v rámci hry
  slot          TINYINT UNSIGNED NOT NULL,               -- který hráč akci provedl
  action_json   TEXT            NOT NULL,                -- payload akce (Action union z client TS)
  created_at    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_game_seq (game_id, seq),
  KEY idx_game_seq (game_id, seq),
  CONSTRAINT fk_vombat_move_game FOREIGN KEY (game_id) REFERENCES vombat_games(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
