import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { createRigSkeleton, HIP_HEIGHT, type HumanoidRig } from "../entities/rig";
import type { AvatarConfig, BodyBuild, HairStyle } from "./avatarConfig";
import { acquireFaceTexture, FACE_TEXTURE_LAYOUT, releaseAvatarTexture } from "./avatarTextures";

/**
 * Agent de repli : silhouette low-poly stylisée, affichée tant que le personnage humain riggé n'est pas
 * téléchargé (ou à sa place si le téléchargement échoue). La tenue est donc fixe et sobre — gilet tactique,
 * cargo, rangers, sac à dos — et seules les couleurs, la coupe, la carrure et la taille suivent la config :
 * le joueur reconnaît son agent sans que ce repli ne duplique toute la garde-robe du modèle humain.
 * Silhouette féminine et barbe n'ont pas de géométrie dédiée : un repli temporaire, vu de dessus, n'en tirerait rien.
 * Le modèle habille exactement le squelette de rig.ts : poseRig l'anime (marche, accroupi, visée). Il regarde vers +Z.
 */
export interface AvatarModel {
  rig: HumanoidRig;
  /**
   * Libère géométries et matériaux propres à cet avatar. La texture du visage est partagée via le cache
   * d'avatarTextures : elle est seulement « rendue », dès que le matériau qui la porte est libéré, par
   * dispose() ou par un nettoyage de scène qui libère les matériaux (disposeScene), une seule fois en tout.
   * Appeler dispose() plusieurs fois, ou après un tel nettoyage, est sans effet.
   */
  dispose(): void;
}

interface BodyMetrics {
  /** Écart des pivots d'épaule (x). */
  shoulderWidth: number;
  chestRadius: number;
  waistRadius: number;
  hipRadius: number;
  /** Aplatissement avant-arrière du tronc : un torse n'est pas un cylindre. */
  depth: number;
  armRadius: number;
  legRadius: number;
  neckRadius: number;
}

const BODY_METRICS: Record<BodyBuild, BodyMetrics> = {
  slim: { shoulderWidth: 0.225, chestRadius: 0.158, waistRadius: 0.128, hipRadius: 0.148, depth: 0.66, armRadius: 0.047, legRadius: 0.07, neckRadius: 0.05 },
  regular: { shoulderWidth: 0.24, chestRadius: 0.175, waistRadius: 0.148, hipRadius: 0.16, depth: 0.68, armRadius: 0.054, legRadius: 0.078, neckRadius: 0.056 },
  strong: { shoulderWidth: 0.265, chestRadius: 0.2, waistRadius: 0.175, hipRadius: 0.175, depth: 0.72, armRadius: 0.064, legRadius: 0.088, neckRadius: 0.066 },
};

/** Tête un peu grosse (style « chibi » léger) : vue de dessus, c'est elle qu'on lit en premier. */
const HEAD_RADIUS = 0.158;
const HEAD_STRETCH = 1.07;
const HEAD_CENTER_Y = 0.04;
const HAND_Y = -0.47;
const SOLE_Y = -HIP_HEIGHT;
/** Le gilet porte-plaques dépasse du torse : sac et bretelles s'appuient sur lui, pas sur la chemise. */
const VEST_THICKNESS = 0.05;

/**
 * Distance (en rayons de tête) du bandeau des optiques selon la coupe : devant, le boîtier se pose sur la
 * coiffure sans s'y enfoncer ; sur les côtés et derrière, le bandeau épouse la tête au lieu de flotter.
 */
const GOGGLE_MOUNT: Record<HairStyle, { front: number; side: number }> = {
  buzz: { front: 1.04, side: 1.04 },
  short: { front: 1.08, side: 1.08 },
  long: { front: 1.06, side: 1.06 },
  bun: { front: 1.05, side: 1.05 },
  bald: { front: 1.01, side: 1.01 },
};
/** Angle polaire (depuis le sommet du crâne) où les optiques relevées reposent sur le front. */
const GOGGLE_POLAR = 1.0;

const workEuler = new THREE.Euler();
const workQuaternion = new THREE.Quaternion();
const workPosition = new THREE.Vector3();
const workScale = new THREE.Vector3();
const workMatrix = new THREE.Matrix4();

