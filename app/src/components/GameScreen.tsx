import { useMemo, useState } from 'react';
import type { GameState, Hex, DiceLevel, SkillId, WoundType } from '../game/types';
import { hexKey, WOUND_TYPES } from '../game/types';
import { HexBoard } from './HexBoard';
import { PlayerBoard } from './PlayerBoard';
import { DiceTray } from './DiceTray';
import {
  rollDice, legalMoveTargets, moveVombat, canUseField, useField,
  endTurnNow, resolveAttackWithPotato, resolveAttackWithDie, sleep,
  canFightDevil, beginDevilCombat, applyDevilWound, devilContinueRoll, devilStop,
  allWoundsTaken, currentPlayer, SKILL_REQUIREMENTS, learnSkill,
} from '../game/engine';

export interface GameScreenProps {
  state: GameState;
  setState: (s: GameState) => void;
}

type Mode = 'idle' | 'pickMove' | 'pickField' | 'sleepMenu';

export function GameScreen({ state, setState }: GameScreenProps) {
  const p = state.players[state.currentPlayerIdx];
  const [mode, setMode] = useState<Mode>('idle');
  const [selectedVombatId, setSelectedVombatId] = useState<string | null>(null);

  // Compute clickable hexes per mode
  const clickable = useMemo(() => {
    if (state.phase === 'using_field' && p.skills.has('sprint')) {
      // After Sprint move — let player click the hex they moved onto
      // Simplest: any hex with their vombat
      return p.vombats.map((v) => v.hex);
    }
    if (mode === 'pickMove') {
      const v = p.vombats.find((vv) => vv.id === selectedVombatId);
      if (!v) return p.vombats.map((vv) => vv.hex); // pick a vombat first
      return legalMoveTargets(state, v.hex);
    }
    if (mode === 'pickField') {
      // any usable adjacent/standing hex
      const hexes: Hex[] = [];
      state.board.forEach((c) => {
        if (canUseField(state, c.hex)) hexes.push(c.hex);
      });
      return hexes;
    }
    return [];
  }, [mode, selectedVombatId, p, state]);

  function onHexClick(hex: Hex) {
    if (state.phase === 'using_field' && p.skills.has('sprint')) {
      setState(useField(state, hex));
      return;
    }
    if (mode === 'pickMove') {
      const v = p.vombats.find((vv) => vv.id === selectedVombatId);
      if (!v) {
        const tap = p.vombats.find((vv) => vv.hex.q === hex.q && vv.hex.r === hex.r);
        if (tap) setSelectedVombatId(tap.id);
        return;
      }
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
  }

  const canRoll = state.phase === 'idle';
  const rolled = state.phase === 'rolled' || state.phase === 'choose_action';

  // Detect post-roll combat-against-devil opportunity
  const adjDevilForMe = p.vombats.some((v) => canFightDevil(state, v.hex));

  return (
    <div className="app">
      <div className="topbar">
        <h1>🐾 Vombat</h1>
        <div className="turn-badge" style={{ color: p.color }}>
          Tah: {p.name}
        </div>
      </div>
      <div className="board-area">
        <HexBoard
          state={state}
          clickableHexes={clickable}
          onHexClick={onHexClick}
        />
      </div>
      <div className="sidebar">
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
                  <button className="primary" onClick={() => setState(rollDice(state))}>
                    🎲 Hoď kostkami ({p.hand.length})
                  </button>
                  <button onClick={() => setMode('sleepMenu')}>💤 Spánek</button>
                </>
              )}
              {rolled && !state.pendingChoice && (
                <>
                  <button onClick={() => { setMode('pickMove'); setSelectedVombatId(null); }}>
                    🐾 Pohyb (vyber Vombata → cílové pole)
                  </button>
                  <button onClick={() => setMode('pickField')}>
                    🌿 Využij pole (vyber pole)
                  </button>
                  <button onClick={() => setMode('sleepMenu')}>
                    💤 Spánek (zruš hod, využij speciální akci)
                  </button>
                </>
              )}
              {state.phase === 'devil_combat' && (
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
            <SleepModal state={state} setState={setState} close={() => setMode('idle')} />
          )}
        </div>
        <div className="panel">
          <h3>Čertova zranění ({p.name})</h3>
          <div className="devil-tracker">
            {WOUND_TYPES.map((w) => {
              const die = state.devilWounds.woundsByPlayer[p.id][w];
              return (
                <div key={w} className={`wound-slot ${die ? 'taken' : ''}`}>
                  <div style={{ fontWeight: 700 }}>{w}</div>
                  <div style={{ fontSize: 10 }}>{die ? `1k${die}` : '—'}</div>
                </div>
              );
            })}
          </div>
          {allWoundsTaken(state, p.id) && (
            <p style={{ color: '#a05e2e', marginTop: 8 }}>
              Všechna zranění zasazena! V boji s Čertem hoď součet 25+ pro vítězství.
            </p>
          )}
        </div>
        <div className="panel">
          <h3>Log</h3>
          <div className="log">
            {state.log.slice(0, 30).map((e, i) => (
              <div key={i} className="entry">{e}</div>
            ))}
          </div>
        </div>
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
          <button onClick={() => setState(useField(state, pc.hex, { dirtAction: 'drill' }))}>
            🕳️ Vrtej (bez bonusu)
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

function SleepModal({ state, setState, close }: { state: GameState; setState: (s: GameState) => void; close: () => void }) {
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
          <button onClick={() => {
            // Quick: downgrade all dice with value > 2 by 1
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
      </div>
    </div>
  );
}

function DevilCombatPanel({ state, setState }: { state: GameState; setState: (s: GameState) => void }) {
  const p = currentPlayer(state);
  const taken = state.devilWounds.woundsByPlayer[p.id];
  return (
    <div>
      <DiceTray player={p} />
      <p style={{ fontSize: 13, marginTop: 8 }}>
        Pro každou kostku zvol, na které zranění ji použít (1, 2, 7+, 10+).
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
          🎲 Hoď znovu {allWoundsTaken(state, p.id) ? '(potřebuješ 25+)' : ''}
        </button>
        <button onClick={() => setState(devilStop(state))}>Ukončit boj</button>
      </div>
    </div>
  );
}
