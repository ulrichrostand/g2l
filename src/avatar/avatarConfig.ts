/**
 * Avatar personnalisable « façon Sims » de l'agent humain : uniquement des données, sans Three.js.
 * La config est sauvegardée côté joueur (donc modifiable à la main) : tout ce qui vient du stockage
 * repasse par parseAvatarConfig avant d'être utilisé.
 */

export type BodyType = "male" | "female";
export type BodyBuild = "slim" | "regular" | "strong";
/** Coupes disponibles sur le modèle humain (chacune existe pour les deux silhouettes). */
export type HairStyle = "buzz" | "short" | "long" | "bun" | "bald";

/**
 * Apparence de l'agent : uniquement ce que le personnage humain riggé sait afficher.
 * Les couleurs de vêtements teintent chacune une pièce : gilet (topColor), chemise et ceintures (topAccent),
 * pantalon (bottomColor), bottes (shoesColor).
 */
export interface AvatarConfig {
  body: BodyType;
  build: BodyBuild;
  /** Facteur d'échelle uniforme du personnage, dans HEIGHT_RANGE. */
  height: number;
  skinTone: string;
  hairStyle: HairStyle;
  /** Barbe : silhouette masculine uniquement (toujours false pour l'autre, voir parseAvatarConfig). */
  beard: boolean;
  hairColor: string;
  topColor: string;
  topAccent: string;
  bottomColor: string;
  shoesColor: string;
  /** Couleur des optiques de vision nocturne : la signature lumineuse de l'agent. */
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

/** Spectre tel qu'il a toujours été : tenue sombre, cheveux ras et optiques vertes. */
export const DEFAULT_AVATAR: Readonly<AvatarConfig> = Object.freeze({
  body: "male",
  build: "regular",
  height: 1,
  skinTone: "#7d5036",
  hairStyle: "buzz",
  beard: false,
  hairColor: "#141110",
  topColor: "#2b333c",
  topAccent: "#1a1f25",
  bottomColor: "#1f252c",
  shoesColor: "#14181c",
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
  readonly body: readonly AvatarOption<BodyType>[];
  readonly build: readonly AvatarOption<BodyBuild>[];
  readonly hairStyle: readonly AvatarOption<HairStyle>[];
} = {
  body: [
    { value: "male", label: "Homme" },
    { value: "female", label: "Femme" },
  ],
  build: [
    { value: "slim", label: "Mince" },
    { value: "regular", label: "Moyenne" },
    { value: "strong", label: "Costaud" },
  ],
  hairStyle: [
    { value: "buzz", label: "Rasé" },
    { value: "short", label: "Court" },
    { value: "long", label: "Longs" },
    { value: "bun", label: "Chignon" },
    { value: "bald", label: "Chauve" },
  ],
};

/** Ordre de référence des champs : sert à la validation, à la comparaison et aux clés de cache. */
export const AVATAR_FIELDS: readonly (keyof AvatarConfig)[] = [
  "body",
  "build",
  "height",
  "skinTone",
  "hairStyle",
  "beard",
  "hairColor",
  "topColor",
  "topAccent",
  "bottomColor",
  "shoesColor",
  "visorColor",
];

/**
 * Coupes de l'ancien agent stylisé (sauvegardes d'avant le modèle humain) vers la coupe humaine la plus proche :
 * le joueur retrouve un agent ressemblant au lieu de perdre sa personnalisation.
 */
const LEGACY_HAIR_STYLES: Readonly<Record<string, HairStyle>> = {
  buzz: "buzz",
  short: "short",
  long: "long",
  bun: "bun",
  bald: "bald",
  afro: "short",
  braids: "long",
  locs: "long",
  mohawk: "buzz",
  gele: "bun",
};

const HEX_COLOR = /^#[0-9a-f]{6}$/;

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
 * Une sauvegarde de l'ancien agent stylisé (sans champ `body`) est convertie : ses vêtements spécifiques
 * (motifs, accessoires...) n'existent plus et sont ignorés, ses couleurs et sa coupe sont reprises.
 */
export function parseAvatarConfig(candidate: unknown): AvatarConfig | null {
  if (!isRecordObject(candidate)) return null;
  const rawBody = readOwn(candidate, "body");
  const legacy = rawBody === undefined;
  const body = legacy ? "male" : parseOption(AVATAR_OPTIONS.body, rawBody);
  const build = parseOption(AVATAR_OPTIONS.build, readOwn(candidate, "build"));
  const height = parseHeight(readOwn(candidate, "height"));
  const skinTone = parseHexColor(readOwn(candidate, "skinTone"));
  const hairStyle = legacy ? parseLegacyHairStyle(readOwn(candidate, "hairStyle")) : parseOption(AVATAR_OPTIONS.hairStyle, readOwn(candidate, "hairStyle"));
  const rawBeard = readOwn(candidate, "beard");
  const beard = legacy && rawBeard === undefined ? false : typeof rawBeard === "boolean" ? rawBeard : null;
  const hairColor = parseHexColor(readOwn(candidate, "hairColor"));
  const topColor = parseHexColor(readOwn(candidate, "topColor"));
  const topAccent = parseHexColor(readOwn(candidate, "topAccent"));
  const bottomColor = parseHexColor(readOwn(candidate, "bottomColor"));
  const shoesColor = parseHexColor(readOwn(candidate, "shoesColor"));
  const visorColor = parseHexColor(readOwn(candidate, "visorColor"));
  if (
    body === null ||
    build === null ||
    height === null ||
    skinTone === null ||
    hairStyle === null ||
    beard === null ||
    hairColor === null ||
    topColor === null ||
    topAccent === null ||
    bottomColor === null ||
    shoesColor === null ||
    visorColor === null
  ) {
    return null;
  }
  // Pas de barbe sur la silhouette féminine : le modèle n'en a pas, et la config reste canonique.
  return { body, build, height, skinTone, hairStyle, beard: body === "male" && beard, hairColor, topColor, topAccent, bottomColor, shoesColor, visorColor };
}

function parseLegacyHairStyle(value: unknown): HairStyle | null {
  return typeof value === "string" && Object.hasOwn(LEGACY_HAIR_STYLES, value) ? (LEGACY_HAIR_STYLES[value] ?? null) : null;
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

/**
 * Avatar tiré au hasard, toujours valide et cohérent (accent distinct de la couleur principale, barbe
 * seulement sur la silhouette masculine). Le générateur est injecté : avec une graine, le résultat est reproductible.
 */
export function randomAvatar(random: () => number): AvatarConfig {
  const body = pickValue(random, AVATAR_OPTIONS.body);
  const topColor = pickFrom(random, CLOTH_COLORS).value;
  const naturalHair = random() < 0.8;
  const hairPalette = naturalHair ? HAIR_COLORS.slice(0, NATURAL_HAIR_COUNT) : HAIR_COLORS.slice(NATURAL_HAIR_COUNT);
  // Arrondi au centième : une valeur lisible dans le créateur, et toujours dans la plage.
  const height = Math.round((HEIGHT_RANGE.min + pickFrom(random, [0, 0.25, 0.5, 0.75, 1]) * (HEIGHT_RANGE.max - HEIGHT_RANGE.min)) * 100) / 100;
  return {
    body,
    build: pickValue(random, AVATAR_OPTIONS.build),
    height,
    skinTone: pickFrom(random, SKIN_TONES).value,
    hairStyle: pickValue(random, AVATAR_OPTIONS.hairStyle),
    beard: body === "male" && random() < 0.35,
    hairColor: pickFrom(random, hairPalette).value,
    topColor,
    topAccent: pickColorExcept(random, CLOTH_COLORS, topColor),
    bottomColor: pickFrom(random, CLOTH_COLORS).value,
    shoesColor: pickFrom(random, CLOTH_COLORS).value,
    visorColor: pickFrom(random, VISOR_COLORS).value,
  };
}

export function isSameAvatar(first: AvatarConfig, second: AvatarConfig): boolean {
  return AVATAR_FIELDS.every((field) => first[field] === second[field]);
}
