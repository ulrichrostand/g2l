import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { advanceProjectile, createProjectile, type Projectile } from "../src/combat/ballistics";
import { bossTuning, FAN_ARC_RADIANS, patternAngles, patternForPhase, patternShotCount, type BossPattern } from "../src/combat/bossPatterns";
import { Grid, Tile } from "../src/core/grid";
import { SeededRandom } from "../src/core/rng";
import { Boss, type BossShot } from "../src/entities/boss";
import type { Room } from "../src/level/generator";

const FRAME = 1 / 60;
/** Arène de 14 × 10 cases ouverte, entourée de murs ; le centre praticable est la case (8, 6). */
const ARENA: Room = { x: 1, z: 1, width: 14, height: 10 };
/** Mêmes valeurs que la mission : silhouette du joueur face aux balles ennemies, portée de ces balles. */
const PLAYER_HIT_RADIUS = 0.3;
const ENEMY_SHOT_RANGE = 16;
/** Au-delà de cet écart entre deux tirs, on change de salve (les balles d'une rafale sont à 0,14 s). */
const VOLLEY_SEPARATION_SECONDS = 0.5;

function createArenaGrid(): Grid {
  const grid = new Grid(16, 12, Tile.Wall);
  for (let z = ARENA.z; z < ARENA.z + ARENA.height; z++) {
    for (let x = ARENA.x; x < ARENA.x + ARENA.width; x++) grid.set(x, z, Tile.Floor);
  }
  return grid;
}

/** Deux salles séparées par un mur plein : l'arène (x 1..8) et une cachette (x 10..13). */
function createWalledGrid(): { grid: Grid; arena: Room } {
  const grid = new Grid(15, 12, Tile.Wall);
  for (let z = 1; z < 11; z++) {
    for (let x = 1; x < 9; x++) grid.set(x, z, Tile.Floor);
    for (let x = 10; x < 14; x++) grid.set(x, z, Tile.Floor);
  }
  return { grid, arena: { x: 1, z: 1, width: 8, height: 10 } };
}

function createBoss(grid = createArenaGrid(), arena = ARENA, level = 0): Boss {
  return new Boss(grid, { name: "Processus Zombie", color: 0x9cff57, level, arena, random: seeded(7) });
}

function seeded(seed: number): () => number {
  const random = new SeededRandom(seed);
  return () => random.next();
}

function playerAt(x: number, z: number): { position: THREE.Vector3 } {
  return { position: new THREE.Vector3(x, 0, z) };
}

/** Avance la simulation et renvoie tous les tirs produits. */
function simulate(boss: Boss, player: { position: THREE.Vector3 } | null, seconds: number): BossShot[] {
  const shots: BossShot[] = [];
  for (let elapsed = 0; elapsed < seconds; elapsed += FRAME) {
    boss.update(FRAME, player);
    shots.push(...boss.consumeShots());
  }
  return shots;
}

function awakenAndFight(boss: Boss, player: { position: THREE.Vector3 } | null): void {
  boss.awaken();
  simulate(boss, player, 2.05);
  expect(boss.state).toBe("fighting");
}

/** Vide l'armure de la phase en cours à coups de balles. */
function breakArmor(boss: Boss): void {
  for (let hit = 0; hit < 50 && boss.state === "fighting"; hit++) boss.takeHit();
  expect(boss.state).toBe("exposed");
}

function normalizeAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

/** Nombre de balles parties à chaque frame qui a tiré : une salve d'un bloc arrive dans la même frame. */
function shotsPerFrame(boss: Boss, player: { position: THREE.Vector3 }, seconds: number): number[] {
  const counts: number[] = [];
  for (let elapsed = 0; elapsed < seconds; elapsed += FRAME) {
    boss.update(FRAME, player);
    const fired = boss.consumeShots().length;
    if (fired > 0) counts.push(fired);
  }
  return counts;
}

/**
 * Le joueur colle le boss à `distance` de son centre et le suit pas à pas.
 * Les balles volent comme dans la mission (advanceProjectile), murs compris.
 */
