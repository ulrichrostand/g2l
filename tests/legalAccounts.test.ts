import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyAccountsBlocks, injectLegalValues, legalValuesFromEnv, type LegalValues } from "../src/seo/site";
import { registeredCatalogs, translateIn } from "../src/i18n/translator";

// Charge les catalogues : chacun s'enregistre en se créant.
import.meta.glob("../src/i18n/messages/*.ts", { eager: true });

const values: LegalValues = { contact: "contact@g2l.example", hostName: "Hébergeur Test SAS", hostAddress: "1 rue des Serveurs, 75000 Paris" };
const FILES = { fr: "mentions-legales/index.html", en: "en/legal/index.html" } as const;
const read = (lang: "fr" | "en"): string => readFileSync(FILES[lang], "utf8");
const build = (lang: "fr" | "en", accounts: boolean): string => {
  const html = applyAccountsBlocks(read(lang), accounts);
  return accounts ? injectLegalValues(html, values) : html;
};

describe("mentions légales selon les comptes", () => {
  it("les blocs « avec comptes » et « sans comptes » sont équilibrés et en nombre égal dans chaque langue", () => {
    for (const lang of ["fr", "en"] as const) {
      const html = read(lang);
      for (const mode of ["on", "off"]) {
        const opens = html.match(new RegExp(`<!--g2l:accounts-${mode}-->`, "g"))?.length ?? 0;
        const closes = html.match(new RegExp(`<!--/g2l:accounts-${mode}-->`, "g"))?.length ?? 0;
        expect(opens, `${lang} ${mode}`).toBe(closes);
        expect(opens).toBeGreaterThan(0);
      }
    }
  });

  it("sans comptes : le texte actuel (GitHub, aucune donnée personnelle), sans marqueur ni coordonnée", () => {
    for (const lang of ["fr", "en"] as const) {
      const html = build(lang, false);
      expect(html).toContain("GitHub, Inc.");
      expect(html).not.toContain("mailto:");
      expect(html).not.toMatch(/__LEGAL_|g2l:accounts|__Host-g2l_session/);
    }
    expect(build("fr", false)).toContain("ne collecte aucune donnée personnelle");
    expect(build("en", false)).toContain("does not collect any personal data");
  });

  it("avec comptes : coordonnées de l'éditeur et de l'hébergeur, traitement décrit, droits exercés dans le jeu", () => {
    for (const lang of ["fr", "en"] as const) {
      const html = build(lang, true);
      expect(html).toContain('href="mailto:contact@g2l.example"');
      expect(html).toContain("Hébergeur Test SAS");
      expect(html).toContain("1 rue des Serveurs, 75000 Paris");
      expect(html).not.toContain("GitHub, Inc.");
      expect(html).toContain("__Host-g2l_session");
      expect(html).not.toMatch(/__LEGAL_|g2l:accounts/);
      expect(html).toContain("Argon2");
      expect(html).toContain("CNIL");
    }
    expect(build("fr", true)).not.toContain("ne collecte aucune donnée personnelle");
  });

  it("cite exactement les libellés des boutons du jeu pour l'export et la suppression", () => {
    const catalog = registeredCatalogs().find((candidate) => candidate.area === "account");
    expect(catalog).toBeDefined();
    for (const lang of ["fr", "en"] as const) {
      const html = build(lang, true);
      expect(html, `${lang} export`).toContain(translateIn(catalog!, lang, "accountExport"));
      expect(html, `${lang} suppression`).toContain(translateIn(catalog!, lang, "accountDelete"));
    }
  });

  it("les sections restent identiques dans les deux modes (même plan, mêmes ancres)", () => {
    const ids = (html: string): string[] => [...html.matchAll(/<h2 id="([a-z-]+)"/g)].map((match) => match[1] as string);
    for (const lang of ["fr", "en"] as const) expect(ids(build(lang, true))).toEqual(ids(build(lang, false)));
  });
});

describe("coordonnées exigées pour publier avec comptes", () => {
  it("refuse un build incomplet en nommant les variables manquantes", () => {
    expect(() => legalValuesFromEnv({})).toThrow(/LEGAL_CONTACT_EMAIL.*LEGAL_HOST_NAME.*LEGAL_HOST_ADDRESS/);
    expect(() => legalValuesFromEnv({ LEGAL_CONTACT_EMAIL: "a@b.fr", LEGAL_HOST_NAME: "  ", LEGAL_HOST_ADDRESS: "x" })).toThrow(/LEGAL_HOST_NAME/);
  });

  it("refuse une adresse e-mail invalide et accepte des valeurs correctes", () => {
    expect(() => legalValuesFromEnv({ LEGAL_CONTACT_EMAIL: "pas-un-email", LEGAL_HOST_NAME: "H", LEGAL_HOST_ADDRESS: "A" })).toThrow(/e-mail/);
    expect(legalValuesFromEnv({ LEGAL_CONTACT_EMAIL: " a@b.fr ", LEGAL_HOST_NAME: "H", LEGAL_HOST_ADDRESS: "A" })).toEqual({ contact: "a@b.fr", hostName: "H", hostAddress: "A" });
  });

  it("échappe les valeurs insérées dans la page", () => {
    const html = injectLegalValues("<dd>__LEGAL_HOST_NAME__</dd>", { contact: "a@b.fr", hostName: '<script>alert("x")</script> & Cie', hostAddress: "A" });
    expect(html).toBe("<dd>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; Cie</dd>");
  });
});
