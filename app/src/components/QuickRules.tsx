// =============================================================================
// QuickRules — compact tutorial modal for new players
// =============================================================================
// Shown as a modal with everything needed to play in ~2 minutes.
// Auto-opens on first visit (localStorage flag) and from the "?" button.
// =============================================================================

const SEEN_KEY = 'vombat:seenQuickRules';

export function shouldAutoShowQuickRules(): boolean {
  try {
    return !localStorage.getItem(SEEN_KEY);
  } catch {
    return false;
  }
}

export function markQuickRulesSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, '1');
  } catch {
    /* ignore */
  }
}

export function QuickRules({ onClose }: { onClose: () => void }) {
  function close() {
    markQuickRulesSeen();
    onClose();
  }
  return (
    <div className="modal-backdrop" onClick={close}>
      <div
        className="modal"
        style={{ maxWidth: 760, maxHeight: '90vh', overflowY: 'auto', padding: '20px 26px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
          <h2 style={{ margin: 0 }}>📖 Jak hrát Vombata</h2>
          <button onClick={close}>✕ Zavřít</button>
        </div>
        <p style={{ marginTop: 0, color: 'var(--muted)', fontSize: 13 }}>
          Stručný úvod (~2 minuty). Plná pravidla najdeš na GitHubu.
        </p>

        <Section title="🎯 Cíl hry">
          <p style={{ margin: 0 }}>
            <strong>Rozmačkat Tasmánského Čerta.</strong> Hra je tahová pro 2 hráče.
            Vyhrává ten, kdo zabije Čerta první.
          </p>
        </Section>

        <Section title="🐾 Tvůj tah">
          <ol style={{ margin: 0, paddingLeft: 20 }}>
            <li>Hoď všemi kostkami v <strong>Ruce</strong>. Spočítej součet.</li>
            <li>Pokud jsi <em>vedle Kočky</em> a hodil &lt; 5 → odevzdej 🥔 bramboru nebo kostku.</li>
            <li>
              Vyber 1 akci:
              <ul style={{ margin: 0 }}>
                <li><strong>🐾 Pohyb</strong> — Vombat na sousední pole, pokud součet odpovídá rozsahu</li>
                <li><strong>🌿 Využij pole</strong> — kde stojíš nebo sousedíš (pole se obsadí)</li>
                <li><strong>💤 Spánek</strong> — když nemáš co dělat (vyber bonus)</li>
              </ul>
            </li>
          </ol>
        </Section>

        <Section title="🟫 Typy polí (rozsah pro pohyb / akce na poli)">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
                <th style={{ padding: '4px 6px' }}>Pole</th>
                <th style={{ padding: '4px 6px' }}>Hod</th>
                <th style={{ padding: '4px 6px' }}>Co dělá</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderTop: '1px solid #eee' }}>
                <td style={{ padding: '4px 6px' }}>🟫 <strong>Hlína</strong></td>
                <td style={{ padding: '4px 6px' }}><code>2–4</code></td>
                <td style={{ padding: '4px 6px' }}>
                  <strong>Zasaď</strong> mrkev · <strong>Vyformuj kostku</strong> (získej kostku, viz níže) ·
                  <strong> Uč se</strong> dovednost
                </td>
              </tr>
              <tr style={{ borderTop: '1px solid #eee' }}>
                <td style={{ padding: '4px 6px' }}>🌱 <strong>Záhon</strong></td>
                <td style={{ padding: '4px 6px' }}><code>4–6</code></td>
                <td style={{ padding: '4px 6px' }}>Zasaď mrkev (zvyšuje skóre Vyformuj kostku)</td>
              </tr>
              <tr style={{ borderTop: '1px solid #eee' }}>
                <td style={{ padding: '4px 6px' }}>🌳 <strong>Eukalyptus</strong></td>
                <td style={{ padding: '4px 6px' }}><code>7–8</code></td>
                <td style={{ padding: '4px 6px' }}>Obsaď (potřeba na učení dovedností)</td>
              </tr>
              <tr style={{ borderTop: '1px solid #eee' }}>
                <td style={{ padding: '4px 6px' }}>🌵 <strong>Houští</strong></td>
                <td style={{ padding: '4px 6px' }}><code>5+/7+/9+</code></td>
                <td style={{ padding: '4px 6px' }}>Získej kostku z pole (k4/k6/k8) zdarma!</td>
              </tr>
              <tr style={{ borderTop: '1px solid #eee' }}>
                <td style={{ padding: '4px 6px' }}>🏜️ <strong>Poušť</strong></td>
                <td style={{ padding: '4px 6px' }}><code>7+</code></td>
                <td style={{ padding: '4px 6px' }}>Stejné akce jako Hlína (vyžaduje Koupel)</td>
              </tr>
              <tr style={{ borderTop: '1px solid #eee' }}>
                <td style={{ padding: '4px 6px' }}>🐱 <strong>Kočka</strong></td>
                <td style={{ padding: '4px 6px' }}><code>11–14</code></td>
                <td style={{ padding: '4px 6px' }}>
                  <strong>Rozdrť zadkem</strong> → získej <strong>1k8</strong> + Lázně zdarma + tunel
                </td>
              </tr>
              <tr style={{ borderTop: '1px solid #eee' }}>
                <td style={{ padding: '4px 6px' }}>👹 <strong>Čert</strong></td>
                <td style={{ padding: '4px 6px' }}><code>12+</code></td>
                <td style={{ padding: '4px 6px' }}>Pohyb. Souboj vyhlásíš <strong>PŘED HODEM</strong>!</td>
              </tr>
            </tbody>
          </table>
        </Section>

        <Section title="⚔️ Souboj s Čertem (jak vyhraješ hru)">
          <ol style={{ margin: 0, paddingLeft: 20 }}>
            <li>Stůj <em>vedle</em> nebo <em>na</em> Čertovi.</li>
            <li>
              <strong>PŘED HODEM</strong> vyhlas souboj. Hoď kostkami.
            </li>
            <li>
              Zranit Čerta 4×: každá kostka musí padnout přesně:
              <strong> 1, 2, 7+, 10+</strong>. Použité kostky propadnou (už je nepoužiješ).
            </li>
            <li>
              Po 4 zraněních: hoď zbylými kostkami <strong>součet 25+</strong>. → <strong>VÝHRA!</strong>
            </li>
          </ol>
          <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--muted)' }}>
            💡 Když nezvládneš ve své tahu → ztratíš 🥔 bramboru a tah končí. Zranění zůstávají.
          </p>
        </Section>

        <Section title="💩 Vyformuj kostku formule (jak získat velkou kostku)">
          <p style={{ margin: '0 0 6px' }}>
            Na Hlíně: spočítej <code>tvé mrkve + sousední značky <strong>soupeře</strong> + investované brambory</code>:
          </p>
          <p style={{ margin: '0 0 6px', fontSize: 11, color: 'var(--muted)' }}>
            💡 Jen <em>soupeřovy</em> sousední značky se počítají. Vyformuj kostku poblíž soupeře = větší kostka.
          </p>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
                <th style={{ padding: '4px 6px' }}>Skóre</th>
                <th style={{ padding: '4px 6px' }}>Získáš</th>
              </tr>
            </thead>
            <tbody>
              <tr><td style={{ padding: '2px 6px' }}>1</td><td>1k2</td></tr>
              <tr><td style={{ padding: '2px 6px' }}>2</td><td>1k4</td></tr>
              <tr><td style={{ padding: '2px 6px' }}>3</td><td>1k6</td></tr>
              <tr><td style={{ padding: '2px 6px' }}>4</td><td>1k8</td></tr>
              <tr><td style={{ padding: '2px 6px' }}>5</td><td>1k10</td></tr>
              <tr><td style={{ padding: '2px 6px' }}>6–7</td><td>1k12</td></tr>
              <tr><td style={{ padding: '2px 6px' }}><strong>8+</strong></td><td><strong>1k20 🎉</strong></td></tr>
            </tbody>
          </table>
        </Section>

        <Section title="🎁 Bonusy zdarma (Milestones)">
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            <li><strong>1. zranění Čerta</strong> → dovednost <em>Kapacita</em> zdarma (ruší limity Ruky/Zásoby)</li>
            <li><strong>1. rozdrcená Kočka</strong> → dovednost <em>Lázně</em> zdarma (umožní Poušť)</li>
          </ul>
        </Section>

        <Section title="🔄 Třídění — deck-building dovednost">
          <p style={{ margin: '0 0 6px' }}>
            S dovedností <strong>Třídění</strong> (1 strom) můžeš <strong>před každým hodem</strong> až
            <strong> 3× zdarma</strong> přesunout kostku Ruka ↔ Zásoba. Tím ladíš tvar Ruky pro
            pole, která chceš aktivovat.
          </p>
          <p style={{ margin: 0, fontSize: 11, color: 'var(--muted)' }}>
            💡 Vidíš sousední Hlínu (2-4)? Stáhni si k4 do Ruky, k10 odlož do Zásoby — vyšší
            šance trefit aktivaci. Bez Třídění hodíš vše, co máš v Ruce.
          </p>
        </Section>

        <Section title="🏅 Úkoly (formace) — bonus kostka navrch">
          <p style={{ margin: '0 0 6px' }}>
            Vedle souboje s Čertem můžeš plnit 3 prostorové úkoly. Splnění se
            vyhodnocuje samo po každém umístění tvé značky (💩 nebo 🥕).
          </p>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            <li><strong>Přímka 5</strong> — 5+ tvých značek v rovné hex-linii (po sobě), bez sousedící značky soupeře.</li>
            <li><strong>Obklíčení</strong> — 4+ tvých značek kolem jedné značky soupeře.</li>
            <li><strong>Průzkumník</strong> — značky na 6+ různých dílcích mapy.</li>
          </ul>
          <p style={{ margin: '6px 0 0', fontSize: 12 }}>
            Odměna podle pořadí: 1.&nbsp;<strong>1k20</strong>, 2.&nbsp;<strong>1k12</strong>, 3.&nbsp;<strong>1k6</strong>. Každou formaci jen 1× za hráče.
          </p>
        </Section>

        <Section title="💤 Spánek — co můžeš dělat">
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            <li>Získat 1 🥔 bramboru</li>
            <li>Downgrade kostky (z větší na menší)</li>
            <li>Výměna kostek mezi Rukou a Zásobou</li>
            <li><strong>🌀 Teleport (5 🥔)</strong> → přemísti Vombata kamkoli (mimo Čerta/Kočky)</li>
            <li>
              <strong>🛒 Skill shop</strong>: kup dovednost za <code>5 🥔 × počet stromů</code>:
              <ul style={{ margin: 0 }}>
                <li>1-strom (Kapacita) = 5 🥔</li>
                <li>2-strom (Koupel, Sprint, …) = 10 🥔</li>
                <li>3-strom (Ajurvéda) = 15 🥔</li>
              </ul>
            </li>
          </ul>
        </Section>

        <Section title="📥 Limity kostek">
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            <li><strong>Ruka:</strong> max 2 kostky stejného levlu (k6+k6 OK, k6+k6+k6 ne)</li>
            <li><strong>Zásoba:</strong> max 3 kostky celkem</li>
            <li>
              Dovednost <strong>Kapacita</strong> ruší oba limity. Když získáš kostku co se nikam
              nevejde, čeká v <strong>📥 Pending</strong> a uvolní se až máš Kapacitu.
            </li>
          </ul>
        </Section>

        <Section title="💡 Strategie pro nováčky">
          <ol style={{ margin: 0, paddingLeft: 20 }}>
            <li>První tahy: <strong>plant mrkve</strong> na Záhonu/Hlíně (carrot ramp)</li>
            <li>S 3+ mrkvemi: <strong>Vyformuj kostku</strong> na Hlíně s sousedy = velké kostky</li>
            <li>Zabij sousední Kočku (hod 11–14) = <strong>1k8</strong> + Lázně zdarma + tunel</li>
            <li>S 5+ kostkama včetně k10/k12/k20 → najdi Čerta a útoč</li>
          </ol>
          <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--muted)' }}>
            <strong>Nespěchej k Čertovi.</strong> Bez dobrých kostek to nezvládneš.
          </p>
        </Section>

        <div style={{ marginTop: 16, padding: 10, background: '#e8f5e0', borderRadius: 6, fontSize: 12 }}>
          🔬 <strong>Vědecký fakt:</strong> Vombati skutečně produkují kostkové
          fekálie (díky struktuře svých střev) a mají chrupavčitě zpevněný
          zadek, kterým drtí predátorům lebky o stěnu nory. Tato hra žádný
          z těchto faktů nepřehání. 🐾
        </div>

        <div style={{ marginTop: 12, padding: 10, background: '#fff5e0', borderRadius: 6, fontSize: 12 }}>
          📖 Najed myší na kterýkoli hex — uvidíš tooltip s detaily.<br />
          📊 Statistiky všech AI vs AI her: tlačítko v topbaru.<br />
          🐾 Pohni Vombata, využij pole, zabij Čerta. Hodně štěstí!
        </div>

        <div style={{ marginTop: 14, textAlign: 'right' }}>
          <button className="primary" onClick={close}>Beru, jdeme hrát 🐾</button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 14 }}>
      <h3 style={{ margin: '0 0 6px', fontSize: 14 }}>{title}</h3>
      {children}
    </div>
  );
}
