import { describe, expect, it } from "vitest";
import { MAX_POSTERS_PER_LEVEL, candidatePosterSlots, placePosters } from "../src/ads/placement";
import { wrapText } from "../src/ads/posterScene";
import { HOUSE_POSTER, SPONSORS, activeSponsors, sponsorProblems, sponsorsToShow, type Sponsor } from "../src/ads/sponsors";
import { SeededRandom } from "../src/core/rng";
import { generateLevel } from "../src/level/generator";

const sample: Sponsor = {
  id: "acme-devops",
  advertiser: "ACME",
  kind: "recruitment",
  headline: { fr: "ACME recrute", en: "ACME is hiring" },
  url: "https://acme.example/jobs",
  accent: "#c6f135",
};
const layout = generateLevel({ seed: 11, terminalCount: 3, guardCount: 2, cameraCount: 2 });

describe("catalogue des annonceurs", () => {
  it("le catalogue livré et l'affiche de repli sont valides", () => {
    expect(sponsorProblems(SPONSORS)).toEqual([]);
    expect(sponsorProblems([HOUSE_POSTER])).toEqual([]);
  });

  it("repère les erreurs classiques", () => {
    expect(sponsorProblems([sample, sample])).toContain("acme-devops : identifiant en double");
    expect(sponsorProblems([{ ...sample, id: "Mauvais Id" }])).toContain("Mauvais Id : identifiant invalide");
    expect(sponsorProblems([{ ...sample, url: "http://acme.example" }])).toContain("acme-devops : l'adresse doit être en https, sans identifiants");
    expect(sponsorProblems([{ ...sample, url: "javascript:alert(1)" }])).toHaveLength(1);
    expect(sponsorProblems([{ ...sample, url: "https://user:pass@acme.example" }])).toHaveLength(1);
    expect(sponsorProblems([{ ...sample, accent: "red" }])).toContain("acme-devops : couleur invalide (#rrggbb requis)");
    expect(sponsorProblems([{ ...sample, headline: { fr: "", en: "ok" } }])).toContain("acme-devops (fr) : accroche vide");
    expect(sponsorProblems([{ ...sample, headline: { fr: "x".repeat(60), en: "ok" } }])).toContain("acme-devops (fr) : accroche trop longue (48 max)");
    expect(sponsorProblems([{ ...sample, startsOn: "2026-02-30" }])).toContain("acme-devops : startsOn invalide (AAAA-MM-JJ requis)");
    expect(sponsorProblems([{ ...sample, startsOn: "2026-12-01", endsOn: "2026-11-01" }])).toContain("acme-devops : la fin précède le début");
  });

  it("filtre par dates (bornes incluses) et retombe sur l'affiche de repli", () => {
    const dated: Sponsor = { ...sample, startsOn: "2026-11-01", endsOn: "2026-11-30" };
    expect(activeSponsors([dated], new Date("2026-10-31T23:59:59Z"))).toEqual([]);
    expect(activeSponsors([dated], new Date("2026-11-01T00:00:00Z"))).toHaveLength(1);
    expect(activeSponsors([dated], new Date("2026-11-30T23:59:59Z"))).toHaveLength(1);
    expect(activeSponsors([dated], new Date("2026-12-01T00:00:00Z"))).toEqual([]);
    expect(sponsorsToShow(new Date("2026-12-01T00:00:00Z"), [dated])).toEqual([HOUSE_POSTER]);
  });
});

describe("placement des affiches", () => {
  it("n'utilise que des murs pleins devant un sol, hors caméras et terminaux", () => {
    const slots = candidatePosterSlots(layout);
    expect(slots.length).toBeGreaterThan(0);
    const cameraWalls = new Set(layout.cameras.map((camera) => `${camera.wallCell.x},${camera.wallCell.z}`));
    for (const slot of slots) {
      expect(layout.grid.isWalkable(slot.wallCell.x, slot.wallCell.z)).toBe(false);
      expect(layout.grid.isWalkable(slot.wallCell.x, slot.wallCell.z + 1)).toBe(true);
      expect(cameraWalls.has(`${slot.wallCell.x},${slot.wallCell.z}`)).toBe(false);
      for (const terminal of layout.terminals) expect(terminal.cell.x === slot.wallCell.x && terminal.cell.z - 1 === slot.wallCell.z).toBe(false);
    }
  });

  it("place au plus une affiche par salle et respecte le plafond", () => {
    const posters = placePosters(layout, [sample], new SeededRandom(3));
    expect(posters.length).toBeLessThanOrEqual(MAX_POSTERS_PER_LEVEL);
    expect(new Set(posters.map((poster) => poster.roomIndex)).size).toBe(posters.length);
    expect(placePosters(layout, [sample], new SeededRandom(3), 1)).toHaveLength(1);
  });

  it("ne place rien sans annonceur ou avec un plafond nul, et reste déterministe", () => {
    expect(placePosters(layout, [], new SeededRandom(3))).toEqual([]);
    expect(placePosters(layout, [sample], new SeededRandom(3), 0)).toEqual([]);
    expect(placePosters(layout, [sample], new SeededRandom(5))).toEqual(placePosters(layout, [sample], new SeededRandom(5)));
  });

  it("fait tourner les annonceurs", () => {
    const other: Sponsor = { ...sample, id: "other" };
    const ids = new Set(placePosters(layout, [sample, other], new SeededRandom(9)).map((poster) => poster.sponsor.id));
    expect(ids.size).toBeGreaterThan(1);
  });
});

describe("découpe du texte des affiches", () => {
  const measure = (text: string) => text.length * 10;

  it("passe à la ligne quand le mot suivant déborde", () => {
    expect(wrapText("aaa bbb ccc", measure, 70, 3)).toEqual(["aaa bbb", "ccc"]);
  });

  it("tronque avec une ellipse au-delà du nombre de lignes", () => {
    const lines = wrapText("un deux trois quatre cinq six", measure, 60, 2);
    expect(lines).toHaveLength(2);
    expect(lines[1]?.endsWith("…")).toBe(true);
    expect(Math.max(...lines.map(measure))).toBeLessThanOrEqual(60);
  });

  it("gère un texte vide", () => {
    expect(wrapText("   ", measure, 100, 2)).toEqual([]);
  });
});
