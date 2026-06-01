<?php

declare(strict_types=1);

/**
 * Herní vrstva Vombat multiplayeru.
 * Server NEVALIDUJE pravidla — jen ukládá akce s monotónním seq a hlídá oprávnění.
 * Pravidla hájí klient (engine.ts → applyAction).
 *
 * Tabulky: VOMBAT_TABLE_PREFIX + games | players | moves (výchozí vombat_).
 */

function v_tbl(string $suffix): string
{
    $p = defined('VOMBAT_TABLE_PREFIX') ? VOMBAT_TABLE_PREFIX : 'vombat_';
    return $p . $suffix;
}

/** Znaky pro room_code — bez ambiguózních (0/O, 1/I/L). 32 symbolů. */
const V_ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const V_ROOM_CODE_LEN = 6;

function v_generate_room_code(): string
{
    $alpha = V_ROOM_CODE_ALPHABET;
    $max = strlen($alpha) - 1;
    $out = '';
    for ($i = 0; $i < V_ROOM_CODE_LEN; $i++) {
        $out .= $alpha[random_int(0, $max)];
    }
    return $out;
}

function v_generate_token(): string
{
    return bin2hex(random_bytes(16));
}

/**
 * Validace přezdívky. Vrátí trim+normalizovanou nebo prázdný řetězec.
 * Délka 1-32, povolené UTF-8 (písmena, čísla, mezery, pomlčky, podtržítka).
 */
function v_clean_name(string $name): string
{
    $name = trim($name);
    if ($name === '') {
        return '';
    }
    // strip control chars
    $name = preg_replace('/[\x00-\x1F\x7F]/u', '', $name) ?? '';
    if (mb_strlen($name) > 32) {
        $name = mb_substr($name, 0, 32);
    }
    return $name;
}

/**
 * Vytvoří novou hru v lobby s hostem ve slotu 0.
 *
 * @return array{gameId:int,roomCode:string,playerToken:string,slot:int,seed:int}
 */
