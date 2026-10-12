import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { DEFAULT_AVATAR, type BodyType } from "../src/avatar/avatarConfig";
import { HumanCharacter, isUpperBodyTrack, locomotionClip, locomotionTimeScale, partRole, REQUIRED_CLIPS, REQUIRED_PARTS, skinTint } from "../src/avatar/humanCharacter";
import { createFakeHumanAsset } from "./support/fakeHumanAsset";

const MODEL_PATHS: Readonly<Record<BodyType, string>> = { male: "public/models/characters/agent-male.glb", female: "public/models/characters/agent-female.glb" };
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

for (const body of ["male", "female"] as const) {
  describe(`fichier du personnage humain (${MODEL_PATHS[body]})`, () => {
    const bytes = readFileSync(MODEL_PATHS[body]);
    const gltf = readGlbJson(bytes);

    it("est un glTF 2.0 binaire valide et léger", () => {
      expect(gltf.asset.version).toBe("2.0");
      expect(bytes.byteLength).toBeLessThan(MAX_MODEL_BYTES);
    });

    it("contient toutes les animations utilisées par le jeu", () => {
      const names = (gltf.animations ?? []).map((animation) => animation.name);
      for (const clip of REQUIRED_CLIPS) expect(names).toContain(clip);
    });

    it("contient toutes les pièces du créateur (coupes, barbe, vêtements) et un squelette complet", () => {
      const nodeNames = (gltf.nodes ?? []).map((node) => node.name ?? "");
      const roles = new Set(nodeNames.map(partRole));
      for (const role of REQUIRED_PARTS[body]) expect(roles).toContain(role);
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
}

describe("apparence du personnage humain", () => {
  function color(character: HumanCharacter, name: string): string {
    const mesh = character.root.getObjectByName(name);
    if (!(mesh instanceof THREE.Mesh) || !(mesh.material instanceof THREE.MeshStandardMaterial)) throw new Error(`pièce absente : ${name}`);
    return `#${mesh.material.color.getHexString()}`;
  }
  const visible = (character: HumanCharacter, name: string): boolean | undefined => character.root.getObjectByName(name)?.visible;

  it("chaque pièce prend sa couleur, sans toucher la ressource partagée", () => {
    const asset = createFakeHumanAsset("male");
    const character = new HumanCharacter(asset, { ...DEFAULT_AVATAR, topColor: "#112233", topAccent: "#445566", bottomColor: "#778899", shoesColor: "#aabbcc", hairColor: "#ddeeff" });
    expect(color(character, "Male_Ranger_Body")).toBe("#112233");
    expect(color(character, "Male_Ranger_Body_Belt_1")).toBe("#445566");
    expect(color(character, "Male_Peasant_Arms")).toBe("#445566");
    expect(color(character, "Male_Peasant_Legs")).toBe("#778899");
    expect(color(character, "Male_Ranger_Feet_Boots")).toBe("#aabbcc");
    expect(color(character, "Hair_Buzzed")).toBe("#ddeeff");
    expect(color(character, "Eyebrows")).toBe("#ddeeff");
    const shared = asset.scene.getObjectByName("Male_Ranger_Body");
    expect(shared instanceof THREE.Mesh && shared.material instanceof THREE.MeshStandardMaterial && shared.material.color.getHexString()).toBe("ffffff");
    character.dispose();
  });

  it("une seule coupe visible, barbe et chauve respectés, mise à jour sur place", () => {
    const character = new HumanCharacter(createFakeHumanAsset("male"), DEFAULT_AVATAR);
    expect(visible(character, "Hair_Buzzed")).toBe(true);
    expect(visible(character, "Hair_Long")).toBe(false);
    expect(visible(character, "Hair_Beard")).toBe(false);
    character.setAppearance({ ...DEFAULT_AVATAR, hairStyle: "bald", beard: true });
    for (const hair of ["Hair_Buzzed", "Hair_SimpleParted", "Hair_Long", "Hair_Buns"]) expect(visible(character, hair)).toBe(false);
    expect(visible(character, "Hair_Beard")).toBe(true);
    character.dispose();
  });

  it("la silhouette féminine prend ses propres pièces, et refuse une config d'une autre silhouette", () => {
    const asset = createFakeHumanAsset("female");
    const character = new HumanCharacter(asset, { ...DEFAULT_AVATAR, body: "female", hairStyle: "buzz" });
    expect(visible(character, "Hair_BuzzedFemale")).toBe(true);
    expect(() => character.setAppearance(DEFAULT_AVATAR)).toThrow();
    expect(() => new HumanCharacter(asset, DEFAULT_AVATAR)).toThrow();
    character.dispose();
  });

  it("carrure et taille : plus large que haut pour un costaud, la tête garde ses proportions", () => {
    const character = new HumanCharacter(createFakeHumanAsset("male"), { ...DEFAULT_AVATAR, build: "strong", height: 1.1 });
    const model = character.root.children[0];
    if (!model) throw new Error("modèle absent");
    expect(model.scale.x).toBeGreaterThan(model.scale.y);
    expect(model.scale.x * (character.root.getObjectByName("Head")?.scale.x ?? 0)).toBeCloseTo(model.scale.y);
    const slim = new HumanCharacter(createFakeHumanAsset("male"), { ...DEFAULT_AVATAR, build: "slim", height: 0.9 });
    expect(slim.scale).toBeLessThan(character.scale);
    character.dispose();
    slim.dispose();
  });

  it("s'anime sans erreur (marche, visée, tir)", () => {
    const character = new HumanCharacter(createFakeHumanAsset("male"), DEFAULT_AVATAR);
    character.playShot();
    for (let frame = 0; frame < 30; frame++) character.update(1 / 30, { speed: 3, crouching: frame > 15, aim: 1 });
    expect(Number.isFinite(character.root.getObjectByName("Head")?.quaternion.w ?? Number.NaN)).toBe(true);
    character.dispose();
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
