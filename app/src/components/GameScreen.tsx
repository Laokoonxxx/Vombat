import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import type { GameState, Hex, DiceLevel, SkillId, WoundType } from '../game/types';
import { hexKey, WOUND_TYPES } from '../game/types';
import { HexBoard } from './HexBoard';
import { PlayerBoard } from './PlayerBoard';
import { DiceTray } from './DiceTray';
import { Legend } from './Legend';
import {
  rollDice, legalMoveTargets, moveVombat, canUseField, useField,
  endTurnNow, resolveAttackWithPotato, resolveAttackWithDie, sleep,
  canFightDevil, beginDevilCombat, applyDevilWound, devilContinueRoll, devilStop,
  allWoundsTaken, currentPlayer, SKILL_REQUIREMENTS, learnSkill, TELEPORT_COST, skillBuyCost,
} from '../game/engine';
import { aiStep } from '../game/ai';

// Prefix icons for the log feed — make events scannable at a glance.
function eventIcon(entry: string): string {
  if (entry.includes('ZABIL')) return '🏆';
  if (entry.includes('hodil kostkami')) return '🎲';
  if (entry.includes('přesunul Vombata')) return '🐾';
  if (entry.includes('rozmačkal Kočku')) return '🎉';
  if (entry.includes('bojuje s Čertem')) return '⚔️';
  if (entry.includes('zranil Čerta')) return '💥';
  if (entry.includes('neuspěl v boji')) return '❌';
  if (entry.includes('ukončil boj')) return '🛑';
  if (entry.includes('Kapacita zdarma') || entry.includes('Koupel zdarma')) return '🎁';
  if (entry.includes('koupil dovednost')) return '🛒';
  if (entry.includes('se naučil')) return '🧠';
  if (entry.includes('získal 1k') && entry.includes('Houští')) return '🌵';
  if (entry.includes('zasadil mrkev')) return '🥕';
  if (entry.includes('Kakej')) return '💩';
  if (entry.includes('obsadil Eukalyptový')) return '🌳';
  if (entry.includes('teleportoval')) return '🌀';
  if (entry.includes('uvolnil čekající')) return '🔓';
  if (entry.includes('čeká na dovednost')) return '📥';
  if (entry.includes('spí a získává') || entry.includes('prospal')) return '💤';
  if (entry.includes('downgradnul') || entry.includes('upgradnul') || entry.includes('výměnu')) return '🔄';
  if (entry.includes('je vedle Kočky') || entry.includes('Pole je obsazeno')) return '⚠️';
  if (entry.includes('odevzdal bramboru') || entry.includes('odevzdal kostku')) return '💔';
  if (entry.includes('koupil 1k') || entry.includes('druhého Vombata')) return '🛒';
  if (entry.includes('umístil Vombata') || entry.startsWith('Hra')) return '🏁';
  if (entry.startsWith('---')) return '▶️';
  return '·';
}

export interface GameScreenProps {
  state: GameState;
  setState: (s: GameState) => void;
  onNewGame?: () => void;
  onShowStats?: () => void;
  onShowRules?: () => void;
}

type Mode = 'idle' | 'pickMove' | 'pickField' | 'sleepMenu' | 'pickTeleport';

