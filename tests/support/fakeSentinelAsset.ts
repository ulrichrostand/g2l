import * as THREE from "three";
import { splitClip } from "../../src/avatar/layeredAnimator";
import { SENTINEL_CLIPS, type SentinelAsset } from "../../src/entities/sentinelAndroid";

/** Androïde factice : os Head et hand_r, deux matériaux nommés comme le mannequin, clips minimaux. */
export function fakeSentinelAsset(): SentinelAsset {
  const scene = new THREE.Group();
  const root = new THREE.Bone();
  root.name = "root";
  const pelvis = new THREE.Bone();
  pelvis.name = "pelvis";
  const head = new THREE.Bone();
  head.name = "Head";
  const hand = new THREE.Bone();
  hand.name = "hand_r";
  root.add(pelvis);
  pelvis.add(head, hand);
  // Os où le boss accroche son armure.
  for (const name of ["spine_03", "upperarm_l", "upperarm_r", "lowerarm_r"]) {
    const bone = new THREE.Bone();
    bone.name = name;
    pelvis.add(bone);
  }
  scene.add(root);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.8, 0.3), [new THREE.MeshStandardMaterial({ name: "M_Main" }), new THREE.MeshStandardMaterial({ name: "M_Joints" })]);
  body.name = "Mannequin";
  scene.add(body);
  const values = [0, 0, 0, 1, 0, 0.1, 0, 0.995];
  const clips = new Map(
    SENTINEL_CLIPS.map((name) => [
      name,
      splitClip(new THREE.AnimationClip(name, 1, [new THREE.QuaternionKeyframeTrack("pelvis.quaternion", [0, 1], values), new THREE.QuaternionKeyframeTrack("Head.quaternion", [0, 1], values)])),
    ]),
  );
  return { scene, clips };
}

