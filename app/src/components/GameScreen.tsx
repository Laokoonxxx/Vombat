import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import type { GameState, Hex, DiceLevel, SkillId, WoundType, FormationKind, TaskKey } from '../game/types';
import {
  hexKey, WOUND_TYPES, FORMATION_LABEL, FORMATION_DESC, FORMATION_REWARDS,
  ALL_TASK_KEYS, TASK_LABEL,
} from '../game/types';
import { HexBoard } from './HexBoard';
import { PlayerCard } from './PlayerCard';
import { DiceTray } from './DiceTray';
import {
  legalMoveTargets, canUseField, canFightDevil, allWoundsTaken,
  currentPlayer, SKILL_REQUIREMENTS, skillBuyCost,
  preRollSwapsRemaining, PRE_ROLL_SWAP_LIMIT,
  SKIP_ROLL_POTATOES,
  rollAdjustmentsRemaining, ROLL_ADJUSTMENT_LIMIT,
  primka5Diagnostic, obkliceniDiagnostic,
} from '../game/engine';
import type { SwapOp } from '../game/engine';
import type { Action } from '../game/actions';
import { rollForCurrentPlayer } from '../game/actions';
import { aiStep } from '../game/ai';

// Najde nejnovější (= index 0) log entry, jejíž "subject" je daný hráč.
// Heuristika: stripni leading emoji/whitespace, pak entry musí začínat
// jménem hráče následovaným non-alfa charakterem (mezera, čárka, ...).
// Vrací plné raw entry (s emoji prefixem), nebo null pokud nikdy nehrál.
function findLastActionFor(log: string[], playerName: string): string | null {
  for (const entry of log) {
    const stripped = entry.replace(/^[^A-Za-zÁ-Žá-žŠšŽžČčŘřŤťŇňĎďÝýÚú0-9]+/u, '');
    if (stripped.startsWith(playerName)) {
      const after = stripped[playerName.length];
      if (!after || /[^A-Za-zÁ-Žá-žŠšŽžČčŘřŤťŇňĎďÝýÚú0-9]/.test(after)) {
        return entry;
      }
    }
  }
  return null;
}

// Vyhodí leading emoji + jméno hráče z entry, aby strip ukazoval jen
// akci. Např. "🎉 Aleš chrupavčitým ... rozdrtil Kočku!" → "rozdrtil Kočku!"
function stripPlayerPrefix(entry: string, playerName: string): string {
  // 1) Strip leading non-letter chars (emoji, whitespace)
  const stripped = entry.replace(/^[^A-Za-zÁ-Žá-žŠšŽžČčŘřŤťŇňĎďÝýÚú0-9]+/u, '');
  // 2) Strip "PlayerName " prefix if present
  if (stripped.startsWith(playerName + ' ')) {
    return stripped.slice(playerName.length + 1);
  }
  if (stripped.startsWith(playerName + ',')) {
    return stripped.slice(playerName.length + 1).trim();
  }
  return stripped;
}

// Prefix icons for the log feed — make events scannable at a glance.
function eventIcon(entry: string): string {
  if (entry.includes('ZABIL')) return '🏆';
  if (entry.includes('hodil kostkami')) return '🎲';
  if (entry.includes('přesunul Vombata')) return '🐾';
  if (entry.includes('rozdrtil Kočku') || entry.includes('rozmačkal Kočku')) return '🎉';
  if (entry.includes('bojuje s Čertem')) return '⚔️';
  if (entry.includes('zranil Čerta')) return '💥';
  if (entry.includes('neuspěl v boji')) return '❌';
  if (entry.includes('ukončil boj')) return '🛑';
  if (entry.includes('Kapacita zdarma') || entry.includes('Koupel zdarma')) return '🎁';
  if (entry.includes('koupil dovednost')) return '🛒';
  if (entry.includes('se naučil')) return '🧠';
  if (entry.includes('získal 1k') && entry.includes('Houští')) return '🌵';
  if (entry.includes('zasadil mrkev')) return '🥕';
  if (entry.includes('vyformoval kostku')) return '💩';
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
  dispatch: (a: Action) => void;
  /** Pro AI loop v hot-seatu — online mód předá undefined (AI online nehraje). */
  setStateForAi?: (s: GameState) => void;
  onNewGame?: () => void;
  onShowStats?: () => void;
  onShowRules?: () => void;
  onShowProbabilities?: () => void;
}

type Mode = 'idle' | 'pickMove' | 'pickField' | 'sleepMenu';