function pointBlankDuel(boss: Boss, grid: Grid, distance: number, seconds: number): { fired: number; hits: number } {
  const player = playerAt(boss.position.x - distance, boss.position.z);
  const flying: Projectile[] = [];
  let fired = 0;
  let hits = 0;
  for (let elapsed = 0; elapsed < seconds; elapsed += FRAME) {
    player.position.set(boss.position.x - distance, 0, boss.position.z);
    boss.update(FRAME, player);
    for (const shot of boss.consumeShots()) {
      flying.push(createProjectile(shot.x, shot.z, shot.angle, shot.speed, ENEMY_SHOT_RANGE));
      fired++;
    }
    const target = { x: player.position.x, z: player.position.z, radius: PLAYER_HIT_RADIUS };
    for (let index = flying.length - 1; index >= 0; index--) {
      const outcome = advanceProjectile(grid, flying[index] as Projectile, FRAME, target);
      if (outcome === "flying") continue;
      flying.splice(index, 1);
      if (outcome === "hit") hits++;
    }
  }
  return { fired, hits };
}

function spriteLabels(boss: Boss): THREE.Sprite[] {
  const labels: THREE.Sprite[] = [];
  boss.root.traverse((object) => {
    if (object instanceof THREE.Sprite) labels.push(object);
  });
  return labels;
}

/**
 * Étendue verticale d'un sprite à l'écran, comptée depuis son ancrage : Sprite.center décale le dessin
 * dans le repère de la caméra, donc cet intervalle ne dépend pas de l'inclinaison de la vue.
 */
function screenExtent(sprite: THREE.Sprite): { bottom: number; top: number } {
  return { bottom: -sprite.center.y * sprite.scale.y, top: (1 - sprite.center.y) * sprite.scale.y };
}

