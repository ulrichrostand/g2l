import { LANGS } from "../i18n/lang";
import { gamePath, legalPath, portalPath } from "../i18n/routes";

/** Adresse publique du site, sans barre finale (ex. « https://ulrichrostand.github.io/rostand »). */
export function siteUrl(origin: string, base: string): string {
  if (!/^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(origin)) throw new RangeError(`Origine invalide (https requis, sans chemin) : ${origin}`);
  return `${origin}${base.replace(/\/$/, "")}`;
}

/** Chemins (sous le préfixe de déploiement) de toutes les pages publiques indexables. */
export function publicPaths(base: string): string[] {
  return LANGS.flatMap((lang) => [portalPath(lang, base), gamePath("devops", lang, base), legalPath(lang, base)]);
}

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function sitemapXml(origin: string, base: string): string {
  siteUrl(origin, base);
  const urls = publicPaths(base).map((path) => `  <url><loc>${escapeXml(origin + path)}</loc></url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
}

/** Les robots lisent ce fichier à la racine du domaine : utile avec un domaine propre, sans effet sur un sous-chemin github.io. */
export function robotsTxt(origin: string, base: string): string {
  siteUrl(origin, base);
  return `User-agent: *\nAllow: /\n\nSitemap: ${origin}${base}sitemap.xml\n`;
}

/** Remplace le marqueur d'adresse publique dans une page : les balises de partage exigent des adresses absolues. */
export const SITE_URL_TOKEN = "__SITE_URL__";

export function injectSiteUrl(html: string, origin: string, base: string): string {
  return html.split(SITE_URL_TOKEN).join(siteUrl(origin, base));
}
