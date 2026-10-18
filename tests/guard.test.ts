import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { Grid, Tile } from "../src/core/grid";
import { Guard, type GuardTuning, type PlayerSnapshot } from "../src/entities/guard";

const TUNING: GuardTuning = {
  walkSpeed: 0,
  visionRange: 6,
  fieldOfViewRadians: Math.PI / 2,
  detectionRate: 1,
  reactionSeconds: 0.6,
  fireIntervalSeconds: 1,
  aimErrorRadians: 0.1,
  hitsToSuspend: 1,
};

/** Couloir horizontal : le garde regarde vers +X depuis la case (1, 1). */
function createCorridor(): Grid {
  const grid = new Grid(14, 3, Tile.Wall);
  for (let x = 1; x < 13; x++) grid.set(x, 1, Tile.Floor);
  return grid;
}

function simulate(guard: Guard, player: PlayerSnapshot | null, seconds: number): void {
  for (let elapsed = 0; elapsed < seconds; elapsed += 1 / 60) guard.update(1 / 60, player);
}

function playerAt(x: number, posture: PlayerSnapshot["posture"] = "standing"): PlayerSnapshot {
  return { position: new THREE.Vector3(x + 0.5, 0, 1.5), posture, isMoving: false };
}

describe("Guard", () => {
  const route = { waypoints: [{ x: 1, z: 1 }, { x: 2, z: 1 }] };

  it("détecte un joueur debout dans son champ de vision", () => {
    const guard = new Guard(createCorridor(), route, TUNING);
    simulate(guard, playerAt(4), 2);
    expect(guard.awareness).toBe(1);
  });

  it("ne voit pas un joueur accroupi hors de la portée réduite", () => {
    const guard = new Guard(createCorridor(), route, TUNING);
    simulate(guard, playerAt(6, "crouching"), 2);
    expect(guard.awareness).toBe(0);
  });

  it("ne voit pas à travers un rack serveur", () => {
    const grid = createCorridor();
    grid.set(3, 1, Tile.Cover);
    const guard = new Guard(grid, route, TUNING);
    simulate(guard, playerAt(5), 2);
    expect(guard.awareness).toBe(0);
  });

  it("ignore le joueur pendant l'invulnérabilité de réapparition", () => {
    const guard = new Guard(createCorridor(), route, TUNING);
    simulate(guard, null, 2);
    expect(guard.awareness).toBe(0);
  });
});

describe("Guard — neutralisation", () => {
  const route = { waypoints: [{ x: 5, z: 1 }, { x: 6, z: 1 }] };

  it("est possible dans son dos, pas de face", () => {
    const guard = new Guard(createCorridor(), route, TUNING);
    // Le garde regarde vers +X depuis x = 5.5 : derrière lui = x plus petit.
    expect(guard.canBeTakenDownFrom(new THREE.Vector3(4.6, 0, 1.5))).toBe(true);
    expect(guard.canBeTakenDownFrom(new THREE.Vector3(6.4, 0, 1.5))).toBe(false);
    expect(guard.canBeTakenDownFrom(new THREE.Vector3(2.5, 0, 1.5))).toBe(false);
  });

  it("est impossible si le garde est en alerte", () => {
    const guard = new Guard(createCorridor(), route, TUNING);
    guard.awareness = 0.6;
    expect(guard.canBeTakenDownFrom(new THREE.Vector3(4.6, 0, 1.5))).toBe(false);
  });

  it("un garde neutralisé ne détecte plus et ne revient pas après un reset", () => {
    const guard = new Guard(createCorridor(), route, TUNING);
    guard.neutralize();
    simulate(guard, playerAt(7), 2);
    expect(guard.awareness).toBe(0);
    guard.reset();
    expect(guard.neutralized).toBe(true);
  });
});

