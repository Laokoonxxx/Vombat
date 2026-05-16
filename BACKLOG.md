# 📋 Backlog & Brainstorm

Nápady na vylepšení hry. Setříděné podle dopadu/složitosti.
Není to TODO — jsou to **uvažované** směry pro budoucí iterace.

---

## 🎯 Designové cíle (kontext)

- **Audience:** přátele autora, případně širší okruh (potenciálně prodej deskové verze)
- **Délka:** rychlovka 15 min × hráč (= 30-60 min pro 2-4 hráče)
- **Charakter:** spíš **strategická** (plán na startu) než taktická (per-roll fiddling)
- **Interakce:** pozitivní (bonusy za adjacency, ne sabotování)
- **Tématický anchor:** vědecké kuriozity vombatů (kostkové bobky, drcení predátorů zadkem)

---

## 🎲 Priorita 0: Deck-building musí být centrální mechanika

**Problém:** Hra cílí být unikátní tím, že hráč staví balíček kostek a tím
ovlivňuje pravděpodobnost aktivací polí. Aktuálně to **nehraje žádnou roli**
— pravidlo „hoď všemi kostkami" vyřazuje rozhodování. AI vyhrává s 2 dovednostmi
za 53 tahů, deck-building je čistě pasivní.

### A. Pre-roll free swap *(minimální změna, nejsilnější dopad)*
- Před hodem v každém tahu: 1× zadarmo přesun kostka ↔ Zásoba
- Třídění (Klystýr) → „**3× zadarmo před hodem**" místo dnešní sleep-only varianty
- Sleep výměna zůstává pro masivní reorganizaci
- **Proč:** každý tah hráč řeší „co tentokrát chci hodit". Hands-on bez ztráty tahu.

### B. Roll-subset rule *(větší změna pravidel)*
- Místo „hodíš VŠEMI" → „hodíš **alespoň 1** a zbytek dle volby"
- Nehozené kostky zůstávají v Ruce na další tah
- Možný kompromis: bonus +1 🥔 za hod všemi (motivace pro plný hod)
- **Riziko:** decision paralysis každý tah

### C. Cat combat jako Čert v malém ⭐ *(spojuje balanc + deck-building)*
- Místo „hod 11-14 + pohyb = smash" → **Cat combat režim** podle vzoru Čerta
- Vyhlášení boje před hodem
- Kočka má **2 sloty zranění**: `1-2` a `7+`
- Musíš v jedné sérii hodů zasáhnout oba (jako u Čerta)
- Selžeš → útok Kočky
- Uspěješ → odměna **1k12** (místo k20) + tunel + milestone Lázně
- **Proč pro deck-building:** ke kočce potřebuješ specifickou ruku — malou kostku
  (k2/k4 pro slot 1-2) i velkou (k8+ pro slot 7+). Hráč PLÁNUJE ruku PŘED
  kočkou. Smíchaná ruka = optimum.
- **Bonus 1:** Menší odměna než k20 řeší dominance honu na kočky (z experimentu
  k8 víme že 28 % stall, k12 by mělo být sweet spot ~10 %)
- **Bonus 2:** Tematicky sedí — vombat kočku „naláká dolů" (nízký hod) a pak
  drtí zadkem (vysoký hod)

### D. Die forging „Kovárna" *(strategický horizont)*
Sleep akce nebo nové pole:
- Spal 2× k4 → získej 1k8 (merge)
- Spal k10 → 2× k4 (split)
- Spal k6 + 3 🥔 → upgrade na k8
- **Proč:** aktivní volba tvaru ruky bez čekání na náhodu

### E. Reroll s cenou
- Po hodu: zaplať 1 🥔 → znovu hod jakoukoli podmnožinu kostek
- Devil combat už mechaniku má (continue roll) — extension na běžný tah

### Doporučená kombinace
- **A + C** — minimum rule change, maximální dopad na deck-building zájem
- D jako druhá iterace
- Experiment k8 ukázal, že snížení odměny za kočku samo bez deck-building
  podpory hru zlomí (28 % stall). Cat combat (C) by mělo dát stejnou redukci
  hodnoty kočky, ale s aktivním zapojením hráče místo čekání na hod 11-14.