export function GameScreen({
  state,
  dispatch,
  setStateForAi,
  onNewGame,
  onShowStats,
  onShowRules,
  onShowProbabilities,
}: GameScreenProps) {
  const p = state.players[state.currentPlayerIdx];
  const [mode, setMode] = useState<Mode>('idle');
  const [selectedVombatId, setSelectedVombatId] = useState<string | null>(null);
  const [inspectHex, setInspectHex] = useState<Hex | null>(null);
  const [inspectPos, setInspectPos] = useState<{ x: number; y: number } | null>(null);

  // Auto-run AI: jen v hot-seatu (setStateForAi != null). V online módu AI nehraje.
  useEffect(() => {
    if (!setStateForAi) return;
    if (state.phase === 'game_over') return;
    const isAITurn = p.kind === 'ai';
    const aiHasPending =
      state.pendingChoice &&
      state.players.some((pl) => pl.kind === 'ai' && pl.id === (state.pendingChoice as any).playerId);
    if (!isAITurn && !aiHasPending) return;
    const t = setTimeout(() => {
      const next = aiStep(state);
      if (next && next !== state) setStateForAi(next);
    }, 700);
    return () => clearTimeout(t);
  }, [state, p, setStateForAi]);

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
    // (Teleport mode removed — feature was deleted.)
    // INSPECT MODE: in 'rolled' phase with no active sub-mode, all hexes are
    // clickable — click reveals available actions for that hex in a side panel.
    if (mode === 'idle' && state.phase === 'rolled' && !state.pendingChoice) {
      const hexes: Hex[] = [];
      state.board.forEach((c) => hexes.push(c.hex));
      return hexes;
    }
    return [];
  }, [mode, selectedVombatId, p, state]);

  // Cells where the player can ACTUALLY do something with the current roll.
  // Computed in 'rolled' phase regardless of sub-mode — the player always
  // wants to see at a glance which hexes match their roll. Distinct from
  // `clickable` (which controls cursor/click handlers).
  const actionable = useMemo(() => {
    if (state.phase !== 'rolled' || state.pendingChoice) return [];
    const hexes: Hex[] = [];
    const seen = new Set<string>();
    // Movement targets from any vombat
    for (const v of p.vombats) {
      for (const t of legalMoveTargets(state, v.hex)) {
        const k = hexKey(t);
        if (!seen.has(k)) { seen.add(k); hexes.push(t); }
      }
    }
    // Field-use targets
    state.board.forEach((c) => {
      if (canUseField(state, c.hex)) {
        const k = hexKey(c.hex);
        if (!seen.has(k)) { seen.add(k); hexes.push(c.hex); }
      }
    });
    return hexes;
  }, [p, state]);

  function onHexClick(hex: Hex, event?: MouseEvent) {
    if (event) setInspectPos({ x: event.clientX, y: event.clientY });
    if (state.phase === 'using_field' && p.skills.has('sprint')) {
      dispatch({ type: 'useField', hex });
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
      dispatch({ type: 'moveVombat', vombatId: v.id, targetHex: hex });
      setMode('idle');
      setSelectedVombatId(null);
      return;
    }
    if (mode === 'pickField') {
      dispatch({ type: 'useField', hex });
      setMode('idle');
      return;
    }
    // (Teleport pickTeleport handler removed — feature deleted.)
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

  // Phase hint pro turn banner — krátká věta co hráč zrovna dělá / může dělat
  let phaseHint = '';
  if (state.phase === 'game_over') phaseHint = '🏆 Hra skončila';
  else if (state.pendingChoice?.kind === 'attack_surrender') phaseHint = '⚠️ Útok! Odevzdat bramboru/kostku';
  else if (state.pendingChoice?.kind === 'pick_die_acquisition') phaseHint = '🎲 Vyber velikost a umístění kostky';
  else if (state.pendingChoice?.kind === 'pick_skill') phaseHint = '🧠 Vyber dovednost';
  else if (state.pendingChoice?.kind === 'select_dirt_action') phaseHint = '🏜️ Vyber akci na Hlíně';
  else if (state.pendingChoice?.kind === 'select_tree_action') phaseHint = '🌳 Vyber akci na Stromě';
  else if (state.phase === 'devil_combat') phaseHint = '⚔️ Souboj s Čertem';
  else if (state.phase === 'using_field') phaseHint = '🌿 Klikni na pole pro využití (Sprint)';
  else if (mode === 'pickMove') phaseHint = '🐾 Klikni na cílový hex pro pohyb';
  else if (mode === 'pickField') phaseHint = '🌿 Klikni na pole pro využití';
  else if (mode === 'sleepMenu') phaseHint = '💤 Spánek — vyber akci';
  else if (canRoll) phaseHint = '🎲 Hoď kostkami nebo speciální akce';
  else if (rolled) phaseHint = '➡️ Vyber: Pohyb / Využij pole / Spánek';

  // Effective sum (raw + adjustment) pro turn banner
  const rawSum = (p.lastRoll || []).reduce((a, b) => a + b, 0);
  const adj = p.rollAdjustment ?? 0;
  const effectiveSum = rawSum + adj;

  return (
    <div className="app">
      <div className="topbar">
        <h1>🐾 Vombat</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {onShowRules && <button className="ghost" onClick={onShowRules}>📖 Pravidla</button>}
          {onShowProbabilities && <button className="ghost" onClick={onShowProbabilities}>🎲 P-osti</button>}
          {onShowStats && <button className="ghost" onClick={onShowStats}>📊 Stats</button>}
          {onNewGame && (
            <button
              className="ghost"
              onClick={() => {
                if (confirm('Opravdu zahodit rozehranou hru a začít novou?')) onNewGame();
              }}
            >
              ↺ Nová hra
            </button>
          )}
        </div>
      </div>

      {/* Last actions strip — co každý hráč naposled udělal */}
      <div className={`last-actions-strip players-${state.players.length}`}>
        {state.players.map((pl) => {
          const last = findLastActionFor(state.log, pl.name);
          const isCurrent = pl.id === p.id;
          return (
            <div
              key={pl.id}
              className={`last-action ${isCurrent ? 'current' : ''} ${last ? '' : 'empty'}`}
              style={{ borderLeftColor: pl.color }}
              title={last ?? 'Ještě nehrál'}
            >
              <div className="la-name" style={{ color: pl.color }}>{pl.name}</div>
              <div className="la-msg">
                {last ? (
                  <>
                    <span className="la-icon">{eventIcon(last)}</span>
                    <span className="la-text">{stripPlayerPrefix(last, pl.name)}</span>
                  </>
                ) : (
                  <span className="la-text">— ještě nehrál</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Turn banner — velký prominent indikátor čí je tah + co se zrovna děje */}
      <div className="turn-banner">
        <div className="color-band" style={{ background: p.color }} />
        <div className="who">
          <div className="who-label">{state.phase === 'game_over' ? 'Vítěz' : 'Na tahu'}</div>
          <div className="who-name" style={{ color: p.color }}>
            {state.phase === 'game_over' && state.winnerId
              ? state.players.find((pp) => pp.id === state.winnerId)?.name || '—'
              : p.name}
          </div>
          <div className="who-turn">Tah #{state.turnNumber} · {p.kind === 'ai' ? '🤖 AI' : '👤 Hráč'}</div>
        </div>
        {p.lastRoll && p.lastRoll.length > 0 && (
          <div className="roll-display">
            <div className="roll-dice">
              {p.lastRoll.map((val, i) => (
                <div key={i} className="roll-die" title={`Kostka 1k${p.hand[i] ?? '?'}`}>{val}</div>
              ))}
            </div>
            <div className="roll-sum">
              Σ {rawSum}
              {adj !== 0 && (
                <> {adj > 0 ? '+' : ''}{adj} = <span className="roll-sum-eff">{effectiveSum}</span></>
              )}
            </div>
          </div>
        )}
        {phaseHint && (
          <div className="phase-hint">{phaseHint}</div>
        )}
      </div>

      <div className="board-area">
        <HexBoard
          state={state}
          clickableHexes={clickable}
          actionableHexes={actionable}
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
              dispatch({ type: 'moveVombat', vombatId: moveTargets.v.id, targetHex: inspectHex });
              setInspectHex(null);
              setInspectPos(null);
            }}
            onUseField={() => {
              dispatch({ type: 'useField', hex: inspectHex });
              setInspectHex(null);
              setInspectPos(null);
            }}
          />
        )}
      </div>
      <div className="sidebar">
        {/* Player cards grid — 1 sloupec pro 2 hráče, 2 sloupce pro 3-4 */}
        <div className={`player-grid ${state.players.length >= 3 ? 'cols-2' : 'cols-1'}`}>
          {state.players.map((pl) => (
            <PlayerCard key={pl.id} player={pl} active={pl.id === p.id} state={state} />
          ))}
        </div>

        {/* Akce — vždy hned po hráčích, aby byl on-tah hráč rovnou vedle tlačítek */}
        <div className="panel">
          <h3>Akce</h3>
          <DiceTray player={p} />
          {state.phase === 'rolled' && !state.pendingChoice && <RollAdjustPanel state={state} dispatch={dispatch} />}
          {state.phase === 'game_over' ? (
            <div>
              <h2>🏆 Vítěz: {state.players.find((pp) => pp.id === state.winnerId)?.name}</h2>
              <p>Pro novou hru obnov stránku.</p>
            </div>
          ) : (
            <div className="action-buttons">
              {canRoll && (
                <>
                  {/* Pre-roll swap panel — visible only with Třídění (Klystýr).
                      Lets the player tune Hand shape before rolling. */}
                  {p.skills.has('klystyr') && (
                    <PreRollSwapPanel state={state} dispatch={dispatch} />
                  )}
                  <button
                    className="primary"
                    disabled={!adjDevilForMe || p.hand.length === 0}
                    onClick={() => dispatch({ type: 'beginDevilCombat', rolls: rollForCurrentPlayer(state) })}
                  >
                    ⚔️ Bojuj s Čertem (vyhlášení před hodem)
                  </button>
                  {p.hand.length > 0 ? (
                    <>
                      <button
                        className="primary"
                        onClick={() => dispatch({ type: 'rollDice', rolls: rollForCurrentPlayer(state) })}
                      >
                        🎲 Hoď kostkami ({p.hand.length})
                      </button>
                      <button
                        onClick={() => dispatch({ type: 'skipRollForPotatoes' })}
                        title={`Tah neházíš, místo toho dostaneš ${SKIP_ROLL_POTATOES} brambory. Vhodné když máš na sousední pole špatnou ruku — radši šetři.`}
                      >
                        🥔🥔 Neházej (vezmi {SKIP_ROLL_POTATOES} brambory)
                      </button>
                    </>
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
                <DevilCombatPanel state={state} dispatch={dispatch} />
              )}
              {state.phase === 'using_field' && p.skills.has('sprint') && (
                <div
                  style={{
                    padding: 10,
                    background: '#e8f4ff',
                    border: '1px solid #b8d4f0',
                    borderRadius: 6,
                    fontSize: 13,
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>
                    🏃 Sprint — klikni na pole svého Vombata pro využití,
                  </div>
                  <div style={{ color: 'var(--muted)', marginBottom: 8 }}>
                    nebo vynechat a ukončit tah:
                  </div>
                  <button onClick={() => dispatch({ type: 'endTurnNow' })}>
                    ⏭️ Vynechat Sprint a ukončit tah
                  </button>
                </div>
              )}
            </div>
          )}
          {state.pendingChoice?.kind === 'attack_surrender' && (
            <AttackModal state={state} dispatch={dispatch} />
          )}
          {state.pendingChoice?.kind === 'select_dirt_action' && (
            <DirtActionModal state={state} dispatch={dispatch} />
          )}
          {state.pendingChoice?.kind === 'select_tree_action' && (
            <TreeActionModal state={state} dispatch={dispatch} />
          )}
          {state.pendingChoice?.kind === 'pick_skill' && (
            <SkillModal state={state} dispatch={dispatch} />
          )}
          {state.pendingChoice?.kind === 'pick_die_acquisition' && (
            <DieAcquisitionModal state={state} dispatch={dispatch} />
          )}
          {mode === 'sleepMenu' && (
            <SleepModal
              state={state}
              dispatch={(a) => {
                // Any Sleep action ends the turn — also close the modal.
                dispatch(a);
                setMode('idle');
              }}
              close={() => setMode('idle')}
            />
          )}
        </div>
        <TaskRewardsPanel state={state} />
        <FormationsPanel state={state} />
        {allWoundsTaken(state, p.id) && state.phase !== 'devil_combat' && (
          <div
            className="panel"
            style={{
              background: '#fff3d4',
              borderColor: 'var(--accent)',
              fontSize: 12,
              color: 'var(--accent-dark)',
              fontWeight: 600,
            }}
          >
            🎯 Tvoje 4 zranění Čerta zasazena. V boji teď hoď součet ≥25 pro vítězství!
          </div>
        )}
        <details className="panel">
          <summary>📜 Log</summary>
          <div className="log">
            {state.log.slice(0, 60).map((e, i) => (
              <div key={i} className="entry" style={{ display: 'flex', gap: 4, alignItems: 'flex-start' }}>
                <span style={{ minWidth: 18 }}>{eventIcon(e)}</span>
                <span style={{ flex: 1 }}>{e}</span>
              </div>
            ))}
          </div>
        </details>
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
    cat: cell.catAlive ? '🐱 Kočka (11-14 = rozdrtit zadkem)' : '🕳️ Rozdrcená kočka (tunel)',
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
      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>
        Pozice ({hex.q},{hex.r}) · Tvůj hod: <strong>{sum}</strong>
        {cell.thornDieLevel && <> · Kostka: 1k{cell.thornDieLevel}</>}
      </div>
      {cell.marker && (() => {
        const owner = state.players.find((pl) => pl.id === cell.marker!.playerId);
        const mine = cell.marker.playerId === p.id;
        const markerEmoji = cell.marker.kind === 'mrkev' ? '🥕' : '💩';
        // Takeover possible only on Záhon / Eukalyptus, and only opponent markers.
        const canBeTakenOver =
          !mine && (cell.type === 'bed' || cell.type === 'tree');
        // Hlína with opponent's mrkev can be "stolen" + used for new action
        const canStealMrkev =
          !mine && cell.type === 'dirt' && cell.marker.kind === 'mrkev';
        return (
          <div
            style={{
              fontSize: 12,
              padding: 6,
              background: mine ? '#d4f0c4' : '#f9efd9',
              border: `1px solid ${mine ? '#6db347' : '#d6a35d'}`,
              borderRadius: 4,
              marginBottom: 8,
            }}
          >
            <div>
              {markerEmoji}{' '}
              <strong style={{ color: owner?.color }}>
                {mine ? 'TVŮJ' : owner?.name}
              </strong>{' '}
              {cell.marker.kind === 'mrkev' ? 'mrkev' : 'bobek'}
            </div>
            {mine && (
              <div style={{ color: '#2d4f1a', marginTop: 2 }}>
                ✗ Pole jsi už <strong>využil</strong> — nelze znovu.
              </div>
            )}
            {canBeTakenOver && (
              <div style={{ color: '#8a5a1a', marginTop: 2 }}>
                ↻ Můžeš <strong>přebrat</strong> (obsadit svým markerem).
              </div>
            )}
            {canStealMrkev && (
              <div style={{ color: '#8a5a1a', marginTop: 2 }}>
                ✂️ Můžeš odstranit a Hlínu využít pro jinou akci.
              </div>
            )}
            {!mine && !canBeTakenOver && !canStealMrkev && (
              <div style={{ color: '#666', marginTop: 2 }}>
                ✗ Pole je obsazeno soupeřem — nelze využít.
              </div>
            )}
          </div>
        );
      })()}
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

function AttackModal({ state, dispatch }: { state: GameState; dispatch: (a: Action) => void }) {
  const pc = state.pendingChoice;
  if (pc?.kind !== 'attack_surrender') return null;
  const p = state.players.find((pp) => pp.id === pc.playerId)!;
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h2>⚠️ Útok {pc.from === 'cat' ? 'Kočky' : 'Čerta'}!</h2>
        <p>{p.name}, musíš odevzdat 1 bramboru nebo 1 kostku.</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            disabled={p.potatoes <= 0}
            onClick={() => dispatch({ type: 'resolveAttackWithPotato' })}
          >
            🥔 Odevzdat bramboru ({p.potatoes})
          </button>
          {p.hand.map((d, i) => (
            <button
              key={`h${i}`}
              onClick={() => dispatch({ type: 'resolveAttackWithDie', location: 'hand', index: i })}
            >
              ✋ Odevzdat 1k{d}
            </button>
          ))}
          {p.reserve.map((d, i) => (
            <button
              key={`r${i}`}
              onClick={() => dispatch({ type: 'resolveAttackWithDie', location: 'reserve', index: i })}
            >
              📦 Odevzdat 1k{d} (Zásoba)
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function DirtActionModal({ state, dispatch }: { state: GameState; dispatch: (a: Action) => void }) {
  const pc = state.pendingChoice;
  if (pc?.kind !== 'select_dirt_action') return null;
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h2 style={{ margin: 0 }}>Hlína / Poušť — vyber akci</h2>
          <button onClick={() => dispatch({ type: 'cancelPendingChoice' })}>✕ Storno</button>
        </div>
        <div className="actions" style={{ marginTop: 8 }}>
          <button onClick={() => dispatch({ type: 'useField', hex: pc.hex, dirtAction: 'plant' })}>
            🥕 Zasaď mrkev
          </button>
          <button onClick={() => dispatch({ type: 'useField', hex: pc.hex, dirtAction: 'poop' })}>
            💩 Vyformuj kostku
          </button>
          <button onClick={() => dispatch({ type: 'useField', hex: pc.hex, dirtAction: 'learn' })}>
            🧠 Uč se dovednost
          </button>
        </div>
      </div>
    </div>
  );
}

function SkillModal({ state, dispatch }: { state: GameState; dispatch: (a: Action) => void }) {
  const pc = state.pendingChoice;
  if (pc?.kind !== 'pick_skill') return null;
  const p = currentPlayer(state);
  const skills = Object.keys(SKILL_REQUIREMENTS) as SkillId[];
  // Anything affordable?
  const anyAffordable = skills.some((sid) => {
    if (p.skills.has(sid)) return false;
    const req = SKILL_REQUIREMENTS[sid];
    return p.bobekTrack >= req.trees || p.bobekTrack * 3 + p.potatoes >= req.trees * 3;
  });
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h2 style={{ margin: 0 }}>🧠 Uč se</h2>
          <button onClick={() => dispatch({ type: 'cancelPendingChoice' })}>✕ Storno</button>
        </div>
        <p style={{ marginTop: 6 }}>
          Vyber dovednost. Stromy: <strong>{p.bobekTrack}</strong> 🌳 ·
          Brambory: <strong>{p.potatoes}</strong> 🥔
        </p>
        <p style={{ fontSize: 12, color: 'var(--muted)' }}>
          1 chybějící strom lze nahradit 3 🥔 brambory.
        </p>
        {!anyAffordable && (
          <p style={{ fontSize: 13, color: '#a05e2e', fontWeight: 600 }}>
            ⚠️ Žádnou dovednost si momentálně nemůžeš naučit. Klikni „Storno“
            a zvol jinou akci na Hlíně.
          </p>
        )}
        {skills.map((sid) => {
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
                  onClick={() =>
                    dispatch({
                      type: 'learnSkill',
                      skill: sid,
                      treesUsed: req.trees,
                      potatoesUsed: 0,
                      diceUsed: [],
                    })
                  }
                >
                  {owned ? '✓ Naučeno' : `Naučit (${req.trees}× strom)`}
                </button>
                <button
                  disabled={owned || !enoughViaPotato || p.bobekTrack >= req.trees}
                  onClick={() => {
                    const treesAvailable = Math.min(p.bobekTrack, req.trees);
                    const missing = req.trees - treesAvailable;
                    dispatch({
                      type: 'learnSkill',
                      skill: sid,
                      treesUsed: treesAvailable,
                      potatoesUsed: missing * 3,
                      diceUsed: [],
                    });
                  }}
                >
                  Nahradit {req.trees - Math.min(p.bobekTrack, req.trees)}× 🥔×3
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Modal shown when the player uses an Eukalyptus and tree-learn is available.
function TreeActionModal({ state, dispatch }: { state: GameState; dispatch: (a: Action) => void }) {
  const pc = state.pendingChoice;
  if (pc?.kind !== 'select_tree_action') return null;
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h2 style={{ margin: 0 }}>🌳 Eukalyptový strom — vyber akci</h2>
          <button onClick={() => dispatch({ type: 'cancelPendingChoice' })}>✕ Storno</button>
        </div>
        <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
          Můžeš si jen <strong>obsadit strom</strong>, nebo zároveň využít k <strong>učení dovednosti</strong>.
          Učení přes strom je možné <strong>1× per strom per hráč</strong> — když navštívíš jiný Eukalyptus,
          můžeš ho použít znovu.
        </p>
        <div className="actions" style={{ marginTop: 10 }}>
          <button
            className="primary"
            onClick={() => dispatch({ type: 'useField', hex: pc.hex, treeAction: 'occupy' })}
          >
            💩 Jen obsadit (+1 strom)
          </button>
          <button
            onClick={() => dispatch({ type: 'useField', hex: pc.hex, treeAction: 'occupy_and_learn' })}
          >
            🌳🧠 Obsadit + Uč se dovednost (1× pro tento strom)
          </button>
        </div>
      </div>
    </div>
  );
}

// Modal shown when a human player gains a die — lets them choose size
// (any ≤ offered) and placement (Hand / Reserve / Pending).
function DieAcquisitionModal({ state, dispatch }: { state: GameState; dispatch: (a: Action) => void }) {
  const pc = state.pendingChoice;
  if (pc?.kind !== 'pick_die_acquisition') return null;
  const p = currentPlayer(state);
  const offered = pc.offered;
  const allLevels: DiceLevel[] = [2, 4, 6, 8, 12, 20];
  const offeredIdx = allLevels.indexOf(offered);
  const sizeOptions = allLevels.slice(0, offeredIdx + 1).reverse(); // biggest first

  function handFits(lvl: DiceLevel): boolean {
    if (p.skills.has('kapacita')) return true;
    return p.hand.filter((d) => d === lvl).length < 2;
  }
  function reserveFits(): boolean {
    if (p.skills.has('kapacita')) return true;
    return p.reserve.length < 3;
  }

  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ maxWidth: 520 }}>
        <h2 style={{ margin: '0 0 6px' }}>🎲 Získáváš kostku!</h2>
        <p style={{ margin: 0, color: 'var(--muted)' }}>
          Zdroj: <strong>{pc.source}</strong> · Maximum: <strong>1k{offered}</strong>
        </p>
        {pc.breakdown && pc.breakdown.length > 0 && (
          <div
            style={{
              marginTop: 8,
              padding: 8,
              background: '#fff5e0',
              border: '1px solid #e8c997',
              borderRadius: 6,
              fontSize: 12,
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 4 }}>📐 Jak vyšla velikost:</div>
            {pc.breakdown.map((b, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{b.label}</span>
                <strong>{b.value >= 0 ? `+${b.value}` : b.value}</strong>
              </div>
            ))}
            {pc.totalScore != null && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginTop: 4,
                  paddingTop: 4,
                  borderTop: '1px dashed #d6c8a9',
                  fontWeight: 700,
                }}
              >
                <span>Σ skóre</span>
                <span>{pc.totalScore} → 1k{offered}</span>
              </div>
            )}
            <div style={{ marginTop: 4, color: 'var(--muted)', fontStyle: 'italic' }}>
              Stupnice: 1→k2 · 2→k4 · 3→k6 · 4→k8 · 5–7→k12 · 8+→k20
            </div>
          </div>
        )}
        <p style={{ margin: '8px 0 4px', fontSize: 13 }}>
          Můžeš si vzít kostku až do velikosti <strong>1k{offered}</strong>, nebo libovolnou menší.
          Vyber kam ji chceš umístit:
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
          {sizeOptions.map((lvl) => {
            const handCanFit = handFits(lvl);
            const reserveCanFit = reserveFits();
            return (
              <div
                key={lvl}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  padding: 8,
                  background: lvl === offered ? '#fff5e0' : '#fafafa',
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: 4 }}>
                  1k{lvl} {lvl === offered && '(max)'}
                  {lvl !== offered && (
                    <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400 }}>
                      {' '}— menší, místo 1k{offered}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button
                    disabled={!handCanFit}
                    onClick={() => dispatch({ type: 'resolveDieAcquisition', level: lvl, location: 'hand' })}
                    title={handCanFit ? '' : 'Ruka — limit "max 2 stejného lvl"'}
                  >
                    ✋ Ruka
                  </button>
                  <button
                    disabled={!reserveCanFit}
                    onClick={() => dispatch({ type: 'resolveDieAcquisition', level: lvl, location: 'reserve' })}
                    title={reserveCanFit ? '' : 'Zásoba — limit 3 kostek'}
                  >
                    📦 Zásoba
                  </button>
                  {!handCanFit && !reserveCanFit && (
                    <button
                      onClick={() => dispatch({ type: 'resolveDieAcquisition', level: lvl, location: 'pending' })}
                    >
                      📥 Čekající (do uvolnění Kapacitou)
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10 }}>
          💡 Tip: malé kostky se hodí pro pohyb na Hlínu (2-4) a Záhon (4-6). Velké kostky na fight s Čertem
          drž v Zásobě, abys mohl navigovat.
        </p>
      </div>
    </div>
  );
}

// =============================================================================
// RollAdjustPanel — utratit brambor pro ±1 k hodu
// =============================================================================
// Rendered in 'rolled' phase. Each ±1 costs 1 🥔, max 2 adjustments per turn
// (= ±2 max). NOT available in Devil combat (per-die mechanic there).
function RollAdjustPanel({
  state, dispatch,
}: { state: GameState; dispatch: (a: Action) => void }) {
  const p = currentPlayer(state);
  if (!p.lastRoll || p.lastRoll.length === 0) return null;
  const rawSum = (p.lastRoll || []).reduce((a, b) => a + b, 0);
  const adj = p.rollAdjustment ?? 0;
  const effective = rawSum + adj;
  const remaining = rollAdjustmentsRemaining(state);
  const canMinus = remaining > 0 && p.potatoes > 0 && effective > 0;
  const canPlus = remaining > 0 && p.potatoes > 0;
  return (
    <div
      style={{
        marginTop: 8,
        padding: 8,
        background: '#fff5e0',
        border: '1px solid #e8c997',
        borderRadius: 6,
        fontSize: 12,
      }}
    >
      <div style={{ marginBottom: 6 }}>
        <strong>Účinný součet:</strong> {rawSum}
        {adj !== 0 && (
          <> {adj > 0 ? '+' : ''}{adj} = <strong style={{ color: 'var(--accent)' }}>{effective}</strong></>
        )}
        {' · '}
        <span style={{ color: 'var(--muted)' }}>
          úprav zbývá {remaining}/{ROLL_ADJUSTMENT_LIMIT} · 🥔 {p.potatoes}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          disabled={!canMinus}
          onClick={() => dispatch({ type: 'adjustRoll', delta: -1 })}
          title="Utratíš 1 🥔 a součet hodu se sníží o 1 (efektivní rozsah polí se posune)."
        >
          🥔 −1
        </button>
        <button
          disabled={!canPlus}
          onClick={() => dispatch({ type: 'adjustRoll', delta: +1 })}
          title="Utratíš 1 🥔 a součet hodu se zvýší o 1 (efektivní rozsah polí se posune)."
        >
          🥔 +1
        </button>
      </div>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
        💡 1 🥔 = ±1 k součtu, max 2 úpravy/tah. Neplatí pro souboj s Čertem.
      </div>
    </div>
  );
}

// =============================================================================
// PreRollSwapPanel — Třídění (Klystýr) ladění Ruky před hodem
// =============================================================================
// Rendered in idle phase when player has Třídění. Lets the player do up to
// 3 free swap operations BEFORE rolling — Hand ↔ Reserve. The whole point:
// deck-building agency every turn. After rolling, swaps go back to Sleep.
function PreRollSwapPanel({
  state, dispatch,
}: { state: GameState; dispatch: (a: Action) => void }) {
  const p = currentPlayer(state);
  const remaining = preRollSwapsRemaining(state);
  const used = PRE_ROLL_SWAP_LIMIT - remaining;
  if (remaining === 0 && used === 0) return null; // shouldn't happen — guard
  return (
    <div
      style={{
        padding: 8,
        marginBottom: 6,
        background: '#fff5e0',
        border: '1px solid #e8c997',
        borderRadius: 6,
        fontSize: 12,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 4 }}>
        🔄 Třídění před hodem · {remaining} / {PRE_ROLL_SWAP_LIMIT} zbývá
      </div>
      <div style={{ color: 'var(--muted)', marginBottom: 6 }}>
        Můžeš teď zdarma přesouvat kostky Ruka ↔ Zásoba. Připrav si ruku na pole, která chceš
        aktivovat.
      </div>
      {remaining === 0 ? (
        <div style={{ color: 'var(--muted)', fontStyle: 'italic' }}>
          Limit výměn vyčerpán. Hoď kostkami nebo Spi.
        </div>
      ) : (
        <>
          {p.hand.length > 0 && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 4 }}>
              <span style={{ alignSelf: 'center', fontSize: 11, color: 'var(--muted)' }}>
                ✋→📦:
              </span>
              {p.hand.map((d, i) => (
                <button
                  key={`pr-h2r${i}`}
                  style={{ padding: '2px 8px', fontSize: 11 }}
                  onClick={() => dispatch({ type: 'preRollSwap', op: { op: 'hand_to_reserve', index: i } })}
                  title={`Přesun 1k${d} do Zásoby (Třídění zdarma)`}
                >
                  1k{d}
                </button>
              ))}
            </div>
          )}
          {p.reserve.length > 0 && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              <span style={{ alignSelf: 'center', fontSize: 11, color: 'var(--muted)' }}>
                📦→✋:
              </span>
              {p.reserve.map((d, i) => (
                <button
                  key={`pr-r2h${i}`}
                  style={{ padding: '2px 8px', fontSize: 11 }}
                  onClick={() => dispatch({ type: 'preRollSwap', op: { op: 'reserve_to_hand', index: i } })}
                  title={`Přesun 1k${d} do Ruky (Třídění zdarma)`}
                >
                  1k{d}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SleepModal({
  state,
  dispatch,
  close,
}: {
  state: GameState;
  dispatch: (a: Action) => void;
  close: () => void;
}) {
  const p = currentPlayer(state);
  // Swap operations are STAGED before commit — necessary so that with Třídění
  // (klystyr) the player can build up multiple swap ops in one Sleep action.
  // Without Třídění, max 1 op is allowed. The committed sleep('swap', ops) is
  // a SINGLE engine action that ends the turn, matching the rules.
  const [stagedOps, setStagedOps] = useState<SwapOp[]>([]);
  const hasKlystyr = p.skills.has('klystyr');
  const maxSwaps = hasKlystyr ? 99 : 1;

  // Compute simulated hand/reserve after applying staged ops. This drives the
  // button indices so the user sees the post-swap state.
  const simHand: DiceLevel[] = [...p.hand];
  const simReserve: DiceLevel[] = [...p.reserve];
  for (const op of stagedOps) {
    if (op.op === 'hand_to_reserve') {
      const lvl = simHand[op.index];
      if (lvl == null) continue;
      simHand.splice(op.index, 1);
      simReserve.push(lvl);
    } else if (op.op === 'reserve_to_hand') {
      const lvl = simReserve[op.index];
      if (lvl == null) continue;
      simReserve.splice(op.index, 1);
      simHand.push(lvl);
    }
    // 'swap' (in-place exchange) not exposed through current UI buttons.
  }
  const swapsLeft = maxSwaps - stagedOps.length;
  const otherActionsDisabled = stagedOps.length > 0;

  function stage(op: SwapOp) {
    if (stagedOps.length >= maxSwaps) return;
    setStagedOps([...stagedOps, op]);
  }
  function commitSwaps() {
    if (stagedOps.length === 0) return;
    dispatch({ type: 'sleep', sleepAction: { kind: 'swap', ops: stagedOps } });
    // Parent's dispatch wrapper closes the modal.
  }

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h2>💤 Spánek</h2>
        <p>{p.name}, vyber akci spánku (alternativa k využití hodu):</p>

        {/* Staged-swaps banner */}
        {stagedOps.length > 0 && (
          <div
            style={{
              padding: 8,
              marginBottom: 8,
              background: '#fff5e0',
              border: '1px solid #e8c997',
              borderRadius: 6,
              fontSize: 12,
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 4 }}>
              🔄 Naplánováno {stagedOps.length} {stagedOps.length === 1 ? 'výměna' : stagedOps.length < 5 ? 'výměny' : 'výměn'}
              {hasKlystyr && <> · Třídění: zbývá {swapsLeft === 99 ? '∞' : swapsLeft}</>}
            </div>
            <div style={{ marginBottom: 6 }}>
              <strong>Po výměnách:</strong> ✋ {simHand.length > 0 ? simHand.map((d) => `1k${d}`).join(' ') : '—'}
              {' · '}📦 {simReserve.length > 0 ? simReserve.map((d) => `1k${d}`).join(' ') : '—'}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="primary" onClick={commitSwaps}>
                ✅ Provést výměny
              </button>
              <button onClick={() => setStagedOps([])}>↺ Reset</button>
            </div>
          </div>
        )}

        <div className="actions">
          <button
            disabled={otherActionsDisabled}
            title={otherActionsDisabled ? 'Nejdřív proveď naplánované výměny (✅) nebo je resetuj.' : ''}
            onClick={() => dispatch({ type: 'sleep', sleepAction: { kind: 'gain_potato' } })}
          >
            🥔 Získej 1 bramboru
          </button>
          <button
            disabled={otherActionsDisabled}
            onClick={() => {
              const targets = p.hand.map((_, i) => ({ location: 'hand' as const, index: i }));
              dispatch({ type: 'sleep', sleepAction: { kind: 'downgrade_dice', targets } });
            }}
          >
            ⬇️ Downgrade všech kostek v Ruce
          </button>
          {/* Swap buttons: STAGE instead of immediate commit. With Třídění,
              user can chain multiple; without, max 1. */}
          {simHand.map((d, i) => (
            <button
              key={`s2r${i}`}
              disabled={stagedOps.length >= maxSwaps}
              title={
                stagedOps.length >= maxSwaps
                  ? hasKlystyr
                    ? 'Limit výměn vyčerpán (interní strop).'
                    : 'Bez dovednosti Třídění lze provést jen 1 výměnu za Spánek.'
                  : 'Naplánovat: přesun 1k' + d + ' do Zásoby'
              }
              onClick={() => stage({ op: 'hand_to_reserve', index: i })}
            >
              ✋→📦 1k{d}
            </button>
          ))}
          {simReserve.map((d, i) => (
            <button
              key={`r2h${i}`}
              disabled={stagedOps.length >= maxSwaps}
              onClick={() => stage({ op: 'reserve_to_hand', index: i })}
            >
              📦→✋ 1k{d}
            </button>
          ))}
          {p.skills.has('masaz_strev') && p.hand.map((d, i) => (
            <button
              key={`up${i}`}
              disabled={otherActionsDisabled || d === 20}
              title={d === 20 ? 'k20 je max, nelze dál upgradnout' : `Upgrade 1k${d} o 2 lvly (Žvýkání)`}
              onClick={() =>
                dispatch({
                  type: 'sleep',
                  sleepAction: { kind: 'upgrade_die', location: 'hand', index: i },
                })
              }
            >
              ⬆️⬆️ Upgrade 1k{d} (+2 lvly)
            </button>
          ))}
          <button
            disabled={otherActionsDisabled}
            onClick={() => dispatch({ type: 'sleep', sleepAction: { kind: 'skip' } })}
          >
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
                    onClick={() => dispatch({ type: 'sleep', sleepAction: { kind: 'buy_skill', skill: sid } })}
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

function DevilCombatPanel({ state, dispatch }: { state: GameState; dispatch: (a: Action) => void }) {
  const p = currentPlayer(state);
  const taken = state.devilWounds.woundsByPlayer[p.id];
  const allTaken = allWoundsTaken(state, p.id);
  return (
    <div>
      <DiceTray player={p} />
      <p style={{ fontSize: 13, marginTop: 8 }}>
        {allTaken
          ? 'Všechna zranění zasazena. Pro smrtelnou ránu musíš hodit ≥25 na SAMOSTATNÝ hod (klikni "Hoď znovu"). Zbylé kostky z hodu po zraněních se nepočítají.'
          : 'Pro každou kostku zvol, na které zranění ji použít (1, 2, 7+, 10+).'}
      </p>
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
                onClick={() => dispatch({ type: 'applyDevilWound', diceIndex: i, wound: w })}
              >
                {w}
              </button>
            );
          })}
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button
          className="primary"
          onClick={() => dispatch({ type: 'devilContinueRoll', rolls: rollForCurrentPlayer(state) })}
        >
          🎲 Hoď znovu{allTaken ? ' (smrtelná rána = 25+)' : ''}
        </button>
        <button onClick={() => dispatch({ type: 'devilStop' })}>Ukončit boj</button>
      </div>
    </div>
  );
}

// =============================================================================
// FormationsPanel — sidebar progress for the 3 formation objectives
// =============================================================================
// Shows per-formation status: which players already claimed it (in order),
// and for each LIVE player, how close they are. Helps the player see at a
// glance whether they should chase a formation or focus on the devil.
function FormationsPanel({ state }: { state: GameState }) {
  const formations: FormationKind[] = ['primka5', 'obkliceni', 'pruzkumnik'];
  // Quick per-player marker counts per tile — used for Průzkumník progress.
  function tilesCovered(playerId: string): number {
    const tiles = new Set<number>();
    state.board.forEach((c) => {
      if (c.marker && c.marker.playerId === playerId) tiles.add(c.tileId);
    });
    return tiles.size;
  }
  function markerCount(playerId: string): number {
    let n = 0;
    state.board.forEach((c) => {
      if (c.marker && c.marker.playerId === playerId) n++;
    });
    return n;
  }
  return (
    <div className="panel">
      <h3>🏅 Úkoly (formace)</h3>
      <p style={{ fontSize: 11, color: 'var(--muted)', margin: '0 0 8px' }}>
        Splníš formaci → odměna podle pořadí: 1.&nbsp;<strong>1k20</strong>, 2.&nbsp;<strong>1k12</strong>, 3.&nbsp;<strong>1k6</strong>.
        Každý hráč jen 1× každou formaci.
      </p>
      {formations.map((f) => {
        const claims = state.completedFormations.filter((c) => c.formation === f);
        return (
          <div key={f} style={{ borderTop: '1px solid #eee', padding: '6px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <strong>{FORMATION_LABEL[f]}</strong>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                {claims.length === 0
                  ? 'nikdo'
                  : `${claims.length}/${state.players.length}`}
              </span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
              {FORMATION_DESC[f]}
            </div>
            {claims.length > 0 && (
              <div style={{ fontSize: 11, marginTop: 3 }}>
                Pořadí:{' '}
                {claims.map((c, i) => {
                  const pl = state.players.find((pp) => pp.id === c.playerId);
                  const reward = FORMATION_REWARDS[Math.min(i, FORMATION_REWARDS.length - 1)];
                  return (
                    <span key={i} style={{ color: pl?.color, fontWeight: 600 }}>
                      {i + 1}. {pl?.name} {reward ? `(1k${reward})` : '(∅)'}
                      {i < claims.length - 1 ? ' · ' : ''}
                    </span>
                  );
                })}
              </div>
            )}
            {f === 'pruzkumnik' && (
              <div style={{ fontSize: 11, marginTop: 2 }}>
                {state.players.map((pl) => {
                  const cov = tilesCovered(pl.id);
                  return (
                    <div key={pl.id} style={{ color: pl.color }}>
                      {pl.name}: {cov}/6 dílků
                    </div>
                  );
                })}
              </div>
            )}
            {f === 'primka5' && (
              <div style={{ fontSize: 11, marginTop: 2 }}>
                {state.players.map((pl) => {
                  const diag = primka5Diagnostic(state, pl.id);
                  const alreadyDone = state.completedFormations.some(
                    (c) => c.playerId === pl.id && c.formation === 'primka5'
                  );
                  let detail: string;
                  if (alreadyDone) {
                    detail = '✅ splněno';
                  } else if (diag.isComplete) {
                    detail = `✅ ${diag.bestRunLen} v řadě (čeká na detekci)`;
                  } else if (diag.bestRunLen >= 5 && diag.blockerOppHex) {
                    detail = `⚠️ ${diag.bestRunLen} v řadě, ale BLOKOVÁNO značkou soupeře v (${diag.blockerOppHex.q},${diag.blockerOppHex.r}) sousedící s linkou`;
                  } else {
                    detail = `${diag.bestRunLen}/5 nejdelší souvislá řada`;
                  }
                  return (
                    <div key={pl.id} style={{ color: pl.color, fontSize: 10, marginBottom: 1 }}>
                      <strong>{pl.name}</strong>: {markerCount(pl.id)} značek · {detail}
                    </div>
                  );
                })}
              </div>
            )}
            {f === 'obkliceni' && (
              <div style={{ fontSize: 11, marginTop: 2 }}>
                {state.players.map((pl) => {
                  const diag = obkliceniDiagnostic(state, pl.id);
                  const alreadyDone = state.completedFormations.some(
                    (c) => c.playerId === pl.id && c.formation === 'obkliceni'
                  );
                  let detail: string;
                  if (alreadyDone) {
                    detail = '✅ splněno';
                  } else if (diag.isComplete) {
                    detail = `✅ ${diag.maxNeighbors}/6 (čeká na detekci)`;
                  } else {
                    detail = `nejvíc ${diag.maxNeighbors}/6 značek kolem soupeře (potřeba 4)`;
                  }
                  return (
                    <div key={pl.id} style={{ color: pl.color, fontSize: 10, marginBottom: 1 }}>
                      <strong>{pl.name}</strong>: {detail}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// =============================================================================
// TaskRewardsPanel — náhodné přiřazení schopností k úkolům (per hra)
// =============================================================================
// Před startem hry se každá z 5 schopností náhodně přiřadí jednomu z 5 úkolů
// (3 formace + 1. kočka + 1. zranění Čerta). Panel ukazuje které schopnosti
// jsou v této hře k dispozici za který úkol a u kterých hráčů už byla
// rozdána (= odškrtnuto).
function TaskRewardsPanel({ state }: { state: GameState }) {
  const TASK_ICONS: Record<TaskKey, string> = {
    primka5: '📏',
    obkliceni: '🛡️',
    pruzkumnik: '🧭',
    devilWound: '⚔️',
    catSmash: '🐱',
  };
  return (
    <div className="panel">
      <h3>🎁 Odměny za úkoly (náhodné)</h3>
      <p style={{ fontSize: 11, color: 'var(--muted)', margin: '0 0 8px' }}>
        Každý úkol uděluje schopnost <strong>poprvé per hráč</strong>.
        Formace navíc dávají kostku (k20/k12/k6) podle pořadí.
      </p>
      {ALL_TASK_KEYS.map((tk) => {
        const skill = state.taskRewards?.[tk];
        const skillLabel = skill ? SKILL_REQUIREMENTS[skill]?.label ?? skill : '—';
        return (
          <div
            key={tk}
            style={{
              padding: '4px 6px',
              borderTop: '1px solid #eee',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              fontSize: 12,
            }}
          >
            <span>
              {TASK_ICONS[tk]} {TASK_LABEL[tk]}
            </span>
            <span style={{ fontWeight: 600 }}>{skillLabel}</span>
          </div>
        );
      })}
      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
        Splnili:
        <div style={{ marginTop: 2 }}>
          {state.players.map((pl) => {
            const granted = state.taskRewardsGranted?.[pl.id] ?? [];
            return (
              <div key={pl.id} style={{ color: pl.color }}>
                {pl.name}:{' '}
                {granted.length === 0
                  ? <em style={{ color: 'var(--muted)' }}>—</em>
                  : granted.map((tk) => TASK_ICONS[tk]).join(' ')}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
