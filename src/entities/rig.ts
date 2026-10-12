import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * Squelette minimal partagé par l'agent et les sentinelles : des groupes pivots (épaules, hanches)
 * qu'on fait osciller pour la marche. Pas de skinning : quelques rotations suffisent à donner vie.
 */
export interface HumanoidRig {
  root: THREE.Group;
  hips: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
}

/** Hauteur du bassin : calée pour que les semelles (bas des pieds à -HIP_HEIGHT) touchent le sol. */
export const HIP_HEIGHT = 0.655;
/** Pivot de la tête, au-dessus du bassin (repère du torse). */
export const HEAD_PIVOT_HEIGHT = 0.72;
/** Pivot des épaules, au-dessus du bassin (repère du torse). */
export const SHOULDER_PIVOT_HEIGHT = 0.56;
/** Écart latéral des hanches. */
export const LEG_PIVOT_OFFSET = 0.11;
export const AGENT_SHOULDER_WIDTH = 0.24;
export const SENTINEL_SHOULDER_WIDTH = 0.31;

function pivot(name: string): THREE.Group {
  const group = new THREE.Group();
  group.name = name;
  return group;
}

/**
 * Pivots seuls, sans aucun mesh : chaque modèle (agent personnalisable, sentinelle) habille ce même
 * squelette, ce qui garantit que poseRig anime tout le monde de la même façon.
 */
export function createRigSkeleton(shoulderWidth: number = AGENT_SHOULDER_WIDTH): HumanoidRig {
  const root = pivot("root");
  const hips = pivot("hips");
  hips.position.y = HIP_HEIGHT;
  root.add(hips);

  const torso = pivot("torso");
  hips.add(torso);
  const head = pivot("head");
  head.position.y = HEAD_PIVOT_HEIGHT;
  torso.add(head);

  const leftLeg = pivot("leftLeg");
  const rightLeg = pivot("rightLeg");
  leftLeg.position.set(-LEG_PIVOT_OFFSET, 0, 0);
  rightLeg.position.set(LEG_PIVOT_OFFSET, 0, 0);
  hips.add(leftLeg, rightLeg);

  const leftArm = pivot("leftArm");
  const rightArm = pivot("rightArm");
  leftArm.position.set(-shoulderWidth, SHOULDER_PIVOT_HEIGHT, 0);
  rightArm.position.set(shoulderWidth, SHOULDER_PIVOT_HEIGHT, 0);
  torso.add(leftArm, rightArm);

  return { root, hips, torso, head, leftArm, rightArm, leftLeg, rightLeg };
}

function addMesh(parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const part = new THREE.Mesh(geometry, material);
  part.position.set(x, y, z);
  part.castShadow = true;
  parent.add(part);
  return part;
}

/** Géométrie déplacée/tournée une fois pour toutes : on peut ensuite la fusionner avec ses voisines. */
function placed(geometry: THREE.BufferGeometry, x: number, y: number, z: number, rotationX = 0, rotationZ = 0): THREE.BufferGeometry {
  if (rotationX !== 0) geometry.rotateX(rotationX);
  if (rotationZ !== 0) geometry.rotateZ(rotationZ);
  geometry.translate(x, y, z);
  return geometry;
}

/** Fusionne des pièces de même matériau en un seul mesh : moins d'appels de dessin par sentinelle. */
function merged(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  // RoundedBoxGeometry n'est pas indexée : la fusion exige que toutes les pièces le soient ou aucune.
  const allIndexed = parts.every((part) => part.index !== null);
  const compatible = allIndexed ? parts : parts.map((part) => (part.index !== null ? part.toNonIndexed() : part));
  const geometry = mergeGeometries(compatible) as THREE.BufferGeometry | null;
  for (const part of new Set([...parts, ...compatible])) part.dispose();
  if (!geometry) throw new Error("Fusion des pièces de la sentinelle impossible (attributs incompatibles)");
  return geometry;
}

interface SentinelKit {
  body: THREE.MeshStandardMaterial;
  armor: THREE.MeshStandardMaterial;
  seam: THREE.MeshStandardMaterial;
  chest: THREE.BufferGeometry;
  abdomen: THREE.BufferGeometry;
  pelvis: THREE.BufferGeometry;
  core: THREE.BufferGeometry;
  torsoTrim: THREE.BufferGeometry;
  pauldron: THREE.BufferGeometry;
  pauldronLights: THREE.BufferGeometry;
  backUnit: THREE.BufferGeometry;
  headShell: THREE.BufferGeometry;
  visor: THREE.BufferGeometry;
  headTrim: THREE.BufferGeometry;
  antennaTip: THREE.BufferGeometry;
  upperArm: THREE.BufferGeometry;
  forearm: THREE.BufferGeometry;
  hand: THREE.BufferGeometry;
  thigh: THREE.BufferGeometry;
  shin: THREE.BufferGeometry;
  foot: THREE.BufferGeometry;
  blasterBody: THREE.BufferGeometry;
  blasterGrip: THREE.BufferGeometry;
  blasterBarrel: THREE.BufferGeometry;
}