---

## 🚀 Priorita 1: Speed & strategy

### Round limit + scoring tiebreak
- Po 30 kolech hra automaticky končí
- Pokud nikdo nezabil Čerta → vyhrává kdo má větší skóre:
  - Zranění Čerta × 10
  - Rozdrcené kočky × 5
  - Naučené dovednosti × 3
  - Mrkve + stromy × 2
  - Velké kostky (k12+) v Ruce/Zásobě × 4
- Vizuální progress bar "Kolo 12/30" v topbar
- **Proč:** psychologický tlak → strategický plán s tempem

### Specializace ze startu
- Každý hráč si na startu vybere (nebo vylosuje) jednu z ~6 specializací:
  - 🥕 **Farmář**: Mrkve dávají +1 ke Vyformování skóre
  - 🐱 **Lovec**: Rozdrcení kočky vyžaduje jen 9-14 (širší okno)
  - 🌳 **Šaman**: První dovednost stojí 0 stromů
  - 🐾 **Sprinter**: Sprint zdarma od začátku
  - 💩 **Lísko-páníč**: Vyformuj kostku má vždy +1 bonus
  - ⚔️ **Bojovník**: Boj s Čertem +1 k handMax pro zranění
- **Proč:** každá hra je *jiná* → strategická hloubka & replayability

### Hidden goal cards
- Vedle "zabij Čerta" si každý vytáhne **tajný bonus cíl**:
  - Naučit 4 dovednosti
  - Zasadit 6 mrkví
  - Mít 2× k20
  - atd.
- Pokud na konci hry splněn → +20 score (tiebreak rozhoduje)
- **Proč:** tajný plán + reading opponent = interakce

---

## 🤝 Priorita 2: Pozitivní interakce mezi hráči

### Adjacency hod bonus
- Když začínáš tah a tvůj Vombat sousedí s Vombatem soupeře:
  - Tvůj hod kostek +1 na každé kostce
  - NEBO: Vyformuj skóre +2
  - NEBO: get free brambora
- **Proč:** přesně pravidlo „lepší kostky u soupeře" které měl autor v hlavě, ale silnější

### Sdílený trh — Houští
- Když má Vombat soupeř na sousedním poli, tvoje Houští využití dá kostku o 1 level větší (k4 → k6)
- **Proč:** incentive: být u soupeře = lepší zdroje

### Společné vyrytí — Eukalyptus
- Pokud oba hráči mají značku na sousedních Eukalyptech, oba získají +1 strom navíc každý 3. tah
- **Proč:** win-win element

### Spillover milestones
- Když JEDEN hráč rozdrtí kočku, druhý získá 5 brambor (rozradování)
- Stejně pro 1. zranění Čerta
- **Proč:** pozitivní spill-over

### Měkký trade (asynchronní)
- Spánek akce: nabídni soupeři výměnu jedné své kostky
- Soupeř může v jeho příštím tahu kdykoli přijmout (zaplatí 3 brambor, swap)
- **Proč:** obchod bez okamžité reakce, žádné brzdění tahů

---

## 🎲 Priorita 3: Méně tactical fiddling

### Auto-default na get-die placement
- Default: max die, Hand first
- "Změnit" tlačítko v sidebar pro override (rare case)
- **Proč:** dialog pokaždé brzdí. Rychlovka.

### Sleep options: zjednodušit
- Default = gain potato (1 click)
- Pokročilé Sleep akce v rozbalovacím submenu
- **Proč:** rychlejší standardní průchod

### Pre-rolled dice queue
- Místo házení každý tah → vyhoď ze startu hry pool ~20 hodů
- Hráč bere po jednom v turn order
- **Proč:** žádné čekání na animaci, hra "feeling déterminističtějši" = víc strategie

---

## 🎨 Priorita 4: Polish

