/**
 * Langue du site. Chaque page HTML porte sa langue (`<html lang>`) : une URL par langue, donc des pages que les moteurs de
 * recherche et les partages de liens distinguent. Le code lit cette valeur une fois au chargement ; changer de langue,
 * c'est naviguer vers l'autre URL (voir routes.ts).
 */

export type Lang = "fr" | "en";
export const LANGS: readonly Lang[] = ["fr", "en"];
export const DEFAULT_LANG: Lang = "fr";

/** « en », « en-GB », « EN_us » → "en" ; toute autre valeur → null (jamais une langue inventée). */
export function parseLang(value: unknown): Lang | null {
  if (typeof value !== "string") return null;
  const primary = value.trim().toLowerCase().split(/[-_]/)[0];
  return primary === "fr" || primary === "en" ? primary : null;
}

/** Langue de la page courante ; français hors navigateur (tests, Node) ou si l'attribut est absent ou inconnu. */
export function readPageLang(doc: { documentElement?: { lang?: string } } | undefined = typeof document === "undefined" ? undefined : document): Lang {
  return parseLang(doc?.documentElement?.lang) ?? DEFAULT_LANG;
}

export const LANG: Lang = readPageLang();

/** Paramètres régionaux pour les dates et les nombres. */
export function localeFor(lang: Lang): string {
  return lang === "en" ? "en-US" : "fr-FR";
}
export const LOCALE = localeFor(LANG);

/** Singulier ? En français 0 et 1 sont au singulier (« 0 secteur »), en anglais seul 1 l'est (« 0 sectors »). */
export function isSingular(count: number, lang: Lang = LANG): boolean {
  return lang === "en" ? count === 1 : Math.abs(count) < 2;
}