describe("Boss — cycle de vie", () => {
  it("dormant : ne tire pas, ignore les balles, reste au centre praticable de l'arène", () => {
    const boss = createBoss();
    expect(boss.state).toBe("dormant");
    expect(boss.position.x).toBeCloseTo(8.5);
    expect(boss.position.z).toBeCloseTo(6.5);
    expect(simulate(boss, playerAt(3.5, 6.5), 5)).toHaveLength(0);
    expect(boss.takeHit()).toBe("ignored");
    expect(boss.armorFraction).toBe(1);
    expect(boss.isTargetable).toBe(false);
  });

  it("se place sur la case praticable la plus proche si le centre est encombré", () => {
    const grid = createArenaGrid();
    grid.set(8, 6, Tile.Cover);
    const boss = createBoss(grid);
    expect(grid.isWalkable(Math.floor(boss.position.x), Math.floor(boss.position.z))).toBe(true);
    expect(Math.hypot(boss.position.x - 8.5, boss.position.z - 6.5)).toBeCloseTo(1);
  });

  it("awaken : invulnérable pendant ~2 s, puis combat", () => {
    const boss = createBoss();
    boss.awaken();
    expect(boss.state).toBe("awakening");
    expect(boss.takeHit()).toBe("ignored");
    expect(boss.isTargetable).toBe(false);
    simulate(boss, playerAt(3.5, 6.5), 1.5);
    expect(boss.state).toBe("awakening");
    simulate(boss, playerAt(3.5, 6.5), 0.6);
    expect(boss.state).toBe("fighting");
    expect(boss.isTargetable).toBe(true);
    // Déjà réveillé : un second appel ne relance pas le réveil.
    boss.awaken();
    expect(boss.state).toBe("fighting");
  });

  it("annonce chaque salve : entre deux rafales, au moins la pause plus tout le télégraphe", () => {
    const boss = createBoss();
    const player = playerAt(3.5, 6.5);
    awakenAndFight(boss, player);
    const tuning = bossTuning(0);
    const shotTimes: number[] = [];
    for (let frame = 0; frame < 60 * 12; frame++) {
      boss.update(FRAME, player);
      for (let shot = boss.consumeShots().length; shot > 0; shot--) shotTimes.push(frame * FRAME);
    }
    const volleyGaps: number[] = [];
    for (let index = 1; index < shotTimes.length; index++) {
      const gap = (shotTimes[index] as number) - (shotTimes[index - 1] as number);
      if (gap > VOLLEY_SEPARATION_SECONDS) volleyGaps.push(gap);
    }
    // Plusieurs rafales observées : sans télégraphe, l'écart tomberait à la seule pause (1,9 s au lieu de 2,6 s).
    expect(volleyGaps.length).toBeGreaterThanOrEqual(3);
    for (const gap of volleyGaps) {
      expect(gap).toBeGreaterThanOrEqual((tuning.volleyIntervalSeconds[0] as number) + tuning.telegraphSeconds - 1e-6);
    }
  });

  it("tire vers le joueur, à une vitesse esquivable, hors de sa propre silhouette", () => {
    const boss = createBoss();
    const player = playerAt(3.5, 6.5);
    awakenAndFight(boss, player);
    const shots = simulate(boss, player, 6);
    expect(shots.length).toBeGreaterThanOrEqual(3);
    for (const shot of shots) {
      const towardPlayer = Math.atan2(player.position.z - shot.z, player.position.x - shot.x);
      expect(Math.abs(normalizeAngle(shot.angle - towardPlayer))).toBeLessThan(0.25);
      expect(shot.speed).toBeGreaterThanOrEqual(8);
      expect(shot.speed).toBeLessThanOrEqual(12);
      // La balle naît hors de la silhouette du boss, jamais dans un mur.
      expect(Math.hypot(shot.x - boss.position.x, shot.z - boss.position.z)).toBeGreaterThan(boss.hitRadius);
    }
  });

  it("ne tire pas de rafale à travers un mur (phase 1)", () => {
    const { grid, arena } = createWalledGrid();
    const boss = createBoss(grid, arena);
    const hidden = playerAt(11.5, 5.5);
    awakenAndFight(boss, hidden);
    expect(simulate(boss, hidden, 15)).toHaveLength(0);
  });

  it("ne tire ni éventail ni rafale à travers un mur (phase 2)", () => {
    const { grid, arena } = createWalledGrid();
    const boss = createBoss(grid, arena);
    const hidden = playerAt(11.5, 5.5);
    awakenAndFight(boss, hidden);
    breakArmor(boss);
    expect(boss.completePhase()).toBe("next");
    expect(boss.phaseIndex).toBe(1);
    expect(simulate(boss, hidden, 15)).toHaveLength(0);
  });

  it("en phase 3 sans ligne de vue : anneaux et spirales seulement, jamais d'éventail", () => {
    const { grid, arena } = createWalledGrid();
    const boss = createBoss(grid, arena);
    const hidden = playerAt(11.5, 5.5);
    awakenAndFight(boss, hidden);
    for (let phase = 0; phase < 2; phase++) {
      breakArmor(boss);
      expect(boss.completePhase()).toBe("next");
    }
    expect(boss.phaseIndex).toBe(2);
    const ringSize = patternShotCount("ring", 0);
    const counts = shotsPerFrame(boss, hidden, 15);
    // Un anneau part d'un bloc ; la spirale, balle par balle. Un éventail (5 d'un bloc) aurait traversé le mur.
    expect(counts).toContain(ringSize);
    expect(counts).toContain(1);
    for (const count of counts) expect([1, ringSize]).toContain(count);
    expect(counts).not.toContain(patternShotCount("fan", 0));
  });

  it("ignore un joueur imperceptible (réapparition)", () => {
    const boss = createBoss();
    awakenAndFight(boss, null);
    expect(simulate(boss, null, 8)).toHaveLength(0);
  });

  it("armure à 0 : exposé, à genoux, ne tire plus et ignore les balles", () => {
    const boss = createBoss();
    const player = playerAt(3.5, 6.5);
    awakenAndFight(boss, player);
    const armor = bossTuning(0).armorPerPhase[0];
    for (let hit = 1; hit < armor; hit++) expect(boss.takeHit()).toBe("armor");
    expect(boss.armorFraction).toBeCloseTo(1 / armor);
    expect(boss.takeHit()).toBe("exposed");
    expect(boss.state).toBe("exposed");
    expect(boss.armorFraction).toBe(0);
    expect(boss.isTargetable).toBe(false);
    expect(boss.exposedSecondsLeft).toBeCloseTo(bossTuning(0).exposedSeconds);
    expect(simulate(boss, player, 5)).toHaveLength(0);
    expect(boss.takeHit()).toBe("ignored");
    expect(boss.exposedSecondsLeft).toBeLessThan(bossTuning(0).exposedSeconds - 4.9);
  });

  it("exposition expirée : retour au combat avec 50 % d'armure", () => {
    const boss = createBoss();
    const player = playerAt(3.5, 6.5);
    awakenAndFight(boss, player);
    breakArmor(boss);
    simulate(boss, player, bossTuning(0).exposedSeconds + 0.1);
    expect(boss.state).toBe("fighting");
    expect(boss.armorFraction).toBeCloseTo(0.5);
    expect(boss.exposedSecondsLeft).toBe(0);
    expect(boss.phaseIndex).toBe(0);
  });

  it("completePhase × 3 : phases suivantes à armure pleine, puis vaincu", () => {
    const boss = createBoss();
    const player = playerAt(3.5, 6.5);
    awakenAndFight(boss, player);
    for (let phase = 0; phase < boss.phaseCount; phase++) {
      breakArmor(boss);
      const outcome = boss.completePhase();
      if (phase < boss.phaseCount - 1) {
        expect(outcome).toBe("next");
        expect(boss.state).toBe("fighting");
        expect(boss.phaseIndex).toBe(phase + 1);
        expect(boss.armorFraction).toBe(1);
      } else {
        expect(outcome).toBe("defeated");
      }
    }
    expect(boss.state).toBe("defeated");
    expect(boss.takeHit()).toBe("ignored");
    expect(simulate(boss, player, 3)).toHaveLength(0);
  });

  it("completePhase hors exposition lève une erreur explicite", () => {
    const boss = createBoss();
    expect(() => boss.completePhase()).toThrow(/exposé/);
    awakenAndFight(boss, playerAt(3.5, 6.5));
    expect(() => boss.completePhase()).toThrow(/fighting/);
  });

  it("commandFailed raccourcit l'exposition de 3 s sans passer sous 1 s", () => {
    const boss = createBoss();
    const player = playerAt(3.5, 6.5);
    awakenAndFight(boss, player);
    // Hors exposition : sans effet.
    boss.commandFailed();
    expect(boss.state).toBe("fighting");
    breakArmor(boss);
    const full = boss.exposedSecondsLeft;
    boss.commandFailed();
    expect(boss.exposedSecondsLeft).toBeCloseTo(full - 3);
    for (let failure = 0; failure < 10; failure++) boss.commandFailed();
    expect(boss.exposedSecondsLeft).toBeCloseTo(1);
    simulate(boss, player, 0.5);
    const below = boss.exposedSecondsLeft;
    boss.commandFailed();
    // Une erreur ne rallonge jamais une fenêtre déjà sous la seconde.
    expect(boss.exposedSecondsLeft).toBeCloseTo(below);
  });

  it("reset : dormant, phase 1, armure pleine, de retour au centre", () => {
    const boss = createBoss();
    const player = playerAt(3.5, 6.5);
    awakenAndFight(boss, player);
    breakArmor(boss);
    boss.completePhase();
    simulate(boss, player, 4);
    boss.reset();
    expect(boss.state).toBe("dormant");
    expect(boss.phaseIndex).toBe(0);
    expect(boss.armorFraction).toBe(1);
    expect(boss.position.x).toBeCloseTo(8.5);
    expect(boss.position.z).toBeCloseTo(6.5);
    expect(boss.consumeShots()).toHaveLength(0);
    expect(simulate(boss, player, 4)).toHaveLength(0);
  });

  it("reste dans son arène et hors des caisses après une longue simulation", () => {
    const grid = createArenaGrid();
    for (const [x, z] of [
      [5, 4],
      [11, 7],
      [7, 8],
      [10, 3],
    ] as const) {
      grid.set(x, z, Tile.Cover);
    }
    const boss = createBoss(grid, ARENA, 15);
    const player = playerAt(3.5, 3.5);
    boss.awaken();
    let moved = 0;
    let previousX = boss.position.x;
    let previousZ = boss.position.z;
    for (let frame = 0; frame < 60 * 150; frame++) {
      // Le joueur tourne autour du boss : il force des décalages dans toutes les directions.
      const time = frame * FRAME;
      player.position.set(8 + Math.cos(time * 0.4) * 5.5, 0, 6 + Math.sin(time * 0.4) * 3.8);
      boss.update(FRAME, player);
      boss.consumeShots();
      if (frame % 90 === 0) boss.takeHit();
      if (boss.state === "exposed" && frame % 300 === 0) boss.reset();
      if (boss.state === "dormant") boss.awaken();
      moved += Math.hypot(boss.position.x - previousX, boss.position.z - previousZ);
      previousX = boss.position.x;
      previousZ = boss.position.z;
      expect(boss.position.x).toBeGreaterThanOrEqual(ARENA.x + 1);
      expect(boss.position.x).toBeLessThanOrEqual(ARENA.x + ARENA.width - 1);
      expect(boss.position.z).toBeGreaterThanOrEqual(ARENA.z + 1);
      expect(boss.position.z).toBeLessThanOrEqual(ARENA.z + ARENA.height - 1);
      expect(grid.isWalkable(Math.floor(boss.position.x), Math.floor(boss.position.z))).toBe(true);
    }
    // Il ne reste pas planté : il se décale réellement pendant le combat.
    expect(moved).toBeGreaterThan(5);
  });
});

