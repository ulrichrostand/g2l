import { readFileSync } from "node:fs";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { LayeredAnimator } from "../src/avatar/layeredAnimator";
import { Guard, type GuardTuning } from "../src/entities/guard";
import { SENTINEL_CLIPS, SentinelAndroid, sentinelLocomotion } from "../src/entities/sentinelAndroid";
import { fakeSentinelAsset } from "./support/fakeSentinelAsset";
import { Grid, Tile } from "../src/core/grid";

const MODEL_PATH = "public/models/characters/sentinel.glb";
/** Une sentinelle par salle ou presque : un fichier léger, partagé par toutes. */
const MAX_MODEL_BYTES = 1.2 * 1024 * 1024;

function readGlbJson(bytes: Uint8Array): { animations?: { name?: string }[]; nodes?: { name?: string }[]; materials?: { name?: string }[]; images?: unknown[] } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  expect(new TextDecoder("ascii").decode(bytes.subarray(0, 4))).toBe("glTF");
  const jsonLength = view.getUint32(12, true);
  return JSON.parse(new TextDecoder("utf-8").decode(bytes.subarray(20, 20 + jsonLength))) as ReturnType<typeof readGlbJson>;
}

describe("fichier de l'androïde des sentinelles", () => {
  const bytes = readFileSync(MODEL_PATH);
  const gltf = readGlbJson(bytes);

  it("contient le mannequin, ses deux matériaux, les os utiles et toutes les animations", () => {
    expect(bytes.byteLength).toBeLessThan(MAX_MODEL_BYTES);
    const names = (gltf.animations ?? []).map((animation) => animation.name);
    for (const clip of SENTINEL_CLIPS) expect(names).toContain(clip);
    const nodes = (gltf.nodes ?? []).map((node) => node.name);
    for (const bone of ["Head", "hand_r", "pelvis", "Mannequin"]) expect(nodes).toContain(bone);
    expect((gltf.materials ?? []).map((material) => material.name)).toEqual(expect.arrayContaining(["M_Main", "M_Joints"]));
    // Aucune image : les matériaux sont remplacés en jeu, rien à décoder.
    expect(gltf.images ?? []).toHaveLength(0);
  });
});

describe("locomotion de l'androïde", () => {
  it("immobile au repos, marche en ronde, court en combat", () => {
    expect(sentinelLocomotion({ speed: 0, hostile: false }).clip).toBe("Idle_Loop");
    expect(sentinelLocomotion({ speed: 1.2, hostile: false }).clip).toBe("Walk_Loop");
    expect(sentinelLocomotion({ speed: 1.2, hostile: true }).clip).toBe("Walk_Loop");
    expect(sentinelLocomotion({ speed: 2.5, hostile: true }).clip).toBe("Jog_Fwd_Loop");
  });

  it("cadence bornée, même pour une vitesse aberrante", () => {
    expect(sentinelLocomotion({ speed: 100, hostile: false }).timeScale).toBe(2);
    expect(sentinelLocomotion({ speed: Number.NaN, hostile: false })).toEqual({ clip: "Idle_Loop", timeScale: 1 });
  });
});

describe("SentinelAndroid", () => {
  it("habille le mannequin : métal sombre, lignes lumineuses qui suivent la visière, visière et pistolet attachés", () => {
    const visor = new THREE.MeshStandardMaterial({ emissive: 0xff2d2d, emissiveIntensity: 3 });
    const android = new SentinelAndroid(fakeSentinelAsset(), visor);
    const body = android.root.getObjectByName("Mannequin") as THREE.Mesh;
    const [plating, joints] = body.material as THREE.MeshStandardMaterial[];
    expect(plating?.name).toBe("SentinelPlating");
    expect(joints?.name).toBe("SentinelJoints");
    android.update(1 / 30, { speed: 0, hostile: false, aim: 0, pose: null });
    expect(joints?.emissive.getHex()).toBe(0xff2d2d);
    expect(joints?.emissiveIntensity).toBeCloseTo(1.5);
    // Visière éteinte (neutralisée) : une braise reste, l'épave ne disparaît pas dans le noir.
    visor.emissiveIntensity = 0;
    android.update(1 / 30, { speed: 0, hostile: false, aim: 0, pose: "fallen" });
    expect(joints?.emissiveIntensity).toBeGreaterThan(0);
    expect(android.root.getObjectByName("Head")?.children.some((child) => child instanceof THREE.Mesh && child.material === visor)).toBe(true);
    android.dispose();
  });
});

