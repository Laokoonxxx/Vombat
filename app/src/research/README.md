# Research pipeline — analytika & insighty z AI-vs-AI her

Cíl: spustit tisíce simulací AI proti AI, ze záznamů automaticky najít
**slabiny pravidel** (mrtvé akce, mrtvé dovednosti, dominantní openings)
a **AI tuning vodítka**.

## Rychlý běh

```bash
# Z app/ adresáře:
npm run research:run             # 1000 her + auto-analyze, ~35s
npm run research:sim 5000 400    # větší vzorek, ~3 min
npm run research:analyze         # přegenerovat insights pro poslední run
```

Po dokončení najdeš report v `app/sim_results/research/<timestamp>/insights.md`.

## Co umí analyzátor (sekce reportu)

| Sekce | Otázka, na kterou odpovídá |
|---|---|
| **Overview** | Kolik her, jak dlouhé, kdo vyhrál |
| **Auto-detekované insighty** | Mrtvé/dominantní dovednosti, order-effect, dlouhé hry, stall |
| **Startovní pole** | Win rate podle typu hexu, kde hráč začal |
| **Otevírací akce** | Které sekvence 1-3 prvních akcí korelují s výhrou |
| **Dovednosti** | Frekvence, cesta získání (milestone/Hlína/Strom/Sleep shop), Ø tah |
| **Distribuce akcí** | Která akce se kolikrát používá; mrtvé akce |
| **Milestone-turn** | Kdy výherci typicky učí 1. dovednost, drtí 1. kočku atd. |
| **Úkoly (formace)** | Kolikrát splněno, Ø tah, win-rate při 1. místě |
| **Souboj s Čertem** | Win rate podle počtu zahájených soubojů |

## Architektura

```
research/
├── types.ts           # ResearchGameRecord + insight types
├── simulate.ts        # runs N games → games.jsonl + meta.json
└── analyze.ts         # reads games.jsonl → insights.md
```

Output (gitignored — regeneruj lokálně):
```
sim_results/research/<timestamp>/
├── games.jsonl        # ~2 KB/hra, JSONL = streaming-friendly
├── meta.json          # run config + summary
├── insights.md        # auto-gen report
└── latest.txt         # pointer pro --latest flag (přepisuje se)
```

## Co to *není*

Tohle není self-improving AI. AI heuristika je staticka — jen sbíráme data
o tom, jak se chová a co z toho plyne pro design hry.

**Další kroky** (BACKLOG úroveň):
- **Param sweep:** parametrizovat AI váhy, hledat optimální koeficienty
- **MCTS:** silnější AI bez učení (~200 řádků, plně v TS)
- **Coevolution:** populace AI variant, evoluce přes generace
- **AlphaZero-light:** vyžaduje Python; v BACKLOG na později

## Příklad typických insightů

Po 2000 hrách báze odhalí:

- ⚠️ **Bylinkový elixír (Ajurvéda):** 1.2 % hráčů → cena 3 stromů moc vysoká
- ⚠️ **Kapacita:** 97.8 % hráčů → milestone bonus + 1 strom = auto-pick (design OK)
- ⚠️ **Black tile start = 0 %** → AI heuristika nestartuje na černých dílcích
- 🟢 **Obklíčení 41.6 % her** → AI to splní mimoděk, formace je „příliš dosažitelná"
- 🟢 **Pruzkumnik 1. místo = 80 % win rate** → kdo úkol dokončí, vyhrává