describe("Boss — bout portant", () => {
  it("un joueur collé au boss est touché : les balles naissent entre eux, pas dans son dos", () => {
    for (const phase of [0, 2]) {
      for (const distance of [0.2, 0.3, 0.4]) {
        const grid = createArenaGrid();
        const boss = createBoss(grid);
        awakenAndFight(boss, playerAt(boss.position.x - distance, boss.position.z));
        for (let cleared = 0; cleared < phase; cleared++) {
          breakArmor(boss);
          boss.completePhase();
        }
        const { fired, hits } = pointBlankDuel(boss, grid, distance, 20);
        expect(fired).toBeGreaterThan(0);
        if (phase === 0) {
          // Rafales visées : à bout portant, aucune balle ne doit passer derrière lui.
          expect(hits).toBe(fired);
        } else {
          // Anneaux et spirales partent dans toutes les directions : seules celles de son côté peuvent toucher.
          expect(hits).toBeGreaterThanOrEqual(fired * 0.2);
        }
      }
    }
  });

  it("à 1,5 case du centre, chaque balle de rafale touche toujours", () => {
    const grid = createArenaGrid();
    const boss = createBoss(grid);
    awakenAndFight(boss, playerAt(boss.position.x - 1.5, boss.position.z));
    const { fired, hits } = pointBlankDuel(boss, grid, 1.5, 10);
    expect(fired).toBeGreaterThan(0);
    expect(hits).toBe(fired);
  });

  it("pushOutOfBody : on ne traverse pas le boss, et on n'est jamais poussé dans une caisse", () => {
    const grid = createArenaGrid();
    grid.set(9, 6, Tile.Cover);
    const boss = createBoss(grid);
    expect(boss.position.x).toBeCloseTo(8.5);
    expect(boss.position.z).toBeCloseTo(6.5);
    expect(boss.bodyRadius).toBeGreaterThanOrEqual(boss.hitRadius);

    const inside = new THREE.Vector3(boss.position.x - 0.2, 0, boss.position.z + 0.1);
    expect(boss.pushOutOfBody(inside, PLAYER_HIT_RADIUS)).toBe(true);
    expect(Math.hypot(inside.x - boss.position.x, inside.z - boss.position.z)).toBeCloseTo(boss.bodyRadius + PLAYER_HIT_RADIUS);
    // Poussé dans l'axe d'où il venait : pas de saut de l'autre côté du boss.
    expect(inside.x).toBeLessThan(boss.position.x);

    const centered = boss.position.clone();
    expect(boss.pushOutOfBody(centered, PLAYER_HIT_RADIUS)).toBe(true);
    expect(Math.hypot(centered.x - boss.position.x, centered.z - boss.position.z)).toBeCloseTo(boss.bodyRadius + PLAYER_HIT_RADIUS);

    const far = new THREE.Vector3(boss.position.x - 3, 0, boss.position.z);
    expect(boss.pushOutOfBody(far, PLAYER_HIT_RADIUS)).toBe(false);
    expect(far.x).toBe(boss.position.x - 3);

    // Vers la caisse (9, 6) : la place est prise, la position ne bouge pas.
    const againstCrate = new THREE.Vector3(boss.position.x + 0.4, 0, boss.position.z);
    expect(boss.pushOutOfBody(againstCrate, PLAYER_HIT_RADIUS)).toBe(false);
    expect(againstCrate.x).toBeCloseTo(boss.position.x + 0.4);

    // Rayon absurde : traité comme un point, jamais comme une raison de téléporter le joueur.
    const pointLike = new THREE.Vector3(boss.position.x - 0.2, 0, boss.position.z);
    expect(boss.pushOutOfBody(pointLike, Number.NaN)).toBe(true);
    expect(Math.hypot(pointLike.x - boss.position.x, pointLike.z - boss.position.z)).toBeCloseTo(boss.bodyRadius);
  });

  it("pushOutOfBody : sans effet une fois le boss effondré (on enjambe l'épave)", () => {
    const boss = createBoss();
    const player = playerAt(3.5, 6.5);
    awakenAndFight(boss, player);
    for (let phase = 0; phase < boss.phaseCount; phase++) {
      breakArmor(boss);
      boss.completePhase();
    }
    expect(boss.state).toBe("defeated");
    const onWreck = new THREE.Vector3(boss.position.x - 0.2, 0, boss.position.z);
    expect(boss.pushOutOfBody(onWreck, PLAYER_HIT_RADIUS)).toBe(false);
    expect(onWreck.x).toBeCloseTo(boss.position.x - 0.2);
  });
});

