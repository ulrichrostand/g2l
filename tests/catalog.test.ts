import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { availableCount, catalogProblems, COURSES, playHref, SCREENSHOTS, screenshotProblems, textOf, type Course } from "../src/portal/catalog";

const sample: Course = { ...COURSES[0]! };

describe("catalogue des jeux", () => {
  it("le catalogue livré est valide dans les deux langues", () => {
    expect(catalogProblems(COURSES)).toEqual([]);
  });

  it("le DevOps est jouable, les autres jeux sont annoncés", () => {
    expect(COURSES.find((course) => course.id === "devops")?.status).toBe("available");
    expect(availableCount(COURSES)).toBe(1);
  });

  it("chaque jeu a un texte distinct en français et en anglais", () => {
    for (const course of COURSES) {
      expect(textOf(course, "en").scenario, course.id).not.toBe(textOf(course, "fr").scenario);
      expect(textOf(course, "en").topics, course.id).toHaveLength(textOf(course, "fr").topics.length);
    }
  });

  it("construit l'adresse du jeu dans chaque langue, ou rien si le jeu n'est pas prêt", () => {
    expect(playHref(sample, "fr", "/")).toBe("/jeux/devops/");
    expect(playHref(sample, "en", "/")).toBe("/en/games/devops/");
    expect(playHref(sample, "en", "/g2l/")).toBe("/g2l/en/games/devops/");
    const soon = COURSES.find((course) => course.status === "soon");
    expect(soon && playHref(soon, "fr", "/")).toBeNull();
  });

  it("repère les erreurs classiques", () => {
    expect(catalogProblems([sample, sample])).toContain("devops : identifiant en double");
    expect(catalogProblems([{ ...sample, id: "Mauvais Id" }])).toContain("Mauvais Id : identifiant invalide");
    expect(catalogProblems([{ ...sample, gameSlug: null }])).toContain("devops : un jeu disponible a besoin d'un dossier de jeu valide");
    expect(catalogProblems([{ ...sample, gameSlug: "../../etc" }])).toContain("devops : un jeu disponible a besoin d'un dossier de jeu valide");
    expect(catalogProblems([{ ...sample, status: "soon" }])).toContain("devops : un jeu à venir ne doit pas avoir de dossier de jeu");
    expect(catalogProblems([{ ...sample, roadmapUrl: "https://evil.example/devops" }])).toContain("devops : la roadmap doit pointer vers https://roadmap.sh/");
    expect(catalogProblems([{ ...sample, monogram: "devops" }])).toContain("devops : monogramme invalide (2 à 4 majuscules)");
    expect(catalogProblems([{ ...sample, cover: { src: "https://evil.example/x.webp" } }])).toContain("devops : visuel invalide (chemin « portal/<nom>.webp » requis)");
    const noAlt: Course = { ...sample, text: { ...sample.text, en: { ...sample.text.en, coverAlt: null } } };
    expect(catalogProblems([noAlt])).toContain("devops (en) : le texte alternatif doit exister si et seulement si le jeu a une capture");
    const french: Course = { ...sample, text: { ...sample.text, en: { ...sample.text.en, scenario: "Un scénario resté en français." } } };
    expect(catalogProblems([french])).toContain("devops (en) : le texte anglais contient du français");
    const shorter: Course = { ...sample, text: { ...sample.text, en: { ...sample.text.en, topics: ["Linux"] } } };
    expect(catalogProblems([shorter])).toContain("devops : les notions doivent être aussi nombreuses en français et en anglais");
  });
});

describe("galerie et visuels du portail", () => {
  it("chaque capture appartient à un jeu, avec texte alternatif et légende dans les deux langues", () => {
    expect(screenshotProblems(SCREENSHOTS, COURSES)).toEqual([]);
    const broken = { courseId: "inconnu", src: "portal/x.webp", text: { fr: { alt: "", caption: "" }, en: { alt: "ok", caption: "ok" } } };
    expect(screenshotProblems([broken], COURSES)).toHaveLength(2);
  });

  it("toutes les images référencées existent dans public/", () => {
    const sources = [...SCREENSHOTS.map((shot) => shot.src), ...COURSES.flatMap((course) => (course.cover ? [course.cover.src] : []))];
    for (const src of sources) expect(existsSync(`public/${src}`), src).toBe(true);
  });
});
