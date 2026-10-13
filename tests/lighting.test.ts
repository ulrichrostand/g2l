import { describe, expect, it } from "vitest";
import { SeededRandom } from "../src/core/rng";
import { AMBIENT_LIGHT, LIGHT_LEVELS, assignRoomLightLevels, canFlicker } from "../src/level/lighting";

describe("niveaux de luminosité", () => {
  it("l'intensité croît de off à bright", () => {
    const { off, dim, normal, bright } = LIGHT_LEVELS;
    expect([off, dim, normal, bright].map((level) => level.intensity)).toEqual([0, 4, 9, 14]);
    expect(off.poolOpacity).toBeLessThan(dim.poolOpacity);
    expect(normal.fixtureGlow).toBeLessThan(bright.fixtureGlow);
  });

  it("garde une lumière d'ambiance non nulle pour que les salles sans néon restent lisibles", () => {
    expect(AMBIENT_LIGHT.hemisphereIntensity).toBeGreaterThan(0);
  });

  it("la salle de départ est toujours normale", () => {
    for (let seed = 1; seed <= 50; seed++) expect(assignRoomLightLevels(9, 4, new SeededRandom(seed))[0]).toBe("normal");
  });

  it("n'allume jamais plus de salles que le plafond de la qualité graphique", () => {
    for (const cap of [0, 1, 3, 6]) {
      const levels = assignRoomLightLevels(12, cap, new SeededRandom(7));
      const lit = levels.filter((level) => level !== "off").length;
      expect(lit).toBe(Math.max(1, Math.min(cap, 12)));
    }
  });

  it("est déterministe, et produit les trois niveaux sur de nombreuses graines", () => {
    expect(assignRoomLightLevels(10, 6, new SeededRandom(42))).toEqual(assignRoomLightLevels(10, 6, new SeededRandom(42)));
    const seen = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) assignRoomLightLevels(10, 6, new SeededRandom(seed)).forEach((level) => seen.add(level));
    expect([...seen].sort()).toEqual(["bright", "dim", "normal", "off"]);
  });

  it("gère zéro salle et refuse un nombre invalide", () => {
    expect(assignRoomLightLevels(0, 4, new SeededRandom(1))).toEqual([]);
    expect(() => assignRoomLightLevels(-1, 4, new SeededRandom(1))).toThrow(RangeError);
  });

  it("seul un néon qui a de la lumière peut grésiller", () => {
    expect(canFlicker("off")).toBe(false);
    expect(canFlicker("bright")).toBe(false);
    expect(canFlicker("normal")).toBe(true);
  });
});