describe("Boss — file de tirs et étiquettes", () => {
  it("consumeShots rend un tableau modifiable qui ne fuit pas dans la file du boss", () => {
    const boss = createBoss();
    const player = playerAt(3.5, 6.5);
    const extra: BossShot = { x: 0, z: 0, angle: 0, speed: 1 };
    const empty = boss.consumeShots();
    expect(empty).toHaveLength(0);
    // L'intégrateur peut y ajouter ses propres tirs : aucune exception, aucune trace à l'appel suivant.
    expect(() => empty.push(extra)).not.toThrow();
    expect(boss.consumeShots()).toHaveLength(0);
    expect(boss.consumeShots()).toHaveLength(0);

    awakenAndFight(boss, player);
    let fired: BossShot[] = [];
    for (let frame = 0; frame < 60 * 6 && fired.length === 0; frame++) {
      boss.update(FRAME, player);
      fired = boss.consumeShots();
    }
    expect(fired.length).toBeGreaterThan(0);
    const firstShot = fired[0];
    const count = fired.length;
    // Le tableau rendu ne change pas tant qu'on ne rappelle pas consumeShots, même si le boss tire encore.
    simulateWithoutConsuming(boss, player, 0.5);
    expect(fired).toHaveLength(count);
    expect(fired[0]).toBe(firstShot);
    expect(() => fired.splice(0, 1)).not.toThrow();
    expect(boss.consumeShots().length).toBeGreaterThan(0);
  });

  it("à genoux : le pictogramme pause et l'étiquette ne se chevauchent pas à l'écran", () => {
    const boss = createBoss();
    const player = playerAt(3.5, 6.5);
    awakenAndFight(boss, player);
    const labels = spriteLabels(boss);
    expect(labels).toHaveLength(2);
    // L'étiquette (nom + armure) est le sprite large ; le pictogramme pause est carré.
    const [nameplate, badge] = [...labels].sort((left, right) => right.scale.x - left.scale.x) as [THREE.Sprite, THREE.Sprite];
    breakArmor(boss);
    boss.update(FRAME, player);
    expect(boss.state).toBe("exposed");
    // Même ancrage pour les deux : leur écart à l'écran ne dépend plus de l'inclinaison de la caméra.
    expect(nameplate.position.equals(badge.position)).toBe(true);
    const nameplateExtent = screenExtent(nameplate);
    const badgeExtent = screenExtent(badge);
    expect(badgeExtent.top).toBeLessThanOrEqual(nameplateExtent.bottom);
    // Tout est dessiné au-dessus de l'ancrage (au-dessus de la tête) : rien ne recouvre le boss.
    expect(badgeExtent.bottom).toBeGreaterThanOrEqual(0);

    // Relevé (exposition expirée) : l'étiquette redescend se poser sur sa tête.
    simulate(boss, player, bossTuning(0).exposedSeconds + 0.1);
    expect(boss.state).toBe("fighting");
    expect(screenExtent(nameplate).bottom).toBeCloseTo(0);
  });
});

