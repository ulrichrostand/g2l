import { describe, expect, it } from "vitest";
import { isTerminalLocked, lessonForDossier } from "../src/game/dossierLessons";

const CHALLENGES = 5;

describe("terminaux verrouillés tant que la leçon n'est pas lue", () => {
  it("verrouille un terminal à question dont la leçon n'est pas lue", () => {
    expect(isTerminalLocked(0, CHALLENGES, new Set())).toBe(true);
    expect(isTerminalLocked(4, CHALLENGES, new Set([0, 1, 2, 3]))).toBe(true);
  });

  it("déverrouille un terminal dont la leçon est lue, sans toucher aux autres", () => {
    const read = new Set([0, 2]);
    expect(isTerminalLocked(0, CHALLENGES, read)).toBe(false);
    expect(isTerminalLocked(1, CHALLENGES, read)).toBe(true);
    expect(isTerminalLocked(2, CHALLENGES, read)).toBe(false);
  });

  it("ne verrouille jamais la console principale, qui n'a pas de leçon", () => {
    expect(isTerminalLocked(CHALLENGES, CHALLENGES, new Set())).toBe(false);
  });
});

describe("leçon révélée par un dossier", () => {
  it("le n-ième dossier trouvé ouvre la n-ième leçon : les terminaux se débloquent dans l'ordre", () => {
    const read = new Set<number>();
    for (let dossier = 1; dossier <= CHALLENGES; dossier++) {
      const lesson = lessonForDossier(read, CHALLENGES, dossier);
      expect(lesson).toEqual({ index: dossier - 1, review: false });
      read.add(lesson.index);
      // Après n dossiers, exactement les n premiers terminaux sont ouverts.
      for (let terminal = 0; terminal < CHALLENGES; terminal++) {
        expect(isTerminalLocked(terminal, CHALLENGES, read)).toBe(terminal >= dossier);
      }
    }
  });

  it("saute les leçons déjà lues (partie reprise, leçon lue à un terminal)", () => {
    expect(lessonForDossier(new Set([0, 1, 3]), CHALLENGES, 1)).toEqual({ index: 2, review: false });
  });

  it("une fois tout lu, un dossier sert de révision et tourne sur les leçons", () => {
    const all = new Set([0, 1, 2, 3, 4]);
    expect(lessonForDossier(all, CHALLENGES, 6)).toEqual({ index: 0, review: true });
    expect(lessonForDossier(all, CHALLENGES, 7)).toEqual({ index: 1, review: true });
  });

  it("refuse un secteur sans leçon", () => {
    expect(() => lessonForDossier(new Set(), 0, 1)).toThrow(RangeError);
  });

  it("chaque secteur a au moins autant de dossiers que de terminaux à débloquer, sinon le joueur serait bloqué", async () => {
    const { CURRICULUM_FR, CURRICULUM_EN } = await import("../src/content/curriculum");
    for (const curriculum of [CURRICULUM_FR, CURRICULUM_EN]) {
      for (const module of curriculum) {
        // Un dossier est placé par leçon (`intelCount: module.lessons.length`), et chaque défi a sa leçon au même indice.
        expect(module.lessons.length, module.id).toBeGreaterThanOrEqual(module.challenges.length);
      }
    }
  });
});
