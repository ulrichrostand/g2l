/**
 * Avatar personnalisable « façon Sims / Lagos Life » : uniquement des données, sans Three.js.
 * La config est sauvegardée côté joueur (donc modifiable à la main) : tout ce qui vient du stockage
 * repasse par parseAvatarConfig avant d'être utilisé.
 */

export type BodyBuild = "slim" | "regular" | "strong";
export type HairStyle = "buzz" | "short" | "afro" | "braids" | "locs" | "bun" | "long" | "mohawk" | "gele" | "bald";
export type TopStyle = "tactical" | "hoodie" | "tshirt" | "jacket" | "boubou";
export type FabricPattern = "plain" | "ankara" | "asooke" | "camo" | "stripes" | "circuit";
export type BottomStyle = "cargo" | "jeans" | "skirt";
export type ShoeStyle = "boots" | "sneakers" | "sandals";
export type Accessory = "none" | "backpack" | "bag" | "glasses" | "headset" | "cap";

export interface AvatarConfig {
  build: BodyBuild;
  /** Facteur d'échelle uniforme du personnage, dans HEIGHT_RANGE. */
  height: number;
  skinTone: string;
  hairStyle: HairStyle;
  hairColor: string;
  eyeColor: string;
  top: TopStyle;
  topPattern: FabricPattern;
  topColor: string;
  /** Couleur des détails du haut (bordures, poches, broderies) et second ton des motifs. */
  topAccent: string;
  bottom: BottomStyle;
  bottomColor: string;
  shoes: ShoeStyle;
  shoesColor: string;
  accessory: Accessory;
  accessoryColor: string;
  /** Couleur des trois optiques de vision nocturne : la signature lumineuse de l'agent. */
  visorColor: string;
}

export interface AvatarOption<T extends string> {
  value: T;
  label: string;
}

export interface ColorPreset {
  value: string;
  label: string;
}

export const HEIGHT_RANGE = { min: 0.9, max: 1.1 } as const;

/** Spectre tel qu'il a toujours été : tenue tactique sombre, sac à dos et optiques vertes. */
export const DEFAULT_AVATAR: Readonly<AvatarConfig> = Object.freeze({
  build: "regular",
  height: 1,
  skinTone: "#7d5036",
  hairStyle: "buzz",
  hairColor: "#141110",
  eyeColor: "#3b2416",
  top: "tactical",
  topPattern: "plain",
  topColor: "#1a1f25",
  topAccent: "#2b333c",
  bottom: "cargo",
  bottomColor: "#1f252c",
  shoes: "boots",
  shoesColor: "#14181c",
  accessory: "backpack",
  accessoryColor: "#2b333c",
  visorColor: "#39ff88",
});

/** Beaucoup de teintes foncées et moyennes : chacun doit pouvoir se reconnaître dans son agent. */
export const SKIN_TONES: readonly ColorPreset[] = [
  { value: "#3b2219", label: "Ébène" },
  { value: "#4a2c20", label: "Cacao" },
  { value: "#5c3a28", label: "Acajou" },
  { value: "#6b4430", label: "Café" },
  { value: "#7d5036", label: "Cannelle" },
  { value: "#8d5a3b", label: "Noisette" },
  { value: "#a0683f", label: "Caramel" },
  { value: "#b07a4f", label: "Miel" },
  { value: "#c68e5e", label: "Sable" },
  { value: "#d8a77c", label: "Pêche" },
  { value: "#e8bf98", label: "Beige" },
  { value: "#f3d5b8", label: "Porcelaine" },
];

export const HAIR_COLORS: readonly ColorPreset[] = [
  { value: "#141110", label: "Noir" },
  { value: "#2e1e15", label: "Brun foncé" },
  { value: "#5a3a22", label: "Châtain" },
  { value: "#7a3420", label: "Auburn" },
  { value: "#c9a25a", label: "Blond" },
  { value: "#e3dccb", label: "Platine" },
  { value: "#8e8e8e", label: "Gris" },
  { value: "#b0302a", label: "Rouge" },
  { value: "#2a3f8f", label: "Bleu nuit" },
  { value: "#6b3fa0", label: "Violet" },
  { value: "#3fbf95", label: "Vert menthe" },
  { value: "#d9659b", label: "Rose" },
];

