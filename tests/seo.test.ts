import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LANGS } from "../src/i18n/lang";
import { injectSiteUrl, publicPaths, robotsTxt, siteUrl, sitemapXml } from "../src/seo/site";

const ORIGIN = "https://ulrichrostand.github.io";
const PAGES = ["index.html", "en/index.html", "jeux/devops/index.html", "en/games/devops/index.html", "mentions-legales/index.html", "en/legal/index.html"];
const read = (file: string): string => readFileSync(file, "utf8");

describe("adresses publiques", () => {
  it("assemble l'origine et le préfixe de déploiement, et refuse une origine invalide", () => {
    expect(siteUrl(ORIGIN, "/rostand/")).toBe("https://ulrichrostand.github.io/rostand");
    expect(siteUrl("https://exemple.fr", "/")).toBe("https://exemple.fr");
    expect(() => siteUrl("http://exemple.fr", "/")).toThrow(RangeError);
    expect(() => siteUrl("https://exemple.fr/chemin", "/")).toThrow(RangeError);
  });

  it("remplace le marqueur partout dans une page", () => {
    expect(injectSiteUrl('<a href="__SITE_URL__/en/"> <b content="__SITE_URL__/x">', ORIGIN, "/rostand/")).toBe(
      '<a href="https://ulrichrostand.github.io/rostand/en/"> <b content="https://ulrichrostand.github.io/rostand/x">',
    );
  });

  it("liste les six pages publiques dans le sitemap et pointe robots.txt vers lui", () => {
    expect(publicPaths("/rostand/")).toHaveLength(6);
    const xml = sitemapXml(ORIGIN, "/rostand/");
    for (const path of publicPaths("/rostand/")) expect(xml).toContain(`<loc>${ORIGIN}${path}</loc>`);
    expect(robotsTxt(ORIGIN, "/rostand/")).toContain(`Sitemap: ${ORIGIN}/rostand/sitemap.xml`);
  });
});

describe("balises de partage des pages", () => {
  it("chaque page a ses balises Open Graph, une image absolue et une carte large", () => {
    for (const file of PAGES) {
      const html = read(file);
      for (const property of ["og:title", "og:description", "og:url", "og:image", "og:image:alt", "og:locale", "og:site_name"]) expect(html, `${file} : ${property}`).toContain(`property="${property}"`);
      expect(html, file).toContain('content="__SITE_URL__/share/og-image.png"');
      expect(html, file).toContain('name="twitter:card" content="summary_large_image"');
      expect(html, file).toContain('rel="canonical"');
    }
  });

  it("chaque page déclare ses deux versions linguistiques et la langue par défaut", () => {
    for (const file of PAGES) {
      const html = read(file);
      for (const lang of [...LANGS, "x-default"]) expect(html, `${file} : ${lang}`).toContain(`hreflang="${lang}"`);
    }
  });

  it("l'image de partage existe", () => {
    expect(read("public/share/og-image.png").length).toBeGreaterThan(1000);
  });
});
