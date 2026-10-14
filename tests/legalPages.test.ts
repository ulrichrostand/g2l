import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LANGS } from "../src/i18n/lang";
import { ANALYTICS_ENDPOINT, isValidEventName } from "../src/analytics/track";
import { CURRICULUM } from "../src/content/curriculum";
import { legalHtmlFile } from "../src/i18n/routes";

const ANALYTICS_ORIGIN = new URL(ANALYTICS_ENDPOINT).origin;
const page = (lang: "fr" | "en"): string => readFileSync(legalHtmlFile(lang), "utf8");
const sectionIds = (html: string): string[] => [...html.matchAll(/<h2 id="([a-z-]+)"/g)].map((match) => match[1] as string);

describe("pages juridiques", () => {
  it("existent dans chaque langue, avec la bonne langue déclarée", () => {
    for (const lang of LANGS) expect(page(lang)).toContain(`<html lang="${lang}">`);
  });

  it("ont les mêmes sections dans les deux langues", () => {
    expect(sectionIds(page("en"))).toEqual(sectionIds(page("fr")));
    expect(sectionIds(page("fr"))).toEqual(["editeur", "hebergeur", "propriete", "publicite", "confidentialite", "audience", "stockage"]);
  });

  it("n'autorisent que leur propre script (CSP stricte) et n'embarquent aucun contenu externe", () => {
    for (const lang of LANGS) {
      const html = page(lang);
      expect(html).toContain("script-src 'self'");
      expect([...html.matchAll(/<script[^>]*>/gi)].map((match) => match[0])).toEqual(['<script type="module" src="/src/legal/optout.ts">']);
      expect(html).not.toMatch(/(?:src|href)="https?:\/\/[^"]*\.(?:css|js|png|webp|woff2?)"/i);
    }
  });

  it("proposent le refus de la mesure d'audience, avec ses libellés dans la langue de la page", () => {
    for (const lang of LANGS) {
      const html = page(lang);
      for (const attribute of ["data-label-disable", "data-label-enable", "data-status-on", "data-status-off", "data-status-fail"]) expect(html, `${lang} : ${attribute}`).toContain(attribute);
      expect(html).toContain('id="optout"');
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
    const keys = ["shadow-ops-devops/progress", "shadow-ops-devops/settings", "shadow-ops-devops/orientation-hint-dismissed", "site-lang", "site-no-analytics"];
    for (const lang of LANGS) for (const key of keys) expect(page(lang), `${lang} : ${key}`).toContain(key);
    const sources = ["src/game/progress.ts", "src/core/settings.ts", "src/main.ts", "src/i18n/preference.ts", "src/analytics/track.ts"].map((file) => readFileSync(file, "utf8")).join("\n");
    for (const key of keys) expect(sources, key).toContain(key);
  });
});

describe("mesure d'audience et CSP", () => {
  const pages = ["index.html", "en/index.html", "jeux/devops/index.html", "en/games/devops/index.html", "mentions-legales/index.html", "en/legal/index.html"];

  it("chaque page autorise l'envoi du pixel vers le compte déclaré, et rien d'autre en externe", () => {
    for (const file of pages) {
      const csp = /Content-Security-Policy" content="([^"]+)"/.exec(readFileSync(file, "utf8"))?.[1] ?? "";
      expect(csp, file).toContain(`img-src 'self' data: ${ANALYTICS_ORIGIN}`);
      expect(csp.match(/https?:\/\/[^\s;]+/g), file).toEqual([ANALYTICS_ORIGIN]);
    }
  });

  it("chaque identifiant de secteur donne un nom d'évènement valide", () => {
    for (const module of CURRICULUM) expect(isValidEventName(`sector-complete/${module.id}`), module.id).toBe(true);
  });
});