describe("Guard — combat", () => {
  const route = { waypoints: [{ x: 1, z: 1 }, { x: 2, z: 1 }] };
  const shooter = new THREE.Vector3(4.5, 0, 1.5);

  function spottedGuard(tuning: GuardTuning = TUNING): Guard {
    const guard = new Guard(createCorridor(), route, tuning, () => 0.5);
    simulate(guard, playerAt(4), 2);
    return guard;
  }

  it("te repère, donne l'alarme une seule fois et passe en combat", () => {
    const guard = spottedGuard();
    expect(guard.state).toBe("combat");
    expect(guard.isHostile).toBe(true);
    expect(guard.consumeAlarm()).toBe(true);
    expect(guard.consumeAlarm()).toBe(false);
  });

  it("tire après son temps de réaction, en direction du joueur", () => {
    const guard = new Guard(createCorridor(), route, TUNING, () => 0.5);
    let firstShotAt = -1;
    for (let frame = 0; frame < 300 && firstShotAt < 0; frame++) {
      guard.update(1 / 60, playerAt(4));
      if (guard.consumeShot()) firstShotAt = frame / 60;
    }
    expect(guard.state).toBe("combat");
    // Le temps de repérer (jauge) puis de réagir : jamais un tir instantané.
    expect(firstShotAt).toBeGreaterThan(TUNING.reactionSeconds);
  });

  it("vise le joueur avec une erreur bornée", () => {
    const guard = new Guard(createCorridor(), route, TUNING, () => 0.999);
    let angle: number | null = null;
    for (let frame = 0; frame < 400 && angle === null; frame++) {
      guard.update(1 / 60, playerAt(4));
      angle = guard.consumeShot()?.angle ?? null;
    }
    expect(angle).not.toBeNull();
    expect(Math.abs(angle as number)).toBeLessThanOrEqual(TUNING.aimErrorRadians);
  });

  it("une balle la suspend : elle ne voit plus, ne tire plus, puis se relève en combat", () => {
    const guard = spottedGuard();
    expect(guard.takeHit(shooter)).toBe("suspended");
    expect(guard.isSuspended).toBe(true);
    simulate(guard, playerAt(4), 5);
    expect(guard.consumeShot()).toBeNull();
    expect(guard.seesPlayer).toBe(false);
    expect(guard.suspensionSecondsLeft).toBeGreaterThan(4);
    simulate(guard, playerAt(4), 5.5);
    expect(guard.isSuspended).toBe(false);
    expect(guard.state).toBe("combat");
  });

  it("le bouclier encaisse la première balle des secteurs avancés", () => {
    const guard = new Guard(createCorridor(), route, { ...TUNING, hitsToSuspend: 2 });
    expect(guard.takeHit(shooter)).toBe("shield");
    expect(guard.state).toBe("combat");
    expect(guard.takeHit(shooter)).toBe("suspended");
  });

  it("une sentinelle suspendue se termine à la commande, pas au corps à corps", () => {
    const guard = new Guard(createCorridor(), { waypoints: [{ x: 5, z: 1 }, { x: 6, z: 1 }] }, TUNING);
    guard.takeHit(shooter);
    expect(guard.canBeTakenDownFrom(new THREE.Vector3(4.6, 0, 1.5))).toBe(false);
    guard.neutralize();
    expect(guard.neutralized).toBe(true);
    expect(guard.takeHit(shooter)).toBe("ignored");
  });

  it("une commande ratée raccourcit la suspension sans la faire tomber sous 1 s", () => {
    const guard = new Guard(createCorridor(), route, TUNING);
    guard.takeHit(shooter);
    guard.shortenSuspension(3);
    expect(guard.suspensionSecondsLeft).toBeCloseTo(7, 5);
    guard.shortenSuspension(30);
    expect(guard.suspensionSecondsLeft).toBe(1);
  });

  it("sans contact, elle fouille la zone puis retourne à sa ronde", () => {
    const guard = spottedGuard({ ...TUNING, walkSpeed: 2 });
    simulate(guard, null, 3);
    expect(guard.state).toBe("search");
    simulate(guard, null, 7);
    expect(guard.isHostile).toBe(false);
  });

  it("une alarme l'envoie au combat sans qu'elle redonne l'alarme", () => {
    const guard = new Guard(createCorridor(), route, TUNING);
    guard.engage(shooter);
    expect(guard.state).toBe("combat");
    expect(guard.consumeAlarm()).toBe(false);
  });
});

describe("Guard — réactivation par la sécurité", () => {
  const route = { waypoints: [{ x: 1, z: 1 }, { x: 2, z: 1 }] };

  it("une sentinelle neutralisée se relève, en alerte, et ne reste plus à terre", () => {
    const guard = new Guard(createCorridor(), route, TUNING);
    guard.neutralize();
    expect(guard.neutralized).toBe(true);
    guard.reactivate(new THREE.Vector3(8.5, 0, 1.5));
    expect(guard.neutralized).toBe(false);
    expect(guard.isHostile).toBe(true);
  });

  it("tire sur un joueur en vue, mais pas à la première image : elle se relève d'abord", () => {
    const guard = new Guard(createCorridor(), route, TUNING);
    guard.neutralize();
    guard.reactivate(new THREE.Vector3(4.5, 0, 1.5));
    const player = playerAt(4);
    guard.update(1 / 60, player);
    expect(guard.consumeShot()).toBeNull();
    let fired = false;
    for (let elapsed = 0; elapsed < 6 && !fired; elapsed += 1 / 60) {
      guard.update(1 / 60, player);
      fired = guard.consumeShot() !== null;
    }
    expect(fired).toBe(true);
  });

  it("n'a aucun effet sur une sentinelle encore en service", () => {
    const guard = new Guard(createCorridor(), route, TUNING);
    guard.reactivate(new THREE.Vector3(8.5, 0, 1.5));
    expect(guard.neutralized).toBe(false);
    expect(guard.isHostile).toBe(false);
  });

  it("peut être neutralisée de nouveau après un redémarrage", () => {
    const guard = new Guard(createCorridor(), route, TUNING);
    guard.neutralize();
    guard.reactivate(new THREE.Vector3(8.5, 0, 1.5));
    guard.neutralize();
    expect(guard.neutralized).toBe(true);
    // Neutralisée, elle ne perçoit plus rien, comme n'importe quelle sentinelle à terre.
    guard.update(1 / 60, playerAt(4));
    expect(guard.awareness).toBe(0);
    expect(guard.consumeShot()).toBeNull();
  });
});
