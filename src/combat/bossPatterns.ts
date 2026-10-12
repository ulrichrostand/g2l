/**
 * Motifs de tir des boss de fin de secteur. Module pur, sans Three.js : testable sous Node.
 * Toutes les salves restent esquivables par un débutant : des trous réguliers entre les balles,
 * des balles plus lentes que celles des sentinelles, et chaque salve est annoncée (télégraphe).
 */

/**
 * burst : courte rafale visée (balles émises l'une après l'autre) ;
 * fan : éventail visé, toutes les balles en même temps ;
 * ring : anneau dans toutes les directions, toutes en même temps ;
 * spiral : anneau émis balle par balle, dont l'origine tourne d'une salve à l'autre.
 */
export type BossPattern = "burst" | "fan" | "ring" | "spiral";

export interface BossTuning {
  /** Balles à encaisser avant que le boss ne tombe à genoux, pour chacune des 3 phases. */
  armorPerPhase: [number, number, number];
  /** Pause entre la fin d'une salve et le télégraphe de la suivante, par phase. */
  volleyIntervalSeconds: [number, number, number];
  /** Vitesse des balles (cases/s), par phase. */
  shotSpeed: [number, number, number];
  /** Durée de l'annonce avant chaque salve : la fenêtre pour se mettre à couvert ou s'écarter. */
  telegraphSeconds: number;
  /** Temps laissé pour taper la commande quand le boss est à genoux. */
  exposedSeconds: number;
  /** Vitesse de déplacement latéral (cases/s). */
  moveSpeed: number;
}

/** Ouverture totale de l'éventail, indépendante du nombre de balles : plus de balles = trous plus serrés. */
export const FAN_ARC_RADIANS = 1.1;
/** Écart entre deux balles d'une rafale : assez serré pour viser, assez ouvert pour lire la trajectoire. */
export const BURST_SPACING_RADIANS = 0.05;
export const BURST_SHOT_COUNT = 3;
/**
 * Rotation de la spirale entre deux salves, en fraction de l'écart entre balles.
 * Le nombre d'or évite que le motif ne se répète : les trous ne sont jamais au même endroit.
 */
const SPIRAL_TURN_FRACTION = 0.381966;
const FULL_TURN = Math.PI * 2;
const LEVEL_COUNT = 16;
const MAX_LEVEL = LEVEL_COUNT - 1;
/** Au-delà, les balles deviennent difficiles à esquiver pour quelqu'un qui découvre le jeu. */
const MAX_SHOT_SPEED = 12;

/** Le « vrai » cycle de chaque phase : on apprend d'abord à esquiver une rafale, puis on ajoute un motif par phase. */
const PHASE_CYCLES: readonly (readonly BossPattern[])[] = [["burst"], ["fan", "burst"], ["ring", "fan", "spiral", "fan"]];

/**
 * Angles des balles d'une salve, dans l'ordre d'émission (convention mathématique, radians).
 * `step` : index de la salve, il fait tourner la spirale d'une salve à l'autre.
 */
export function patternAngles(pattern: BossPattern, aimAngle: number, count: number, step: number): number[] {
  const total = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  const angles: number[] = [];
  if (total === 0) return angles;
  switch (pattern) {
    case "burst":
      for (let index = 0; index < total; index++) angles.push(aimAngle + centeredOffset(index, total) * BURST_SPACING_RADIANS);
      return angles;
    case "fan": {
      const spacing = total > 1 ? FAN_ARC_RADIANS / (total - 1) : 0;
      for (let index = 0; index < total; index++) angles.push(aimAngle + centeredOffset(index, total) * spacing);
      return angles;
    }
    case "ring":
    case "spiral": {
      const gap = FULL_TURN / total;
      const turn = pattern === "spiral" && Number.isFinite(step) ? step * gap * SPIRAL_TURN_FRACTION : 0;
      for (let index = 0; index < total; index++) angles.push(aimAngle + turn + index * gap);
      return angles;
    }
  }
}

/** Décalage symétrique autour de 0 : -1, 0, 1 pour 3 balles ; -1.5, -0.5, 0.5, 1.5 pour 4. */
function centeredOffset(index: number, total: number): number {
  return index - (total - 1) / 2;
}

/** Motif de la `volleyIndex`-ième salve d'une phase (0..2, bornée). */
export function patternForPhase(phaseIndex: number, volleyIndex: number): BossPattern {
  const cycle = PHASE_CYCLES[clampInteger(phaseIndex, 0, PHASE_CYCLES.length - 1)] as readonly BossPattern[];
  const volley = Number.isFinite(volleyIndex) ? Math.floor(volleyIndex) : 0;
  // Modulo positif : un index négatif reste dans le cycle au lieu de sortir du tableau.
  return cycle[((volley % cycle.length) + cycle.length) % cycle.length] as BossPattern;
}

/** Les motifs « visés » ont besoin de voir le joueur ; l'anneau et la spirale partent dans toutes les directions. */
export function isAimedPattern(pattern: BossPattern): boolean {
  return pattern === "burst" || pattern === "fan";
}

/** Motifs émis balle après balle (une rafale, un bras de spirale) plutôt que d'un bloc. */
export function isSequencedPattern(pattern: BossPattern): boolean {
  return pattern === "burst" || pattern === "spiral";
}

/** Nombre de balles d'une salve : l'éventail passe de 5 à 7 balles et l'anneau de 10 à 14 au fil des secteurs. */
export function patternShotCount(pattern: BossPattern, level: number): number {
  const progress = normalizeLevel(level) / MAX_LEVEL;
  switch (pattern) {
    case "burst":
      return BURST_SHOT_COUNT;
    case "fan":
      return 5 + Math.round(progress * 2);
    case "ring":
    case "spiral":
      return 10 + Math.round(progress * 4);
  }
}

/** Réglages du boss d'un secteur (moduleIndex 0..15) : tout se durcit avec la phase et avec le niveau. */
export function bossTuning(level: number): BossTuning {
  const safeLevel = normalizeLevel(level);
  const extraArmor = Math.floor(safeLevel / 4);
  const shotSpeed = (base: number): number => Math.min(MAX_SHOT_SPEED, base + safeLevel * 0.13);
  const interval = (base: number): number => base - safeLevel * 0.04;
  return {
    armorPerPhase: [4 + extraArmor, 5 + extraArmor, 6 + extraArmor],
    volleyIntervalSeconds: [interval(1.9), interval(1.6), interval(1.4)],
    shotSpeed: [shotSpeed(8), shotSpeed(9), shotSpeed(10)],
    telegraphSeconds: 0.7 - safeLevel * 0.01,
    // Constant : les commandes à taper deviennent plus dures, réduire aussi le temps punirait deux fois.
    exposedSeconds: 14,
    moveSpeed: 0.9 + safeLevel * 0.02,
  };
}

/** Niveau entier dans [0, 15] : une valeur absurde ne doit pas produire un boss injouable. */
function normalizeLevel(level: number): number {
  return clampInteger(level, 0, MAX_LEVEL);
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.floor(value)));
}