### Animace tahů
- Vombat se pohne plynule po hexech, ne teleport
- Kostky se rolnou s 3D animací
- Cat smash → poof animace

### Soundtrack
- Australian ambient (kookaburras, didgeridoo)
- Cat smash sound
- Devil roar
- Dice rolling

### Replay funkce
- Ukládat každou hru a umožnit replay - vidět svoje špatné tahy

### Persistent stats napříč hrami
- Tvoje win-rate, oblíbená dovednost, nejrychlejší výhra
- Friends leaderboard

### Interactive tutorial
- Místo statického QuickRules → interactive walkthrough
- "Klikni teď na tohle pole. Hoď kostkami. Vidíš, žes mohl..."

---

## 🚀 Priorita 5: Crazy / experimentální

### Battle Royale Mode
- 6 hráčů na velké mapě (3 mapy spojené)
- 5 minut na tah
- Poslední přeživší vyhrává

### Coop mode proti AI
- 2 hráči vs AI-Čert
- Čert se na hráče střídá útokem
- Hráči musí kooperovat

### Procedural mapa
- Místo 7-dílků flower, generovaná pomocí random walk
- Některé mapy s "ostrovy" jen propojenými tunely

### Augmented reality / fyzická verze
- Vytisknout dílky, použít mobile app jako "deska"
- App scanuje pozici figurek z fotky

### Roguelike kampaň
- Persistent skills/items mezi hrami
- Každá hra randomizovaná
- Progression carry-over

### Devil escalation
- Čert se každých 5 kol zesílí (sum requirement +1, +1 wound)
- "Čert se rozzuří" event v půlce hry

### Hidden devil cards
- Před soubojem si hráč táhne kartu Čerta s modifikátorem:
  - "Letošní zranění: 1, 2, 5+, 12+"
  - "Čert v rytmu" (každý 3. hod má bonus +5)
  - "Čert opilý" (rolly 1-3 ignorovány)
- Adaptace > čisté štístí

### Dice forging "Kovárna"
- Nové pole nebo Sleep akce:
  - Spal 2× k4 → získej 1k8
  - Spal k10 → 2× k4 (split)
  - Spal 3 brambory + k6 → upgrade na k8

### Eukalypty rostou
- Eukalyptus obsazený 5+ kol = STAROBYLÝ
- Dává +1 strom navíc, ale obrana 1k8

### Tunely jako resource (omezit)
- Pouze 1-2 tunely v setupu
- Další vznikne jen po cat-smash
- Tunely lze ucpat bramborami (5 🥔)

---

## 📚 Game design — poznámky

### Inspirace pro speed-up
- **Splendor** (~30 min, 2-4 hráči): jednoduchá akce, rychlé tahy
- **Sushi Go** (~15 min): vše visible, plánuj
- **7 Wonders Duel** (~30 min): 2 hráči, asymetrické cíle

### Inspirace pro interakci
- **Catan**: trading klíčové, ale závisí na talku
- **Wingspan**: positive interaction via player abilities
- **Lost Cities** (2-hráči): visible to opponent, race element

### Co se *neosvědčilo* z naší verze (zjištěno simulací)
- Dlouhé hry > 100 tahů → opuštěné, žádný fun
- Pasivní engine-builder bez interakce = solitaire
- Příliš mnoho voleb na turn = paralysis

---

## 🎯 Pro fyzickou deskovou verzi (long-term)

- Hexagonální dílky (laser-cut wood?)
- Vombatí figurky (3D-printed)
- Karty pro specializace + hidden goals
- Bobek-tokeny (cube-shaped, hnědé)
- Skill cards (kapsové, ilustrované)
- Box art: vědecká kuriozita + cute vombat

Plán:
1. Doladit MVP digital (aktuálně)
2. Playtest s přáteli, sbírat feedback
3. Iterace 2-3
4. Pokud má potenciál → fyzický prototyp
5. Konvence / playtesty cizími hráči
6. Pitch nakladatelům (Albi, Mindok, Gala...)