function simulateWithoutConsuming(boss: Boss, player: { position: THREE.Vector3 }, seconds: number): void {
  for (let elapsed = 0; elapsed < seconds; elapsed += FRAME) boss.update(FRAME, player);
}

describe("motifs de tir", () => {
  it("produisent exactement le nombre de balles demandé", () => {
    for (const pattern of ["burst", "fan", "ring", "spiral"] as const satisfies readonly BossPattern[]) {
      expect(patternAngles(pattern, 0.3, 7, 2)).toHaveLength(7);
      expect(patternAngles(pattern, 0.3, 0, 2)).toHaveLength(0);
    }
    expect(patternAngles("ring", 0, Number.NaN, 0)).toHaveLength(0);
  });

  it("l'éventail est symétrique autour de l'angle visé et couvre son ouverture", () => {
    const aim = 1.1;
    for (const count of [5, 6, 7]) {
      const angles = patternAngles("fan", aim, count, 0);
      for (let index = 0; index < count; index++) {
        const mirrored = angles[count - 1 - index] as number;
        expect((angles[index] as number) - aim).toBeCloseTo(-(mirrored - aim));
      }
      expect((angles[count - 1] as number) - (angles[0] as number)).toBeCloseTo(FAN_ARC_RADIANS);
    }
    expect(patternAngles("fan", aim, 7, 0)[3]).toBeCloseTo(aim);
  });

  it("la rafale reste serrée autour de l'angle visé", () => {
    const angles = patternAngles("burst", -0.4, 3, 5);
    expect(angles[1]).toBeCloseTo(-0.4);
    for (const angle of angles) expect(Math.abs(angle + 0.4)).toBeLessThan(0.1);
  });

  it("l'anneau est réparti uniformément et part vers le joueur", () => {
    const count = 12;
    const angles = patternAngles("ring", 0.7, count, 3);
    expect(angles[0]).toBeCloseTo(0.7);
    for (let index = 1; index < count; index++) {
      expect((angles[index] as number) - (angles[index - 1] as number)).toBeCloseTo((Math.PI * 2) / count);
    }
  });

  it("la spirale tourne d'une salve à l'autre sans jamais retomber sur le même motif", () => {
    const count = 12;
    const gap = (Math.PI * 2) / count;
    const first = patternAngles("spiral", 0, count, 0);
    const second = patternAngles("spiral", 0, count, 1);
    const turn = (second[0] as number) - (first[0] as number);
    expect(Math.abs(turn)).toBeGreaterThan(0.05);
    // Rotation qui n'est pas un multiple de l'écart : les trous changent de place.
    expect(Math.abs(turn % gap)).toBeGreaterThan(0.05);
    for (let index = 0; index < count; index++) expect((second[index] as number) - (first[index] as number)).toBeCloseTo(turn);
    expect(patternAngles("spiral", 0, count, 2)[0]).toBeCloseTo(2 * turn);
  });

  it("chaque phase ajoute un motif : rafales, puis éventails, puis anneaux et spirales", () => {
    const patternsOf = (phase: number): Set<BossPattern> => new Set(Array.from({ length: 8 }, (_, volley) => patternForPhase(phase, volley)));
    expect([...patternsOf(0)]).toEqual(["burst"]);
    expect(patternsOf(1)).toEqual(new Set(["fan", "burst"]));
    expect(patternsOf(2)).toEqual(new Set(["ring", "fan", "spiral"]));
    // Valeurs hors bornes : on reste dans un cycle valide plutôt que de planter.
    expect(patternForPhase(9, -3)).toMatch(/ring|fan|spiral/);
    expect(patternForPhase(-1, 4)).toBe("burst");
  });

  it("le nombre de balles par salve suit le cahier des charges", () => {
    expect(patternShotCount("burst", 0)).toBe(3);
    expect(patternShotCount("fan", 0)).toBe(5);
    expect(patternShotCount("fan", 15)).toBe(7);
    expect(patternShotCount("ring", 0)).toBe(10);
    expect(patternShotCount("spiral", 15)).toBe(14);
  });
});

