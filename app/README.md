# Vombat — webová digitalní verze

Tahová desková hra Vombat na webu. MVP podporuje **2 hráče lokálně (hot-seat)** s cílem **Rozmačkej Tasmánského Čerta**.

## Spuštění

Předpoklad: Node.js 18+ a npm.

```bash
cd app
npm install
npm run dev
```

Pak otevři `http://localhost:5173`.

## Build

```bash
npm run build
npm run preview
```

## Struktura

- `src/game/` — herní engine (čisté funkce, žádné UI). Stavový typ `GameState` + reducer-style akce.
  - `types.ts` — domain types
  - `hex.ts` — hexová matematika (axial coords)
  - `tiles.ts` — šablony dílků (5 modrých, 3 černé)
  - `map.ts` — generování mapy
  - `engine.ts` — všechny herní akce (rollDice, moveVombat, useField, sleep, devil combat)
  - `rng.ts` — seedovaný RNG
- `src/components/` — React komponenty (UI)
  - `App.tsx` — root, lobby
  - `SetupScreen.tsx` — umístění Vombatů + nákup kostek
  - `GameScreen.tsx` — hlavní herní obrazovka
  - `HexBoard.tsx` — SVG hex mapa
  - `PlayerBoard.tsx` — hráčská deska
  - `DiceTray.tsx` — zobrazení hodu

## MVP omezení

- Pouze 2 hráči (rozšíření na 3-4 si vyžádá další tile templates a layout 10/13 dílků).
- Pouze vítězný cíl "Rozmačkej Čerta" (formace přímka/obklíčení/průzkumník zatím neimplementovány).
- Obrana kostkou na Záhonu/Stromě je zjednodušená (záměrná takeover bez ověření vyšší kostky).
- Akce "Vrtej" byla odstraněna (bez úkolů nemělo využití).
- Dovednosti "Žonglování" a "Zácpa" byly sloučeny do "Kapacita" (1 strom, ruší oba limity).
- Spánek má novou akci "Teleport" (5 brambor → kamkoli mimo Čerta/živé Kočky/jiného Vombata).

## Pravidla — připomenutí

- Pole jsou aktivována součtem hodu kostek v Ruce.
- Hlína 2-4, Záhon 4-6, Eukalyptus 7-8, Houští 5-9, Poušť 7+ (vyžaduje Koupel), Kočka 11-14 (rozmačkání), Čert 12+ (pohyb).
- Když Vombat sousedí s Kočkou a hod < 5 → musí odevzdat bramboru/kostku.
- Tunely: každé černé pole + porazené kočky.
- Druhý Vombat za 5 brambor začíná na stejném poli jako první.
