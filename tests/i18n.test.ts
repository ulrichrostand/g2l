import { describe, expect, it } from "vitest";
import { isSingular, localeFor, parseLang, readPageLang } from "../src/i18n/lang";
import { browserLang, preferredLang, readStoredLang, storeLang } from "../src/i18n/preference";
import { alternatePath, gameHtmlFile, gamePath, legalHtmlFile, legalPath, portalPath } from "../src/i18n/routes";
import { createTranslator, formatMessage, placeholdersOf, registeredCatalogs, translateIn } from "../src/i18n/translator";

// Charge tous les catalogues de l'interface : chacun s'enregistre en se créant.
import.meta.glob("../src/i18n/messages/*.ts", { eager: true });

describe("langue de la page", () => {
  it("reconnaît fr et en, avec région ou casse, et refuse le reste", () => {
    expect(parseLang("en")).toBe("en");
    expect(parseLang("en-GB")).toBe("en");
    expect(parseLang(" FR_ca ")).toBe("fr");
    expect(parseLang("de")).toBeNull();
    expect(parseLang(undefined)).toBeNull();
    expect(parseLang(42)).toBeNull();
  });

  it("lit <html lang>, et revient au français sans document ou avec une langue inconnue", () => {
    expect(readPageLang({ documentElement: { lang: "en" } })).toBe("en");
    expect(readPageLang({ documentElement: { lang: "es" } })).toBe("fr");
    expect(readPageLang(undefined)).toBe("fr");
  });

  it("choisit les paramètres régionaux et la règle du pluriel de chaque langue", () => {
    expect(localeFor("fr")).toBe("fr-FR");
    expect(localeFor("en")).toBe("en-US");
    expect(isSingular(0, "fr")).toBe(true);
    expect(isSingular(1, "fr")).toBe(true);
    expect(isSingular(2, "fr")).toBe(false);
    expect(isSingular(0, "en")).toBe(false);
    expect(isSingular(1, "en")).toBe(true);
  });
});

describe("préférence de langue", () => {
  const memory = () => {
    const values = new Map<string, string>();
    return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => void values.set(key, value) };
  };

  it("le choix mémorisé l'emporte sur la langue du navigateur", () => {
    expect(preferredLang("fr", ["en-US"])).toBe("fr");
    expect(preferredLang(null, ["de-DE", "en-US", "fr"])).toBe("en");
    expect(preferredLang(null, ["de-DE"])).toBe("fr");
    expect(browserLang([])).toBeNull();
  });

  it("mémorise, relit, et ignore une valeur corrompue ou un stockage absent", () => {
    const storage = memory();
    storeLang("en", storage);
    expect(readStoredLang(storage)).toBe("en");
    storage.setItem("site-lang", "<script>");
    expect(readStoredLang(storage)).toBeNull();
    expect(readStoredLang(null)).toBeNull();
    expect(() => storeLang("fr", null)).not.toThrow();
    const broken = { getItem: () => { throw new Error("bloqué"); }, setItem: () => { throw new Error("bloqué"); } };
    expect(readStoredLang(broken)).toBeNull();
    const warn = console.warn;
    console.warn = () => undefined;
    expect(() => storeLang("en", broken)).not.toThrow();
    console.warn = warn;
  });
});

describe("adresses par langue", () => {
  it("construit les adresses du portail et des jeux sous le préfixe de déploiement", () => {
    expect(portalPath("fr", "/")).toBe("/");
    expect(portalPath("en", "/g2l/")).toBe("/g2l/en/");
    expect(gamePath("devops", "fr", "/g2l/")).toBe("/g2l/jeux/devops/");
    expect(gamePath("devops", "en", "/g2l/")).toBe("/g2l/en/games/devops/");
    expect(gameHtmlFile("devops", "en")).toBe("en/games/devops/index.html");
    expect(() => gamePath("../etc", "fr", "/")).toThrow(RangeError);
  });

  it("trouve la même page dans l'autre langue, ou rien pour une adresse inconnue", () => {
    expect(alternatePath("/g2l/", "en", "/g2l/")).toBe("/g2l/en/");
    expect(alternatePath("/g2l/en/", "fr", "/g2l/")).toBe("/g2l/");
    expect(alternatePath("/g2l/en/index.html", "fr", "/g2l/")).toBe("/g2l/");
    expect(alternatePath("/g2l/jeux/devops/", "en", "/g2l/")).toBe("/g2l/en/games/devops/");
    expect(alternatePath("/g2l/en/games/devops/", "fr", "/g2l/")).toBe("/g2l/jeux/devops/");
    expect(alternatePath("/g2l/mentions-legales/", "en", "/g2l/")).toBe("/g2l/en/legal/");
    expect(alternatePath("/g2l/en/legal/", "fr", "/g2l/")).toBe("/g2l/mentions-legales/");
    expect(legalPath("fr", "/")).toBe("/mentions-legales/");
    expect(legalHtmlFile("en")).toBe("en/legal/index.html");
    expect(alternatePath("/g2l/autre/", "en", "/g2l/")).toBeNull();
    expect(alternatePath("/ailleurs/", "en", "/g2l/")).toBeNull();
  });
});

describe("traducteur", () => {
  it("remplace les paramètres et refuse un paramètre manquant", () => {
    expect(formatMessage("{count} secteurs sur {total}", { count: 3, total: 16 })).toBe("3 secteurs sur 16");
    expect(() => formatMessage("Bonjour {name}", {})).toThrow(RangeError);
    expect(placeholdersOf("{b} et {a} et {b}")).toEqual(["a", "b", "b"]);
  });

  it("traduit dans chaque langue et signale une clé inconnue", () => {
    const t = createTranslator("test", { fr: { hello: "Bonjour {name}" }, en: { hello: "Hello {name}" } });
    expect(t("hello", { name: "Spectre" })).toBe("Bonjour Spectre");
    const catalog = registeredCatalogs().find((entry) => entry.area === "test");
    expect(catalog && translateIn(catalog, "en", "hello", { name: "Spectre" })).toBe("Hello Spectre");
    expect(() => catalog && translateIn(catalog, "en", "absent")).toThrow(RangeError);
  });
});

describe("catalogues de l'interface : parité français / anglais", () => {
  const catalogs = registeredCatalogs().filter((catalog) => catalog.area !== "test");

  it("chaque catalogue a les mêmes clés et les mêmes paramètres dans les deux langues", () => {
    for (const catalog of catalogs) {
      const fr = catalog.messages.fr;
      const en = catalog.messages.en;
      expect(Object.keys(en).sort(), `clés de « ${catalog.area} »`).toEqual(Object.keys(fr).sort());
      for (const key of Object.keys(fr)) expect(placeholdersOf(en[key] as string), `${catalog.area}.${key}`).toEqual(placeholdersOf(fr[key] as string));
    }
  });

  it("aucun message anglais ne contient de lettre accentuée française ni n'est vide", () => {
    const french = /[àâçéèêëîïôûùœÀÉÈ]/;
    for (const catalog of catalogs) {
      for (const [key, message] of Object.entries(catalog.messages.en)) {
        expect(message.trim().length, `${catalog.area}.${key} vide`).toBeGreaterThan(0);
        expect(french.test(message), `${catalog.area}.${key} : « ${message} » contient du français`).toBe(false);
      }
    }
  });
});