describe("réglages par niveau", () => {
  it("se durcissent avec le niveau, sans rendre les balles inesquivables", () => {
    for (let level = 0; level < 15; level++) {
      const current = bossTuning(level);
      const next = bossTuning(level + 1);
      for (let phase = 0; phase < 3; phase++) {
        expect(next.armorPerPhase[phase]).toBeGreaterThanOrEqual(current.armorPerPhase[phase] as number);
        expect(next.shotSpeed[phase]).toBeGreaterThanOrEqual(current.shotSpeed[phase] as number);
        expect(next.volleyIntervalSeconds[phase]).toBeLessThan(current.volleyIntervalSeconds[phase] as number);
      }
      expect(next.moveSpeed).toBeGreaterThan(current.moveSpeed);
    }
    const easiest = bossTuning(0);
    const hardest = bossTuning(15);
    expect(easiest.armorPerPhase).toEqual([4, 5, 6]);
    expect(hardest.armorPerPhase).toEqual([7, 8, 9]);
    for (const tuning of [easiest, hardest]) {
      for (let phase = 1; phase < 3; phase++) {
        // D'une phase à l'autre : plus d'armure, des balles plus rapides, une cadence plus soutenue.
        expect(tuning.armorPerPhase[phase]).toBeGreaterThan(tuning.armorPerPhase[phase - 1] as number);
        expect(tuning.shotSpeed[phase]).toBeGreaterThan(tuning.shotSpeed[phase - 1] as number);
        expect(tuning.volleyIntervalSeconds[phase]).toBeLessThan(tuning.volleyIntervalSeconds[phase - 1] as number);
      }
      for (const speed of tuning.shotSpeed) {
        expect(speed).toBeGreaterThanOrEqual(8);
        expect(speed).toBeLessThanOrEqual(12);
      }
      expect(tuning.telegraphSeconds).toBeGreaterThanOrEqual(0.5);
      expect(tuning.exposedSeconds).toBeGreaterThanOrEqual(12);
    }
  });

  it("borne les niveaux absurdes au lieu de produire un boss injouable", () => {
    expect(bossTuning(-4)).toEqual(bossTuning(0));
    expect(bossTuning(99)).toEqual(bossTuning(15));
    expect(bossTuning(Number.NaN)).toEqual(bossTuning(0));
  });
});
