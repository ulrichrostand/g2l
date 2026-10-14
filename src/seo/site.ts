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

/**
 * Pages juridiques : deux versions du texte dans le même fichier, selon que le build gère les comptes ou non.
 * Les blocs <!--g2l:accounts-on--> … et <!--g2l:accounts-off--> ne sont gardés que pour le mode actif, afin que les
 * mentions légales décrivent toujours ce que le site fait réellement.
 */
export function applyAccountsBlocks(html: string, accountsEnabled: boolean): string {
  const keep = accountsEnabled ? "on" : "off";
  const drop = accountsEnabled ? "off" : "on";
  return html
    .replace(new RegExp(`[ \\t]*<!--g2l:accounts-${drop}-->[\\s\\S]*?<!--/g2l:accounts-${drop}-->[ \\t]*\\n?`, "g"), "")
    .replace(new RegExp(`[ \\t]*<!--/?g2l:accounts-${keep}-->[ \\t]*\\n?`, "g"), "");
}

export interface LegalValues {
  contact: string;
  hostName: string;
  hostAddress: string;
}

const EMAIL = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;

/** Variables d'environnement exigées pour publier un site avec comptes : sans elles, le build s'arrête plutôt que de publier des mentions incomplètes. */
export function legalValuesFromEnv(env: Record<string, string | undefined>): LegalValues {
  const names = { contact: "LEGAL_CONTACT_EMAIL", hostName: "LEGAL_HOST_NAME", hostAddress: "LEGAL_HOST_ADDRESS" } as const;
  const missing = Object.values(names).filter((name) => !env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`Build avec comptes (VITE_ACCOUNTS=1) : mentions légales incomplètes. Variables à définir : ${missing.join(", ")}`);
  }
  const contact = (env[names.contact] as string).trim();
  if (!EMAIL.test(contact)) throw new Error(`LEGAL_CONTACT_EMAIL : « ${contact} » n'est pas une adresse e-mail valide`);
  return { contact, hostName: (env[names.hostName] as string).trim(), hostAddress: (env[names.hostAddress] as string).trim() };
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Remplace les marqueurs de coordonnées ; les valeurs sont échappées (elles viennent de l'environnement). */
export function injectLegalValues(html: string, values: LegalValues): string {
  return html
    .split("__LEGAL_CONTACT__").join(escapeHtml(values.contact))
    .split("__LEGAL_HOST_NAME__").join(escapeHtml(values.hostName))
    .split("__LEGAL_HOST_ADDRESS__").join(escapeHtml(values.hostAddress));
}