/** Les couleurs « naturelles » sont en tête : le tirage aléatoire les privilégie. */
const NATURAL_HAIR_COUNT = 7;

export const EYE_COLORS: readonly ColorPreset[] = [
  { value: "#3b2416", label: "Brun foncé" },
  { value: "#16110e", label: "Noir" },
  { value: "#7a5230", label: "Noisette" },
  { value: "#b07a1f", label: "Ambre" },
  { value: "#4f7f3a", label: "Vert" },
  { value: "#3f78b5", label: "Bleu" },
  { value: "#7d8a92", label: "Gris" },
];

export const CLOTH_COLORS: readonly ColorPreset[] = [
  { value: "#1a1f25", label: "Noir tactique" },
  { value: "#2b333c", label: "Ardoise" },
  { value: "#5b6670", label: "Gris acier" },
  { value: "#ecebe6", label: "Blanc cassé" },
  { value: "#6d6a4c", label: "Kaki" },
  { value: "#4b5a32", label: "Olive" },
  { value: "#c2a878", label: "Sable" },
  { value: "#1f3157", label: "Bleu marine" },
  { value: "#3b5b8c", label: "Denim" },
  { value: "#2456c7", label: "Bleu roi" },
  { value: "#1fa5a0", label: "Turquoise" },
  { value: "#13865a", label: "Vert émeraude" },
  { value: "#f2b318", label: "Jaune soleil" },
  { value: "#e5711d", label: "Orange" },
  { value: "#c62f2f", label: "Rouge" },
  { value: "#6e1f2f", label: "Bordeaux" },
  { value: "#c2337a", label: "Fuchsia" },
  { value: "#5d3196", label: "Violet" },
  { value: "#c9a23a", label: "Or" },
  { value: "#6b4226", label: "Marron" },
];

/** Pas de rouge : c'est la couleur d'ENTROPIA, le joueur doit toujours distinguer son agent des sentinelles. */
export const VISOR_COLORS: readonly ColorPreset[] = [
  { value: "#39ff88", label: "Vert Spectre" },
  { value: "#3fe0ff", label: "Cyan" },
  { value: "#ffb53f", label: "Ambre" },
  { value: "#ff4fd8", label: "Magenta" },
  { value: "#9b6bff", label: "Violet" },
  { value: "#f2f7ff", label: "Blanc" },
];

export const AVATAR_OPTIONS: {
  readonly build: readonly AvatarOption<BodyBuild>[];
  readonly hairStyle: readonly AvatarOption<HairStyle>[];
  readonly top: readonly AvatarOption<TopStyle>[];
  readonly topPattern: readonly AvatarOption<FabricPattern>[];
  readonly bottom: readonly AvatarOption<BottomStyle>[];
  readonly shoes: readonly AvatarOption<ShoeStyle>[];
  readonly accessory: readonly AvatarOption<Accessory>[];
} = {
  build: [
    { value: "slim", label: "Mince" },
    { value: "regular", label: "Moyenne" },
    { value: "strong", label: "Costaud" },
  ],
  hairStyle: [
    { value: "buzz", label: "Rasé court" },
    { value: "short", label: "Court" },
    { value: "afro", label: "Afro" },
    { value: "braids", label: "Tresses" },
    { value: "locs", label: "Locks" },
    { value: "bun", label: "Chignon" },
    { value: "long", label: "Longs" },
    { value: "mohawk", label: "Crête" },
    { value: "gele", label: "Gele (foulard)" },
    { value: "bald", label: "Chauve" },
  ],
  top: [
    { value: "tactical", label: "Gilet tactique" },
    { value: "hoodie", label: "Sweat à capuche" },
    { value: "tshirt", label: "T-shirt" },
    { value: "jacket", label: "Veste" },
    { value: "boubou", label: "Boubou" },
  ],
  topPattern: [
    { value: "plain", label: "Uni" },
    { value: "ankara", label: "Ankara (wax)" },
    { value: "asooke", label: "Aso-oke" },
    { value: "camo", label: "Camouflage" },
    { value: "stripes", label: "Rayures" },
    { value: "circuit", label: "Circuit imprimé" },
  ],
  bottom: [
    { value: "cargo", label: "Pantalon cargo" },
    { value: "jeans", label: "Jean" },
    { value: "skirt", label: "Jupe / pagne" },
  ],
  shoes: [
    { value: "boots", label: "Rangers" },
    { value: "sneakers", label: "Baskets" },
    { value: "sandals", label: "Sandales" },
  ],
  accessory: [
    { value: "none", label: "Aucun" },
    { value: "backpack", label: "Sac à dos" },
    { value: "bag", label: "Sac en bandoulière" },
    { value: "glasses", label: "Lunettes" },
    { value: "headset", label: "Casque radio" },
    { value: "cap", label: "Casquette" },
  ],
};

