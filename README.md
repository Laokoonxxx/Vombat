# Vombat

Webová digitalní verze tahové deskové hry **Vombat**. 2 hráči lokálně (hot-seat), React + TypeScript + Vite.

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

## Dokumentace

- **[PRAVIDLA.md](PRAVIDLA.md)** — kompletní pravidla hry (12 sekcí + 2 přílohy)
- **[Pravidla hry.docx](Pravidla%20hry.docx)** — původní pravidla v Word formátu
- **[app/README.md](app/README.md)** — technická dokumentace aplikace

## Struktura

```
vombat/
├── PRAVIDLA.md           # kanonická pravidla (Markdown)
├── Pravidla hry.docx     # originální pravidla
└── app/                  # webová aplikace
    ├── src/
    │   ├── game/         # herní engine (čisté funkce)
    │   └── components/   # React UI
    └── ...
```

## MVP rozsah

- ✅ 2 hráči, hot-seat
- ✅ Cíl: Rozmačkej Tasmánského Čerta
- ✅ Plný engine: pohyb, tunely, využití pole, dovednosti, spánek, boj s Čertem
- 🚧 Cíle 2 a 3 (eukalypty, mrkve) — *zatím neimplementováno*
- 🚧 Úkoly (formace přímka/obklíčení/průzkumník) — *zatím neimplementováno*
- 🚧 3–4 hráči — *zatím neimplementováno*

Viz [PRAVIDLA.md Příloha B](PRAVIDLA.md#příloha-b--mvp-zjednodušení-k-doladění) pro úplný seznam MVP zjednodušení.
