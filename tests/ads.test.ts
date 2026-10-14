import { describe, expect, it } from "vitest";
import { MAX_POSTERS_PER_LEVEL, POSTER_FOOTPRINT, candidatePosterSlots, placePosters, preferredRow } from "../src/ads/placement";
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

  it("l'affiche de repli annonce « À venir » dans les deux langues, sans nommer de partenaire", () => {
    expect(HOUSE_POSTER.placeholder).toBe(true);
    expect(HOUSE_POSTER.headline).toEqual({ fr: "À venir", en: "Coming soon" });
    expect(sponsorsToShow(new Date("2026-10-14T00:00:00Z"), [])).toEqual([HOUSE_POSTER]);
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
  it("n'occupe que du sol dans une salle, sans aucun élément de jeu dessus", () => {
    const slots = candidatePosterSlots(layout);
    expect(slots.length).toBeGreaterThan(0);
    const occupied = new Set(
      [layout.start, layout.exit, ...layout.intel, ...layout.terminals.flatMap((slot) => [slot.cell, slot.accessCell]), ...layout.cameras.map((camera) => camera.floorCell), ...layout.guards.flatMap((route) => route.waypoints)].map((cell) => `${cell.x},${cell.z}`),
    );
    for (const slot of slots) {
      const room = layout.rooms[slot.roomIndex]!;
      expect(slot.cell.x).toBeGreaterThanOrEqual(room.x);
      expect(slot.cell.z).toBeGreaterThanOrEqual(room.z);
      expect(slot.cell.x + POSTER_FOOTPRINT.cellsX).toBeLessThanOrEqual(room.x + room.width);
      expect(slot.cell.z + POSTER_FOOTPRINT.cellsZ).toBeLessThanOrEqual(room.z + room.height);
      for (let z = slot.cell.z; z < slot.cell.z + POSTER_FOOTPRINT.cellsZ; z++) {
        for (let x = slot.cell.x; x < slot.cell.x + POSTER_FOOTPRINT.cellsX; x++) {
          expect(layout.grid.isWalkable(x, z)).toBe(true);
          expect(occupied.has(`${x},${z}`)).toBe(false);
        }
      }
    }
  });

  it("choisit la rangée la plus au sud encore visible, hors de l'ombre du mur sud", () => {
    const posters = placePosters(layout, [sample], new SeededRandom(3));
    for (const poster of posters) {
      const sameRoom = candidatePosterSlots(layout).filter((slot) => slot.roomIndex === poster.roomIndex);
      expect(poster.cell.z).toBe(preferredRow(layout.rooms[poster.roomIndex]!, sameRoom));
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

describe("rangée préférée", () => {
  const room = { x: 1, z: 10, width: 8, height: 8 };
  const slotAt = (z: number) => ({ cell: { x: 1, z }, roomIndex: 0 });

  it("prend la plus au sud hors de l'ombre du mur sud", () => {
    expect(preferredRow(room, [10, 11, 12, 13, 14, 15].map(slotAt))).toBe(12);
  });

  it("retombe sur la plus au nord si toute la salle est dans l'ombre", () => {
    expect(preferredRow({ ...room, height: 4 }, [11, 12].map(slotAt))).toBe(11);
  });
});
