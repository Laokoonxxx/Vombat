import type { PlayerState, SkillId } from '../game/types';
import { SKILL_REQUIREMENTS, skillBuyCost } from '../game/engine';

const ALL_SKILLS: SkillId[] = [
  'kapacita',
  'koupel',
  'sprint',
  'masaz_strev',
  'klystyr',
  'ajurveda',
];

// Optional milestone trigger for skills that have one
const MILESTONE: Partial<Record<SkillId, string>> = {
  kapacita: '🎁 1. zranění Čerta',
  koupel: '🎁 1. rozdrcená Kočka',
};

export function PlayerBoard({ player, active }: { player: PlayerState; active: boolean }) {
  return (
    <div className={`panel player-board ${active ? 'active' : ''}`} style={{ borderLeftColor: player.color }}>
      <h2>{player.name} {active && '⬅️ TAH'}</h2>
      <div className="stat-row">
        <span className="label">🥔 Brambory:</span>
        <span className="val">{player.potatoes}</span>
      </div>
      <div className="stat-row">
        <span className="label">🥕 Mrkev:</span>
        <span className="val">{player.carrotTrack}</span>
        <span className="label">🌳 Strom:</span>
        <span className="val">{player.bobekTrack}</span>
      </div>
      <div className="stat-row">
        <span className="label">✋ Ruka:</span>
        <span className="val">
          {player.hand.length === 0 ? '—' : player.hand.map((d, i) => <span key={i} style={{ marginRight: 4 }}>1k{d}</span>)}
        </span>
      </div>
      <div className="stat-row">
        <span className="label">📦 Zásoba:</span>
        <span className="val">
          {player.reserve.length === 0 ? '—' : player.reserve.map((d, i) => <span key={i} style={{ marginRight: 4 }}>1k{d}</span>)}
        </span>
      </div>
      {player.pendingDice.length > 0 && (
        <div className="stat-row" title="Tyto kostky jsi získal, ale nevešly se do Ruky ani Zásoby. Uvolní se až získáš Kapacitu.">
          <span className="label" style={{ color: '#a05e2e' }}>📥 Čekající:</span>
          <span className="val" style={{ color: '#a05e2e' }}>
            {player.pendingDice.map((d, i) => <span key={i} style={{ marginRight: 4 }}>1k{d}</span>)}
          </span>
        </div>
      )}
      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          🧠 Dovednosti
        </div>
        <div className="skills-list">
          {ALL_SKILLS.map((sid) => {
            const req = SKILL_REQUIREMENTS[sid];
            const learned = player.skills.has(sid);
            const cost = skillBuyCost(sid);
            const milestone = MILESTONE[sid];
            const tipParts = [
              req.desc,
              `🌳 stromy: ${req.trees}`,
              `🛒 Spánek shop: ${cost} 🥔`,
              milestone ? `Milestone: ${milestone}` : null,
            ].filter(Boolean);
            return (
              <span
                key={sid}
                className={`skill-chip ${learned ? 'learned' : 'unlearned'}`}
                title={tipParts.join('\n')}
              >
                {learned ? '✓' : '○'} {req.label}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