type Profile = readonly (readonly [number, number])[];

interface Placement {
  x?: number;
  y?: number;
  z?: number;
  rotationX?: number;
  rotationY?: number;
  rotationZ?: number;
  scaleX?: number;
  scaleY?: number;
  scaleZ?: number;
}

/** Applique échelle, rotation puis translation directement aux sommets (pour pouvoir fusionner ensuite). */
function place<T extends THREE.BufferGeometry>(geometry: T, placement: Placement): T {
  workEuler.set(placement.rotationX ?? 0, placement.rotationY ?? 0, placement.rotationZ ?? 0);
  workQuaternion.setFromEuler(workEuler);
  workPosition.set(placement.x ?? 0, placement.y ?? 0, placement.z ?? 0);
  workScale.set(placement.scaleX ?? 1, placement.scaleY ?? 1, placement.scaleZ ?? 1);
  geometry.applyMatrix4(workMatrix.compose(workPosition, workQuaternion, workScale));
  return geometry;
}

/** Plusieurs pièces de même matériau → un seul mesh : moins d'appels de dessin à chaque image. */
function mergeParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const allIndexed = parts.every((part) => part.index !== null);
  const compatible = allIndexed ? parts : parts.map((part) => (part.index !== null ? part.toNonIndexed() : part));
  const merged = mergeGeometries(compatible) as THREE.BufferGeometry | null;
  for (const part of new Set([...parts, ...compatible])) part.dispose();
  if (!merged) throw new Error("Fusion des pièces de l'avatar impossible (attributs incompatibles)");
  return merged;
}

/**
 * Volume (au facteur π près) balayé par le profil, signé par son sens de parcours : somme de troncs de cône.
 * Positif quand le profil « monte » dans l'ensemble, même s'il fait des retours en arrière.
 */
function signedSweptVolume(profile: Profile): number {
  let volume = 0;
  for (let index = 1; index < profile.length; index++) {
    const [radiusFrom, yFrom] = profile[index - 1] as readonly [number, number];
    const [radiusTo, yTo] = profile[index] as readonly [number, number];
    volume += ((radiusFrom * radiusFrom + radiusFrom * radiusTo + radiusTo * radiusTo) / 3) * (yTo - yFrom);
  }
  return volume;
}

/**
 * LatheGeometry ne tourne ses faces et ses normales vers l'extérieur que si le profil monte. Or un membre
 * se décrit naturellement de l'épaule vers le poignet : en FrontSide, la paroi extérieure serait éliminée
 * et on verrait l'intérieur du membre, éclairé à l'envers. On accepte donc les deux sens d'écriture.
 */
function lathe(profile: Profile, segments: number): THREE.LatheGeometry {
  const rising = signedSweptVolume(profile) >= 0 ? profile : [...profile].reverse();
  return new THREE.LatheGeometry(
    rising.map(([radius, y]) => new THREE.Vector2(radius, y)),
    segments,
  );
}

/** Quart de cercle en haut d'un profil de tour : épaule ronde, comme une capsule, pas un disque plat. */
function domeProfile(radius: number, topY: number): [number, number][] {
  const steps = 4;
  const points: [number, number][] = [];
  for (let step = 0; step <= steps; step++) {
    const angle = (step / steps) * (Math.PI / 2);
    points.push([radius * Math.sin(angle), topY - radius * (1 - Math.cos(angle))]);
  }
  return points;
}

/** Rayon du profil à la hauteur y (interpolation linéaire) : pour poser plaques et poches au ras du torse. */
function profileRadiusAt(profile: Profile, y: number): number {
  for (let index = 1; index < profile.length; index++) {
    const [radiusBelow, yBelow] = profile[index - 1] as readonly [number, number];
    const [radiusAbove, yAbove] = profile[index] as readonly [number, number];
    if (y >= yBelow && y <= yAbove && yAbove > yBelow) return radiusBelow + ((y - yBelow) / (yAbove - yBelow)) * (radiusAbove - radiusBelow);
  }
  return 0;
}

