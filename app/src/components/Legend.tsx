import { useState } from 'react';
import { SKILL_REQUIREMENTS } from '../game/engine';
import type { SkillId } from '../game/types';

interface LegendRow {
  emoji: string;
  name: string;
  color: string;
  activation: string;
  description: string;
}

const LEGEND: LegendRow[] = [
  {
    emoji: '🟫',
    name: 'Hlína',
    color: 'var(--hex-dirt)',
    activation: '2–4',
    description: 'Zasaď mrkev / Kakej (získej kostku) / Uč se dovednost / Vrtej',
  },
  {
    emoji: '🌱',
    name: 'Záhon',
    color: 'var(--hex-bed)',
    activation: '4–6',
    description: 'Zasaď mrkev (zvyšuje skóre Kakej). Soupeř může přebrat.',
  },
  {
    emoji: '🏜️',
    name: 'Poušť',
    color: 'var(--hex-desert)',
    activation: '7+',
    description: 'Akce jako Hlína. Vyžaduje dovednost Koupel.',
  },
  {
    emoji: '🌳',
    name: 'Eukalyptus',
    color: 'var(--hex-tree)',
    activation: '7–8',
    description: 'Obsaď — kapitál pro učení dovedností. Soupeř může přebrat.',
  },
  {
    emoji: '🌵',
    name: 'Houští',
    color: 'var(--hex-thorn)',
    activation: '5+/7+/9+',
    description: 'Získej kostku z pole (k4 → 5+, k6 → 7+, k8 → 9+). Pohyb 5–9.',
  },
  {
    emoji: '🐱',
    name: 'Kočka',
    color: 'var(--hex-cat)',
    activation: '11–14',
    description: 'Rozmačkání → získej 1k20, pole se mění na tunel. Útok při hodu <5 v sousedství.',
  },
  {
    emoji: '👹',
    name: 'Čert',
    color: 'var(--hex-devil)',
    activation: '12+',
    description: 'Pohyb 12+. Boj se vyhlašuje PŘED hodem. Zranění 1, 2, 7+, 10+. Finále 25+.',
  },
  {
    emoji: '🕳️',
    name: 'Tunel',
    color: 'var(--hex-tunnel)',
    activation: '—',
    description: 'Všechna černá pole + zabité kočky. Místo sousedního pole můžeš jít na jakýkoli jiný tunel.',
  },
];

const ICON_LEGEND = [
  { icon: '🐾', desc: 'Vombat (figurka hráče)' },
  { icon: '💩', desc: 'Bobek — žeton hráče po akci (Kakej, Obsaď, Uč se…)' },
  { icon: '🥕', desc: 'Mrkev — žeton hráče po akci Zasaď' },
  { icon: '🥔', desc: 'Brambora — měna a obrana proti útoku' },
  { icon: 'kX', desc: 'Kostka (k2/k4/k6/k8/k10/k12/k20)' },
];

const SKILL_ORDER: SkillId[] = [
  'zonglovani',
  'zacpa',
  'koupel',
  'klystyr',
  'masaz_strev',
  'ajurveda',
  'sprint',
];

export function Legend() {
  const [open, setOpen] = useState(false);
  const [skillsOpen, setSkillsOpen] = useState(false);
  return (
    <div className="panel">
      <h3
        style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', margin: 0 }}
        onClick={() => setOpen((o) => !o)}
      >
        <span>📖 Legenda polí</span>
        <span>{open ? '▾' : '▸'}</span>
      </h3>
      {open && (
        <div style={{ marginTop: 10 }}>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
                <th style={{ paddingBottom: 4 }}></th>
                <th style={{ paddingBottom: 4 }}>Pole</th>
                <th style={{ paddingBottom: 4 }}>Hod</th>
              </tr>
            </thead>
            <tbody>
              {LEGEND.map((l) => (
                <tr key={l.name} style={{ borderTop: '1px solid #eee' }}>
                  <td style={{ padding: '6px 4px', width: 24 }}>
                    <span
                      style={{
                        display: 'inline-block',
                        width: 18,
                        height: 18,
                        background: l.color,
                        border: '1px solid #3d2f1a',
                        borderRadius: 3,
                        verticalAlign: 'middle',
                        textAlign: 'center',
                        lineHeight: '16px',
                        fontSize: 12,
                      }}
                    >
                      {l.emoji}
                    </span>
                  </td>
                  <td style={{ padding: '6px 4px' }}>
                    <strong>{l.name}</strong>
                    <div style={{ color: 'var(--muted)', fontSize: 11 }}>{l.description}</div>
                  </td>
                  <td style={{ padding: '6px 4px', whiteSpace: 'nowrap' }}>
                    <code>{l.activation}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <h4 style={{ margin: '14px 0 6px', fontSize: 12, textTransform: 'uppercase', color: 'var(--muted)' }}>
            Žetony
          </h4>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <tbody>
              {ICON_LEGEND.map((i) => (
                <tr key={i.icon} style={{ borderTop: '1px solid #eee' }}>
                  <td style={{ padding: '4px 6px', width: 26 }}>{i.icon}</td>
                  <td style={{ padding: '4px 6px' }}>{i.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10 }}>
            <strong>Tip:</strong> Číslo nad emoji v hexu = rozsah hodu pro aktivaci.
            <br />
            Pohyb i Využití pole = stejný rozsah (kromě Houští: pohyb 5–9, využití dle hodnoty kostky).
          </p>
        </div>
      )}
      <h3
        style={{
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          margin: '12px 0 0',
        }}
        onClick={() => setSkillsOpen((o) => !o)}
      >
        <span>🧠 Dovednosti (Uč se)</span>
        <span>{skillsOpen ? '▾' : '▸'}</span>
      </h3>
      {skillsOpen && (
        <div style={{ marginTop: 8 }}>
          <p style={{ fontSize: 11, color: 'var(--muted)', margin: '0 0 8px' }}>
            Získáš akcí <strong>Uč se</strong> na 🟫 Hlíně (nebo 🏜️ Poušti s Koupelí). Vyžaduje
            obsazené 🌳 Eukalypty. 1 chybějící strom lze nahradit 3 🥔 brambory nebo odhozením
            libovolné kostky. Každou dovednost lze získat pouze 1×.
          </p>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
                <th style={{ paddingBottom: 4 }}>Dovednost</th>
                <th style={{ paddingBottom: 4, whiteSpace: 'nowrap' }}>🌳</th>
              </tr>
            </thead>
            <tbody>
              {SKILL_ORDER.map((sid) => {
                const req = SKILL_REQUIREMENTS[sid];
                return (
                  <tr key={sid} style={{ borderTop: '1px solid #eee', verticalAlign: 'top' }}>
                    <td style={{ padding: '6px 4px' }}>
                      <strong>{req.label}</strong>
                      <div style={{ color: 'var(--muted)', fontSize: 11 }}>{req.desc}</div>
                    </td>
                    <td style={{ padding: '6px 4px', whiteSpace: 'nowrap', textAlign: 'center' }}>
                      <code>{req.trees}×</code>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
