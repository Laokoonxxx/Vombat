# Vombat

Webová digitální verze tahové deskové hry **Vombat**. 2–4 hráči, hot-seat / proti AI / online přes sdílený PHP backend. React + TypeScript + Vite.

## Spuštění

```bash
cd app
npm install
npm run dev
```

Otevři http://localhost:5173 v prohlížeči.

## Build

```bash
cd app
npm run build
npm run preview
```

## Nasazení

Nasazení na hosting **probíhá automaticky přes GitHub Actions** při každém pushi do větve `main`. Workflow `.github/workflows/deploy.yml` provede:

1. `npm ci` + `npm run build` (Vite produkční bundle)
2. Sestaví deploy balík (frontend dist + PHP backend)
3. FTP upload na Web4U hosting (`/html/vombat/`)

Pro lokální deploy balík existuje složka `deploy/` (gitignored) — viz [deploy/README-DEPLOY.md](deploy/README-DEPLOY.md).

## Dokumentace

- **[PRAVIDLA.md](PRAVIDLA.md)** — kompletní pravidla hry (12 sekcí + 2 přílohy)
- **[Pravidla hry.docx](Pravidla%20hry.docx)** — původní pravidla v Word formátu
- **[app/README.md](app/README.md)** — technická dokumentace aplikace
- **[BACKLOG.md](BACKLOG.md)** — co je hotovo / na čem se pracuje

## Struktura

```
vombat/
├── PRAVIDLA.md           # kanonická pravidla (Markdown)
├── Pravidla hry.docx     # originální pravidla
├── api/, includes/, sql/ # PHP backend pro online multiplayer (Web4U)
├── bootstrap.php, config.example.php
├── .github/workflows/    # auto-deploy na push do main
└── app/                  # webová aplikace
    ├── src/
    │   ├── game/         # herní engine (čisté funkce)
    │   ├── components/   # React UI
    │   └── net/          # online layer (fetch + polling)
    └── ...
```

## Funkce

- ✅ 2–4 hráči (hot-seat, proti AI, online)
- ✅ Cíl: **Rozmačkej Tasmánského Čerta** (samostatný hod ≥ 25)
- ✅ Plný engine: pohyb, tunely, využití polí, 5 dovedností, spánek, boj s Čertem
- ✅ **3 úkoly** (Přímka 5, Obklíčení, Průzkumník) — odměny v kostkách dle pořadí
- ✅ **Náhodné přiřazení dovedností úkolům** — strategická variabilita per hra
- ✅ AI heuristika s Monte Carlo lookahead
- ✅ Online multiplayer přes PHP/MySQL (sdílený Web4U hosting)
- 🚧 Cíle "získej eukalypty/mrkve" (alternativní vítězné podmínky) — *zatím neimplementováno*

Viz [PRAVIDLA.md Příloha B](PRAVIDLA.md#příloha-b--mvp-zjednodušení-k-doladění) pro detaily.
