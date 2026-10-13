import { defineConfig } from "vitest/config";
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

export default defineConfig({
  base: siteBase(),
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 900,
    rollupOptions: { input: htmlEntries() },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
