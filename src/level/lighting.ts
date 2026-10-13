import type { SeededRandom } from "../core/rng";

/**
 * Niveaux de luminosité d'une salle. Un seul endroit définit les valeurs : le décor ne contient aucun
 * « nombre magique » d'éclairage, et le réglage d'ambiance se fait ici.
 */
export type LightLevel = "off" | "dim" | "normal" | "bright";

export interface LightLevelSpec {
  /** Intensité du néon (PointLight, en candela). 0 = aucune source : la salle n'est éclairée que par l'ambiance. */
  intensity: number;
  /** Opacité de la flaque de lumière au sol. */
  poolOpacity: number;
  /** Multiplicateur de couleur de la réglette visible (au-delà de 1, elle déclenche le bloom). */
  fixtureGlow: number;
}

export const LIGHT_LEVELS: Readonly<Record<LightLevel, LightLevelSpec>> = {
  off: { intensity: 0, poolOpacity: 0, fixtureGlow: 0.08 },
  dim: { intensity: 4, poolOpacity: 0.12, fixtureGlow: 0.9 },
  normal: { intensity: 9, poolOpacity: 0.22, fixtureGlow: 1.6 },
  bright: { intensity: 14, poolOpacity: 0.3, fixtureGlow: 1.85 },
};

/**
 * Lumière d'ambiance commune à tout le niveau. Plancher de lisibilité : même dans une salle sans néon,
 * le joueur doit distinguer les murs et les gardes (sinon le jeu devient injouable sur un écran de téléphone).
 */
export const AMBIENT_LIGHT = {
  hemisphereIntensity: 0.6,
  moonlightIntensity: 0.35,
} as const;

/** Part des salles éclairées qui sont tamisées ou très claires, le reste est normal. */
const DIM_SHARE = 0.3;
const BRIGHT_SHARE = 0.2;

/**
 * Attribue un niveau à chaque salle. Règles :
 * - la salle de départ (indice 0) est toujours « normal » : premier contact rassurant ;
 * - au plus `maxLitRooms` salles ont une source de lumière (chaque PointLight alourdit tous les shaders) ;
 * - les salles restantes sont « off », mais l'ambiance garantit leur lisibilité ;
 * - le tirage est déterministe (même graine, même niveau) pour que le joueur retrouve ses repères.
 */
export function assignRoomLightLevels(roomCount: number, maxLitRooms: number, random: SeededRandom): LightLevel[] {
  if (!Number.isInteger(roomCount) || roomCount < 0) throw new RangeError(`roomCount invalide : ${roomCount}`);
  if (roomCount === 0) return [];
  const levels: LightLevel[] = new Array<LightLevel>(roomCount).fill("off");
  levels[0] = "normal";
  const otherRooms = Array.from({ length: roomCount - 1 }, (_, offset) => offset + 1);
  const litOthers = random.shuffle(otherRooms).slice(0, Math.max(0, maxLitRooms - 1));
  for (const roomIndex of litOthers) levels[roomIndex] = pickLitLevel(random.next());
  return levels;
}

function pickLitLevel(roll: number): LightLevel {
  if (roll < DIM_SHARE) return "dim";
  if (roll < DIM_SHARE + BRIGHT_SHARE) return "bright";
  return "normal";
}

/** Un néon « fatigué » ne grésille que dans une salle qui a de la lumière à perdre. */
export function canFlicker(level: LightLevel): boolean {
  return level === "normal" || level === "dim";
}
