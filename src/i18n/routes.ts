import type { Lang } from "./lang";

/**
 * Adresses du site par langue, sous le préfixe de déploiement (« / » ou « /g2l/ ») :
 *   portail        /            ·  /en/
 *   jeu <slug>     /jeux/<slug>/  ·  /en/games/<slug>/
 *   mentions       /mentions-legales/  ·  /en/legal/
 * Les segments sont ceux de chaque langue : une adresse anglaise lisible pour un public anglophone.
 */

const GAME_SEGMENT: Record<Lang, string> = { fr: "jeux", en: "en/games" };
const LEGAL_SEGMENT: Record<Lang, string> = { fr: "mentions-legales", en: "en/legal" };
const SLUG = /^[a-z0-9-]{1,40}$/;

export function portalPath(lang: Lang, base: string): string {
  return lang === "en" ? `${base}en/` : base;
}

export function gamePath(slug: string, lang: Lang, base: string): string {
  if (!SLUG.test(slug)) throw new RangeError(`Identifiant de jeu invalide : ${slug}`);
  return `${base}${GAME_SEGMENT[lang]}/${slug}/`;
}

/** Page des mentions légales et de la confidentialité. */
export function legalPath(lang: Lang, base: string): string {
  return `${base}${LEGAL_SEGMENT[lang]}/`;
}

export function legalHtmlFile(lang: Lang): string {
  return `${LEGAL_SEGMENT[lang]}/index.html`;
}

/** Fichier HTML (sous la racine du projet) d'une page, pour la configuration de build. */
export function gameHtmlFile(slug: string, lang: Lang): string {
  return `${lang === "en" ? "en/games" : "jeux"}/${slug}/index.html`;
}

/**
 * Adresse équivalente dans l'autre langue pour la page courante, ou null si l'adresse n'appartient à aucune page connue.
 * `pathname` est le chemin complet (avec préfixe de déploiement).
 */
export function alternatePath(pathname: string, target: Lang, base: string): string | null {
  const relative = pathname.startsWith(base) ? pathname.slice(base.length) : null;
  if (relative === null) return null;
  const clean = relative.replace(/index\.html$/, "");
  if (clean === "" || clean === "en/" || clean === "en") return portalPath(target, base);
  if (clean === "mentions-legales/" || clean === "mentions-legales" || clean === "en/legal/" || clean === "en/legal") return legalPath(target, base);
  const game = /^(?:jeux|en\/games)\/([a-z0-9-]{1,40})\/?$/.exec(clean);
  return game ? gamePath(game[1] as string, target, base) : null;
}
