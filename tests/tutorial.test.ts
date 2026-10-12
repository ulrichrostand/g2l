import { describe, expect, it } from "vitest";
import { MOVE_GOAL_CELLS, placeMarker, TUTORIAL_STEPS, tutorialInstruction, TutorialSession, type TutorialSnapshot } from "../src/game/tutorial";

function snapshot(overrides: Partial<TutorialSnapshot> = {}): TutorialSnapshot {
  return { x: 5, z: 5, aiming: false, crouching: false, intelCollected: 0, hackedCount: 0, neutralizations: 0, shotsFired: 0, guardsRemaining: 2, ...overrides };
}

/** Fait marcher l'agent en ligne droite par petits pas, comme les images d'une vraie partie. */
function walk(session: TutorialSession, base: TutorialSnapshot, cells: number): TutorialSnapshot {
  let current = base;
  for (let step = 0; step < Math.ceil(cells / 0.1); step++) {
    current = { ...base, ...current, x: current.x + 0.1 };
    session.update(current);
  }
  return current;
}

describe("TutorialSession", () => {
  it("démarre sur le déplacement, et ne valide que les gestes réellement faits", () => {
    const session = new TutorialSession();
    expect(session.step?.id).toBe("move");
    expect(session.stepNumber).toBe(1);
    expect(session.update(snapshot())).toBe(0);
    // Rester immobile ne valide rien, même longtemps.
    for (let frame = 0; frame < 100; frame++) session.update(snapshot());
    expect(session.step?.id).toBe("move");
  });

  it("le déplacement se valide après quelques cases parcourues", () => {
    const session = new TutorialSession();
    walk(session, snapshot(), MOVE_GOAL_CELLS + 0.5);
    expect(session.step?.id).toBe("intel");
  });

  it("une téléportation n'est pas un déplacement (réapparition, point d'insertion)", () => {
    const session = new TutorialSession();
    session.update(snapshot({ x: 1, z: 1 }));
    session.update(snapshot({ x: 20, z: 15 }));
    session.update(snapshot({ x: 1, z: 1 }));
    expect(session.step?.id).toBe("move");
  });

  it("déroule toutes les étapes dans l'ordre, puis se termine", () => {
    const session = new TutorialSession();
    let state = walk(session, snapshot(), 4);
    expect(session.step?.id).toBe("intel");
    state = { ...state, intelCollected: 1 };
    expect(session.update(state)).toBe(1);
    expect(session.step?.id).toBe("terminal");
    state = { ...state, hackedCount: 1 };
    session.update(state);
    expect(session.step?.id).toBe("aim");
    state = { ...state, aiming: true };
    session.update(state);
    expect(session.step?.id).toBe("shoot");
    state = { ...state, shotsFired: 1 };
    session.update(state);
    expect(session.step?.id).toBe("crouch");
    state = { ...state, crouching: true };
    session.update(state);
    expect(session.step?.id).toBe("takedown");
    expect(session.isActive).toBe(true);
    state = { ...state, neutralizations: 1 };
    session.update(state);
    expect(session.state).toBe("finished");
    expect(session.step).toBeNull();
    expect(session.isActive).toBe(false);
  });

  it("un joueur pressé qui a déjà ramassé un dossier et piraté un terminal saute ces étapes d'un coup", () => {
    const session = new TutorialSession();
    const rushed = walk(session, snapshot({ intelCollected: 2, hackedCount: 1 }), 4);
    expect(session.step?.id).toBe("aim");
    expect(rushed.intelCollected).toBe(2);
  });

  it("les tirs faits avant l'étape « tirer » ne la valident pas : il faut le geste à ce moment-là", () => {
    const session = new TutorialSession();
    const state = walk(session, snapshot({ shotsFired: 3, intelCollected: 1, hackedCount: 1, aiming: true }), 4);
    expect(session.step?.id).toBe("shoot");
    session.update({ ...state, shotsFired: 3 });
    expect(session.step?.id).toBe("shoot");
    session.update({ ...state, shotsFired: 4 });
    expect(session.step?.id).toBe("crouch");
  });

  it("sans sentinelle debout, l'étape de neutralisation ne bloque pas le joueur", () => {
    const session = new TutorialSession();
    const state = walk(session, snapshot({ intelCollected: 1, hackedCount: 1, aiming: true, crouching: true, guardsRemaining: 0 }), 4);
    session.update({ ...state, shotsFired: 1 });
    expect(session.state).toBe("finished");
  });

  it("« Passer » arrête tout, et plus rien n'avance ensuite", () => {
    const session = new TutorialSession();
    session.skip();
    expect(session.state).toBe("skipped");
    expect(session.step).toBeNull();
    expect(session.update(snapshot({ intelCollected: 5 }))).toBe(0);
    session.skip();
    expect(session.state).toBe("skipped");
  });

  it("ignore des coordonnées invalides sans casser le suivi", () => {
    const session = new TutorialSession();
    session.update(snapshot({ x: Number.NaN, z: 3 }));
    session.update(snapshot({ x: 5, z: Number.POSITIVE_INFINITY }));
    expect(session.step?.id).toBe("move");
  });
});