export function GameScreen({ state, setState, onNewGame, onShowStats, onShowRules }: GameScreenProps) {
  const p = state.players[state.currentPlayerIdx];
  const [mode, setMode] = useState<Mode>('idle');
  const [selectedVombatId, setSelectedVombatId] = useState<string | null>(null);
  const [inspectHex, setInspectHex] = useState<Hex | null>(null);
  const [inspectPos, setInspectPos] = useState<{ x: number; y: number } | null>(null);

  // Auto-run AI: when current player is AI, dispatch one step every ~700ms
  // so the user can see each move land.
  useEffect(() => {
    if (state.phase === 'game_over') return;
    const isAITurn = p.kind === 'ai';
    // Also handle: AI is in a pending choice from a human-triggered effect
    const aiHasPending = state.pendingChoice && state.players.some((pl) => pl.kind === 'ai' && pl.id === (state.pendingChoice as any).playerId);
    if (!isAITurn && !aiHasPending) return;
    const t = setTimeout(() => {
      const next = aiStep(state);
      if (next && next !== state) setState(next);
    }, 700);
    return () => clearTimeout(t);
  }, [state, p, setState]);

  // Compute clickable hexes per mode
  const clickable = useMemo(() => {
    if (state.phase === 'using_field' && p.skills.has('sprint')) {
      // After Sprint move — let player click the hex they moved onto
      // Simplest: any hex with their vombat
      return p.vombats.map((v) => v.hex);
    }
    if (mode === 'pickMove') {
      // Show ALL legal move targets from ANY of player's vombats up front.
      // Click a target hex → if multiple vombats could move there, pick the
      // closest one. Skips the "select vombat first" step.
      const targets: Hex[] = [];
      const seen = new Set<string>();
      for (const v of p.vombats) {
        for (const t of legalMoveTargets(state, v.hex)) {
          const k = hexKey(t);
          if (!seen.has(k)) { seen.add(k); targets.push(t); }
        }
      }
      return targets;
    }
    if (mode === 'pickField') {
      // any usable adjacent/standing hex
      const hexes: Hex[] = [];
      state.board.forEach((c) => {
        if (canUseField(state, c.hex)) hexes.push(c.hex);
      });
      return hexes;
    }
    if (mode === 'pickTeleport') {
      // any non-cat-alive, non-devil, non-vombat hex
      const hexes: Hex[] = [];
      state.board.forEach((c) => {
        if (c.type === 'devil') return;
        if (c.type === 'cat' && c.catAlive) return;
        if (state.players.some((pl) => pl.vombats.some((v) => v.hex.q === c.hex.q && v.hex.r === c.hex.r))) return;
        hexes.push(c.hex);
      });
      return hexes;
    }
    // INSPECT MODE: in 'rolled' phase with no active sub-mode, all hexes are
    // clickable — click reveals available actions for that hex in a side panel.
    if (mode === 'idle' && state.phase === 'rolled' && !state.pendingChoice) {
      const hexes: Hex[] = [];
      state.board.forEach((c) => hexes.push(c.hex));
      return hexes;
    }
    return [];
  }, [mode, selectedVombatId, p, state]);

  function onHexClick(hex: Hex, event?: MouseEvent) {
    if (event) setInspectPos({ x: event.clientX, y: event.clientY });
    if (state.phase === 'using_field' && p.skills.has('sprint')) {
      setState(useField(state, hex));
      return;
    }
    if (mode === 'pickMove') {
      // Find which of player's vombats can actually move to the clicked hex.
      // If multiple, pick the one whose direct adjacency matches (or first).
      const movableVombats = p.vombats.filter((v) =>
        legalMoveTargets(state, v.hex).some((t) => t.q === hex.q && t.r === hex.r)
      );
      if (movableVombats.length === 0) return;
      const v = movableVombats[0];
      const after = moveVombat(state, v.id, hex);
      setState(after);
      setMode('idle');
      setSelectedVombatId(null);
      return;
    }
    if (mode === 'pickField') {
      const after = useField(state, hex);
      setState(after);
      setMode('idle');
      return;
    }
    if (mode === 'pickTeleport') {
      // Use first vombat if no selection; otherwise the selected one.
      const vombatId = selectedVombatId || p.vombats[0]?.id;
      if (!vombatId) return;
      const after = sleep(state, { kind: 'teleport', vombatId, targetHex: hex });
      setState(after);
      setMode('idle');
      setSelectedVombatId(null);
      return;
    }
    // Inspect mode: open the hex options panel.
    if (mode === 'idle' && state.phase === 'rolled' && !state.pendingChoice) {
      setInspectHex(hex);
      return;
    }
  }

  const canRoll = state.phase === 'idle';
  const rolled = state.phase === 'rolled' || state.phase === 'choose_action';

  // Detect post-roll combat-against-devil opportunity
  const adjDevilForMe = p.vombats.some((v) => canFightDevil(state, v.hex));

  return (
    <div className="app">
      <div className="topbar">
        <h1>🐾 Vombat</h1>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div className="turn-badge" style={{ color: p.color }}>
            Tah #{state.turnNumber} · {p.name}
          </div>
          {onShowRules && <button onClick={onShowRules}>📖 Pravidla</button>}
          {onShowStats && <button onClick={onShowStats}>📊 Statistiky</button>}
          {onNewGame && (
            <button
              onClick={() => {
                if (confirm('Opravdu zahodit rozehranou hru a začít novou?')) onNewGame();
              }}
            >
              ↺ Nová hra
            </button>
          )}
        </div>
      </div>
      <div className="board-area">
        <HexBoard
          state={state}
          clickableHexes={clickable}
          selectedHex={inspectHex}
          onHexClick={onHexClick}
        />
        {inspectHex && state.phase === 'rolled' && (
          <HexInspectPanel
            hex={inspectHex}
            anchor={inspectPos}
            state={state}
            onClose={() => { setInspectHex(null); setInspectPos(null); }}
            onMove={() => {
              const moveTargets = p.vombats
                .map((v) => ({ v, targets: legalMoveTargets(state, v.hex) }))
                .find(({ targets }) =>
                  targets.some((t) => t.q === inspectHex.q && t.r === inspectHex.r)
                );
              if (!moveTargets) return;
              setState(moveVombat(state, moveTargets.v.id, inspectHex));
              setInspectHex(null);
              setInspectPos(null);
            }}
            onUseField={() => {
              setState(useField(state, inspectHex));
              setInspectHex(null);
              setInspectPos(null);
            }}
          />
        )}
      </div>
      <div className="sidebar">
        <Legend />
        {state.players.map((pl) => (
          <PlayerBoard key={pl.id} player={pl} active={pl.id === p.id} />
        ))}
        <div className="panel">
          <h3>Hod</h3>
          <DiceTray player={p} />
        </div>
        <div className="panel">
          <h3>Akce</h3>
          {state.phase === 'game_over' ? (
            <div>
              <h2>🏆 Vítěz: {state.players.find((pp) => pp.id === state.winnerId)?.name}</h2>
              <p>Pro novou hru obnov stránku.</p>
            </div>
          ) : (
            <div className="action-buttons">
              {canRoll && (
                <>
                  <button
                    className="primary"
                    disabled={!adjDevilForMe || p.hand.length === 0}
                    onClick={() => setState(beginDevilCombat(state))}
                  >
                    ⚔️ Bojuj s Čertem (vyhlášení před hodem)
                  </button>
                  {p.hand.length > 0 ? (
                    <button className="primary" onClick={() => setState(rollDice(state))}>
                      🎲 Hoď kostkami ({p.hand.length})
                    </button>
                  ) : (
                    <button onClick={() => setMode('sleepMenu')}>
                      💤 Spánek (Ruka je prázdná, není co házet)
                    </button>
                  )}
                </>
              )}
              {rolled && !state.pendingChoice && (() => {
                // Compute what's actually possible given the current roll —
                // don't offer disabled buttons.
                const moveTargets = new Set<string>();
                for (const v of p.vombats) {
                  for (const t of legalMoveTargets(state, v.hex)) {
                    moveTargets.add(hexKey(t));
                  }
                }
                const fieldTargets: Hex[] = [];
                state.board.forEach((c) => {
                  if (canUseField(state, c.hex)) fieldTargets.push(c.hex);
                });
                const canMove = moveTargets.size > 0;
                const canUse = fieldTargets.length > 0;
                return (
                  <>
                    {canMove && (
                      <button onClick={() => { setMode('pickMove'); setSelectedVombatId(null); }}>
                        🐾 Pohyb ({moveTargets.size} {moveTargets.size === 1 ? 'možnost' : 'možností'})
                      </button>
                    )}
                    {canUse && (
                      <button onClick={() => setMode('pickField')}>
                        🌿 Využij pole ({fieldTargets.length} {fieldTargets.length === 1 ? 'možnost' : 'možností'})
                      </button>
                    )}
                    <button onClick={() => setMode('sleepMenu')}>
                      💤 Spánek (zruš hod, využij speciální akci)
                    </button>
                    {!canMove && !canUse && (
                      <p style={{ fontSize: 12, color: 'var(--muted)', margin: '4px 0 0' }}>
                        S tímto hodem nemůžeš nic dělat — zvol Spánek.
                      </p>
                    )}
                  </>
                );
              })()}
              {state.phase === 'devil_combat' && p.fighting && (
                <DevilCombatPanel state={state} setState={setState} />
              )}
            </div>
          )}
          {state.pendingChoice?.kind === 'attack_surrender' && (
            <AttackModal state={state} setState={setState} />
          )}
          {state.pendingChoice?.kind === 'select_dirt_action' && (
            <DirtActionModal state={state} setState={setState} />
          )}
          {state.pendingChoice?.kind === 'pick_skill' && (
            <SkillModal state={state} setState={setState} />
          )}
          {mode === 'sleepMenu' && (
            <SleepModal
              state={state}
              setState={(s) => {
                // Any Sleep action ends the turn — also close the modal.
                setState(s);
                setMode('idle');
              }}
              close={() => setMode('idle')}
              onPickTeleport={(vombatId) => {
                setSelectedVombatId(vombatId);
                setMode('pickTeleport');
              }}
            />
          )}
        </div>
        <div className="panel">
          <h3>Čertova zranění (každý bojuje vlastního)</h3>
          {state.players.map((pl) => (
            <div key={pl.id} style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: pl.color, marginBottom: 2 }}>
                {pl.name}
              </div>
              <div className="devil-tracker">
                {WOUND_TYPES.map((w) => {
                  const die = state.devilWounds.woundsByPlayer[pl.id][w];
                  return (
                    <div key={w} className={`wound-slot ${die ? 'taken' : ''}`}>
                      <div style={{ fontWeight: 700 }}>{w}</div>
                      <div style={{ fontSize: 10 }}>{die ? `1k${die}` : '—'}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {allWoundsTaken(state, p.id) && (
            <p style={{ color: '#a05e2e', marginTop: 6, fontSize: 12 }}>
              Tvoje 4 zranění zasazena. V boji s Čertem hoď součet 25+ pro vítězství.
            </p>
          )}
        </div>
        <div className="panel">
          <h3>Log</h3>
          <div className="log">
            {state.log.slice(0, 40).map((e, i) => (
              <div key={i} className="entry" style={{ display: 'flex', gap: 4, alignItems: 'flex-start' }}>
                <span style={{ minWidth: 18 }}>{eventIcon(e)}</span>
                <span style={{ flex: 1 }}>{e}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Floating panel showing what the current player can do at a specific hex.
// Opens at click position so the user doesn't have to mouse across screen.
function HexInspectPanel({
  hex,
  anchor,
  state,
  onClose,
  onMove,
  onUseField,
}: {
  hex: Hex;
  anchor: { x: number; y: number } | null;
  state: GameState;
  onClose: () => void;
  onMove: () => void;
  onUseField: () => void;
}) {
  const p = currentPlayer(state);
  const cell = state.board.get(hexKey(hex));
  if (!cell) return null;
  const sum = (p.lastRoll || []).reduce((a, b) => a + b, 0);
  const canMoveHere = p.vombats.some((v) =>
    legalMoveTargets(state, v.hex).some((t) => t.q === hex.q && t.r === hex.r)
  );
  const canUseHere = canUseField(state, hex);
  const typeLabel: Record<string, string> = {
    dirt: '🟫 Hlína (2-4)',
    bed: '🌱 Záhon (4-6)',
    desert: '🏜️ Poušť (7+, vyžaduje Lázně)',
    tree: '🌳 Eukalyptus (7-8)',
    thorn: '🌵 Houští (k4 → 5+, k6 → 7+, k8 → 9+)',
    cat: cell.catAlive ? '🐱 Kočka (11-14 = rozmačkat)' : '🕳️ Mrtvá kočka (tunel)',
    devil: '👹 Tasmánský Čert (12+ pohyb, boj se vyhlašuje před hodem)',
  };

  // Position the floating panel near the click point. Clamp so it stays
  // within the viewport even if click was near an edge.
  const PANEL_W = 280;
  const PANEL_H_EST = 200;
  const margin = 12;
  let left = (anchor?.x ?? window.innerWidth / 2) + 18;
  let top = (anchor?.y ?? window.innerHeight / 2) - PANEL_H_EST / 2;
  if (left + PANEL_W + margin > window.innerWidth) {
    left = (anchor?.x ?? 0) - PANEL_W - 18; // flip to left side of cursor
  }
  if (top < margin) top = margin;
  if (top + PANEL_H_EST + margin > window.innerHeight) {
    top = window.innerHeight - PANEL_H_EST - margin;
  }

  return (
    <div
      style={{
        position: 'fixed',
        left,
        top,
        width: PANEL_W,
        background: '#fff',
        border: '2px solid var(--accent)',
        borderRadius: 8,
        padding: 12,
        boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
        zIndex: 50,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <strong>{typeLabel[cell.type]}</strong>
        <button onClick={onClose} style={{ padding: '2px 8px', fontSize: 12 }}>✕</button>
      </div>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>
        Pozice ({hex.q},{hex.r}) · Tvůj hod: <strong>{sum}</strong>
        {cell.thornDieLevel && <> · Kostka: 1k{cell.thornDieLevel}</>}
        {cell.marker && (
          <> · Obsadil {state.players.find((pl) => pl.id === cell.marker!.playerId)?.name}{' '}
            ({cell.marker.kind})</>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <button disabled={!canMoveHere} onClick={onMove}>
          🐾 Pohni se sem {canMoveHere ? '' : '(nelze s tímto hodem)'}
        </button>
        <button disabled={!canUseHere} onClick={onUseField}>
          🌿 Využij pole {canUseHere ? '' : '(nelze)'}
        </button>
        {!canMoveHere && !canUseHere && (
          <p style={{ fontSize: 11, color: 'var(--muted)', margin: '4px 0 0' }}>
            S tímto hodem na toto pole nemůžeš nic dělat.
          </p>
        )}
      </div>
    </div>
  );
}

function AttackModal({ state, setState }: { state: GameState; setState: (s: GameState) => void }) {
  const pc = state.pendingChoice;
  if (pc?.kind !== 'attack_surrender') return null;
  const p = state.players.find((pp) => pp.id === pc.playerId)!;
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h2>⚠️ Útok {pc.from === 'cat' ? 'Kočky' : 'Čerta'}!</h2>
        <p>{p.name}, musíš odevzdat 1 bramboru nebo 1 kostku.</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button disabled={p.potatoes <= 0} onClick={() => setState(resolveAttackWithPotato(state))}>
            🥔 Odevzdat bramboru ({p.potatoes})
          </button>
          {p.hand.map((d, i) => (
            <button key={`h${i}`} onClick={() => setState(resolveAttackWithDie(state, 'hand', i))}>
              ✋ Odevzdat 1k{d}
            </button>
          ))}
          {p.reserve.map((d, i) => (
            <button key={`r${i}`} onClick={() => setState(resolveAttackWithDie(state, 'reserve', i))}>
              📦 Odevzdat 1k{d} (Zásoba)
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function DirtActionModal({ state, setState }: { state: GameState; setState: (s: GameState) => void }) {
  const pc = state.pendingChoice;
  if (pc?.kind !== 'select_dirt_action') return null;
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h2>Hlína / Poušť — vyber akci</h2>
        <div className="actions">
          <button onClick={() => setState(useField(state, pc.hex, { dirtAction: 'plant' }))}>
            🥕 Zasaď mrkev
          </button>
          <button onClick={() => setState(useField(state, pc.hex, { dirtAction: 'poop' }))}>
            💩 Kakej (získej kostku)
          </button>
          <button onClick={() => setState(useField(state, pc.hex, { dirtAction: 'learn' }))}>
            🧠 Uč se dovednost
          </button>
        </div>
      </div>
    </div>
  );
}

function SkillModal({ state, setState }: { state: GameState; setState: (s: GameState) => void }) {
  const pc = state.pendingChoice;
  if (pc?.kind !== 'pick_skill') return null;
  const p = currentPlayer(state);
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h2>🧠 Uč se</h2>
        <p>Vyber dovednost. Trees: {p.bobekTrack} (eukalypty), brambor: {p.potatoes}.</p>
        <p style={{ fontSize: 12, color: 'var(--muted)' }}>Pro MVP: 1 strom = 1 tvůj eukalyptus (nezdrojuje). 1 strom lze nahradit 3 bramborami nebo 1 odhozenou kostkou (zatím zjednodušeno - používáme jen stromy/brambory).</p>
        {(Object.keys(SKILL_REQUIREMENTS) as SkillId[]).map((sid) => {
          const req = SKILL_REQUIREMENTS[sid];
          const owned = p.skills.has(sid);
          const enoughTrees = p.bobekTrack >= req.trees;
          const enoughViaPotato = p.bobekTrack * 3 + p.potatoes >= req.trees * 3;
          return (
            <div key={sid} style={{ borderBottom: '1px dashed #ddd', padding: '6px 0' }}>
              <strong>{req.label}</strong> (vyžaduje {req.trees}× 🌳)
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>{req.desc}</div>
              <div style={{ marginTop: 4, display: 'flex', gap: 6 }}>
                <button
                  disabled={owned || !enoughTrees}
                  onClick={() => setState(learnSkill(state, sid, req.trees, 0, []))}
                >
                  {owned ? '✓ Naučeno' : `Naučit (${req.trees}× strom)`}
                </button>
                <button
                  disabled={owned || !enoughViaPotato || p.bobekTrack >= req.trees}
                  onClick={() => {
                    const treesAvailable = Math.min(p.bobekTrack, req.trees);
                    const missing = req.trees - treesAvailable;
                    setState(learnSkill(state, sid, treesAvailable, missing * 3, []));
                  }}
                >
                  Naučit (nahradit chybějící stromy bramborami)
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SleepModal({
  state,
  setState,
  close,
  onPickTeleport,
}: {
  state: GameState;
  setState: (s: GameState) => void;
  close: () => void;
  onPickTeleport: (vombatId: string) => void;
}) {
  const p = currentPlayer(state);
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h2>💤 Spánek</h2>
        <p>{p.name}, vyber akci spánku (alternativa k využití hodu):</p>
        <div className="actions">
          <button onClick={() => setState(sleep(state, { kind: 'gain_potato' }))}>
            🥔 Získej 1 bramboru
          </button>
          {p.vombats.map((v, i) => (
            <button
              key={`tp${i}`}
              disabled={p.potatoes < TELEPORT_COST}
              onClick={() => {
                close();
                onPickTeleport(v.id);
              }}
              title="Teleport Vombata na libovolné pole (kromě Čerta a živé Kočky) za 5 brambor"
            >
              🌀 Teleport {p.vombats.length > 1 ? `Vombata #${i + 1} ` : ''}({TELEPORT_COST} 🥔)
            </button>
          ))}
          <button onClick={() => {
            const targets = p.hand.map((_, i) => ({ location: 'hand' as const, index: i }));
            setState(sleep(state, { kind: 'downgrade_dice', targets }));
          }}>
            ⬇️ Downgrade všech kostek v Ruce
          </button>
          {p.hand.map((d, i) => (
            <button key={`s2r${i}`} onClick={() => setState(sleep(state, { kind: 'swap', ops: [{ op: 'hand_to_reserve', index: i }] }))}>
              ✋→📦 1k{d}
            </button>
          ))}
          {p.reserve.map((d, i) => (
            <button key={`r2h${i}`} onClick={() => setState(sleep(state, { kind: 'swap', ops: [{ op: 'reserve_to_hand', index: i }] }))}>
              📦→✋ 1k{d}
            </button>
          ))}
          {p.skills.has('masaz_strev') && p.hand.map((d, i) => (
            <button key={`up${i}`} onClick={() => setState(sleep(state, { kind: 'upgrade_die', location: 'hand', index: i }))}>
              ⬆️ Upgrade 1k{d}
            </button>
          ))}
          {p.skills.has('ajurveda') && p.hand.map((d, i) => (
            <button key={`up2${i}`} onClick={() => setState(sleep(state, { kind: 'upgrade_die_2x', location: 'hand', index: i }))}>
              ⬆️⬆️ Upgrade 1k{d} 2x
            </button>
          ))}
          <button onClick={() => setState(sleep(state, { kind: 'skip' }))}>
            ✖️ Skip tah
          </button>
          <button onClick={close}>Zrušit</button>
        </div>
        {/* Skill shop */}
        {(Object.keys(SKILL_REQUIREMENTS) as SkillId[]).filter((s) => !p.skills.has(s)).length > 0 && (
          <div style={{ marginTop: 14, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
            <h3 style={{ margin: 0, fontSize: 13, textTransform: 'uppercase', color: 'var(--muted)' }}>
              🧠 Skill shop (Sleep)
            </h3>
            <p style={{ fontSize: 11, color: 'var(--muted)', margin: '4px 0 8px' }}>
              Cena: 5 🥔 za každý vyžadovaný strom.
            </p>
            <div className="actions">
              {(Object.keys(SKILL_REQUIREMENTS) as SkillId[]).map((sid) => {
                const req = SKILL_REQUIREMENTS[sid];
                if (p.skills.has(sid)) return null;
                const cost = skillBuyCost(sid);
                return (
                  <button
                    key={sid}
                    disabled={p.potatoes < cost}
                    onClick={() => setState(sleep(state, { kind: 'buy_skill', skill: sid }))}
                    title={req.desc}
                  >
                    🛒 {req.label} ({cost} 🥔)
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DevilCombatPanel({ state, setState }: { state: GameState; setState: (s: GameState) => void }) {
  const p = currentPlayer(state);
  const taken = state.devilWounds.woundsByPlayer[p.id];
  const allTaken = allWoundsTaken(state, p.id);
  const currentSum = (p.lastRoll || []).reduce((a, b) => a + b, 0);
  const readyToKill = allTaken && currentSum >= 25;
  return (
    <div>
      <DiceTray player={p} />
      <p style={{ fontSize: 13, marginTop: 8 }}>
        {allTaken
          ? 'Všechna zranění zasazena. Potřebuješ součet ≥25 pro smrtelnou ránu.'
          : 'Pro každou kostku zvol, na které zranění ji použít (1, 2, 7+, 10+).'}
      </p>
      {readyToKill && (
        <p style={{ background: '#d4f0c4', padding: 8, borderRadius: 6, fontSize: 13 }}>
          ✨ <strong>Zbylé kostky dávají {currentSum}</strong> (≥25). Klikni "Zasaď smrtelnou ránu" pro vítězství.
        </p>
      )}
      {(p.lastRoll || []).map((val, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
          <span style={{ minWidth: 60 }}>Kostka 1k{p.hand[i]} = <strong>{val}</strong></span>
          {WOUND_TYPES.map((w) => {
            const validate =
              (w === '1' && val === 1) ||
              (w === '2' && val === 2) ||
              (w === '7+' && val >= 7) ||
              (w === '10+' && val >= 10);
            const slotFree = taken[w] == null;
            return (
              <button
                key={w}
                disabled={!validate || !slotFree}
                onClick={() => setState(applyDevilWound(state, i, w))}
              >
                {w}
              </button>
            );
          })}
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button className="primary" onClick={() => setState(devilContinueRoll(state))}>
          {readyToKill
            ? '⚔️ Zasaď smrtelnou ránu'
            : `🎲 Hoď znovu${allTaken ? ' (potřebuješ 25+)' : ''}`}
        </button>
        <button onClick={() => setState(devilStop(state))}>Ukončit boj</button>
      </div>
    </div>
  );
}
