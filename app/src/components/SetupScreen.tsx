import { useEffect, useState } from 'react';
import type { GameState, DiceLevel, Hex } from '../game/types';
import { ALL_DICE_LEVELS, DICE_PRICES } from '../game/types';
import { HexBoard } from './HexBoard';
import { Legend } from './Legend';
import { buyDie, buySecondVombat, finishSetup, placeStartingVombat } from '../game/engine';
import { aiSetupStep } from '../game/ai';

export interface SetupScreenProps {
  state: GameState;
  setState: (s: GameState) => void;
  onNewGame?: () => void;
}

export function SetupScreen({ state, setState, onNewGame }: SetupScreenProps) {
  // Phase 1: each player picks a starting hex in order.
  // Phase 2: each player buys at least 1 die and optionally a 2nd vombat.
  const playersWithoutVombat = state.players.filter((p) => p.vombats.length === 0);
  const placingPlayer = playersWithoutVombat[0];

  // Auto-run AI setup actions (placement + buying)
  useEffect(() => {
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
      if (next) setState(next);
    }, 500);
    return () => clearTimeout(t);
  }, [state, setState]);

  // For shop phase we let players take turns: first the one who hasn't bought; once all bought >=1, we let any player continue to add more until "Hotovo".
  const allBought = state.players.every((p) => p.hand.length > 0);
  const [shopPlayerIdx, setShopPlayerIdx] = useState(0);
  const activeShopPlayer = state.players[shopPlayerIdx];

  function onHexClick(hex: Hex) {
    if (placingPlayer) {
      setState(placeStartingVombat(state, placingPlayer.id, hex));
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
            <div style={{ marginBottom: 10 }}>
              {state.players.map((p, i) => (
                <button
                  key={p.id}
                  onClick={() => setShopPlayerIdx(i)}
                  className={i === shopPlayerIdx ? 'primary' : ''}
                  style={{ marginRight: 4 }}
                >
                  {p.name}
                </button>
              ))}
            </div>
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
                    setState={setState}
                    playerId={activeShopPlayer.id}
                    level={d as DiceLevel}
                  />
                ))}
                <div style={{ gridColumn: '1 / -1' }}>
                  <button
                    onClick={() => setState(buySecondVombat(state, activeShopPlayer.id))}
                    disabled={activeShopPlayer.vombats.length !== 1 || activeShopPlayer.potatoes < 5}
                  >
                    Koupit druhého Vombata (5 brambor)
                  </button>
                </div>
              </div>
            </div>
            <button
              className="primary"
              disabled={!allBought}
              onClick={() => setState(finishSetup(state))}
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
  setState,
  playerId,
  level,
}: {
  state: GameState;
  setState: (s: GameState) => void;
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
      <button disabled={!canAfford} onClick={() => setState(buyDie(state, playerId, level))}>
        Koupit
      </button>
    </>
  );
}
