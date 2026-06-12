// =============================================================================
// AI WEIGHTS ("genom") — všechny laditelné konstanty heuristické AI
// =============================================================================
// Smysl: místo hardcoded čísel rozesetých po ai.ts má AI jeden objekt vah.
// Evoluční tuner (research/evolve.ts) hraje AI-vs-AI turnaje s mutovanými
// genomy a vítězný zapisuje do ai-weights.json — hra ho automaticky načte.
//
// Konvence: čím vyšší váha, tím víc AI danou věc chce. Pravděpodobnostní
// prahy (xxxP) jsou v intervalu 0..1.
// =============================================================================

import tunedJson from './ai-weights.json';

export interface AiWeights {
  // --- start tahu -----------------------------------------------------------
  /** Strop brambor — nad ním AI nikdy nevolí "Neházej" (anti-stall). */
  potatoCap: number;
  /** Práh skóre ruky: pod ním AI radši vezme 2 🥔 než házet. */
  skipThreshold: number;

  // --- souboj s Čertem (nová pravidla: smrtelná rána = NOVÝ hod ≥ 25) -------
  /** P(sum≥25) nutná k zahájení/pokračování finálního hodu (klidný režim). */
  devilFinalP: number;
  /** Totéž, když soupeř vypadá blízko výhry (zoufalejší = nižší práh). */
  devilFinalPDesperate: number;
  /** Mid-combat re-roll na zranění: min. počet kostek v ruce. */
  devilMidRerollMinDice: number;
  /** Odhad: kolik nejmenších kostek padne na sloty 1+2 při plánování. */
  devilSmallDiceForLowWounds: number;

  // --- pohyb (scoreMove) -----------------------------------------------------
  catSmashBase: number;
  catFirstMilestone: number;
  devilMoveReady: number;
  treeMoveBase: number;
  dirtMoveBase: number;
  bedMoveBase: number;

  // --- využití pole (scoreUseField) ------------------------------------------
  thornBase: number;
  treeUseBase: number;
  treeUseDecay: number;
  bedRampLimit: number;
  bedUseHigh: number;
  bedUseLow: number;
  kakejHigh: number;
  kakejMid: number;
  kakejLow: number;
  plantLimit: number;
  plantScore: number;

  // --- formace (úkoly) --------------------------------------------------------
  /** Bonus za značku na dílku, kde ještě žádnou nemám (Průzkumník). */
  pruzkumnikNewTile: number;
  /** Násobič progresu: blízko 6 dílků → bonus roste. */
  pruzkumnikCloseScale: number;
  /** Obklíčení: bonus za každou moji existující značku kolem cílové soupeřovy. */
  obklPerAdj: number;
  /** Obklíčení: bonus při dokončení (4. značka). */
  obklComplete: number;
  /** Přímka: bonus za každý hex souvislé řady, kterou tahle značka prodlouží. */
  primkaPerRun: number;
  /** Přímka: bonus při dosažení 5. */
  primkaComplete: number;
  /** Násobič hodnoty schopnosti přiřazené úkolu (task-aware play). */
  taskSkillScale: number;

  // --- stateValue (lookahead ohodnocení stavu) --------------------------------
  svWound: number;
  svCarrot: number;
  svBobek: number;
  svDie: number;
  svPotato: number;
  svTile: number;
  svDevilDistMax: number;
  svDevilDistPer: number;

  // --- Monte Carlo lookahead ---------------------------------------------------
  mcSamples: number;
  myTurnLookahead: number;
}

export const DEFAULT_WEIGHTS: AiWeights = {
  potatoCap: 8,
  skipThreshold: 3.0,

  devilFinalP: 0.40,
  devilFinalPDesperate: 0.22,
  devilMidRerollMinDice: 3,
  devilSmallDiceForLowWounds: 2,

  catSmashBase: 20,
  catFirstMilestone: 12,
  devilMoveReady: 25,
  treeMoveBase: 7,
  dirtMoveBase: 5,
  bedMoveBase: 5,

  thornBase: 12,
  treeUseBase: 14,
  treeUseDecay: 2,
  bedRampLimit: 5,
  bedUseHigh: 12,
  bedUseLow: 3,
  kakejHigh: 16,
  kakejMid: 13,
  kakejLow: 8,
  plantLimit: 4,
  plantScore: 8,

  pruzkumnikNewTile: 4,
  pruzkumnikCloseScale: 2.0,
  obklPerAdj: 3,
  obklComplete: 14,
  primkaPerRun: 2.5,
  primkaComplete: 16,
  taskSkillScale: 1.0,

  svWound: 200,
  svCarrot: 5,
  svBobek: 4,
  svDie: 3,
  svPotato: 0.15,
  svTile: 6,
  svDevilDistMax: 30,
  svDevilDistPer: 5,

  mcSamples: 10,
  myTurnLookahead: 3,
};

// Aktivní váhy. Inicializace = defaults přepsané vyladěným JSON (pokud
// evoluce nějaký zapsala — prázdný {} nechá čisté defaults).
export let W: AiWeights = { ...DEFAULT_WEIGHTS, ...(tunedJson as Partial<AiWeights>) };

/** Přepiš aktivní váhy (parciálně). Použito evolucí pro per-genome hraní. */
export function setAiWeights(w: Partial<AiWeights>): void {
  W = { ...DEFAULT_WEIGHTS, ...w };
}

/** Vrať aktivní váhy (kopie). */
export function getAiWeights(): AiWeights {
  return { ...W };
}

/** Reset na defaults + tuned JSON. */
export function resetAiWeights(): void {
  W = { ...DEFAULT_WEIGHTS, ...(tunedJson as Partial<AiWeights>) };
}
