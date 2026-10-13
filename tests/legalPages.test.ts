import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LANGS } from "../src/i18n/lang";
import { legalHtmlFile } from "../src/i18n/routes";

const page = (lang: "fr" | "en"): string => readFileSync(legalHtmlFile(lang), "utf8");
const sectionIds = (html: string): string[] => [...html.matchAll(/<h2 id="([a-z-]+)"/g)].map((match) => match[1] as string);

describe("pages juridiques", () => {
  it("existent dans chaque langue, avec la bonne langue déclarée", () => {
    for (const lang of LANGS) expect(page(lang)).toContain(`<html lang="${lang}">`);
  });

  it("ont les mêmes sections dans les deux langues", () => {
    expect(sectionIds(page("en"))).toEqual(sectionIds(page("fr")));
    expect(sectionIds(page("fr"))).toEqual(["editeur", "hebergeur", "propriete", "publicite", "confidentialite", "stockage"]);
  });

  it("n'autorisent aucun script et n'embarquent aucun contenu externe (CSP stricte)", () => {
    for (const lang of LANGS) {
      const html = page(lang);
      expect(html).toContain("script-src 'none'");
      expect(html).not.toMatch(/<script/i);
      expect(html).not.toMatch(/(?:src|href)="https?:\/\/[^"]*\.(?:css|js|png|webp|woff2?)"/i);
    }
  });

  it("se renvoient l'une à l'autre et vers le portail, en liens relatifs (aucun préfixe de déploiement figé)", () => {
    expect(page("fr")).toContain('href="../en/legal/"');
    expect(page("en")).toContain('href="../../mentions-legales/"');
    for (const lang of LANGS) expect(page(lang)).toContain('href="../"');
  });

  it("ne publient aucune adresse e-mail personnelle", () => {
    for (const lang of LANGS) expect(page(lang)).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
  });

  it("listent chaque clé de stockage réellement utilisée par le site", () => {
    const keys = ["shadow-ops-devops/progress", "shadow-ops-devops/settings", "shadow-ops-devops/orientation-hint-dismissed", "site-lang"];
    for (const lang of LANGS) for (const key of keys) expect(page(lang), `${lang} : ${key}`).toContain(key);
    const sources = ["src/game/progress.ts", "src/core/settings.ts", "src/main.ts", "src/i18n/preference.ts"].map((file) => readFileSync(file, "utf8")).join("\n");
    for (const key of keys) expect(sources, key).toContain(key);
  });
});
