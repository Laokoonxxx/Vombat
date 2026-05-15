import type { PlayerState } from '../game/types';
import { SKILL_REQUIREMENTS } from '../game/engine';

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
      {player.skills.size > 0 && (
        <div className="skills-list">
          {Array.from(player.skills).map((s) => (
            <span key={s} className="skill-chip" title={SKILL_REQUIREMENTS[s].desc}>
              {SKILL_REQUIREMENTS[s].label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