/** Calotte crânienne : sphère tronquée, basculée vers l'arrière (front dégagé, nuque couverte). */
function scalpCap(scale: number, polarExtent: number, tilt: number): THREE.BufferGeometry {
  const cap = new THREE.SphereGeometry(HEAD_RADIUS * scale, 22, 10, 0, Math.PI * 2, 0, polarExtent);
  cap.rotateX(-tilt);
  cap.scale(1, HEAD_STRETCH, 1);
  cap.translate(0, HEAD_CENTER_Y, 0);
  return cap;
}

class AvatarBuilder {
  private readonly rig: HumanoidRig;
  private readonly glow: THREE.MeshStandardMaterial;
  private readonly metrics: BodyMetrics;
  private readonly torsoProfile: Profile;
  private readonly geometries = new Set<THREE.BufferGeometry>();
  private readonly materials = new Map<string, THREE.Material>();

  constructor(private readonly config: AvatarConfig) {
    this.metrics = BODY_METRICS[config.build];
    this.rig = createRigSkeleton(this.metrics.shoulderWidth);
    this.rig.root.scale.setScalar(config.height);
    // Optiques et bobine du pistolet : couleur visorColor, assez émissive pour accrocher le bloom.
    this.glow = new THREE.MeshStandardMaterial({ color: config.visorColor, emissive: config.visorColor, emissiveIntensity: 2.2 });
    this.materials.set("glow", this.glow);
    const { waistRadius, chestRadius, shoulderWidth, neckRadius } = this.metrics;
    this.torsoProfile = [
      [0, 0.05],
      [waistRadius * 0.96, 0.055],
      [waistRadius, 0.12],
      [waistRadius * 1.03, 0.2],
      [chestRadius, 0.33],
      [chestRadius * 1.03, 0.41],
      [shoulderWidth * 0.86, 0.475],
      [shoulderWidth * 0.74, 0.528],
      [shoulderWidth * 0.46, 0.566],
      [neckRadius * 1.25, 0.585],
      [0, 0.59],
    ];
  }

  build(): AvatarModel {
    this.buildHead();
    this.buildHair();
    this.buildGoggles();
    this.buildTorso();
    this.buildVest();
    this.buildArms();
    this.buildLegs();
    this.buildBoots();
    this.buildBackpack();
    this.buildPistol();
    const geometries = this.geometries;
    const materials = this.materials;
    let disposed = false;
    return {
      rig: this.rig,
      dispose: () => {
        if (disposed) return;
        disposed = true;
        for (const geometry of geometries) geometry.dispose();
        // Libérer les matériaux rend aussi la texture partagée du visage au cache (voir releaseWithMaterial).
        for (const material of materials.values()) material.dispose();
      },
    };
  }

  // --- Matériaux (un par clé : les pièces de même couleur partagent le leur) ---

  /**
   * Rend la texture partagée au cache quand le matériau qui la porte est libéré. En fin de mission, la
   * scène est nettoyée par disposeScene, qui libère les matériaux sans connaître l'avatar : sans ce
   * branchement, le compteur du cache ne redescendrait jamais et la texture y resterait à vie.
   * L'écouteur se retire au premier appel : un second dispose() du matériau ne la rend pas deux fois.
   */
  private releaseWithMaterial(texture: THREE.Texture, material: THREE.Material): void {
    const release = (): void => {
      material.removeEventListener("dispose", release);
      releaseAvatarTexture(texture);
    };
    material.addEventListener("dispose", release);
  }

  private material(key: string, create: () => THREE.Material): THREE.Material {
    const existing = this.materials.get(key);
    if (existing) return existing;
    const created = create();
    this.materials.set(key, created);
    return created;
  }

  private standard(key: string, color: THREE.ColorRepresentation, roughness: number, metalness = 0): THREE.Material {
    return this.material(key, () => new THREE.MeshStandardMaterial({ color, roughness, metalness }));
  }

  private shade(hex: string, factor: number): THREE.Color {
    return new THREE.Color(hex).multiplyScalar(factor);
  }

  private get skin(): THREE.Material {
    return this.standard("skin", this.config.skinTone, 0.6);
  }

