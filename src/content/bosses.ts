import { LANG } from "../i18n/lang";
import { BOSSES_EN } from "./en/bosses";
import { BOSSES_FR } from "./fr/bosses";
import type { BossDefinition } from "./types";

export type { BossDefinition, BossPhase } from "./types";
export { BOSSES_EN, BOSSES_FR };

/** Les boss dans la langue de la page : mêmes modules, mêmes phases dans les deux langues. */
export const BOSSES: Record<string, BossDefinition> = LANG === "en" ? BOSSES_EN : BOSSES_FR;

export function bossFor(moduleId: string): BossDefinition {
  const boss = Object.hasOwn(BOSSES, moduleId) ? BOSSES[moduleId] : undefined;
  if (!boss) throw new RangeError(`Aucun boss pour le module « ${moduleId} »`);
  return boss;
}