describe("consignes du tutoriel", () => {
  it("chaque étape a un texte pour le clavier et un pour le tactile, sans emoji", () => {
    for (const { id } of TUTORIAL_STEPS) {
      for (const touch of [false, true]) {
        const { title, hint } = tutorialInstruction(id, touch);
        expect(title.length).toBeGreaterThan(3);
        expect(hint.length).toBeGreaterThan(20);
        expect(`${title}${hint}`).not.toMatch(/\p{Extended_Pictographic}/u);
      }
    }
  });

  it("les touches citées existent dans le jeu (E, C, clic droit) au clavier, des boutons au tactile", () => {
    expect(tutorialInstruction("terminal", false).hint).toContain("E");
    expect(tutorialInstruction("crouch", false).hint).toContain("C");
    expect(tutorialInstruction("aim", false).hint).toContain("clic droit");
    expect(tutorialInstruction("terminal", true).hint).toContain("Pirater");
    expect(tutorialInstruction("takedown", true).hint).toContain("Neutraliser");
  });

  it("seules les étapes à cible en montrent une dans le monde", () => {
    const targets = Object.fromEntries(TUTORIAL_STEPS.map((step) => [step.id, step.target]));
    expect(targets).toMatchObject({ move: null, intel: "intel", terminal: "terminal", aim: null, shoot: null, crouch: null, takedown: "guard" });
  });
});

describe("placeMarker", () => {
  it("cible visible : l'anneau se pose dessus", () => {
    const marker = placeMarker(0, 0, false, 0.1);
    expect(marker).toMatchObject({ onScreen: true, left: 0.5, top: 0.5 });
  });

  it("cible hors écran : la flèche est collée au bord, dans la direction de la cible", () => {
    const right = placeMarker(3, 0, false, 0.1);
    expect(right.onScreen).toBe(false);
    expect(right.left).toBeCloseTo(0.9);
    expect(right.top).toBeCloseTo(0.5);
    expect(right.angle).toBeCloseTo(0);
    const up = placeMarker(0, 5, false, 0.1);
    expect(up.top).toBeCloseTo(0.1);
    expect(up.angle).toBeCloseTo(-Math.PI / 2);
  });

  it("cible derrière la caméra : on vise le bord opposé, jamais l'anneau", () => {
    const marker = placeMarker(0.2, 0.2, true, 0.1);
    expect(marker.onScreen).toBe(false);
    expect(marker.left).toBeLessThan(0.5);
  });

  it("reste dans l'écran quelles que soient les valeurs (NaN, énormes, marge absurde)", () => {
    for (const [x, y, behind, margin] of [[Number.NaN, 2, false, 0.1], [1e9, -1e9, false, 0.1], [0.5, 0.5, false, 9], [0.5, 0.5, false, -3]] as const) {
      const marker = placeMarker(x, y, behind, margin);
      expect(marker.left).toBeGreaterThanOrEqual(0);
      expect(marker.left).toBeLessThanOrEqual(1);
      expect(marker.top).toBeGreaterThanOrEqual(0);
      expect(marker.top).toBeLessThanOrEqual(1);
    }
  });
});
