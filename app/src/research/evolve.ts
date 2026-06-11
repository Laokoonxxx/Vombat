// =============================================================================
// EVOLUČNÍ SELF-PLAY TUNER — AI se zdokonaluje hraním sama proti sobě
// =============================================================================
// Princip:
//   1. Populace genomů (sad AI vah z ai-weights.ts).
//   2. Každá generace: round-robin turnaj — každý pár genomů odehraje
//      G her (sudé počty, střídání nasazení).
//   3. Fitness = výhry (remíza 0.5 + drobný bonus za progres zranění).
//   4. Selekce: šampion přežívá beze změny (elitismus), zbytek populace
//      se doplní mutacemi nejlepší poloviny.
//   5. Po poslední generaci se šampion zapíše do src/game/ai-weights.json —
//      hra ho při dalším buildu/spuštění automaticky načte.
//
// Spuštění:  npm run research:evolve [-- generations population gamesPerPair maxTurns]
// Default:   npm run research:evolve            (8 gen × 6 genomů × 8 her/pár)
// Rychlý test: npm run research:evolve -- 1 4 2 80
// =============================================================================

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { GameState } from '../game/types';
import { WOUND_TYPES } from '../game/types';
import { createGame, finishSetup } from '../game/engine';
import { aiStep, aiSetupStep, setAiWeights, getAiWeights } from '../game/ai';
import type { AiWeights } from '../game/ai';
import { DEFAULT_WEIGHTS } from '../game/ai';

// -----------------------------------------------------------------------------
// CLI args
// -----------------------------------------------------------------------------
const args = process.argv.slice(2).map(Number);
const GENERATIONS = args[0] || 8;
const POPULATION = args[1] || 6;
const GAMES_PER_PAIR = args[2] || 8;   // sudé číslo — střídání nasazení
const MAX_TURNS = args[3] || 150;

// -----------------------------------------------------------------------------
// Gene spec — rozsahy a typy pro mutace
// -----------------------------------------------------------------------------
type GeneSpec = { min: number; max: number; int?: boolean };
const GENE_SPEC: Record<keyof AiWeights, GeneSpec> = {
  potatoCap: { min: 2, max: 16, int: true },
  skipThreshold: { min: 0.5, max: 8 },
  devilFinalP: { min: 0.1, max: 0.85 },
  devilFinalPDesperate: { min: 0.05, max: 0.6 },
  devilMidRerollMinDice: { min: 1, max: 6, int: true },
  devilSmallDiceForLowWounds: { min: 0, max: 4, int: true },
  catSmashBase: { min: 5, max: 40 },
  catFirstMilestone: { min: 0, max: 25 },
  devilMoveReady: { min: 10, max: 50 },
  treeMoveBase: { min: 1, max: 20 },
  dirtMoveBase: { min: 1, max: 15 },
  bedMoveBase: { min: 1, max: 15 },
  thornBase: { min: 4, max: 25 },
  treeUseBase: { min: 4, max: 30 },
  treeUseDecay: { min: 0, max: 6 },
  bedRampLimit: { min: 2, max: 9, int: true },
  bedUseHigh: { min: 4, max: 25 },
  bedUseLow: { min: 0, max: 10 },
  kakejHigh: { min: 6, max: 30 },
  kakejMid: { min: 4, max: 25 },
  kakejLow: { min: 2, max: 18 },
  plantLimit: { min: 1, max: 8, int: true },
  plantScore: { min: 2, max: 18 },
  pruzkumnikNewTile: { min: 0, max: 15 },
  pruzkumnikCloseScale: { min: 1, max: 5 },
  obklPerAdj: { min: 0, max: 10 },
  obklComplete: { min: 0, max: 35 },
  primkaPerRun: { min: 0, max: 10 },
  primkaComplete: { min: 0, max: 40 },
  taskSkillScale: { min: 0, max: 3 },
  svWound: { min: 50, max: 500 },
  svCarrot: { min: 1, max: 15 },
  svBobek: { min: 1, max: 15 },
  svDie: { min: 1, max: 10 },
  svPotato: { min: 0, max: 1 },
  svTile: { min: 0, max: 20 },
  svDevilDistMax: { min: 5, max: 80 },
  svDevilDistPer: { min: 1, max: 15 },
  mcSamples: { min: 3, max: 12, int: true },
  myTurnLookahead: { min: 1, max: 4, int: true },
};

