import { useEffect, useState } from 'react';
import type { GameState, DiceLevel, Hex } from '../game/types';
import { ALL_DICE_LEVELS, DICE_PRICES } from '../game/types';
import { HexBoard } from './HexBoard';
import { Legend } from './Legend';
import type { Action } from '../game/actions';
import { aiSetupStep } from '../game/ai';

export interface SetupScreenProps {
  state: GameState;
  dispatch: (a: Action) => void;
  /** Hot-seat režim používá pro AI loop. V online módu vždy null (AI nehraje online). */
  setStateForAi?: (s: GameState) => void;
  onNewGame?: () => void;
  onShowStats?: () => void;
  onShowRules?: () => void;
  onShowProbabilities?: () => void;
}

export function SetupScreen({
  state,
  dispatch,
  setStateForAi,
  onNewGame,
  onShowStats,
  onShowRules,
  onShowProbabilities,
}: SetupScreenProps) {
  // Phase 1: each player picks a starting hex in order.
  // Phase 2: each player buys at least 1 die and optionally a 2nd vombat.
  const playersWithoutVombat = state.players.filter((p) => p.vombats.length === 0);
  const placingPlayer = playersWithoutVombat[0];

  // Auto-run AI setup actions (placement + buying). Pouze v hot-seatu — online
  // mód neposílá AI hráče (setStateForAi je tam null).
  useEffect(() => {
    if (!setStateForAi) return;
    // The *next* player who needs to place — placement happens in turn order.
    const firstPlacer = state.players.find((p) => p.vombats.length === 0);
    const shouldPlace = !!firstPlacer && firstPlacer.kind === 'ai';
    // After all placed: shop is open to everyone in parallel, so auto-buy any
    // AI player that hasn't bought a die yet.
    const shouldBuy =
      !firstPlacer && state.players.some((p) => p.kind === 'ai' && p.hand.length === 0);
    if (!shouldPlace && !shouldBuy) return;
    const t = setTimeout(() => {
      const next = aiSetupStep(state);
      if (next) setStateForAi(next);
    }, 500);
    return () => clearTimeout(t);
  }, [state, setStateForAi]);

  // For shop phase we let players take turns: first the one who hasn't bought; once all bought >=1, we let any player continue to add more until "Hotovo".
  const allBought = state.players.every((p) => p.hand.length > 0);
  // Shoppable players = humans only. AI auto-shops so their tab would be
  // read-only and confusing. Default to the first human.
  const shoppablePlayers = state.players.filter((pl) => pl.kind === 'human');
  const [shopPlayerId, setShopPlayerId] = useState<string>(shoppablePlayers[0]?.id ?? state.players[0].id);
  const activeShopPlayer = state.players.find((pl) => pl.id === shopPlayerId) ?? state.players[0];

  function onHexClick(hex: Hex) {
    if (placingPlayer) {
      dispatch({ type: 'placeStartingVombat', playerId: placingPlayer.id, hex });
    }
  }

  // Build clickable hex list during placement: only when a HUMAN is placing
  const clickable: Hex[] = [];
  if (placingPlayer && placingPlayer.kind === 'human') {
    state.board.forEach((c) => {
      if (c.type === 'cat' || c.type === 'devil') return;
      const occupied = state.players.some((p) => p.vombats.some((v) => v.hex.q === c.hex.q && v.hex.r === c.hex.r));
      if (!occupied) clickable.push(c.hex);
    });
  }

  return (
    <div className="app">
      <div className="topbar">
        <h1>🐾 Vombat — příprava hry</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          {onShowRules && <button onClick={onShowRules}>📖 Pravidla</button>}
          <a
            href="https://github.com/Laokoonxxx/Vombat/blob/main/PRAVIDLA.md"
            target="_blank"
            rel="noopener noreferrer"
            title="Otevřít plná pravidla na GitHubu (nová záložka)"
            style={{
              padding: '8px 14px',
              border: '1px solid var(--border)',
              background: 'var(--panel)',
              borderRadius: 8,
              color: 'var(--text)',
              textDecoration: 'none',
              cursor: 'pointer',
              fontSize: 'inherit',
            }}
          >
            📚 Plná pravidla
          </a>
          {onShowProbabilities && <button onClick={onShowProbabilities}>🎲 Pravděpodobnosti</button>}
          {onShowStats && <button onClick={onShowStats}>📊 Statistiky</button>}
          {onNewGame && (
            <button
              onClick={() => {
                if (confirm('Opravdu zahodit rozehranou přípravu a začít novou hru?')) onNewGame();
              }}
            >
              ↺ Nová hra
            </button>
          )}
        </div>
      </div>
      <div className="board-area">
        <HexBoard state={state} clickableHexes={clickable} onHexClick={onHexClick} />
      </div>
      <div className="sidebar">
        <Legend />
        {placingPlayer ? (
          <div className="panel">
            <h3>Umístění Vombatů</h3>
            {placingPlayer.kind === 'human' ? (
              <>
                <p>
                  <strong style={{ color: placingPlayer.color }}>{placingPlayer.name}</strong>: klikni na pole na mapě.
                  (Nelze začít na Kočce nebo Čertovi.)
                </p>
                <p style={{ fontSize: 12, color: 'var(--muted)' }}>
                  Tip: Pole sousedící s Kočkou nejsou úplně bezpečná.
                </p>
              </>
            ) : (
              <p>
                🤖 <strong style={{ color: placingPlayer.color }}>{placingPlayer.name}</strong> přemýšlí kde se umístit…
              </p>
            )}
          </div>
        ) : (
          <div className="panel">
            <h3>Nákup startovního vybavení</h3>
            <p>Každý hráč si musí koupit alespoň 1 kostku.</p>
            {shoppablePlayers.length > 1 && (
              <div style={{ marginBottom: 10 }}>
                {shoppablePlayers.map((pl) => (
                  <button
                    key={pl.id}
                    onClick={() => setShopPlayerId(pl.id)}
                    className={pl.id === shopPlayerId ? 'primary' : ''}
                    style={{ marginRight: 4 }}
                  >
                    {pl.name}
                  </button>
                ))}
              </div>
            )}
            {state.players.some((pl) => pl.kind === 'ai') && (
              <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 0 }}>
                🤖 AI hráči si nakupují automaticky — počkej až dokončí.
              </p>
            )}
            <div className="panel" style={{ background: '#fffaf0' }}>
              <h3>{activeShopPlayer.name}</h3>
              <p>🥔 Brambory: <strong>{activeShopPlayer.potatoes}</strong></p>
              <p>
                ✋ Ruka:{' '}
                {activeShopPlayer.hand.length === 0
                  ? '—'
                  : activeShopPlayer.hand.map((d, i) => <span key={i} style={{ marginRight: 4 }}>1k{d}</span>)}
              </p>
              <div className="shop-grid">
                {ALL_DICE_LEVELS.filter((d) => d !== 20).map((d) => (
                  <Row
                    key={d}
                    state={state}
                    dispatch={dispatch}
                    playerId={activeShopPlayer.id}
                    level={d as DiceLevel}
                  />
                ))}
              </div>
            </div>
            <button
              className="primary"
              disabled={!allBought}
              onClick={() => dispatch({ type: 'finishSetup' })}
              style={{ marginTop: 12, width: '100%' }}
            >
              🎲 Začít hru
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({
  state,
  dispatch,
  playerId,
  level,
}: {
  state: GameState;
  dispatch: (a: Action) => void;
  playerId: string;
  level: DiceLevel;
}) {
  const p = state.players.find((pp) => pp.id === playerId)!;
  const price = DICE_PRICES[level];
  const canAfford = p.potatoes >= price;
  return (
    <>
      <span>1k{level}</span>
      <span>{price} 🥔</span>
      <button disabled={!canAfford} onClick={() => dispatch({ type: 'buyDie', playerId, level })}>
        Koupit
      </button>
    </>
  );
}