/**
 * Géométries et matériaux communs à toutes les sentinelles, créés une seule fois.
 * disposeScene les libère en fin de mission : Three.js les renvoie simplement au GPU s'ils resservent,
 * le partage reste donc sûr. Seul le matériau lumineux est propre à chaque sentinelle.
 */
let sentinelKit: SentinelKit | null = null;

function getSentinelKit(): SentinelKit {
  sentinelKit ??= buildSentinelKit();
  return sentinelKit;
}

function buildSentinelKit(): SentinelKit {
  const chestFront = 0.17;
  return {
    body: new THREE.MeshStandardMaterial({ color: 0x24161a, roughness: 0.6, metalness: 0.4 }),
    armor: new THREE.MeshStandardMaterial({ color: 0x55303a, roughness: 0.32, metalness: 0.7 }),
    seam: new THREE.MeshStandardMaterial({ color: 0x0c0708, roughness: 0.75, metalness: 0.3 }),
    chest: new RoundedBoxGeometry(0.54, 0.42, 0.34, 3, 0.09),
    abdomen: new THREE.CylinderGeometry(0.15, 0.18, 0.24, 14),
    pelvis: new RoundedBoxGeometry(0.42, 0.13, 0.3, 2, 0.05),
    core: placed(new THREE.CylinderGeometry(0.062, 0.062, 0.04, 16), 0, 0.42, chestFront + 0.004, Math.PI / 2),
    // Lignes de panneaux, anneau du cœur, côtes de l'abdomen, tuyères : un seul mesh sombre.
    torsoTrim: merged([
      placed(new THREE.TorusGeometry(0.082, 0.014, 6, 20), 0, 0.42, chestFront),
      placed(new THREE.BoxGeometry(0.34, 0.012, 0.012), 0, 0.53, chestFront - 0.002),
      placed(new THREE.BoxGeometry(0.012, 0.2, 0.012), -0.13, 0.4, chestFront - 0.002),
      placed(new THREE.BoxGeometry(0.012, 0.2, 0.012), 0.13, 0.4, chestFront - 0.002),
      placed(new THREE.BoxGeometry(0.012, 0.1, 0.012), 0, 0.3, chestFront - 0.002),
      placed(new THREE.TorusGeometry(0.168, 0.013, 6, 24), 0, 0.12, 0, Math.PI / 2),
      placed(new THREE.TorusGeometry(0.16, 0.013, 6, 24), 0, 0.2, 0, Math.PI / 2),
      placed(new THREE.CylinderGeometry(0.035, 0.035, 0.06, 10), -0.08, 0.37, -0.27, Math.PI / 2),
      placed(new THREE.CylinderGeometry(0.035, 0.035, 0.06, 10), 0.08, 0.37, -0.27, Math.PI / 2),
    ]),
    pauldron: new THREE.SphereGeometry(0.14, 16, 10).scale(1.05, 0.58, 1.18),
    // Bandes lumineuses sur les épaules : la menace reste lisible vue de dessus.
    pauldronLights: merged([
      placed(new RoundedBoxGeometry(0.035, 0.02, 0.2, 1, 0.008), -0.35, 0.632, 0, 0, 0.25),
      placed(new RoundedBoxGeometry(0.035, 0.02, 0.2, 1, 0.008), 0.35, 0.632, 0, 0, -0.25),
    ]),
    backUnit: new RoundedBoxGeometry(0.34, 0.3, 0.12, 2, 0.04),
    headShell: new RoundedBoxGeometry(0.3, 0.27, 0.3, 3, 0.08),
    visor: new RoundedBoxGeometry(0.27, 0.07, 0.05, 2, 0.02),
    headTrim: merged([
      placed(new RoundedBoxGeometry(0.31, 0.045, 0.06, 1, 0.015), 0, 0.115, 0.135),
      placed(new RoundedBoxGeometry(0.18, 0.07, 0.04, 1, 0.015), 0, -0.03, 0.14),
      placed(new THREE.CylinderGeometry(0.055, 0.055, 0.04, 14), -0.155, 0.04, 0, 0, Math.PI / 2),
      placed(new THREE.CylinderGeometry(0.055, 0.055, 0.04, 14), 0.155, 0.04, 0, 0, Math.PI / 2),
      placed(new THREE.CylinderGeometry(0.075, 0.09, 0.12, 12), 0, -0.12, 0),
      placed(new THREE.CylinderGeometry(0.01, 0.01, 0.2, 6), 0.1, 0.27, -0.06),
    ]),
    antennaTip: new THREE.SphereGeometry(0.022, 10, 8),
    upperArm: new THREE.CapsuleGeometry(0.075, 0.14, 4, 10),
    forearm: new RoundedBoxGeometry(0.17, 0.24, 0.17, 2, 0.06),
    hand: new RoundedBoxGeometry(0.12, 0.1, 0.13, 2, 0.035),
    thigh: new THREE.CapsuleGeometry(0.095, 0.16, 4, 10),
    shin: new RoundedBoxGeometry(0.18, 0.28, 0.2, 2, 0.06),
    foot: new RoundedBoxGeometry(0.2, 0.09, 0.3, 2, 0.035),
    blasterBody: new RoundedBoxGeometry(0.09, 0.12, 0.3, 2, 0.02),
    blasterGrip: placed(new THREE.BoxGeometry(0.06, 0.12, 0.07), 0, -0.08, 0, 0.3),
    blasterBarrel: placed(new THREE.CylinderGeometry(0.03, 0.03, 0.08, 10), 0, 0, 0, Math.PI / 2),
  };
}

