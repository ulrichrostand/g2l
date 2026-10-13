import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { availableCount, catalogProblems, COURSES, playHref, SCREENSHOTS, screenshotProblems, type Course } from "../src/portal/catalog";

const sample: Course = { ...COURSES[0]! };

describe("catalogue des parcours", () => {
  it("le catalogue livré est valide", () => {
    expect(catalogProblems(COURSES)).toEqual([]);
  });

  it("le DevOps est jouable, les autres parcours sont annoncés", () => {
    expect(COURSES.find((course) => course.id === "devops")?.status).toBe("available");
    expect(availableCount(COURSES)).toBe(1);
  });

  it("construit l'adresse du jeu sous le préfixe du site, ou rien si le parcours n'est pas prêt", () => {
    expect(playHref(sample, "/")).toBe("/jeux/devops/");
    expect(playHref(sample, "/rostand/")).toBe("/rostand/jeux/devops/");
    const soon = COURSES.find((course) => course.status === "soon");
    expect(soon && playHref(soon, "/")).toBeNull();
  });

  it("repère les erreurs classiques", () => {
    expect(catalogProblems([sample, sample])).toContain("devops : identifiant en double");
    expect(catalogProblems([{ ...sample, id: "Mauvais Id" }])).toContain("Mauvais Id : identifiant invalide");
    expect(catalogProblems([{ ...sample, playPath: null }])).toContain("devops : un parcours disponible a besoin d'un chemin de jeu « jeux/<id>/ »");
    expect(catalogProblems([{ ...sample, status: "soon" }])).toContain("devops : un parcours à venir ne doit pas avoir de chemin de jeu");
    expect(catalogProblems([{ ...sample, roadmapUrl: "https://evil.example/devops" }])).toContain("devops : la roadmap doit pointer vers https://roadmap.sh/");
    expect(catalogProblems([{ ...sample, playPath: "../../etc/" }])).toContain("devops : un parcours disponible a besoin d'un chemin de jeu « jeux/<id>/ »");
    expect(catalogProblems([{ ...sample, monogram: "devops" }])).toContain("devops : monogramme invalide (2 à 4 majuscules)");
    expect(catalogProblems([{ ...sample, cover: { src: "https://evil.example/x.webp", alt: "x" } }])).toContain("devops : visuel invalide (chemin « portal/<nom>.webp » et texte alternatif requis)");
  });
});

describe("galerie et visuels du portail", () => {
  it("chaque capture appartient à un parcours, avec texte alternatif et légende", () => {
    expect(screenshotProblems(SCREENSHOTS, COURSES)).toEqual([]);
    expect(screenshotProblems([{ courseId: "inconnu", src: "portal/x.webp", alt: "", caption: "" }], COURSES)).toHaveLength(2);
  });

  it("toutes les images référencées existent dans public/", () => {
    const sources = [...SCREENSHOTS.map((shot) => shot.src), ...COURSES.flatMap((course) => (course.cover ? [course.cover.src] : []))];
    for (const src of sources) expect(existsSync(`public/${src}`), src).toBe(true);
  });
});