describe("LayeredAnimator : poses plein corps", () => {
  it("une pose recouvre peu à peu la locomotion, et chaque os garde un poids total de 1", () => {
    const asset = fakeSentinelAsset();
    const model = asset.scene;
    const animator = new LayeredAnimator(model, asset.clips, {
      locomotion: ["Idle_Loop", "Walk_Loop"],
      idle: "Idle_Loop",
      aim: "Pistol_Aim_Neutral",
      shot: "Pistol_Shoot",
      poses: ["Fixing_Kneeling", "Death01"],
      oneShotPoses: ["Death01"],
    });
    for (let frame = 0; frame < 60; frame++) animator.update(1 / 30, { locomotion: "Walk_Loop", timeScale: 1, aim: 0.5, pose: frame > 20 ? "Fixing_Kneeling" : null });
    const head = model.getObjectByName("Head");
    // Quaternion normalisé : pas de mélange dégénéré (poids total ≠ 1 ramènerait vers la pose de liaison).
    expect(head?.quaternion.length()).toBeCloseTo(1, 3);
    expect(() => animator.snapToPose("Death01")).not.toThrow();
    animator.dispose();
  });
});

describe("Guard avec l'androïde", () => {
  function corridor(): Grid {
    const grid = new Grid(10, 3, Tile.Wall);
    for (let x = 1; x < 9; x++) grid.set(x, 1, Tile.Floor);
    return grid;
  }
  const route = { waypoints: [{ x: 1, z: 1 }, { x: 4, z: 1 }] };
  const tuning: GuardTuning = { walkSpeed: 1.2, visionRange: 5, fieldOfViewRadians: 1.4, detectionRate: 1, reactionSeconds: 0.6, fireIntervalSeconds: 1, aimErrorRadians: 0.1, hitsToSuspend: 1 };

  it("remplace le robot procédural une fois chargé, et une sentinelle neutralisée avant reste à terre", async () => {
    const guard = new Guard(corridor(), route, tuning, () => 0.5, Promise.resolve(fakeSentinelAsset()));
    guard.neutralize(true);
    for (let round = 0; round < 5; round++) await Promise.resolve();
    expect(guard.usesAndroidModel).toBe(true);
    expect(guard.root.getObjectByName("Mannequin")).toBeDefined();
    expect(() => guard.update(1 / 30, null)).not.toThrow();
  });

  it("revient au robot procédural quand l'appareil ne suit plus, même si l'androïde arrive après", async () => {
    const shown = new Guard(corridor(), route, tuning, () => 0.5, Promise.resolve(fakeSentinelAsset()));
    for (let round = 0; round < 5; round++) await Promise.resolve();
    expect(shown.usesAndroidModel).toBe(true);
    shown.dropAndroid();
    expect(shown.usesAndroidModel).toBe(false);
    expect(shown.root.getObjectByName("Mannequin")).toBeUndefined();
    expect(() => shown.update(1 / 30, null)).not.toThrow();

    let deliver: (asset: ReturnType<typeof fakeSentinelAsset>) => void = () => undefined;
    const late = new Guard(corridor(), route, tuning, () => 0.5, new Promise((resolve) => (deliver = resolve)));
    late.dropAndroid();
    deliver(fakeSentinelAsset());
    for (let round = 0; round < 5; round++) await Promise.resolve();
    expect(late.usesAndroidModel).toBe(false);
  });

  it("un téléchargement raté laisse le robot procédural, sans erreur", async () => {
    const warn = console.warn;
    console.warn = () => undefined;
    const guard = new Guard(corridor(), route, tuning, () => 0.5, Promise.reject(new Error("réseau coupé (simulé)")));
    for (let round = 0; round < 5; round++) await Promise.resolve();
    console.warn = warn;
    expect(guard.usesAndroidModel).toBe(false);
    expect(() => guard.update(1 / 30, null)).not.toThrow();
  });
});
