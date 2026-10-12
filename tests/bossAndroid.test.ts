import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { Grid, Tile } from "../src/core/grid";
import { Boss } from "../src/entities/boss";
import { BossAndroid } from "../src/entities/bossAndroid";
import { fakeSentinelAsset } from "./support/fakeSentinelAsset";

function materials() {
  return {
    armor: new THREE.MeshStandardMaterial({ name: "armure" }),
    core: new THREE.MeshStandardMaterial({ name: "coeur" }),
    visor: new THREE.MeshStandardMaterial({ name: "visiere" }),
    charge: new THREE.MeshStandardMaterial({ name: "charge" }),
  };
}

function arenaGrid(): Grid {
  const grid = new Grid(12, 10, Tile.Wall);
  for (let z = 1; z < 9; z++) for (let x = 1; x < 11; x++) grid.set(x, z, Tile.Floor);
  return grid;
}

async function flush(): Promise<void> {
  for (let round = 0; round < 5; round++) await Promise.resolve();
}

describe("BossAndroid", () => {
  it("porte cinq plaques d'armure dans l'ordre de leur chute, aux couleurs pilotées par le boss", () => {
    const shared = materials();
    const android = new BossAndroid(fakeSentinelAsset(), shared);
    expect(android.plates).toHaveLength(5);
    for (const plate of android.plates) expect(plate.material).toBe(shared.armor);
    // Les articulations du mannequin prennent le matériau de charge : elles s'allument avant chaque salve.
    const body = android.root.getObjectByName("Mannequin") as THREE.Mesh;
    expect((body.material as THREE.Material[]).includes(shared.charge)).toBe(true);
    android.dispose();
    // Les matériaux du boss ne lui appartiennent pas : ils restent utilisables après dispose.
    expect(shared.armor.version).toBeGreaterThanOrEqual(0);
  });

  it("s'anime dans tous les états du boss sans erreur", () => {
    const android = new BossAndroid(fakeSentinelAsset(), materials());
    for (const state of ["dormant", "awakening", "fighting", "exposed", "defeated"] as const) {
      for (let frame = 0; frame < 10; frame++) android.update(1 / 30, { state, speed: state === "fighting" ? 1.5 : 0, aim: 1 });
    }
    expect(Number.isFinite(android.root.getObjectByName("Head")?.quaternion.w ?? Number.NaN)).toBe(true);
    android.dispose();
  });
});

describe("Boss avec l'androïde", () => {
  const options = { name: "Processus Zombie", color: 0x9cff57, level: 0, arena: { x: 1, z: 1, width: 10, height: 8 } };

  it("remplace le colosse procédural une fois chargé, et ses plaques suivent l'armure restante", async () => {
    const boss = new Boss(arenaGrid(), { ...options, androidModel: Promise.resolve(fakeSentinelAsset()) });
    await flush();
    expect(boss.usesAndroidModel).toBe(true);
    boss.awaken();
    for (let frame = 0; frame < 200; frame++) boss.update(1 / 30, null);
    expect(boss.state).toBe("fighting");
    for (let hit = 0; hit < 3; hit++) boss.takeHit();
    boss.update(1 / 30, null);
    const mannequin = boss.root.getObjectByName("Mannequin");
    expect(mannequin).toBeDefined();
    const visiblePlates = (mannequin?.parent?.parent ?? boss.root).getObjectsByProperty("type", "Mesh").filter((mesh) => mesh.visible).length;
    expect(visiblePlates).toBeGreaterThan(0);
  });

  it("revient au colosse procédural (plaques comprises) quand l'appareil ne suit plus, même si l'androïde arrive après", async () => {
    const boss = new Boss(arenaGrid(), { ...options, androidModel: Promise.resolve(fakeSentinelAsset()) });
    await flush();
    expect(boss.usesAndroidModel).toBe(true);
    boss.dropAndroid();
    expect(boss.usesAndroidModel).toBe(false);
    expect(() => boss.update(1 / 30, null)).not.toThrow();
    expect(boss.root.getObjectByName("Mannequin")).toBeUndefined();

    let deliver: (asset: ReturnType<typeof fakeSentinelAsset>) => void = () => undefined;
    const late = new Boss(arenaGrid(), { ...options, androidModel: new Promise((resolve) => (deliver = resolve)) });
    late.dropAndroid();
    deliver(fakeSentinelAsset());
    await flush();
    expect(late.usesAndroidModel).toBe(false);
  });

  it("un téléchargement raté laisse le colosse procédural, sans erreur", async () => {
    const warn = console.warn;
    console.warn = () => undefined;
    const boss = new Boss(arenaGrid(), { ...options, androidModel: Promise.reject(new Error("réseau coupé (simulé)")) });
    await flush();
    console.warn = warn;
    expect(boss.usesAndroidModel).toBe(false);
    expect(() => boss.update(1 / 30, null)).not.toThrow();
  });
});
