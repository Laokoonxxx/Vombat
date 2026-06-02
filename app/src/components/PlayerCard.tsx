// =============================================================================
// PlayerCard — compact karta pro hráče v sidebar gridu
// =============================================================================
// Místo dlouhé PlayerBoard (full-width panel) ukáže totéž v kompaktní formě
// vhodné pro grid 1×N nebo 2×N. Obsahuje:
//   - barevný color band (border-left)
//   - jméno + indikátor TAH
//   - 4-column stats: 🥔 / 🌳 / 🥕 / ✋
//   - dice chips (Ruka + Zásoba, s rozlišením)
//   - skill chips (kompaktní)
//   - devil wounds 1/2/7+/10+ jako 4 mini sloty

import type { GameState, PlayerState, SkillId, WoundType } from '../game/types';
import { WOUND_TYPES } from '../game/types';
import { SKILL_REQUIREMENTS } from '../game/engine';

const ALL_SKILLS: SkillId[] = [
  'kapacita',
  'koupel',
  'klystyr',
  'masaz_strev',
  'sprint',
];

const SKILL_SHORT: Record<SkillId, string> = {
  kapacita: 'Kapa',
  koupel: 'Lázně',
  klystyr: 'Tříd',
  masaz_strev: 'Žvýk',
  sprint: 'Sprint',
};

export function PlayerCard({
  player,
  active,
  state,
}: {
  player: PlayerState;
  active: boolean;
  state: GameState;
}) {
  const wounds = state.devilWounds.woundsByPlayer[player.id];
  return (
    <div
      className={`player-card ${active ? 'active' : ''}`}
      style={{ borderLeftColor: player.color }}
    >
      <div className="pc-header">
        <div className="pc-name" style={{ color: player.color }}>{player.name}</div>
        {active && <span className="pc-turn-tag">TAH</span>}
      </div>

      <div className="pc-stats">
        <span className="pc-stat" title="Brambory">🥔 <span className="val">{player.potatoes}</span></span>
        <span className="pc-stat" title="Stromy (Eukalypty)">🌳 <span className="val">{player.bobekTrack}</span></span>
        <span className="pc-stat" title="Mrkve">🥕 <span className="val">{player.carrotTrack}</span></span>
        <span className="pc-stat" title="Ruka + Zásoba">🎲 <span className="val">{player.hand.length}+{player.reserve.length}</span></span>
      </div>

      {(player.hand.length > 0 || player.reserve.length > 0 || player.pendingDice.length > 0) && (
        <div className="pc-dice">
          {player.hand.map((d, i) => (
            <span key={`h${i}`} className="dchip" title="Ruka">1k{d}</span>
          ))}
          {player.reserve.map((d, i) => (
            <span key={`r${i}`} className="dchip reserve" title="Zásoba">1k{d}</span>
          ))}
          {player.pendingDice.map((d, i) => (
            <span
              key={`p${i}`}
              className="dchip"
              title="Čekající — uvolní se až dostane Kapacitu"
              style={{ background: '#fce4d4', borderColor: '#a05e2e' }}
            >
              ⏳1k{d}
            </span>
          ))}
        </div>
      )}

      <div className="pc-skills">
        {ALL_SKILLS.map((sid) => {
          const req = SKILL_REQUIREMENTS[sid];
          const learned = player.skills.has(sid);
          const tip = `${req.desc}\n🌳 Naučit: Obsaď + Uč se na Eukalyptu, nebo za úkol`;
          return (
            <span
              key={sid}
              className={`skill-chip ${learned ? 'learned' : 'unlearned'}`}
              title={tip}
            >
              {learned ? '✓' : '○'}&nbsp;{SKILL_SHORT[sid]}
            </span>
          );
        })}
      </div>

      <div className="pc-wounds" title="Zranění Čerta — sloty hodnot 1, 2, 7+, 10+">
        {WOUND_TYPES.map((w: WoundType) => {
          const die = wounds[w];
          return (
            <div key={w} className={`pc-wound ${die ? 'taken' : ''}`}>
              <div style={{ fontWeight: 700, fontSize: 9 }}>{w}</div>
              <div style={{ fontSize: 8 }}>{die ? `k${die}` : '—'}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
