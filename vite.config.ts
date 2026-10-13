import { defineConfig } from "vitest/config";

/**
 * Préfixe d'URL du site : « /rostand/ » sur GitHub Pages, « / » sur un serveur à domaine propre (VPS) et en local.
 * Un préfixe absolu (plutôt que « ./ ») garde les chargements de modèles 3D corrects depuis les pages imbriquées
 * (le portail est à la racine, le jeu sous /jeux/devops/).
 */
function siteBase(): string {
  const raw = process.env.APP_BASE ?? "/";
  if (!/^\/([A-Za-z0-9._-]+\/)*$/.test(raw)) throw new Error(`APP_BASE invalide : « ${raw} » (attendu : « / » ou « /nom/ »)`);
  return raw;
}

export default defineConfig({
  base: siteBase(),
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      // Une page par produit : le portail (catalogue des parcours) et chaque jeu.
      input: {
        portal: "index.html",
        devops: "jeux/devops/index.html",
      },
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
