// =============================================================================
// Online home screen — výběr Vytvořit / Připojit
// =============================================================================
// Po úspěšném create/join získáš OnlineSession a předá ji App.tsx přes
// onSessionCreated. Server přidělí seed; klient ho použije pro createGame
// až přejde session do 'active'.

import { useState } from 'react';
import { apiCreateGame, apiJoinGame } from '../net/api';
import type { OnlineSession } from '../net/session';

export interface OnlineHomeScreenProps {
  onSessionCreated: (s: OnlineSession) => void;
  onBack: () => void;
  onShowRules?: () => void;
}

type Mode = 'menu' | 'create' | 'join';

export function OnlineHomeScreen({ onSessionCreated, onBack, onShowRules }: OnlineHomeScreenProps) {
  const [mode, setMode] = useState<Mode>('menu');
  const [name, setName] = useState('');
  const [numPlayers, setNumPlayers] = useState(2);
  const [roomCode, setRoomCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleCreate() {
    setErr(null);
    setBusy(true);
    try {
      const resp = await apiCreateGame(name.trim() || 'Hráč 1', numPlayers);
      if ('ok' in resp && resp.ok) {
        const session: OnlineSession = {
          gameId: resp.gameId,
          roomCode: resp.roomCode,
          playerToken: resp.playerToken,
          slot: resp.slot,
          seed: resp.seed,
          numPlayers,
          status: 'lobby',
          players: [{ slot: 0, name: name.trim() || 'Hráč 1', color: null }],
          currentSeq: 0,
          winnerSlot: null,
          endedReason: null,
        };
        onSessionCreated(session);
      } else {
        setErr(translateError(resp.error));
      }
    } catch {
      setErr('Chyba sítě. Zkontroluj připojení.');
    } finally {
      setBusy(false);
    }
  }

  async function handleJoin() {
    setErr(null);
    setBusy(true);
    try {
      const code = roomCode.trim().toUpperCase();
      const resp = await apiJoinGame(code, name.trim() || 'Hráč');
      if ('ok' in resp && resp.ok) {
        const session: OnlineSession = {
          gameId: resp.gameId,
          roomCode: code,
          playerToken: resp.playerToken,
          slot: resp.slot,
          seed: resp.seed,
          numPlayers: resp.numPlayers,
          status: 'lobby',
          players: resp.players.map((p) => ({ slot: p.slot, name: p.name, color: null })),
          currentSeq: 0,
          winnerSlot: null,
          endedReason: null,
        };
        onSessionCreated(session);
      } else {
        setErr(translateError(resp.error));
      }
    } catch {
      setErr('Chyba sítě. Zkontroluj připojení.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="setup-screen">
      <h1>🌐 Online hra</h1>

      {mode === 'menu' && (
        <>
          <p>Hraj proti kamarádovi přes internet. Žádná registrace.</p>
          <button className="primary" style={{ width: '100%', marginTop: 12 }} onClick={() => setMode('create')}>
            🆕 Vytvořit místnost
          </button>
          <button style={{ width: '100%', marginTop: 8 }} onClick={() => setMode('join')}>
            🔑 Připojit se kódem
          </button>
          <button style={{ width: '100%', marginTop: 20 }} onClick={onBack}>
            ← Zpět
          </button>
          {onShowRules && (
            <button style={{ width: '100%', marginTop: 8 }} onClick={onShowRules}>
              📖 Pravidla
            </button>
          )}
        </>
      )}

      {mode === 'create' && (
        <>
          <label>Tvoje jméno</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Hráč 1" autoFocus />
          <label>Počet hráčů</label>
          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
            {[2, 3, 4].map((n) => (
              <button
                key={n}
                onClick={() => setNumPlayers(n)}
                className={numPlayers === n ? 'primary' : ''}
                style={{ flex: 1 }}
              >
                {n}
              </button>
            ))}
          </div>
          <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
            (3-4 hráče zatím nepodporujeme v enginu — vznikne až ve Fázi 3.)
          </p>
          {err && <p style={{ color: '#c33', fontSize: 13 }}>{err}</p>}
          <button
            className="primary"
            style={{ width: '100%', marginTop: 14 }}
            onClick={handleCreate}
            disabled={busy}
          >
            {busy ? 'Vytvářím…' : 'Vytvořit místnost'}
          </button>
          <button style={{ width: '100%', marginTop: 8 }} onClick={() => setMode('menu')}>
            ← Zpět
          </button>
        </>
      )}

      {mode === 'join' && (
        <>
          <label>Tvoje jméno</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Hráč 2" />
          <label>Kód místnosti</label>
          <input
            type="text"
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
            placeholder="ABC234"
            maxLength={6}
            style={{ textTransform: 'uppercase', letterSpacing: 4, fontSize: 18 }}
            autoFocus
          />
          {err && <p style={{ color: '#c33', fontSize: 13 }}>{err}</p>}
          <button
            className="primary"
            style={{ width: '100%', marginTop: 14 }}
            onClick={handleJoin}
            disabled={busy || roomCode.length !== 6}
          >
            {busy ? 'Připojuji…' : 'Připojit se'}
          </button>
          <button style={{ width: '100%', marginTop: 8 }} onClick={() => setMode('menu')}>
            ← Zpět
          </button>
        </>
      )}
    </div>
  );
}

function translateError(err: string): string {
  switch (err) {
    case 'room_not_found': return 'Místnost s tímto kódem neexistuje.';
    case 'game_already_started': return 'Hra už začala — nelze se připojit.';
    case 'lobby_full': return 'Místnost je plná.';
    case 'bad_room_code': return 'Neplatný kód (musí být 6 znaků A-Z 2-9).';
    case 'db_not_configured': return 'Server nemá nakonfigurovanou databázi.';
    case 'num_players must be 2-4': return 'Počet hráčů musí být 2-4.';
    case 'network': return 'Chyba sítě.';
    default: return `Chyba: ${err}`;
  }
}