/** Sentinelle d'ENTROPIA : robot massif à coques arrondies, épaulières, cœur et visière rouges. */
export function createSentinelRig(): { rig: HumanoidRig; glow: THREE.MeshStandardMaterial } {
  const kit = getSentinelKit();
  // Matériau propre à chaque sentinelle : éteindre la visière d'une sentinelle ne doit pas éteindre les autres.
  const glow = new THREE.MeshStandardMaterial({ color: 0xff2d2d, emissive: 0xff2d2d, emissiveIntensity: 3 });
  const rig = createRigSkeleton(SENTINEL_SHOULDER_WIDTH);

  addMesh(rig.torso, kit.chest, kit.armor, 0, 0.4, 0);
  addMesh(rig.torso, kit.abdomen, kit.body, 0, 0.16, 0);
  addMesh(rig.torso, kit.pelvis, kit.armor, 0, 0.02, 0);
  addMesh(rig.torso, kit.core, glow);
  addMesh(rig.torso, kit.torsoTrim, kit.seam);
  addMesh(rig.torso, kit.pauldron, kit.armor, -0.34, 0.56, 0).rotation.z = 0.25;
  addMesh(rig.torso, kit.pauldron, kit.armor, 0.34, 0.56, 0).rotation.z = -0.25;
  addMesh(rig.torso, kit.pauldronLights, glow);
  addMesh(rig.torso, kit.backUnit, kit.body, 0, 0.42, -0.2);

  addMesh(rig.head, kit.headShell, kit.armor, 0, 0.05, 0);
  addMesh(rig.head, kit.visor, glow, 0, 0.055, 0.142);
  addMesh(rig.head, kit.headTrim, kit.body);
  addMesh(rig.head, kit.antennaTip, glow, 0.1, 0.375, -0.06);

  for (const arm of [rig.leftArm, rig.rightArm]) {
    addMesh(arm, kit.upperArm, kit.body, 0, -0.12, 0);
    addMesh(arm, kit.forearm, kit.armor, 0, -0.36, 0);
    addMesh(arm, kit.hand, kit.body, 0, -0.52, 0.01);
  }
  for (const leg of [rig.leftLeg, rig.rightLeg]) {
    addMesh(leg, kit.thigh, kit.body, 0, -0.14, 0);
    addMesh(leg, kit.shin, kit.armor, 0, -0.41, 0.01);
    addMesh(leg, kit.foot, kit.body, 0, -0.61, 0.05);
  }

  // Arme de poing : visible dès qu'elle la lève en combat, avec un canon rouge qui accroche le bloom.
  const blaster = new THREE.Group();
  addMesh(blaster, kit.blasterBody, kit.armor, 0, 0, 0.08);
  addMesh(blaster, kit.blasterGrip, kit.body);
  addMesh(blaster, kit.blasterBarrel, glow, 0, 0.02, 0.26);
  blaster.position.set(0, -0.6, 0.05);
  rig.rightArm.add(blaster);
  return { rig, glow };
}

/**
 * Pose de marche + accroupissement.
 * `stride` ∈ [0, 1] : amplitude du pas ; `crouch` ∈ [0, 1] : degré d'accroupissement.
 */
export function poseRig(rig: HumanoidRig, phase: number, stride: number, crouch: number, aim = 0): void {
  const swing = Math.sin(phase) * 0.7 * stride;
  rig.leftLeg.rotation.x = swing - crouch * 0.9;
  rig.rightLeg.rotation.x = -swing - crouch * 0.9;
  rig.leftArm.rotation.x = -swing * 0.8 - crouch * 0.4;
  // `aim` ∈ [0, 1] : bras tendu à l'horizontale pour tirer.
  rig.rightArm.rotation.x = THREE.MathUtils.lerp(swing * 0.8 - crouch * 0.4, -Math.PI / 2, aim);
  rig.torso.rotation.x = crouch * 0.45 + stride * 0.08;
  rig.hips.position.y = HIP_HEIGHT - crouch * 0.26 + Math.abs(Math.cos(phase)) * 0.035 * stride;
}