// Gaussian noise (Box-Muller)
function gauss(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function clampGene(key: keyof AiWeights, value: number): number {
  const spec = GENE_SPEC[key];
  let x = Math.max(spec.min, Math.min(spec.max, value));
  if (spec.int) x = Math.round(x);
  return x;
}

// Mutace genomu: každý gen má MUTATION_RATE šanci na multiplikativní šum.
function mutate(genome: AiWeights, sigma = 0.20, rate = 0.45): AiWeights {
  const out = { ...genome };
  for (const key of Object.keys(GENE_SPEC) as (keyof AiWeights)[]) {
    if (Math.random() > rate) continue;
    const factor = 1 + gauss() * sigma;
    out[key] = clampGene(key, genome[key] * factor);
  }
  return out;
}

// -----------------------------------------------------------------------------
// Jedna hra mezi dvěma genomy. Vrací body [pro A, pro B].
// -----------------------------------------------------------------------------
function playGame(genomeA: AiWeights, genomeB: AiWeights, seed: number): [number, number] {
  let state: GameState = createGame(
    [
      { name: 'GenA', kind: 'ai' },
      { name: 'GenB', kind: 'ai' },
    ],
    seed,
  );

  const weightsFor = (s: GameState): AiWeights =>
    s.players[s.currentPlayerIdx].name === 'GenA' ? genomeA : genomeB;

  // Setup fáze (umístění + nákup) — váhy nehrají roli, ale nastavíme je.
  let guard = 0;
  while (state.phase === 'setup' && guard++ < 100) {
    setAiWeights(weightsFor(state));
    const next = aiSetupStep(state);
    if (next == null) break;
    state = next;
  }
  if (state.phase === 'setup') {
    state = finishSetup(state);
  }

  // Hlavní smyčka — před každým krokem nastav váhy aktuálního hráče.
  guard = 0;
  while (state.phase !== 'game_over' && state.turnNumber <= MAX_TURNS && guard++ < 30000) {
    setAiWeights(weightsFor(state));
    const next = aiStep(state);
    if (!next || next === state) break; // stuck — ukonči jako remízu
    state = next;
  }

  // Vyhodnocení: výhra 1 b, remíza 0.5 b + malý bonus za progres zranění
  // (snižuje šum z remíz — genom, který Čerta aspoň zraňuje, je lepší).
  const pa = state.players.find((p) => p.name === 'GenA')!;
  const pb = state.players.find((p) => p.name === 'GenB')!;
  const woundsOf = (pid: string) =>
    WOUND_TYPES.filter((w) => state.devilWounds.woundsByPlayer[pid][w] != null).length;

  if (state.winnerId === pa.id) return [1, 0];
  if (state.winnerId === pb.id) return [0, 1];
  const wa = woundsOf(pa.id);
  const wb = woundsOf(pb.id);
  return [0.5 + (wa - wb) * 0.02, 0.5 + (wb - wa) * 0.02];
}

// -----------------------------------------------------------------------------
// Turnaj jedné generace: round-robin, vrací fitness pole.
// -----------------------------------------------------------------------------
function tournament(population: AiWeights[], seedBase: number): number[] {
  const fitness = population.map(() => 0);
  let gamesPlayed = 0;
  const totalGames = (population.length * (population.length - 1) / 2) * GAMES_PER_PAIR;

  for (let i = 0; i < population.length; i++) {
    for (let j = i + 1; j < population.length; j++) {
      for (let g = 0; g < GAMES_PER_PAIR; g++) {
        // Střídání nasazení: sudá hra i=A, lichá j=A (firstmover bias).
        const swap = g % 2 === 1;
        const seed = seedBase + i * 7919 + j * 104729 + g * 1299709;
        const [ptsA, ptsB] = swap
          ? playGame(population[j], population[i], seed)
          : playGame(population[i], population[j], seed);
        if (swap) {
          fitness[j] += ptsA;
          fitness[i] += ptsB;
        } else {
          fitness[i] += ptsA;
          fitness[j] += ptsB;
        }
        gamesPlayed++;
        if (gamesPlayed % 20 === 0) {
          process.stdout.write(`\r    hra ${gamesPlayed}/${totalGames}…`);
        }
      }
    }
  }
  process.stdout.write(`\r    ${totalGames} her odehráno.        \n`);
  return fitness;
}

// -----------------------------------------------------------------------------
// MAIN — evoluční smyčka
// -----------------------------------------------------------------------------
async function main() {
  console.log('🧬 Evoluční self-play tuner AI');
  console.log(`   Generace: ${GENERATIONS} · Populace: ${POPULATION} · Her/pár: ${GAMES_PER_PAIR} · Max tahů: ${MAX_TURNS}\n`);

  const startedAt = Date.now();

  // Gen 0: aktuální šampion (defaults + tuned JSON) + mutace
  const champion0 = getAiWeights();
  let population: AiWeights[] = [champion0];
  while (population.length < POPULATION) {
    population.push(mutate(champion0, 0.3, 0.6)); // širší úvodní exploration
  }

  let champion = champion0;
  let championFitness = -Infinity;

  for (let gen = 0; gen < GENERATIONS; gen++) {
    console.log(`▶ Generace ${gen + 1}/${GENERATIONS}`);
    const fitness = tournament(population, 1_000_000 + gen * 7_777_777);

    // Seřaď populaci podle fitness
    const ranked = population
      .map((genome, idx) => ({ genome, fit: fitness[idx] }))
      .sort((a, b) => b.fit - a.fit);

    const best = ranked[0];
    const avg = fitness.reduce((a, b) => a + b, 0) / fitness.length;
    console.log(`    nejlepší: ${best.fit.toFixed(2)} b · průměr: ${avg.toFixed(2)} b`);

    if (best.fit > championFitness || gen === 0) {
      champion = best.genome;
      championFitness = best.fit;
    }

    // Selekce + mutace pro další generaci (elitismus: šampion beze změny)
    if (gen < GENERATIONS - 1) {
      const survivors = ranked.slice(0, Math.max(2, Math.floor(POPULATION / 2)));
      const nextPop: AiWeights[] = [best.genome]; // elita
      while (nextPop.length < POPULATION) {
        const parent = survivors[Math.floor(Math.random() * survivors.length)].genome;
        nextPop.push(mutate(parent));
      }
      population = nextPop;
      championFitness = -Infinity; // fitness není mezi generacemi srovnatelná (jiné protivníky)
    }
  }

  // Zaokrouhli a zapiš šampiona
  const rounded: Record<string, number> = {};
  for (const key of Object.keys(GENE_SPEC) as (keyof AiWeights)[]) {
    const spec = GENE_SPEC[key];
    rounded[key] = spec.int ? Math.round(champion[key]) : Math.round(champion[key] * 1000) / 1000;
  }

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const outPath = path.resolve(__dirname, '../game/ai-weights.json');
  fs.writeFileSync(outPath, JSON.stringify(rounded, null, 2) + '\n', 'utf8');

  const mins = ((Date.now() - startedAt) / 60000).toFixed(1);
  console.log(`\n✓ Hotovo za ${mins} min. Šampion zapsán do:\n  ${outPath}`);
  console.log('\nZměny oproti defaultům:');
  for (const key of Object.keys(GENE_SPEC) as (keyof AiWeights)[]) {
    const def = DEFAULT_WEIGHTS[key];
    const evolved = rounded[key];
    if (Math.abs(evolved - def) / (Math.abs(def) || 1) > 0.05) {
      console.log(`  ${key}: ${def} → ${evolved}`);
    }
  }
  console.log('\nDalší krok: npm run build (nové váhy se zabalí do bundle) + commit ai-weights.json');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
