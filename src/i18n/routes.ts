import type { Lang } from "./lang";

/**
 * Adresses du site par langue, sous le préfixe de déploiement (« / » ou « /rostand/ ») :
 *   portail        /            ·  /en/
 *   jeu <slug>     /jeux/<slug>/  ·  /en/games/<slug>/
 * Les segments sont ceux de chaque langue : une adresse anglaise lisible pour un public anglophone.
 */

const GAME_SEGMENT: Record<Lang, string> = { fr: "jeux", en: "en/games" };
const SLUG = /^[a-z0-9-]{1,40}$/;

export function portalPath(lang: Lang, base: string): string {
  return lang === "en" ? `${base}en/` : base;
}

export function gamePath(slug: string, lang: Lang, base: string): string {
  if (!SLUG.test(slug)) throw new RangeError(`Identifiant de jeu invalide : ${slug}`);
  return `${base}${GAME_SEGMENT[lang]}/${slug}/`;
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
  const game = /^(?:jeux|en\/games)\/([a-z0-9-]{1,40})\/?$/.exec(clean);
  return game ? gamePath(game[1] as string, target, base) : null;
}