  private get hair(): THREE.Material {
    return this.material(
      "hair",
      () =>
        new THREE.MeshStandardMaterial({
          color: this.config.hairColor,
          roughness: 0.8,
          // Les cheveux longs sont une coque ouverte : on doit voir l'intérieur par en dessous.
          side: this.config.hairStyle === "long" ? THREE.DoubleSide : THREE.FrontSide,
        }),
    );
  }

  /** Chemise de combat (torse et manches) et sac : la couleur des détails, sous le gilet. */
  private get accent(): THREE.Material {
    return this.standard("accent", this.config.topAccent, 0.8, 0.02);
  }

  /** Version sombre de l'accent : sangles, ceinture, rabats du sac. */
  private get accentTrim(): THREE.Material {
    return this.standard("accentTrim", this.shade(this.config.topAccent, 0.6), 0.7, 0.05);
  }

  private get gear(): THREE.Material {
    return this.standard("gear", 0x2b333c, 0.42, 0.55);
  }

  // --- Construction ---

  private add(parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
    this.geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  }

  private buildHead(): void {
    const head = this.rig.head;
    this.add(head, new THREE.SphereGeometry(HEAD_RADIUS, 24, 18).scale(1, HEAD_STRETCH, 1), this.skin, 0, HEAD_CENTER_Y, 0);
    const ears = mergeParts([-1, 1].map((side) => place(new THREE.SphereGeometry(0.034, 10, 8), { x: side * HEAD_RADIUS * 0.97, y: HEAD_CENTER_Y + 0.005, z: -0.005, scaleX: 0.45, scaleZ: 0.75 })));
    this.add(head, ears, this.skin);
    this.add(head, place(new THREE.SphereGeometry(0.026, 10, 8), { scaleX: 0.8, scaleY: 1.05, scaleZ: 0.8 }), this.skin, 0, HEAD_CENTER_Y - 0.033, HEAD_RADIUS * 0.94);
    this.add(this.rig.torso, new THREE.CylinderGeometry(this.metrics.neckRadius, this.metrics.neckRadius * 1.1, 0.14, 12), this.skin, 0, 0.62, -0.005);

    const face = acquireFaceTexture(this.config);
    if (!face) return;
    const { phiLength, thetaStart, thetaLength } = FACE_TEXTURE_LAYOUT;
    // Calotte à peine plus grande que la tête, centrée sur +Z : le visage dessiné suit la courbure.
    const cap = new THREE.SphereGeometry(HEAD_RADIUS * 1.012, 20, 14, Math.PI / 2 - phiLength / 2, phiLength, thetaStart, thetaLength);
    cap.scale(1, HEAD_STRETCH, 1);
    // Créé directement (pas via material()) : la texture qu'on vient d'acquérir doit être liée à CE matériau.
    const material = new THREE.MeshStandardMaterial({ map: face, transparent: true, depthWrite: false, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.releaseWithMaterial(face, material);
    this.materials.set("face", material);
    this.add(head, cap, material, 0, HEAD_CENTER_Y, 0).castShadow = false;
  }

  private buildHair(): void {
    const head = this.rig.head;
    switch (this.config.hairStyle) {
      case "bald":
        return;
      case "buzz":
        this.add(head, scalpCap(1.035, 1.55, 0.35), this.hair);
        return;
      case "short":
        this.add(head, mergeParts([scalpCap(1.07, 1.5, 0.4), place(new THREE.SphereGeometry(HEAD_RADIUS * 0.78, 16, 10), { y: HEAD_CENTER_Y + 0.12, z: 0.025, scaleX: 1.05, scaleY: 0.45, scaleZ: 0.92 })]), this.hair);
        return;
      case "bun": {
        this.add(head, mergeParts([scalpCap(1.04, 1.6, 0.3), place(new THREE.SphereGeometry(0.078, 14, 10), { y: HEAD_CENTER_Y + 0.155, z: -0.1, scaleY: 0.85 })]), this.hair);
        const band = new THREE.TorusGeometry(0.052, 0.014, 6, 18);
        band.rotateX(Math.PI / 2);
        band.rotateX(-0.59);
        this.add(head, band, this.accent, 0, HEAD_CENTER_Y + 0.12, -0.075);
        return;
      }
      case "long": {
        // Rideau ouvert devant : un tube évasé sur 240°, qui retombe sur les épaules.
        const curtain = new THREE.CylinderGeometry(HEAD_RADIUS * 1.05, HEAD_RADIUS * 1.24, 0.32, 22, 1, true, Math.PI / 3, (Math.PI * 4) / 3);
        curtain.translate(0, HEAD_CENTER_Y - 0.15, -0.008);
        this.add(head, mergeParts([scalpCap(1.05, 1.62, 0.3), curtain]), this.hair);
        return;
      }
    }
  }

  /** Lunettes de vision nocturne relevées sur le front : trois optiques lumineuses, la signature de Spectre. */
  private buildGoggles(): void {
    const { front, side } = GOGGLE_MOUNT[this.config.hairStyle];
    // Bandeau ovale : loin devant (boîtier posé sur la coiffure), au ras de la tête sur les côtés et derrière.
    const frontRadius = HEAD_RADIUS * front + 0.004;
    const sideRadius = HEAD_RADIUS * side + 0.004;
    const strap = new THREE.TorusGeometry(sideRadius, 0.011, 6, 30);
    strap.rotateX(Math.PI / 2);
    strap.scale(1, 1, (frontRadius + sideRadius) / 2 / sideRadius);
    strap.translate(0, 0, (frontRadius - sideRadius) / 2);
    strap.rotateX(-(Math.PI / 2 - GOGGLE_POLAR));
    strap.scale(1, HEAD_STRETCH, 1);
    strap.translate(0, HEAD_CENTER_Y, 0);

    // Boîtier basculé vers le haut, comme des optiques relevées : les lentilles regardent le ciel (et la caméra).
    const mountDistance = HEAD_RADIUS * front + 0.026;
    const housingParts: THREE.BufferGeometry[] = [new RoundedBoxGeometry(0.2, 0.055, 0.045, 2, 0.018)];
    const lensParts: THREE.BufferGeometry[] = [];
    for (const offsetX of [-0.064, 0, 0.064]) {
      const length = offsetX === 0 ? 0.07 : 0.055;
      housingParts.push(place(new THREE.CylinderGeometry(0.024, 0.028, length, 12), { x: offsetX, z: 0.0225 + length / 2, rotationX: Math.PI / 2 }));
      lensParts.push(place(new THREE.CylinderGeometry(0.02, 0.02, 0.01, 12), { x: offsetX, z: 0.0225 + length + 0.004, rotationX: Math.PI / 2 }));
    }
    const mount: Placement = {
      y: HEAD_CENTER_Y + Math.cos(GOGGLE_POLAR) * mountDistance * HEAD_STRETCH,
      z: Math.sin(GOGGLE_POLAR) * mountDistance,
      rotationX: -(Math.PI / 2 - GOGGLE_POLAR) - 0.35,
    };
    const housing = place(mergeParts(housingParts), mount);
    this.add(this.rig.head, mergeParts([strap, housing]), this.gear);
    this.add(this.rig.head, place(mergeParts(lensParts), mount), this.glow);
  }

  private frontAt(y: number): number {
    return profileRadiusAt(this.torsoProfile, y) * this.metrics.depth;
  }

  private buildTorso(): void {
    const { depth, hipRadius, waistRadius } = this.metrics;
    const torso = lathe(this.torsoProfile, 20);
    torso.scale(1, 1, depth);
    this.add(this.rig.torso, torso, this.accent);
    const pelvis = lathe(
      [
        [0, -0.105],
        [hipRadius * 0.7, -0.1],
        [hipRadius * 0.95, -0.05],
        [hipRadius, 0.02],
        [waistRadius * 1.01, 0.12],
        [waistRadius * 0.96, 0.14],
        [0, 0.145],
      ],
      18,
    );
    pelvis.scale(1, 1, depth * 1.02);
    this.add(this.rig.hips, pelvis, this.standard("bottom", this.config.bottomColor, 0.82));
  }

  /** Gilet porte-plaques : plaques avant/arrière, ceinture abdominale, bretelles, poches. */
  private buildVest(): void {
    const torso = this.rig.torso;
    const { chestRadius, waistRadius, depth } = this.metrics;
    const plateFront = this.frontAt(0.37) + 0.016;
    const vest = mergeParts([
      place(new RoundedBoxGeometry(chestRadius * 1.65, 0.25, VEST_THICKNESS, 2, 0.016), { y: 0.37, z: plateFront }),
      place(new RoundedBoxGeometry(chestRadius * 1.65, 0.27, VEST_THICKNESS, 2, 0.016), { y: 0.38, z: -plateFront }),
      place(new THREE.CylinderGeometry(waistRadius * 1.1, waistRadius * 1.12, 0.1, 18), { y: 0.21, scaleZ: depth * 1.08 }),
      ...[-1, 1].map((side) => place(new RoundedBoxGeometry(0.06, 0.025, plateFront * 2, 1, 0.01), { x: side * 0.12, y: 0.515, rotationZ: side * -0.32 })),
    ]);
    this.add(torso, vest, this.standard("vest", this.config.topColor, 0.5, 0.35));
    const pouches = mergeParts([
      ...[-0.078, 0, 0.078].map((offsetX) => place(new RoundedBoxGeometry(0.068, 0.08, 0.04, 1, 0.012), { x: offsetX, y: 0.29, z: plateFront + 0.04 })),
      place(new RoundedBoxGeometry(0.045, 0.09, 0.032, 1, 0.01), { x: -0.095, y: 0.43, z: plateFront + 0.038 }),
      place(new THREE.CylinderGeometry(0.005, 0.005, 0.12, 5), { x: -0.11, y: 0.52, z: plateFront + 0.038 }),
    ]);
    this.add(torso, pouches, this.standard("pouches", this.shade(this.config.topColor, 0.7), 0.75, 0.1));
  }

  private buildArms(): void {
    const { armRadius } = this.metrics;
    // Manche longue au tour : épaule arrondie, bras qui s'affine vers le poignet, revers de manche.
    const radius = armRadius * 1.2;
    const sleeveProfile: Profile = [
      ...domeProfile(radius, 0.035),
      [radius * 1.02, -0.08],
      [radius * 0.9, -0.2],
      [radius * 0.82, -0.32],
      [radius * 0.8, -0.385],
      [radius * 0.88, -0.392],
      [radius * 0.88, -0.413],
      [radius * 0.5, -0.42],
      [0, -0.421],
    ];
    const sleeve = lathe(sleeveProfile, 12);
    // Le gilet tactique va avec des gants : mains couleur équipement.
    const gloves = this.standard("gloves", 0x1b1f24, 0.7, 0.1);
    const hand = place(new THREE.SphereGeometry(1, 12, 10), { scaleX: armRadius * 0.9, scaleY: armRadius * 1.08, scaleZ: armRadius * 0.72 });
    for (const arm of [this.rig.leftArm, this.rig.rightArm]) {
      this.add(arm, sleeve, this.accent);
      this.add(arm, hand, gloves, 0, HAND_Y, 0.005);
    }
  }

  /** Pantalon cargo : jambes au tour, poches latérales plus sombres, ceinture couleur des détails. */
  private buildLegs(): void {
    const { legRadius, waistRadius, depth } = this.metrics;
    const legs = [this.rig.leftLeg, this.rig.rightLeg] as const;
    const legGeometry = lathe(
      [
        [0, 0.07],
        [legRadius * 0.7, 0.062],
        [legRadius, 0.02],
        [legRadius, -0.08],
        [legRadius * 0.9, -0.22],
        [legRadius * 0.78, -0.32],
        [legRadius * 0.74, -0.38],
        [legRadius * 0.7, -0.5],
        [legRadius * 0.78, -0.575],
        [0, -0.58],
      ],
      12,
    );
    const pants = this.standard("bottom", this.config.bottomColor, 0.82);
    for (const leg of legs) this.add(leg, legGeometry, pants);
    const belt = place(new THREE.TorusGeometry(waistRadius * 1.04, 0.018, 6, 24), { y: 0.1, rotationX: Math.PI / 2, scaleY: depth * 1.04 });
    this.add(this.rig.hips, belt, this.accentTrim);
    this.add(this.rig.hips, new RoundedBoxGeometry(0.05, 0.036, 0.016, 1, 0.006), this.gear, 0, 0.1, waistRadius * 1.04 * depth + 0.012);
    const pocketMaterial = this.standard("pockets", this.shade(this.config.bottomColor, 0.72), 0.85);
    const pocket = new RoundedBoxGeometry(0.03, 0.1, 0.085, 1, 0.01);
    legs.forEach((leg, index) => {
      const side = index === 0 ? -1 : 1;
      this.add(leg, pocket, pocketMaterial, side * (legRadius * 0.95 + 0.008), -0.21, 0);
    });
  }

  /** Rangers montantes : la semelle repose exactement au sol (SOLE_Y). */
  private buildBoots(): void {
    const { legRadius } = this.metrics;
    const width = legRadius * 2.05;
    const upper = mergeParts([
      place(new RoundedBoxGeometry(width, 0.095, 0.24, 2, 0.035), { y: SOLE_Y + 0.0475 + 0.012, z: 0.035 }),
      place(new THREE.CylinderGeometry(legRadius * 0.8, legRadius * 0.84, 0.13, 12), { y: SOLE_Y + 0.13 }),
    ]);
    const sole = place(new RoundedBoxGeometry(width * 1.05, 0.024, 0.25, 1, 0.01), { y: SOLE_Y + 0.012, z: 0.035 });
    const bootMaterial = this.standard("boots", this.config.shoesColor, 0.45, 0.05);
    const soleMaterial = this.standard("sole", 0x111214, 0.9);
    for (const leg of [this.rig.leftLeg, this.rig.rightLeg]) {
      this.add(leg, upper, bootMaterial);
      this.add(leg, sole, soleMaterial);
    }
  }

  /** Sac à dos adossé au gilet, bretelles passant par-dessus les épaules jusqu'aux plaques avant. */
  private buildBackpack(): void {
    const torso = this.rig.torso;
    const back = -this.frontAt(0.38) - VEST_THICKNESS;
    const chestAt = (y: number): number => this.frontAt(y) + VEST_THICKNESS - 0.005;
    this.add(torso, new RoundedBoxGeometry(0.28, 0.32, 0.14, 2, 0.04), this.accent, 0, 0.36, back - 0.07);
    const trim = mergeParts([
      place(new RoundedBoxGeometry(0.29, 0.1, 0.15, 2, 0.035), { y: 0.5, z: back - 0.07 }),
      place(new RoundedBoxGeometry(0.2, 0.12, 0.05, 2, 0.02), { y: 0.27, z: back - 0.15 }),
      ...[-1, 1].map((side) => place(new RoundedBoxGeometry(0.045, 0.3, 0.02, 1, 0.008), { x: side * 0.1, y: 0.4, z: chestAt(0.4) + 0.008 })),
      ...[-1, 1].map((side) => place(new RoundedBoxGeometry(0.045, 0.02, chestAt(0.5) - back + 0.02, 1, 0.008), { x: side * 0.1, y: 0.545, z: (chestAt(0.5) + back) / 2 })),
    ]);
    this.add(torso, trim, this.accentTrim);
  }

  /** Pistolet IEM dans la main droite, avec sa bobine lumineuse. */
  private buildPistol(): void {
    const pistol = new THREE.Group();
    const body = mergeParts([
      place(new RoundedBoxGeometry(0.07, 0.1, 0.24, 2, 0.015), { z: 0.06 }),
      place(new THREE.BoxGeometry(0.05, 0.1, 0.06), { y: -0.07, z: -0.02, rotationX: 0.25 }),
    ]);
    this.add(pistol, body, this.gear);
    this.add(pistol, place(new THREE.CylinderGeometry(0.035, 0.035, 0.05, 10), { rotationX: Math.PI / 2 }), this.glow, 0, 0.02, 0.2);
    pistol.position.set(0, -0.52, 0.04);
    this.rig.rightArm.add(pistol);
  }
}

/** Construit l'agent de repli à partir de sa config (déjà validée par parseAvatarConfig). */
export function createAvatarRig(config: AvatarConfig): AvatarModel {
  return new AvatarBuilder(config).build();
}
