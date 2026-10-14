import { describe, expect, it } from "vitest";
import { GAME_COURSE_ID } from "../src/account/config";
import { COURSES } from "../src/portal/catalog";
import { ENROLLABLE_COURSE_IDS } from "../server/src/courses";

describe("cours du site et de l'API", () => {
  it("les jeux disponibles du catalogue sont exactement les cours auxquels l'API accepte de s'inscrire", () => {
    const available = COURSES.filter((course) => course.status === "available").map((course) => course.id).sort();
    expect([...ENROLLABLE_COURSE_IDS].sort()).toEqual(available);
  });

  it("le jeu s'inscrit au cours qui porte son identifiant", () => {
    expect(ENROLLABLE_COURSE_IDS).toContain(GAME_COURSE_ID);
    expect(COURSES.find((course) => course.id === GAME_COURSE_ID)?.gameSlug).toBe("devops");
  });
});
