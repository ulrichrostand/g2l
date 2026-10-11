import { describe, expect, it } from "vitest";
import { advanceProjectile, applySpread, createProjectile, rayCircleDistance, Sidearm, shotSpread, traceShot } from "../src/combat/ballistics";
import { Grid, Tile } from "../src/core/grid";

/** Couloir horizontal sur la ligne z = 1, de x = 1 à x = 18. */
function corridor(): Grid {
  const grid = new Grid(20, 3, Tile.Wall);
  for (let x = 1; x < 19; x++) grid.set(x, 1, Tile.Floor);
  return grid;
}

describe("tir instantané", () => {
  const grid = corridor();
  const sentinel = { id: "s1", x: 8.5, z: 1.5, radius: 0.42 };

  it("touche une sentinelle dans l'axe", () => {
    const trace = traceShot(grid, 2.5, 1.5, 0, 12, [sentinel]);
    expect(trace.hit).toBe("s1");
    expect(trace.distance).toBeCloseTo(6 - 0.42, 5);
  });

  it("rate si la visée passe à côté de la silhouette", () => {
    // Salle ouverte : seul l'écart de visée compte. À 6 cases, 0,1 rad décale la balle de ~0,6 > rayon.
    const room = new Grid(20, 6, Tile.Floor);
    const target = { id: "s1", x: 8.5, z: 2.5, radius: 0.42 };
    expect(traceShot(room, 2.5, 2.5, 0.1, 12, [target]).hit).toBeNull();
    expect(traceShot(room, 2.5, 2.5, 0.05, 12, [target]).hit).toBe("s1");
  });

  it("un rack entre le tireur et la cible arrête la balle", () => {
    const covered = corridor();
    covered.set(5, 1, Tile.Cover);
    const trace = traceShot(covered, 2.5, 1.5, 0, 12, [sentinel]);
    expect(trace.hit).toBeNull();
    expect(trace.impactX).toBeCloseTo(5, 5);
  });

  it("touche la cible la plus proche quand deux sont alignées", () => {
    const trace = traceShot(grid, 2.5, 1.5, 0, 12, [sentinel, { id: "s2", x: 5.5, z: 1.5, radius: 0.42 }]);
    expect(trace.hit).toBe("s2");
  });

  it("hors de portée, la balle se perd", () => {
    expect(traceShot(grid, 2.5, 1.5, 0, 4, [sentinel]).hit).toBeNull();
  });

  it("à bout portant, on touche toujours", () => {
    expect(rayCircleDistance(8.4, 1.5, -1, 0, 8.5, 1.5, 0.42)).toBe(0);
  });
});

describe("dispersion", () => {
  it("visée immobile accroupie = précise, course à la hanche = au jugé", () => {
    const precise = shotSpread({ posture: "crouching", isMoving: false, aiming: true, recoil: 0 });
    const sloppy = shotSpread({ posture: "running", isMoving: true, aiming: false, recoil: 0 });
    expect(precise).toBeLessThan(0.01);
    expect(sloppy).toBeGreaterThan(0.15);
  });

  it("le recul s'ajoute à la dispersion", () => {
    const base = { posture: "standing" as const, isMoving: false, aiming: true };
    expect(shotSpread({ ...base, recoil: 0.05 })).toBeCloseTo(shotSpread({ ...base, recoil: 0 }) + 0.05, 10);
  });

  it("reste dans le cône", () => {
    expect(applySpread(1, 0.1, () => 0)).toBeCloseTo(0.9, 10);
    expect(applySpread(1, 0.1, () => 0.5)).toBeCloseTo(1, 10);
    expect(applySpread(1, 0.1, () => 0.999999)).toBeLessThan(1.1);
  });
});

describe("pistolet", () => {
  it("vide son chargeur, enchaîne sur le rechargement et puise dans la réserve", () => {
    const pistol = new Sidearm(12);
    expect(pistol.magazine).toBe(8);
    expect(pistol.reserve).toBe(4);
    for (let shot = 0; shot < 8; shot++) {
      expect(pistol.tryFire()).toBe("fired");
      pistol.update(1);
    }
    expect(pistol.tryFire()).toBe("empty");
    expect(pistol.isReloading).toBe(true);
    expect(pistol.tryFire()).toBe("reloading");
    pistol.update(2);
    expect(pistol.magazine).toBe(4);
    expect(pistol.reserve).toBe(0);
  });

  it("respecte la cadence de tir", () => {
    const pistol = new Sidearm(8);
    expect(pistol.tryFire()).toBe("fired");
    expect(pistol.tryFire()).toBe("cooldown");
    pistol.update(0.3);
    expect(pistol.tryFire()).toBe("fired");
  });

  it("ne recharge pas un chargeur plein ni sans réserve", () => {
    expect(new Sidearm(20).startReload()).toBe(false);
    const dry = new Sidearm(3);
    dry.tryFire();
    expect(dry.startReload()).toBe(false);
  });

  it("plafonne la réserve et le recul", () => {
    const pistol = new Sidearm(8);
    pistol.addAmmo(1000);
    expect(pistol.reserve).toBe(48);
    for (let shot = 0; shot < 8; shot++) {
      pistol.tryFire();
      pistol.update(0.3);
    }
    expect(pistol.recoil).toBeLessThanOrEqual(0.12);
  });
});

describe("tirs ennemis", () => {
  const grid = corridor();

  it("touchent le joueur sur leur trajectoire, même rapides", () => {
    const projectile = createProjectile(2.5, 1.5, 0, 60, 20);
    // 60 cases/s pendant 0,2 s : 12 cases parcourues d'un coup, le joueur est à 6 cases.
    expect(advanceProjectile(grid, projectile, 0.2, { x: 8.5, z: 1.5, radius: 0.3 })).toBe("hit");
    expect(projectile.x).toBeCloseTo(8.2, 5);
  });

  it("s'écrasent sur un mur au lieu de le traverser", () => {
    const covered = corridor();
    covered.set(6, 1, Tile.Cover);
    const projectile = createProjectile(2.5, 1.5, 0, 60, 20);
    expect(advanceProjectile(covered, projectile, 0.2, { x: 8.5, z: 1.5, radius: 0.3 })).toBe("wall");
    expect(projectile.x).toBeCloseTo(6, 5);
  });

  it("peuvent être esquivées : un joueur hors trajectoire n'est pas touché", () => {
    const open = new Grid(20, 6, Tile.Floor);
    const projectile = createProjectile(2.5, 1.5, 0, 10, 20);
    expect(advanceProjectile(open, projectile, 0.1, { x: 8.5, z: 2.5, radius: 0.3 })).toBe("flying");
  });

  it("s'éteignent au bout de leur portée", () => {
    const open = new Grid(40, 6, Tile.Floor);
    const projectile = createProjectile(2.5, 2.5, 0, 10, 5);
    expect(advanceProjectile(open, projectile, 1, null)).toBe("expired");
  });
});