function v_create_game(PDO $pdo, string $hostName, int $numPlayers): array
{
    if ($numPlayers < 2 || $numPlayers > 4) {
        throw new InvalidArgumentException('num_players must be 2-4');
    }
    $hostName = v_clean_name($hostName);
    if ($hostName === '') {
        $hostName = 'Hráč 1';
    }

    $tg = v_tbl('games');
    $tp = v_tbl('players');

    // Pokus o vložení s unikátním room_code, max ~5 pokusů (kolize prakticky vyloučena).
    $token = v_generate_token();
    $seed = random_int(1, 2147483646); // 31bit pozitivní int — vejde do Mulberry32 seedu

    $pdo->beginTransaction();
    try {
        $code = '';
        for ($attempt = 0; $attempt < 5; $attempt++) {
            $code = v_generate_room_code();
            $st = $pdo->prepare("INSERT IGNORE INTO {$tg} (room_code, seed, num_players, host_slot, status) VALUES (?,?,?,?,?)");
            $st->execute([$code, $seed, $numPlayers, 0, 'lobby']);
            if ($st->rowCount() > 0) {
                break;
            }
        }
        $gameId = (int) $pdo->lastInsertId();
        if ($gameId <= 0) {
            throw new RuntimeException('room_code_collision');
        }

        $ip = $pdo->prepare("INSERT INTO {$tp} (game_id, slot, player_token, name) VALUES (?,?,?,?)");
        $ip->execute([$gameId, 0, $token, $hostName]);

        $pdo->commit();
        return [
            'gameId' => $gameId,
            'roomCode' => $code,
            'playerToken' => $token,
            'slot' => 0,
            'seed' => $seed,
        ];
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
}

/**
 * Připojí hráče do existující hry (status='lobby') přes room_code.
 *
 * @return array{gameId:int,playerToken:string,slot:int,seed:int,numPlayers:int,players:array<int,array{slot:int,name:string}>}
 */
function v_join_game(PDO $pdo, string $roomCode, string $name): array
{
    $roomCode = strtoupper(trim($roomCode));
    if (!preg_match('/^[A-Z2-9]{6}$/', $roomCode)) {
        throw new InvalidArgumentException('bad_room_code');
    }
    $name = v_clean_name($name);
    if ($name === '') {
        $name = 'Hráč';
    }

    $tg = v_tbl('games');
    $tp = v_tbl('players');

    $pdo->beginTransaction();
    try {
        $g = $pdo->prepare("SELECT * FROM {$tg} WHERE room_code = ? FOR UPDATE");
        $g->execute([$roomCode]);
        $game = $g->fetch();
        if (!$game) {
            throw new RuntimeException('room_not_found');
        }
        if ($game['status'] !== 'lobby') {
            throw new RuntimeException('game_already_started');
        }

        $gameId = (int) $game['id'];
        $numPlayers = (int) $game['num_players'];

        $cnt = $pdo->prepare("SELECT COUNT(*) c FROM {$tp} WHERE game_id = ?");
        $cnt->execute([$gameId]);
        $taken = (int) $cnt->fetch()['c'];
        if ($taken >= $numPlayers) {
            throw new RuntimeException('lobby_full');
        }

        $slot = $taken; // sloty se obsazují po pořadí
        $token = v_generate_token();
        $ip = $pdo->prepare("INSERT INTO {$tp} (game_id, slot, player_token, name) VALUES (?,?,?,?)");
        $ip->execute([$gameId, $slot, $token, $name]);

        $pl = $pdo->prepare("SELECT slot, name FROM {$tp} WHERE game_id = ? ORDER BY slot ASC");
        $pl->execute([$gameId]);
        $players = array_map(static fn($r) => ['slot' => (int) $r['slot'], 'name' => (string) $r['name']], $pl->fetchAll());

        $pdo->commit();
        return [
            'gameId' => $gameId,
            'playerToken' => $token,
            'slot' => $slot,
            'seed' => (int) $game['seed'],
            'numPlayers' => $numPlayers,
            'players' => $players,
        ];
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
}

/**
 * Host přepne hru z lobby do active. Vyžaduje plný počet hráčů.
 */
function v_start_game(PDO $pdo, int $gameId, string $token): void
{
    $tg = v_tbl('games');
    $tp = v_tbl('players');

    $pdo->beginTransaction();
    try {
        $g = $pdo->prepare("SELECT * FROM {$tg} WHERE id = ? FOR UPDATE");
        $g->execute([$gameId]);
        $game = $g->fetch();
        if (!$game) {
            throw new RuntimeException('game_not_found');
        }
        if ($game['status'] !== 'lobby') {
            throw new RuntimeException('not_in_lobby');
        }

        // Token musí patřit hostovi (slot = host_slot).
        $p = $pdo->prepare("SELECT slot FROM {$tp} WHERE game_id = ? AND player_token = ?");
        $p->execute([$gameId, $token]);
        $me = $p->fetch();
        if (!$me || (int) $me['slot'] !== (int) $game['host_slot']) {
            throw new RuntimeException('not_host');
        }

        $cnt = $pdo->prepare("SELECT COUNT(*) c FROM {$tp} WHERE game_id = ?");
        $cnt->execute([$gameId]);
        if ((int) $cnt->fetch()['c'] !== (int) $game['num_players']) {
            throw new RuntimeException('lobby_not_full');
        }

        $u = $pdo->prepare("UPDATE {$tg} SET status = 'active' WHERE id = ? AND status = 'lobby'");
        $u->execute([$gameId]);

        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
}

/**
 * Append-only zápis tahu. Klient pošle expected_seq = current_seq+1; pokud nesedí,
 * vrátí se conflict (klient ať se sesynchronizuje pollingem).
 *
 * @param mixed $actionJson  Decoded action payload (libovolný JSON-kompatibilní typ).
 * @return array{seq:int,acceptedAt:string}
 */
function v_submit_move(PDO $pdo, string $token, int $expectedSeq, $actionJson): array
{
    $tg = v_tbl('games');
    $tp = v_tbl('players');
    $tm = v_tbl('moves');

    $jsonStr = json_encode($actionJson, JSON_UNESCAPED_UNICODE);
    if ($jsonStr === false) {
        throw new InvalidArgumentException('bad_action_json');
    }
    if (strlen($jsonStr) > 8192) {
        throw new InvalidArgumentException('action_too_large');
    }

    $pdo->beginTransaction();
    try {
        $p = $pdo->prepare("SELECT game_id, slot FROM {$tp} WHERE player_token = ?");
        $p->execute([$token]);
        $me = $p->fetch();
        if (!$me) {
            throw new RuntimeException('bad_token');
        }
        $gameId = (int) $me['game_id'];
        $slot = (int) $me['slot'];

        $g = $pdo->prepare("SELECT status, current_seq FROM {$tg} WHERE id = ? FOR UPDATE");
        $g->execute([$gameId]);
        $game = $g->fetch();
        if (!$game) {
            throw new RuntimeException('game_not_found');
        }
        if ($game['status'] !== 'active') {
            throw new RuntimeException('game_not_active');
        }

        $current = (int) $game['current_seq'];
        if ($expectedSeq !== $current + 1) {
            throw new RuntimeException('seq_conflict:' . $current);
        }
        $newSeq = $current + 1;

        $ins = $pdo->prepare("INSERT INTO {$tm} (game_id, seq, slot, action_json) VALUES (?,?,?,?)");
        $ins->execute([$gameId, $newSeq, $slot, $jsonStr]);

        $u = $pdo->prepare("UPDATE {$tg} SET current_seq = ? WHERE id = ?");
        $u->execute([$newSeq, $gameId]);

        $pdo->prepare("UPDATE {$tp} SET last_seen_at = NOW() WHERE player_token = ?")->execute([$token]);

        $pdo->commit();
        return ['seq' => $newSeq, 'acceptedAt' => date('c')];
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
}

/**
 * Vrátí stav hry + tahy s seq > $since.
 *
 * @return array{ok:bool,status:string,currentSeq:int,seed:int,numPlayers:int,players:array,moves:array,winnerSlot:?int,endedReason:?string}
 */
function v_poll(PDO $pdo, int $gameId, int $since, ?string $token = null): array
{
    $tg = v_tbl('games');
    $tp = v_tbl('players');
    $tm = v_tbl('moves');

    $g = $pdo->prepare("SELECT * FROM {$tg} WHERE id = ?");
    $g->execute([$gameId]);
    $game = $g->fetch();
    if (!$game) {
        throw new RuntimeException('game_not_found');
    }

    // Aktualizace last_seen_at, pokud klient poslal token (volitelné — poll může být i anonymní pro spectatora).
    if ($token !== null && $token !== '') {
        $pdo->prepare("UPDATE {$tp} SET last_seen_at = NOW() WHERE game_id = ? AND player_token = ?")->execute([$gameId, $token]);
    }

    $pl = $pdo->prepare("SELECT slot, name, color FROM {$tp} WHERE game_id = ? ORDER BY slot ASC");
    $pl->execute([$gameId]);
    $players = array_map(
        static fn($r) => ['slot' => (int) $r['slot'], 'name' => (string) $r['name'], 'color' => $r['color']],
        $pl->fetchAll()
    );

    $moves = [];
    if ((int) $game['current_seq'] > $since) {
        $m = $pdo->prepare("SELECT seq, slot, action_json, created_at FROM {$tm} WHERE game_id = ? AND seq > ? ORDER BY seq ASC");
        $m->execute([$gameId, $since]);
        foreach ($m->fetchAll() as $row) {
            $decoded = json_decode((string) $row['action_json'], true);
            $moves[] = [
                'seq' => (int) $row['seq'],
                'slot' => (int) $row['slot'],
                'action' => $decoded,
                'at' => (string) $row['created_at'],
            ];
        }
    }

    return [
        'ok' => true,
        'status' => (string) $game['status'],
        'currentSeq' => (int) $game['current_seq'],
        'seed' => (int) $game['seed'],
        'numPlayers' => (int) $game['num_players'],
        'players' => $players,
        'moves' => $moves,
        'winnerSlot' => isset($game['winner_slot']) && $game['winner_slot'] !== null ? (int) $game['winner_slot'] : null,
        'endedReason' => $game['ended_reason'] ?? null,
    ];
}

/**
 * Uzavře hru. Smí host kdykoliv, nebo libovolný hráč s reason='left'.
 */
function v_end_game(PDO $pdo, string $token, ?int $winnerSlot, string $reason): void
{
    $tg = v_tbl('games');
    $tp = v_tbl('players');

    $pdo->beginTransaction();
    try {
        $p = $pdo->prepare("SELECT game_id, slot FROM {$tp} WHERE player_token = ?");
        $p->execute([$token]);
        $me = $p->fetch();
        if (!$me) {
            throw new RuntimeException('bad_token');
        }
        $gameId = (int) $me['game_id'];

        $g = $pdo->prepare("SELECT host_slot, status FROM {$tg} WHERE id = ? FOR UPDATE");
        $g->execute([$gameId]);
        $game = $g->fetch();
        if (!$game) {
            throw new RuntimeException('game_not_found');
        }
        if ($game['status'] === 'ended') {
            $pdo->commit();
            return;
        }

        $isHost = (int) $me['slot'] === (int) $game['host_slot'];
        if (!$isHost && $reason !== 'left') {
            throw new RuntimeException('not_host');
        }

        $u = $pdo->prepare("UPDATE {$tg} SET status='ended', winner_slot = ?, ended_reason = ? WHERE id = ? AND status <> 'ended'");
        $u->execute([$winnerSlot, $reason, $gameId]);

        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
}