/** Ordre de référence des champs : sert à la validation, à la comparaison et aux clés de cache. */
export const AVATAR_FIELDS: readonly (keyof AvatarConfig)[] = [
  "build",
  "height",
  "skinTone",
  "hairStyle",
  "hairColor",
  "eyeColor",
  "top",
  "topPattern",
  "topColor",
  "topAccent",
  "bottom",
  "bottomColor",
  "shoes",
  "shoesColor",
  "accessory",
  "accessoryColor",
  "visorColor",
];

const HEX_COLOR = /^#[0-9a-f]{6}$/;

/** Coiffures volumineuses : une casquette par-dessus serait absurde, le tirage aléatoire les sépare. */
const VOLUMINOUS_HAIR: readonly HairStyle[] = ["afro", "bun", "mohawk", "gele"];

function isRecordObject(candidate: unknown): candidate is Record<string, unknown> {
  return typeof candidate === "object" && candidate !== null && !Array.isArray(candidate);
}

/**
 * Lecture des seules propriétés propres : un objet dont le prototype porte des champs
 * (ou une clé "__proto__" injectée) ne peut pas faire passer une valeur pour valide.
 */
function readOwn(record: Record<string, unknown>, key: string): unknown {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

function parseOption<T extends string>(options: readonly AvatarOption<T>[], value: unknown): T | null {
  if (typeof value !== "string") return null;
  const match = options.find((option) => option.value === value);
  return match ? match.value : null;
}

/** Couleur "#rrggbb" normalisée en minuscules, ou null. La longueur est vérifiée avant toute transformation. */
export function parseHexColor(value: unknown): string | null {
  if (typeof value !== "string" || value.length !== 7) return null;
  const normalized = value.toLowerCase();
  return HEX_COLOR.test(normalized) ? normalized : null;
}

function parseHeight(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value >= HEIGHT_RANGE.min && value <= HEIGHT_RANGE.max ? value : null;
}

/**
 * Validation stricte d'un avatar venant du stockage ou d'un code collé.
 * Copie champ par champ : aucune propriété inattendue ne survit, et un seul champ invalide rejette tout
 * (on retombe alors sur l'avatar par défaut plutôt que sur un mélange incohérent).
 */
export function parseAvatarConfig(candidate: unknown): AvatarConfig | null {
  if (!isRecordObject(candidate)) return null;
  const build = parseOption(AVATAR_OPTIONS.build, readOwn(candidate, "build"));
  const height = parseHeight(readOwn(candidate, "height"));
  const skinTone = parseHexColor(readOwn(candidate, "skinTone"));
  const hairStyle = parseOption(AVATAR_OPTIONS.hairStyle, readOwn(candidate, "hairStyle"));
  const hairColor = parseHexColor(readOwn(candidate, "hairColor"));
  const eyeColor = parseHexColor(readOwn(candidate, "eyeColor"));
  const top = parseOption(AVATAR_OPTIONS.top, readOwn(candidate, "top"));
  const topPattern = parseOption(AVATAR_OPTIONS.topPattern, readOwn(candidate, "topPattern"));
  const topColor = parseHexColor(readOwn(candidate, "topColor"));
  const topAccent = parseHexColor(readOwn(candidate, "topAccent"));
  const bottom = parseOption(AVATAR_OPTIONS.bottom, readOwn(candidate, "bottom"));
  const bottomColor = parseHexColor(readOwn(candidate, "bottomColor"));
  const shoes = parseOption(AVATAR_OPTIONS.shoes, readOwn(candidate, "shoes"));
  const shoesColor = parseHexColor(readOwn(candidate, "shoesColor"));
  const accessory = parseOption(AVATAR_OPTIONS.accessory, readOwn(candidate, "accessory"));
  const accessoryColor = parseHexColor(readOwn(candidate, "accessoryColor"));
  const visorColor = parseHexColor(readOwn(candidate, "visorColor"));
  if (
    build === null ||
    height === null ||
    skinTone === null ||
    hairStyle === null ||
    hairColor === null ||
    eyeColor === null ||
    top === null ||
    topPattern === null ||
    topColor === null ||
    topAccent === null ||
    bottom === null ||
    bottomColor === null ||
    shoes === null ||
    shoesColor === null ||
    accessory === null ||
    accessoryColor === null ||
    visorColor === null
  ) {
    return null;
  }
  return {
    build,
    height,
    skinTone,
    hairStyle,
    hairColor,
    eyeColor,
    top,
    topPattern,
    topColor,
    topAccent,
    bottom,
    bottomColor,
    shoes,
    shoesColor,
    accessory,
    accessoryColor,
    visorColor,
  };
}

/** Choix uniforme robuste : un générateur qui renverrait 1 ou NaN ne fait pas sortir du tableau. */
function pickFrom<T>(random: () => number, items: readonly T[]): T {
  const draw = random();
  const index = Number.isFinite(draw) ? Math.min(items.length - 1, Math.max(0, Math.floor(draw * items.length))) : 0;
  return items[index] as T;
}

function pickValue<T extends string>(random: () => number, options: readonly AvatarOption<T>[]): T {
  return pickFrom(random, options).value;
}

function pickColorExcept(random: () => number, palette: readonly ColorPreset[], excluded: string): string {
  const candidates = palette.filter((preset) => preset.value !== excluded);
  return pickFrom(random, candidates.length > 0 ? candidates : palette).value;
}

/** Motif cohérent avec le vêtement : un gilet tactique en wax serait un contresens visuel. */
function pickPattern(random: () => number, top: TopStyle): FabricPattern {
  if (top === "tactical") return pickFrom<FabricPattern>(random, ["plain", "plain", "camo", "circuit"]);
  if (top === "boubou") return pickFrom<FabricPattern>(random, ["ankara", "asooke", "plain", "ankara"]);
  return pickValue(random, AVATAR_OPTIONS.topPattern);
}

/**
 * Avatar tiré au hasard, toujours valide et cohérent (pas de casquette sur un afro, accent distinct
 * de la couleur principale...). Le générateur est injecté : avec une graine, le résultat est reproductible.
 */
export function randomAvatar(random: () => number): AvatarConfig {
  const hairStyle = pickValue(random, AVATAR_OPTIONS.hairStyle);
  const top = pickValue(random, AVATAR_OPTIONS.top);
  const topColor = pickFrom(random, CLOTH_COLORS).value;
  const naturalHair = random() < 0.8;
  const hairPalette = naturalHair ? HAIR_COLORS.slice(0, NATURAL_HAIR_COUNT) : HAIR_COLORS.slice(NATURAL_HAIR_COUNT);
  let accessory = pickValue(random, AVATAR_OPTIONS.accessory);
  if (accessory === "cap" && VOLUMINOUS_HAIR.includes(hairStyle)) accessory = "backpack";
  // Arrondi au centième : une valeur lisible dans le créateur, et toujours dans la plage.
  const height = Math.round((HEIGHT_RANGE.min + pickFrom(random, [0, 0.25, 0.5, 0.75, 1]) * (HEIGHT_RANGE.max - HEIGHT_RANGE.min)) * 100) / 100;
  return {
    build: pickValue(random, AVATAR_OPTIONS.build),
    height,
    skinTone: pickFrom(random, SKIN_TONES).value,
    hairStyle,
    hairColor: pickFrom(random, hairPalette).value,
    eyeColor: pickFrom(random, EYE_COLORS).value,
    top,
    topPattern: pickPattern(random, top),
    topColor,
    topAccent: pickColorExcept(random, CLOTH_COLORS, topColor),
    bottom: pickValue(random, AVATAR_OPTIONS.bottom),
    bottomColor: pickFrom(random, CLOTH_COLORS).value,
    shoes: pickValue(random, AVATAR_OPTIONS.shoes),
    shoesColor: pickFrom(random, CLOTH_COLORS).value,
    accessory,
    accessoryColor: pickFrom(random, CLOTH_COLORS).value,
    visorColor: pickFrom(random, VISOR_COLORS).value,
  };
}

export function isSameAvatar(first: AvatarConfig, second: AvatarConfig): boolean {
  return AVATAR_FIELDS.every((field) => first[field] === second[field]);
}
