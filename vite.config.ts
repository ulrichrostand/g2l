import { defineConfig, type Plugin } from "vitest/config";
import { applyAccountsBlocks, injectLegalValues, injectSiteUrl, legalValuesFromEnv, robotsTxt, sitemapXml } from "./src/seo/site";
import { LANGS } from "./src/i18n/lang";
import { gameHtmlFile, legalHtmlFile } from "./src/i18n/routes";

/**
 * Préfixe d'URL du site : « /rostand/ » sur GitHub Pages, « / » sur un serveur à domaine propre (VPS) et en local.
 * Un préfixe absolu (plutôt que « ./ ») garde les chargements de modèles 3D corrects depuis les pages imbriquées
 * (le portail est à la racine, les jeux sous /jeux/<jeu>/ et /en/games/<jeu>/).
 */
function siteBase(): string {
  const raw = process.env.APP_BASE ?? "/";
  if (!/^\/([A-Za-z0-9._-]+\/)*$/.test(raw)) throw new Error(`APP_BASE invalide : « ${raw} » (attendu : « / » ou « /nom/ »)`);
  return raw;
}

/** Origine publique du site (domaine). À changer avec SITE_ORIGIN le jour où le site a son propre nom de domaine. */
function siteOrigin(): string {
  return process.env.SITE_ORIGIN ?? "https://ulrichrostand.github.io";
}

/** Adresses absolues des balises de partage, sitemap et robots.txt, calculés au build avec le bon domaine et le bon préfixe. */
function seoPlugin(command: "build" | "serve"): Plugin {
  const origin = siteOrigin();
  const base = siteBase();
  const accounts = process.env.VITE_ACCOUNTS === "1";
  // Avec les comptes, le build refuse de produire des mentions légales incomplètes ; en développement, des valeurs d'exemple suffisent.
  const legal = accounts
    ? command === "build"
      ? legalValuesFromEnv(process.env)
      : { contact: "contact@exemple.invalid", hostName: "(hébergeur à renseigner)", hostAddress: "(adresse à renseigner)" }
    : null;
  return {
    name: "g2l-seo",
    transformIndexHtml: {
      order: "pre",
      handler: (html) => {
        const withBlocks = applyAccountsBlocks(injectSiteUrl(html, origin, base), accounts);
        return legal ? injectLegalValues(withBlocks, legal) : withBlocks;
      },
    },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "sitemap.xml", source: sitemapXml(origin, base) });
      this.emitFile({ type: "asset", fileName: "robots.txt", source: robotsTxt(origin, base) });
    },
  };
}

/** Une page par langue et par produit : le portail, chaque jeu et les mentions légales, en français et en anglais. */
function htmlEntries(): Record<string, string> {
  const entries: Record<string, string> = {};
  for (const lang of LANGS) {
    entries[`portal-${lang}`] = lang === "en" ? "en/index.html" : "index.html";
    entries[`devops-${lang}`] = gameHtmlFile("devops", lang);
    entries[`legal-${lang}`] = legalHtmlFile(lang);
  }
  return entries;
}

export default defineConfig(({ command }) => ({
  base: siteBase(),
  plugins: [seoPlugin(command)],
  // En développement, l'API (npm start dans server/) est servie sous le même nom d'hôte que le site, comme avec le reverse proxy.
  server: { proxy: { "/api": "http://127.0.0.1:3000" } },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 900,
    rollupOptions: { input: htmlEntries() },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
}));
