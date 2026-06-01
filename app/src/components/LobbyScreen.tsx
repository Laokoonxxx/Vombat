// =============================================================================
// Lobby — čeká se na ostatní hráče. Host vidí start button až je lobby plné.
// =============================================================================
// Polling aktualizuje session.players a status. Když přejde status na 'active',
// App.tsx přepne na SetupScreen / GameScreen automaticky.

import { useState } from 'react';
import { apiStartGame } from '../net/api';
import type { OnlineSession } from '../net/session';

export interface LobbyScreenProps {
  session: OnlineSession;
  onLeave: () => void;
  onShowRules?: () => void;
}

export function LobbyScreen({ session, onLeave, onShowRules }: LobbyScreenProps) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const isHost = session.slot === 0;
  const filled = session.players.length;
  const ready = filled === session.numPlayers;

  async function handleStart() {
    setErr(null);
    setBusy(true);
    try {
      const resp = await apiStartGame(session.gameId, session.playerToken);
      if (!('ok' in resp) || !resp.ok) {
        setErr(translate(resp.error));
      }
      // Polling brzy uvidí status='active' a App přepne obrazovku.
    } catch {
      setErr('Chyba sítě.');
    } finally {
      setBusy(false);
    }
  }

  function copyCode() {
    try {
      navigator.clipboard.writeText(session.roomCode);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="setup-screen">
      <h1>🌐 Místnost</h1>

      <div
        style={{
          padding: 14,
          background: '#fff5e0',
          border: '1px solid #e8c997',
          borderRadius: 8,
          textAlign: 'center',
          marginBottom: 14,
        }}
      >
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>Kód místnosti</div>
        <div style={{ fontSize: 36, fontWeight: 700, letterSpacing: 6, fontFamily: 'monospace' }}>
          {session.roomCode}
        </div>
        <button onClick={copyCode} style={{ marginTop: 8 }}>
          📋 Kopírovat kód
        </button>
      </div>

      <h3>Hráči ({filled} / {session.numPlayers})</h3>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {Array.from({ length: session.numPlayers }, (_, i) => {
          const pl = session.players.find((p) => p.slot === i);
          return (
            <li
              key={i}
              style={{
                padding: '6px 10px',
                marginBottom: 4,
                background: pl ? '#fafafa' : '#f0f0f0',
                border: '1px solid var(--border)',
                borderRadius: 4,
                display: 'flex',
                justifyContent: 'space-between',
              }}
            >
              <span>
                Slot {i + 1}: {pl ? <strong>{pl.name}</strong> : <em style={{ color: 'var(--muted)' }}>čeká…</em>}
                {pl && i === 0 && <span style={{ color: 'var(--muted)' }}> (host)</span>}
                {pl && i === session.slot && <span style={{ color: 'var(--accent)' }}> ← ty</span>}
              </span>
            </li>
          );
        })}
      </ul>

      {err && <p style={{ color: '#c33' }}>{err}</p>}

      {isHost ? (
        <button
          className="primary"
          style={{ width: '100%', marginTop: 14 }}
          disabled={!ready || busy}
          onClick={handleStart}
        >
          {ready ? (busy ? 'Startuji…' : '🎲 Spustit hru') : `Čekej na hráče (${filled}/${session.numPlayers})`}
        </button>
      ) : (
        <p style={{ textAlign: 'center', color: 'var(--muted)', marginTop: 14 }}>
          {ready ? 'Čekáme až host spustí hru…' : `Čekáme na další hráče (${filled}/${session.numPlayers})…`}
        </p>
      )}

      <button style={{ width: '100%', marginTop: 14 }} onClick={onLeave}>
        ← Opustit místnost
      </button>
      {onShowRules && (
        <button style={{ width: '100%', marginTop: 8 }} onClick={onShowRules}>
          📖 Pravidla
        </button>
      )}
    </div>
  );
}

function translate(err: string): string {
  switch (err) {
    case 'lobby_not_full': return 'Místnost ještě není plná.';
    case 'not_host': return 'Hru může spustit jen host (slot 1).';
    case 'not_in_lobby': return 'Hra už není v lobby.';
    default: return `Chyba: ${err}`;
  }
}
