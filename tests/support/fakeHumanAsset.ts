import * as THREE from "three";
import type { BodyType } from "../../src/avatar/avatarConfig";
import { REQUIRED_CLIPS, type HumanCharacterAsset } from "../../src/avatar/humanCharacter";

/**
 * Personnage factice pour les tests sous Node (pas de GLTFLoader ni d'images) : mêmes noms d'os et de pièces
 * que les vrais fichiers, des boîtes à la place des maillages, et des clips minimaux sur le haut et le bas du corps.
 * Taille calquée sur le modèle masculin (1,81 m cheveux compris) pour que le cadrage du studio soit réaliste.
 */
const PART_BOXES: Readonly<Record<BodyType, readonly [string, number, number][]>> = {
  male: [
    ["Male_Peasant_Arms", 0.95, 1.5],
    ["Male_Peasant_Legs", 0.05, 1.0],
    ["Male_Ranger_Body", 0.95, 1.5],
    ["Male_Ranger_Body_Belt_1", 1.1, 1.2],
    ["Male_Ranger_Feet_Boots", 0, 0.5],
    ["SuperHero_Male", 1.5, 1.78],
    ["Eyebrows", 1.68, 1.72],
    ["Eyes", 1.66, 1.7],
    ["Hair_Buzzed", 1.62, 1.79],
    ["Hair_SimpleParted", 1.62, 1.8],
    ["Hair_Long", 1.4, 1.8],
    ["Hair_Buns", 1.62, 1.81],
    ["Hair_Beard", 1.5, 1.62],
  ],
  female: [
    ["Female_Peasant_Arms", 0.9, 1.4],
    ["Female_Peasant_Legs", 0.05, 0.95],
    ["Female_Ranger_Body", 0.9, 1.42],
    ["Female_Ranger_Body_Belt_1", 1.0, 1.1],
    ["Female_Ranger_Feet", 0, 0.45],
    ["Superhero_Female", 1.4, 1.68],
    ["Eyebrows", 1.58, 1.62],
    ["Eyes", 1.56, 1.6],
    ["Hair_BuzzedFemale", 1.52, 1.69],
    ["Hair_SimpleParted", 1.52, 1.7],
    ["Hair_Long", 1.3, 1.7],
    ["Hair_Buns", 1.52, 1.72],
  ],
};

export function createFakeHumanAsset(body: BodyType): HumanCharacterAsset {
  const scene = new THREE.Group();
  const root = new THREE.Bone();
  root.name = "root";
  const pelvis = new THREE.Bone();
  pelvis.name = "pelvis";
  const spine = new THREE.Bone();
  spine.name = "spine_01";
  const head = new THREE.Bone();
  head.name = "Head";
  head.position.y = 0.6;
  const hand = new THREE.Bone();
  hand.name = "hand_r";
  root.add(pelvis);
  pelvis.position.y = 0.95;
  pelvis.add(spine);
  spine.add(head, hand);
  scene.add(root);

  for (const [name, bottom, top] of PART_BOXES[body]) {
    const geometry = new THREE.BoxGeometry(0.4, top - bottom, 0.25).translate(0, (top + bottom) / 2, 0);
    const material = new THREE.MeshStandardMaterial({ name: `MI_${name}` });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    scene.add(mesh);
  }

  const clips = new Map<(typeof REQUIRED_CLIPS)[number], { lower: THREE.AnimationClip; upper: THREE.AnimationClip }>();
  for (const name of REQUIRED_CLIPS) {
    const sway = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.2);
    const values = [0, 0, 0, 1, sway.x, sway.y, sway.z, sway.w];
    clips.set(name, {
      lower: new THREE.AnimationClip(`${name}:lower`, 1, [new THREE.QuaternionKeyframeTrack("pelvis.quaternion", [0, 1], values)]),
      upper: new THREE.AnimationClip(`${name}:upper`, 1, [new THREE.QuaternionKeyframeTrack("Head.quaternion", [0, 1], values)]),
    });
  }
  return { body, scene, clips };
}
