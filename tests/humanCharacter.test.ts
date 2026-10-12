import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isUpperBodyTrack, locomotionClip, locomotionTimeScale, REQUIRED_CLIPS, skinTint, TINTED_MESHES } from "../src/avatar/humanCharacter";

const MODEL_PATH = "public/models/characters/agent.glb";
/** Le personnage est téléchargé au lancement : au-delà, l'attente se ferait sentir sur une connexion mobile. */
const MAX_MODEL_BYTES = 3 * 1024 * 1024;

interface GltfJson {
  asset: { version: string };
  animations?: { name?: string }[];
  nodes?: { name?: string }[];
  skins?: { joints: number[] }[];
  images?: { mimeType?: string; uri?: string }[];
  extensionsRequired?: string[];
}

/** Lit le bloc JSON d'un .glb (en-tête de 12 octets, puis le premier bloc, de type JSON). */
function readGlbJson(bytes: Uint8Array): GltfJson {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (start: number, end: number): string => new TextDecoder("ascii").decode(bytes.subarray(start, end));
  expect(ascii(0, 4)).toBe("glTF");
  expect(view.getUint32(4, true)).toBe(2);
  expect(view.getUint32(8, true)).toBe(bytes.byteLength);
  const jsonLength = view.getUint32(12, true);
  expect(ascii(16, 20)).toBe("JSON");
  return JSON.parse(new TextDecoder("utf-8").decode(bytes.subarray(20, 20 + jsonLength))) as GltfJson;
}

describe("fichier du personnage humain (agent.glb)", () => {
  const bytes = readFileSync(MODEL_PATH);
  const gltf = readGlbJson(bytes);

  it("est un glTF 2.0 binaire valide et léger", () => {
    expect(gltf.asset.version).toBe("2.0");
    expect(bytes.byteLength).toBeLessThan(MAX_MODEL_BYTES);
  });

  it("contient toutes les animations utilisées par le jeu", () => {
    const names = (gltf.animations ?? []).map((animation) => animation.name);
    for (const clip of REQUIRED_CLIPS) expect(names).toContain(clip);
  });

  it("contient les pièces teintées par le créateur et un squelette complet", () => {
    const nodeNames = (gltf.nodes ?? []).map((node) => node.name ?? "");
    for (const prefix of Object.values(TINTED_MESHES)) expect(nodeNames.some((name) => name.startsWith(prefix))).toBe(true);
    for (const bone of ["root", "pelvis", "Head", "hand_r", "foot_l"]) expect(nodeNames).toContain(bone);
    expect(gltf.skins?.every((skin) => skin.joints.length === 65)).toBe(true);
  });

  it("n'embarque que des images intégrées (aucune URL externe, compatible avec la CSP)", () => {
    for (const image of gltf.images ?? []) {
      expect(image.uri).toBeUndefined();
      expect(["image/webp", "image/png", "image/jpeg"]).toContain(image.mimeType);
    }
    // Seules des extensions décodées nativement par GLTFLoader, sans décodeur à livrer (ni Draco, ni meshopt).
    for (const extension of gltf.extensionsRequired ?? []) expect(["EXT_texture_webp", "KHR_mesh_quantization"]).toContain(extension);
  });
});

describe("animation du personnage humain", () => {
  it("choisit le cycle selon la posture et la vitesse réelle", () => {
    expect(locomotionClip({ speed: 0, crouching: false, aim: 0 })).toBe("Idle_Loop");
    expect(locomotionClip({ speed: 1.5, crouching: false, aim: 1 })).toBe("Walk_Loop");
    expect(locomotionClip({ speed: 3, crouching: false, aim: 0 })).toBe("Jog_Fwd_Loop");
    expect(locomotionClip({ speed: 5, crouching: false, aim: 0 })).toBe("Sprint_Loop");
    expect(locomotionClip({ speed: 0, crouching: true, aim: 0 })).toBe("Crouch_Idle_Loop");
    expect(locomotionClip({ speed: 1.6, crouching: true, aim: 0 })).toBe("Crouch_Fwd_Loop");
  });

  it("cale la cadence sur la vitesse, dans des bornes raisonnables", () => {
    expect(locomotionTimeScale("Jog_Fwd_Loop", 3, 0.9)).toBeCloseTo(3 / (2.68 * 0.9));
    expect(locomotionTimeScale("Walk_Loop", 100, 0.9)).toBe(2.2);
    expect(locomotionTimeScale("Walk_Loop", 0, 0.9)).toBe(0.6);
    expect(locomotionTimeScale("Idle_Loop", 3, 0.9)).toBe(1);
    expect(locomotionTimeScale("Walk_Loop", 3, 0)).toBe(1);
  });

  it("sépare le haut du corps (visée) des jambes (marche)", () => {
    expect(isUpperBodyTrack("upperarm_r.quaternion")).toBe(true);
    expect(isUpperBodyTrack("Head.quaternion")).toBe(true);
    expect(isUpperBodyTrack("spine_02.quaternion")).toBe(true);
    expect(isUpperBodyTrack("pelvis.position")).toBe(false);
    expect(isUpperBodyTrack("thigh_l.quaternion")).toBe(false);
    expect(isUpperBodyTrack("root.quaternion")).toBe(false);
  });

  it("teinte la peau vers la couleur choisie sans valeurs aberrantes", () => {
    const tint = skinTint("#5a3825");
    expect(tint.r).toBeGreaterThan(0);
    expect(tint.r).toBeLessThan(1);
    const pale = skinTint("#ffffff");
    expect(Math.max(pale.r, pale.g, pale.b)).toBeLessThanOrEqual(2);
  });
});
