import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { createRigSkeleton, HIP_HEIGHT, type HumanoidRig } from "../entities/rig";
import type { AvatarConfig, BodyBuild, HairStyle } from "./avatarConfig";
import { acquireFabricTexture, acquireFaceTexture, FACE_TEXTURE_LAYOUT, releaseAvatarTexture } from "./avatarTextures";

/**
 * Agent personnalisable : silhouette stylisée low-poly (à la Lagos Life), lisible vue de dessus.
 * Le modèle habille exactement le squelette de rig.ts : poseRig l'anime comme avant (marche, accroupi, visée).
 * Le modèle regarde vers +Z.
 */
export interface AvatarModel {
  rig: HumanoidRig;
  /** Optiques de vision nocturne et bobine du pistolet : couleur visorColor, accroche le bloom. */
  glow: THREE.MeshStandardMaterial;
  /**
   * Libère géométries et matériaux propres à cet avatar. Les textures (visage, tissu) sont partagées
   * via le cache d'avatarTextures : elles sont seulement « rendues », le cache les libère quand plus
   * aucun avatar ne s'en sert. Elles sont rendues dès que le matériau qui les porte est libéré : par
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
/** Polaire des yeux sur la tête (même valeur que le dessin du visage) : sert à poser les lunettes. */
const EYE_POLAR = 1.6;
const EYE_AZIMUTH = 0.36;
const HAND_Y = -0.47;
const SOLE_Y = -HIP_HEIGHT;
/** Hauteur d'une tuile de tissu sur le corps : même densité de motif sur le torse et les manches. */
const FABRIC_TILE_HEIGHT = 0.24;

interface GoggleMount {
  /** Distance du boîtier (en rayons de tête) : il se pose sur la coiffure sans s'y enfoncer. */
  front: number;
  /** Distance du bandeau sur les côtés et à l'arrière : il épouse la tête au lieu de flotter. */
  side: number;
}

const GOGGLE_MOUNT: Record<HairStyle, GoggleMount> = {
  buzz: { front: 1.04, side: 1.04 },
  short: { front: 1.08, side: 1.08 },
  afro: { front: 1.2, side: 1.06 },
  braids: { front: 1.05, side: 1.05 },
  locs: { front: 1.06, side: 1.06 },
  bun: { front: 1.05, side: 1.05 },
  long: { front: 1.06, side: 1.06 },
  mohawk: { front: 1.04, side: 1.04 },
  gele: { front: 1.27, side: 1.06 },
  bald: { front: 1.01, side: 1.01 },
};
const CAP_GOGGLE_MOUNT: GoggleMount = { front: 1.16, side: 1.15 };

/** Sous une casquette, les coiffures volumineuses sont tassées : sinon elles traverseraient la casquette. */
const HAIR_UNDER_CAP: Partial<Record<HairStyle, HairStyle>> = { afro: "short", mohawk: "buzz", bun: "short" };

const workEuler = new THREE.Euler();
const workQuaternion = new THREE.Quaternion();
const workPosition = new THREE.Vector3();
const workScale = new THREE.Vector3();
const workMatrix = new THREE.Matrix4();

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
 * UV « en tuiles » : u fait le tour du membre (un nombre entier de fois, pour ne pas voir la couture),
 * v suit la hauteur réelle. Le motif garde ainsi la même taille sur le torse et sur les manches.
 */
function tileFabric<T extends THREE.BufferGeometry>(geometry: T, tilesAround: number): T {
  const uv = geometry.getAttribute("uv");
  const position = geometry.getAttribute("position");
  for (let index = 0; index < uv.count; index++) {
    uv.setXY(index, uv.getX(index) * tilesAround, position.getY(index) / FABRIC_TILE_HEIGHT);
  }
  uv.needsUpdate = true;
  return geometry;
}

/**
 * Volume (au facteur π près) balayé par le profil, signé par son sens de parcours : somme de troncs de cône.
 * Positif quand le profil « monte » dans l'ensemble, même s'il fait des retours en arrière.
 */
function signedSweptVolume(profile: readonly (readonly [number, number])[]): number {
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
 * Les UV ne bougent pas en pratique : u suit l'angle, et tileFabric recalcule v depuis la hauteur.
 */
function lathe(profile: readonly (readonly [number, number])[], segments: number): THREE.LatheGeometry {
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
function profileRadiusAt(profile: readonly (readonly [number, number])[], y: number): number {
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

/** Point sur la tête : polaire depuis le sommet, azimut depuis l'avant (+Z), distance en rayons de tête. */
function headPoint(polar: number, azimuth: number, scale: number): THREE.Vector3 {
  const radius = HEAD_RADIUS * scale;
  return new THREE.Vector3(
    radius * Math.sin(polar) * Math.sin(azimuth),
    HEAD_CENTER_Y + radius * HEAD_STRETCH * Math.cos(polar),
    radius * Math.sin(polar) * Math.cos(azimuth),
  );
}

/** Mèche pendante (tresse, lock) : capsule accrochée à `root`, légèrement écartée de la tête. */
function hangingStrand(root: THREE.Vector3, azimuth: number, radius: number, length: number, outwardTilt: number): THREE.BufferGeometry {
  const strand = new THREE.CapsuleGeometry(radius, length, 2, 6);
  strand.translate(0, -length / 2 - radius, 0);
  // Rotation autour de l'axe tangent : le bas de la mèche s'écarte vers l'extérieur.
  const tangent = new THREE.Vector3(Math.cos(azimuth), 0, -Math.sin(azimuth));
  strand.applyMatrix4(workMatrix.makeRotationAxis(tangent, -outwardTilt));
  strand.translate(root.x, root.y, root.z);
  return strand;
}

function strandEnd(root: THREE.Vector3, azimuth: number, length: number, outwardTilt: number): THREE.Vector3 {
  const reach = length + 0.01;
  return new THREE.Vector3(
    root.x + Math.sin(azimuth) * Math.sin(outwardTilt) * reach,
    root.y - Math.cos(outwardTilt) * reach,
    root.z + Math.cos(azimuth) * Math.sin(outwardTilt) * reach,
  );
}

/** Afro : sphère facettée bosselée. Bosses calculées depuis la position : sommets dupliqués = même bosse. */
function afroGeometry(): THREE.BufferGeometry {
  const afro = new THREE.IcosahedronGeometry(0.2, 3);
  const position = afro.getAttribute("position");
  const direction = new THREE.Vector3();
  for (let index = 0; index < position.count; index++) {
    direction.fromBufferAttribute(position, index).normalize();
    const bumps =
      0.07 * Math.sin(9 * direction.x + 1.3) * Math.sin(9 * direction.y + 0.7) * Math.sin(9 * direction.z + 2.1) +
      0.03 * Math.sin(17 * direction.x + 4 * direction.z) * Math.sin(15 * direction.y + 0.4);
    direction.multiplyScalar(0.2 * (1 + bumps));
    position.setXYZ(index, direction.x, direction.y, direction.z);
  }
  afro.computeVertexNormals();
  afro.scale(1.15, 1, 1.08);
  afro.translate(0, HEAD_CENTER_Y + 0.085, -0.07);
  return afro;
}

function geleGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [scalpCap(1.09, 1.5, 0.5)];
  // Trois plis enroulés autour de la tête, basculés vers l'arrière : le gele descend sur la nuque.
  for (let fold = 0; fold < 3; fold++) {
    const band = new THREE.TorusGeometry(HEAD_RADIUS * (1.04 + fold * 0.05), 0.032, 8, 28);
    band.rotateX(Math.PI / 2);
    band.translate(0, 0.04 + fold * 0.045, 0);
    band.rotateX(-0.5);
    band.translate(0, HEAD_CENTER_Y, 0);
    parts.push(band);
  }
  // Grands plis évasés à l'arrière et sur les côtés, comme un éventail de tissu amidonné :
  // la silhouette sculptée typique du gele, très lisible vue de dessus.
  const pleatCount = 6;
  for (let pleat = 0; pleat < pleatCount; pleat++) {
    const azimuth = Math.PI - 1.75 + (pleat / (pleatCount - 1)) * 3.5;
    const fold = new THREE.SphereGeometry(1, 12, 8);
    fold.scale(0.1, 0.105, 0.02);
    fold.translate(0, 0.075, 0);
    fold.rotateX(0.85);
    fold.rotateY(azimuth);
    fold.translate(Math.sin(azimuth) * 0.1, HEAD_CENTER_Y + 0.14, -0.05 + Math.cos(azimuth) * 0.1);
    parts.push(fold);
  }
  // Nœud sur le dessus, légèrement décentré.
  parts.push(place(new THREE.SphereGeometry(0.05, 12, 8), { x: -0.06, y: HEAD_CENTER_Y + 0.19, z: 0.05, scaleX: 1.25, scaleY: 0.8, scaleZ: 0.9 }));
  parts.push(place(new THREE.SphereGeometry(0.05, 12, 8), { x: 0.02, y: HEAD_CENTER_Y + 0.21, z: 0.03, rotationZ: -0.6, scaleX: 1.1, scaleY: 0.55, scaleZ: 0.8 }));
  return mergeParts(parts);
}

class AvatarBuilder {
  readonly rig: HumanoidRig;
  readonly glow: THREE.MeshStandardMaterial;
  private readonly metrics: BodyMetrics;
  private readonly torsoProfile: readonly (readonly [number, number])[];
  private readonly hairStyle: HairStyle;
  private readonly geometries = new Set<THREE.BufferGeometry>();
  private readonly materials = new Map<string, THREE.Material>();

  constructor(private readonly config: AvatarConfig) {
    this.metrics = BODY_METRICS[config.build];
    this.rig = createRigSkeleton(this.metrics.shoulderWidth);
    this.rig.root.scale.setScalar(config.height);
    this.glow = new THREE.MeshStandardMaterial({ color: config.visorColor, emissive: config.visorColor, emissiveIntensity: 2.2 });
    this.materials.set("glow", this.glow);
    const hairUnderCap = config.accessory === "cap" ? HAIR_UNDER_CAP[config.hairStyle] : undefined;
    this.hairStyle = hairUnderCap ?? config.hairStyle;
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
    this.buildTop();
    this.buildArms();
    this.buildBottom();
    this.buildShoes();
    this.buildAccessory();
    this.buildPistol();
    const geometries = this.geometries;
    const materials = this.materials;
    let disposed = false;
    return {
      rig: this.rig,
      glow: this.glow,
      dispose: () => {
        if (disposed) return;
        disposed = true;
        for (const geometry of geometries) geometry.dispose();
        // Libérer les matériaux rend aussi les textures partagées au cache (voir releaseWithMaterial).
        for (const material of materials.values()) material.dispose();
      },
    };
  }

  // --- Matériaux (créés à la demande : une tenue sans ceinture ne crée pas de cuir) ---

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
    const afro = this.hairStyle === "afro";
    return this.material(
      "hair",
      () =>
        new THREE.MeshStandardMaterial({
          color: this.config.hairColor,
          roughness: afro ? 0.95 : 0.8,
          flatShading: afro,
          // Les cheveux longs sont une coque ouverte : on doit voir l'intérieur par en dessous.
          side: this.hairStyle === "long" ? THREE.DoubleSide : THREE.FrontSide,
        }),
    );
  }

  /** Tissu du haut : couleur unie, ou tuile de motif (les couleurs sont alors dans la texture). */
  private get top(): THREE.Material {
    return this.material("top", () => {
      const fabric = acquireFabricTexture(this.config.topPattern, this.config.topColor, this.config.topAccent);
      const woven = this.config.topPattern === "asooke";
      const material = new THREE.MeshStandardMaterial({
        color: fabric ? 0xffffff : this.config.topColor,
        map: fabric,
        roughness: woven ? 0.55 : 0.82,
        metalness: woven ? 0.12 : 0.02,
        // Boubou et veste ont des pans ouverts (coques) : visibles des deux côtés.
        side: this.config.top === "boubou" || this.config.top === "jacket" ? THREE.DoubleSide : THREE.FrontSide,
      });
      if (fabric) this.releaseWithMaterial(fabric, material);
      if (fabric && this.config.topPattern === "circuit") {
        // Les pistes du circuit luisent faiblement : clin d'œil « tech » sans voler la vedette aux optiques.
        material.emissive.setHex(0xffffff);
        material.emissiveMap = fabric;
        material.emissiveIntensity = 0.35;
      }
      return material;
    });
  }

  private get topAccent(): THREE.Material {
    return this.standard("topAccent", this.config.topAccent, 0.6, 0.1);
  }

  private get bottom(): THREE.Material {
    return this.material(
      "bottom",
      () =>
        new THREE.MeshStandardMaterial({
          color: this.config.bottomColor,
          roughness: this.config.bottom === "jeans" ? 0.9 : 0.82,
          side: this.config.bottom === "skirt" ? THREE.DoubleSide : THREE.FrontSide,
        }),
    );
  }

  private get gear(): THREE.Material {
    return this.standard("gear", 0x2b333c, 0.42, 0.55);
  }

  private get accessory(): THREE.Material {
    return this.standard("accessory", this.config.accessoryColor, 0.62, 0.05);
  }

  private get accessoryTrim(): THREE.Material {
    return this.standard("accessoryTrim", this.shade(this.config.accessoryColor, 0.6), 0.7, 0.05);
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
    const strands = (count: number, radius: number, lengthFor: (index: number) => number): THREE.BufferGeometry[] => {
      const parts: THREE.BufferGeometry[] = [];
      for (let index = 0; index < count; index++) {
        // Réparties sur l'arrière et les côtés, jamais devant le visage.
        const azimuth = Math.PI - 2.15 + (index / (count - 1)) * 4.3;
        const root = headPoint(1.5, azimuth, 0.98);
        parts.push(hangingStrand(root, azimuth, radius, lengthFor(index), 0.16));
      }
      return parts;
    };
    switch (this.hairStyle) {
      case "bald":
        return;
      case "buzz":
        this.add(head, scalpCap(1.035, 1.55, 0.35), this.hair);
        return;
      case "short":
        this.add(head, mergeParts([scalpCap(1.07, 1.5, 0.4), place(new THREE.SphereGeometry(HEAD_RADIUS * 0.78, 16, 10), { y: HEAD_CENTER_Y + 0.12, z: 0.025, scaleX: 1.05, scaleY: 0.45, scaleZ: 0.92 })]), this.hair);
        return;
      case "afro":
        this.add(head, scalpCap(1.03, 1.5, 0.3), this.hair);
        this.add(head, afroGeometry(), this.hair);
        return;
      case "braids": {
        // Tresses latérales courtes : plus longues, leurs perles traverseraient les épaules.
        const lengths = (index: number): number => (index < 2 || index > 8 ? 0.12 : 0.3);
        this.add(head, mergeParts([scalpCap(1.04, 1.62, 0.3), ...strands(11, 0.017, lengths)]), this.hair);
        // Perles au bout des tresses, couleur des détails de la tenue.
        const beads: THREE.BufferGeometry[] = [];
        for (let index = 0; index < 11; index++) {
          const azimuth = Math.PI - 2.15 + (index / 10) * 4.3;
          const end = strandEnd(headPoint(1.5, azimuth, 0.98), azimuth, lengths(index) + 0.034, 0.16);
          beads.push(place(new THREE.SphereGeometry(0.022, 8, 6), { x: end.x, y: end.y, z: end.z }));
        }
        this.add(head, mergeParts(beads), this.topAccent);
        return;
      }
      case "locs":
        this.add(head, mergeParts([scalpCap(1.05, 1.58, 0.35), ...strands(15, 0.024, (index) => 0.22 + ((index * 37) % 5) * 0.03)]), this.hair);
        return;
      case "bun": {
        this.add(head, mergeParts([scalpCap(1.04, 1.6, 0.3), place(new THREE.SphereGeometry(0.078, 14, 10), { y: HEAD_CENTER_Y + 0.155, z: -0.1, scaleY: 0.85 })]), this.hair);
        const band = new THREE.TorusGeometry(0.052, 0.014, 6, 18);
        band.rotateX(Math.PI / 2);
        band.rotateX(-0.59);
        this.add(head, band, this.topAccent, 0, HEAD_CENTER_Y + 0.12, -0.075);
        return;
      }
      case "long": {
        // Rideau ouvert devant : un tube évasé sur 240°, qui retombe sur les épaules.
        const curtain = new THREE.CylinderGeometry(HEAD_RADIUS * 1.05, HEAD_RADIUS * 1.24, 0.32, 22, 1, true, Math.PI / 3, (Math.PI * 4) / 3);
        curtain.translate(0, HEAD_CENTER_Y - 0.15, -0.008);
        this.add(head, mergeParts([scalpCap(1.05, 1.62, 0.3), curtain]), this.hair);
        return;
      }
      case "mohawk": {
        const parts: THREE.BufferGeometry[] = [scalpCap(1.035, 1.5, 0.35)];
        const spikes = 6;
        for (let spike = 0; spike < spikes; spike++) {
          const angle = -1.25 + spike * 0.4;
          const height = 0.09 + 0.06 * Math.sin((Math.PI * (spike + 0.5)) / spikes);
          const blade = new THREE.ConeGeometry(0.036, height, 6);
          blade.scale(0.45, 1, 1);
          blade.translate(0, height / 2 - 0.012, 0);
          blade.rotateX(angle);
          blade.translate(0, HEAD_CENTER_Y + Math.cos(angle) * HEAD_RADIUS * HEAD_STRETCH, Math.sin(angle) * HEAD_RADIUS);
          parts.push(blade);
        }
        this.add(head, mergeParts(parts), this.hair);
        return;
      }
      case "gele":
        // Foulard noué assorti à la tenue (aso ebi) : il prend la couleur des détails du haut.
        this.add(head, geleGeometry(), this.standard("gele", this.config.topAccent, 0.45, 0.15));
        return;
    }
  }

  /** Lunettes de vision nocturne relevées sur le front : trois optiques lumineuses, la signature de Spectre. */
  private buildGoggles(): void {
    const wearsCap = this.config.accessory === "cap" && this.hairStyle !== "gele";
    const { front, side } = wearsCap ? CAP_GOGGLE_MOUNT : GOGGLE_MOUNT[this.hairStyle];
    const polar = wearsCap ? 0.82 : 1.0;
    // Bandeau ovale : loin devant (boîtier posé sur la coiffure), au ras de la tête sur les côtés et derrière.
    const frontRadius = HEAD_RADIUS * front + 0.004;
    const sideRadius = HEAD_RADIUS * side + 0.004;
    const strap = new THREE.TorusGeometry(sideRadius, 0.011, 6, 30);
    strap.rotateX(Math.PI / 2);
    strap.scale(1, 1, (frontRadius + sideRadius) / 2 / sideRadius);
    strap.translate(0, 0, (frontRadius - sideRadius) / 2);
    strap.rotateX(-(Math.PI / 2 - polar));
    strap.scale(1, HEAD_STRETCH, 1);
    strap.translate(0, HEAD_CENTER_Y, 0);

    // Boîtier basculé vers le haut, comme des optiques relevées : les lentilles regardent le ciel (et la caméra).
    const mountDistance = HEAD_RADIUS * front + 0.026;
    const tilt = -(Math.PI / 2 - polar) - 0.35;
    const housingParts: THREE.BufferGeometry[] = [new RoundedBoxGeometry(0.2, 0.055, 0.045, 2, 0.018)];
    const lensParts: THREE.BufferGeometry[] = [];
    for (const offsetX of [-0.064, 0, 0.064]) {
      const length = offsetX === 0 ? 0.07 : 0.055;
      housingParts.push(place(new THREE.CylinderGeometry(0.024, 0.028, length, 12), { x: offsetX, z: 0.0225 + length / 2, rotationX: Math.PI / 2 }));
      lensParts.push(place(new THREE.CylinderGeometry(0.02, 0.02, 0.01, 12), { x: offsetX, z: 0.0225 + length + 0.004, rotationX: Math.PI / 2 }));
    }
    const mount: Placement = {
      y: HEAD_CENTER_Y + Math.cos(polar) * mountDistance * HEAD_STRETCH,
      z: Math.sin(polar) * mountDistance,
      rotationX: tilt,
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
    const torso = tileFabric(lathe(this.torsoProfile, 20), 4);
    torso.scale(1, 1, depth);
    this.add(this.rig.torso, torso, this.top);
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
    this.add(this.rig.hips, pelvis, this.bottom);
  }

  private buildTop(): void {
    const torso = this.rig.torso;
    const { chestRadius, waistRadius, hipRadius, neckRadius, depth } = this.metrics;
    switch (this.config.top) {
      case "tactical": {
        // Gilet porte-plaques : plaques avant/arrière, ceinture, bretelles. Couleur des détails.
        const plateFront = this.frontAt(0.37) + 0.016;
        const vest = mergeParts([
          place(new RoundedBoxGeometry(chestRadius * 1.65, 0.25, 0.05, 2, 0.016), { y: 0.37, z: plateFront }),
          place(new RoundedBoxGeometry(chestRadius * 1.65, 0.27, 0.05, 2, 0.016), { y: 0.38, z: -plateFront }),
          place(new THREE.CylinderGeometry(waistRadius * 1.1, waistRadius * 1.12, 0.1, 18), { y: 0.21, scaleZ: depth * 1.08 }),
          ...[-1, 1].map((side) => place(new RoundedBoxGeometry(0.06, 0.025, plateFront * 2, 1, 0.01), { x: side * 0.12, y: 0.515, rotationZ: side * -0.32 })),
        ]);
        this.add(torso, vest, this.standard("vest", this.config.topAccent, 0.5, 0.35));
        const pouches = mergeParts([
          ...[-0.078, 0, 0.078].map((offsetX) => place(new RoundedBoxGeometry(0.068, 0.08, 0.04, 1, 0.012), { x: offsetX, y: 0.29, z: plateFront + 0.04 })),
          place(new RoundedBoxGeometry(0.045, 0.09, 0.032, 1, 0.01), { x: -0.095, y: 0.43, z: plateFront + 0.038 }),
          place(new THREE.CylinderGeometry(0.005, 0.005, 0.12, 5), { x: -0.11, y: 0.52, z: plateFront + 0.038 }),
        ]);
        this.add(torso, pouches, this.standard("pouches", this.shade(this.config.topAccent, 0.7), 0.75, 0.1));
        return;
      }
      case "hoodie": {
        const hood = mergeParts([
          place(new THREE.TorusGeometry(neckRadius * 1.75, 0.04, 8, 20), { y: 0.578, z: -0.012, rotationX: Math.PI / 2, scaleY: depth * 1.1 }),
          place(new THREE.SphereGeometry(0.11, 14, 10), { y: 0.515, z: -this.frontAt(0.5) - 0.035, scaleX: 1.2, scaleY: 0.85, scaleZ: 0.55 }),
        ]);
        this.add(torso, hood, this.top);
        const details = mergeParts([
          place(new RoundedBoxGeometry(waistRadius * 1.2, 0.085, 0.014, 1, 0.006), { y: 0.19, z: this.frontAt(0.19) + 0.001 }),
          place(new THREE.TorusGeometry(waistRadius * 1.0, 0.016, 6, 22), { y: 0.075, rotationX: Math.PI / 2, scaleY: depth * 1.05 }),
          ...[-1, 1].map((side) => place(new THREE.CylinderGeometry(0.006, 0.006, 0.12, 5), { x: side * 0.035, y: 0.49, z: this.frontAt(0.49) + 0.012 })),
        ]);
        this.add(torso, details, this.topAccent);
        return;
      }
      case "tshirt": {
        const details = mergeParts([
          place(new THREE.TorusGeometry(neckRadius * 1.3, 0.012, 6, 20), { y: 0.578, rotationX: Math.PI / 2, scaleY: depth * 1.15 }),
          place(new THREE.CylinderGeometry(0.03, 0.03, 0.008, 16), { x: -0.07, y: 0.42, z: this.frontAt(0.42) * 0.93 + 0.004, rotationX: Math.PI / 2 }),
        ]);
        this.add(torso, details, this.topAccent);
        return;
      }
      case "jacket": {
        // Veste ouverte : col montant, revers, pans sur les hanches ; le t-shirt dessous prend la couleur des détails.
        const shell = mergeParts([
          new THREE.CylinderGeometry(neckRadius * 1.7, neckRadius * 1.45, 0.08, 16, 1, true, 0.5, Math.PI * 2 - 1.0).translate(0, 0.598, 0),
          ...[-1, 1].map((side) => place(new RoundedBoxGeometry(0.06, 0.2, 0.014, 1, 0.005), { x: side * 0.058, y: 0.46, z: this.frontAt(0.46) + 0.004, rotationZ: side * 0.28 })),
          new THREE.CylinderGeometry(waistRadius * 1.04, hipRadius * 1.14, 0.17, 18, 1, true, 0.32, Math.PI * 2 - 0.64).scale(1, 1, depth * 1.08).translate(0, 0.045, 0),
        ]);
        this.add(torso, shell, this.top);
        this.add(torso, new RoundedBoxGeometry(0.1, 0.4, 0.02, 1, 0.008), this.topAccent, 0, 0.3, this.frontAt(0.3) - 0.004);
        return;
      }
      case "boubou": {
        // Tunique ample jusqu'aux genoux, portée par le bassin : elle ne bascule pas quand le torse se penche.
        const tunic = tileFabric(
          lathe(
            [
              [waistRadius * 1.06, 0.2],
              [hipRadius * 1.16, 0.05],
              [hipRadius * 1.45, -0.18],
              [hipRadius * 1.75, -0.36],
            ],
            22,
          ),
          6,
        );
        tunic.scale(1, 1, 0.82);
        this.add(this.rig.hips, tunic, this.top);
        const hem = place(new THREE.TorusGeometry(hipRadius * 1.75, 0.014, 6, 28), { y: -0.355, rotationX: Math.PI / 2, scaleY: 0.82 });
        this.add(this.rig.hips, hem, this.topAccent);
        // Broderie du plastron : col rond et bande verticale, comme sur les boubous brodés.
        const embroidery = mergeParts([
          place(new THREE.TorusGeometry(neckRadius * 1.5, 0.014, 6, 20), { y: 0.578, rotationX: Math.PI / 2, scaleY: depth * 1.1 }),
          place(new RoundedBoxGeometry(0.075, 0.2, 0.012, 1, 0.005), { y: 0.45, z: this.frontAt(0.45) + 0.002 }),
        ]);
        this.add(torso, embroidery, this.topAccent);
        return;
      }
    }
  }

  private buildArms(): void {
    const { armRadius } = this.metrics;
    const top = this.config.top;
    // Profils au tour : épaule arrondie, bras qui s'affine vers le poignet, revers de manche.
    let sleeveProfile: readonly (readonly [number, number])[];
    let bareArmProfile: readonly (readonly [number, number])[] | null = null;
    const forearm: [number, number][] = [[armRadius * 0.8, -0.32], [armRadius * 0.72, -0.42], [armRadius * 0.55, -0.445], [0, -0.45]];
    if (top === "tshirt") {
      const radius = armRadius * 1.3;
      // Le bas de la manche se referme sur le bras : pas de grand disque visible par en dessous.
      sleeveProfile = [...domeProfile(radius, 0.035), [radius * 1.02, -0.09], [radius, -0.14], [armRadius * 1.02, -0.15], [0, -0.151]];
      bareArmProfile = [...domeProfile(armRadius, 0.02), [armRadius * 0.95, -0.2], ...forearm];
    } else if (top === "boubou") {
      // Manche ouverte qui s'évase jusqu'au poignet : l'avant-bras nu apparaît dedans.
      const radius = armRadius * 1.2;
      sleeveProfile = [...domeProfile(radius, 0.035), [radius * 1.05, -0.08], [radius * 1.3, -0.16], [0.095, -0.3], [0.108, -0.37]];
      bareArmProfile = [[0, -0.15], [armRadius * 0.85, -0.16], ...forearm];
    } else {
      const radius = armRadius * 1.2;
      sleeveProfile = [...domeProfile(radius, 0.035), [radius * 1.02, -0.08], [radius * 0.9, -0.2], [radius * 0.82, -0.32], [radius * 0.8, -0.385], [radius * 0.88, -0.392], [radius * 0.88, -0.413], [radius * 0.5, -0.42], [0, -0.421]];
    }
    const sleeve = tileFabric(lathe(sleeveProfile, 12), 2);
    const bareArm = bareArmProfile ? lathe(bareArmProfile, 10) : null;
    // Le gilet tactique va avec des gants : mains couleur équipement.
    const handMaterial = top === "tactical" ? this.standard("gloves", 0x1b1f24, 0.7, 0.1) : this.skin;
    const hand = place(new THREE.SphereGeometry(1, 12, 10), { scaleX: armRadius * 0.9, scaleY: armRadius * 1.08, scaleZ: armRadius * 0.72 });
    for (const arm of [this.rig.leftArm, this.rig.rightArm]) {
      this.add(arm, sleeve, this.top);
      if (bareArm) this.add(arm, bareArm, this.skin);
      this.add(arm, hand, handMaterial, 0, HAND_Y, 0.005);
    }
  }

  private legProfile(scale: number, ankleFlare: number): readonly (readonly [number, number])[] {
    const radius = this.metrics.legRadius * scale;
    return [
      [0, 0.07],
      [radius * 0.7, 0.062],
      [radius, 0.02],
      [radius, -0.08],
      [radius * 0.9, -0.22],
      [radius * 0.78, -0.32],
      [radius * 0.74, -0.38],
      [radius * 0.7, -0.5],
      [radius * ankleFlare, -0.575],
      [0, -0.58],
    ];
  }

  private buildBottom(): void {
    const { legRadius, waistRadius, hipRadius, depth } = this.metrics;
    const style = this.config.bottom;
    const legs = [this.rig.leftLeg, this.rig.rightLeg] as const;
    if (style === "skirt") {
      const legGeometry = lathe(this.legProfile(0.9, 0.62), 12);
      for (const leg of legs) this.add(leg, legGeometry, this.skin);
      const skirt = lathe(
        [
          [waistRadius * 1.02, 0.14],
          [hipRadius * 1.06, 0.02],
          [hipRadius * 1.28, -0.15],
          [hipRadius * 1.55, -0.32],
        ],
        22,
      );
      skirt.scale(1, 1, 0.85);
      this.add(this.rig.hips, skirt, this.bottom);
      const waistband = place(new THREE.TorusGeometry(waistRadius * 1.03, 0.016, 6, 22), { y: 0.135, rotationX: Math.PI / 2, scaleY: depth * 1.05 });
      this.add(this.rig.hips, waistband, this.topAccent);
      return;
    }
    const legGeometry = lathe(this.legProfile(1, style === "cargo" ? 0.78 : 0.66), 12);
    for (const leg of legs) this.add(leg, legGeometry, this.bottom);
    // Ceinture seulement sous un haut rentré : par-dessus un sweat ou un boubou, elle flotterait sur le tissu.
    if (this.config.top === "tactical" || this.config.top === "tshirt") {
      const belt = place(new THREE.TorusGeometry(waistRadius * 1.04, 0.018, 6, 24), { y: 0.1, rotationX: Math.PI / 2, scaleY: depth * 1.04 });
      this.add(this.rig.hips, belt, this.standard("belt", 0x1e1814, 0.55, 0.1));
      this.add(this.rig.hips, new RoundedBoxGeometry(0.05, 0.036, 0.016, 1, 0.006), this.gear, 0, 0.1, waistRadius * 1.04 * depth + 0.012);
    }
    if (style === "cargo") {
      const pocketMaterial = this.standard("pockets", this.shade(this.config.bottomColor, 0.72), 0.85);
      const pocket = new RoundedBoxGeometry(0.03, 0.1, 0.085, 1, 0.01);
      legs.forEach((leg, index) => {
        const side = index === 0 ? -1 : 1;
        this.add(leg, pocket, pocketMaterial, side * (legRadius * 0.95 + 0.008), -0.21, 0);
      });
    } else {
      // Ourlet retroussé, plus clair : le détail qui fait « jean ».
      const cuffMaterial = this.standard("cuffs", new THREE.Color(this.config.bottomColor).lerp(new THREE.Color(0xffffff), 0.25), 0.9);
      const cuff = new THREE.CylinderGeometry(legRadius * 0.74, legRadius * 0.74, 0.04, 12);
      for (const leg of legs) this.add(leg, cuff, cuffMaterial, 0, -0.55, 0);
    }
  }

  private buildShoes(): void {
    const width = this.metrics.legRadius * 2.05;
    const legs = [this.rig.leftLeg, this.rig.rightLeg];
    const shoeMaterial = this.standard("shoes", this.config.shoesColor, this.config.shoes === "boots" ? 0.45 : 0.65, 0.05);
    switch (this.config.shoes) {
      case "boots": {
        const upper = mergeParts([
          place(new RoundedBoxGeometry(width, 0.095, 0.24, 2, 0.035), { y: SOLE_Y + 0.0475 + 0.012, z: 0.035 }),
          place(new THREE.CylinderGeometry(this.metrics.legRadius * 0.8, this.metrics.legRadius * 0.84, 0.13, 12), { y: SOLE_Y + 0.13 }),
        ]);
        const sole = place(new RoundedBoxGeometry(width * 1.05, 0.024, 0.25, 1, 0.01), { y: SOLE_Y + 0.012, z: 0.035 });
        const soleMaterial = this.standard("sole", 0x111214, 0.9);
        for (const leg of legs) {
          this.add(leg, upper, shoeMaterial);
          this.add(leg, sole, soleMaterial);
        }
        return;
      }
      case "sneakers": {
        const upper = place(new RoundedBoxGeometry(width, 0.08, 0.23, 2, 0.035), { y: SOLE_Y + 0.03 + 0.036, z: 0.03 });
        const sole = place(new RoundedBoxGeometry(width * 1.06, 0.032, 0.245, 1, 0.012), { y: SOLE_Y + 0.016, z: 0.033 });
        const soleMaterial = this.standard("sole", 0xecebe6, 0.8);
        for (const leg of legs) {
          this.add(leg, upper, shoeMaterial);
          this.add(leg, sole, soleMaterial);
        }
        return;
      }
      case "sandals": {
        const foot = place(new RoundedBoxGeometry(width * 0.86, 0.055, 0.21, 2, 0.024), { y: SOLE_Y + 0.022 + 0.026, z: 0.03 });
        const straps = mergeParts([
          place(new RoundedBoxGeometry(width * 1.05, 0.022, 0.235, 1, 0.008), { y: SOLE_Y + 0.011, z: 0.032 }),
          place(new RoundedBoxGeometry(width * 0.92, 0.016, 0.03, 1, 0.006), { y: SOLE_Y + 0.078, z: 0.075 }),
          place(new RoundedBoxGeometry(width * 0.92, 0.016, 0.03, 1, 0.006), { y: SOLE_Y + 0.08, z: -0.01 }),
        ]);
        for (const leg of legs) {
          this.add(leg, foot, this.skin);
          this.add(leg, straps, shoeMaterial);
        }
        return;
      }
    }
  }

  /** Surface du dos à hauteur de poitrine, épaisseur du haut comprise : les sacs s'y adossent. */
  private backSurface(): number {
    const extra = this.config.top === "tactical" ? 0.05 : this.config.top === "hoodie" ? 0.03 : 0.005;
    return -this.frontAt(0.38) - extra;
  }

  private chestSurface(y: number): number {
    return this.frontAt(y) + (this.config.top === "tactical" ? 0.045 : 0.008);
  }

  private buildAccessory(): void {
    const torso = this.rig.torso;
    const head = this.rig.head;
    switch (this.config.accessory) {
      case "none":
        return;
      case "backpack": {
        const back = this.backSurface();
        this.add(torso, new RoundedBoxGeometry(0.28, 0.32, 0.14, 2, 0.04), this.accessory, 0, 0.36, back - 0.07);
        const trim = mergeParts([
          place(new RoundedBoxGeometry(0.29, 0.1, 0.15, 2, 0.035), { y: 0.5, z: back - 0.07 }),
          place(new RoundedBoxGeometry(0.2, 0.12, 0.05, 2, 0.02), { y: 0.27, z: back - 0.15 }),
          ...[-1, 1].map((side) => place(new RoundedBoxGeometry(0.045, 0.3, 0.02, 1, 0.008), { x: side * 0.1, y: 0.4, z: this.chestSurface(0.4) + 0.008 })),
          ...[-1, 1].map((side) => place(new RoundedBoxGeometry(0.045, 0.02, this.chestSurface(0.5) - back + 0.02, 1, 0.008), { x: side * 0.1, y: 0.545, z: (this.chestSurface(0.5) + back) / 2 })),
        ]);
        this.add(torso, trim, this.accessoryTrim);
        return;
      }
      case "bag": {
        // Bandoulière : anneau aplati qui traverse le torse en diagonale, de l'épaule droite à la hanche gauche.
        const strapDepth = this.chestSurface(0.32) + 0.012;
        const strap = new THREE.TorusGeometry(0.27, 0.012, 6, 36);
        strap.rotateX(Math.PI / 2);
        strap.scale(1, 1, strapDepth / 0.27);
        strap.rotateZ(0.72);
        strap.translate(0, 0.32, 0);
        const flap = place(new RoundedBoxGeometry(0.205, 0.07, 0.075, 2, 0.02), { x: -0.205, y: 0.15, z: -0.02, rotationY: -0.5 });
        this.add(torso, mergeParts([strap, flap]), this.accessoryTrim);
        this.add(torso, place(new RoundedBoxGeometry(0.2, 0.16, 0.07, 2, 0.025), { rotationY: -0.5 }), this.accessory, -0.2, 0.1, -0.025);
        return;
      }
      case "glasses": {
        const eye = headPoint(EYE_POLAR, EYE_AZIMUTH, 1);
        const rimZ = eye.z + 0.022;
        const frame = mergeParts([
          ...[-1, 1].map((side) => place(new THREE.TorusGeometry(0.033, 0.006, 6, 18), { x: side * eye.x, y: eye.y, z: rimZ })),
          place(new THREE.CylinderGeometry(0.005, 0.005, eye.x * 2 - 0.066, 5), { y: eye.y + 0.008, z: rimZ, rotationZ: Math.PI / 2 }),
          ...[-1, 1].map((side) => {
            // Branche oblique : du bord de la monture jusqu'au-dessus de l'oreille.
            const hingeX = eye.x + 0.033;
            const earX = HEAD_RADIUS * 1.0;
            const earZ = -0.01;
            const length = Math.hypot(earX - hingeX, rimZ - earZ);
            return place(new RoundedBoxGeometry(0.008, 0.008, length, 1, 0.003), {
              x: (side * (hingeX + earX)) / 2,
              y: eye.y + 0.006,
              z: (rimZ + earZ) / 2,
              rotationY: Math.atan2(side * (hingeX - earX), rimZ - earZ),
            });
          }),
        ]);
        this.add(head, frame, this.accessory);
        const lenses = mergeParts([-1, 1].map((side) => place(new THREE.CylinderGeometry(0.03, 0.03, 0.004, 16), { x: side * eye.x, y: eye.y, z: rimZ, rotationX: Math.PI / 2 })));
        const glass = this.material("lens", () => new THREE.MeshStandardMaterial({ color: 0x1b2a33, roughness: 0.1, metalness: 0.6, transparent: true, opacity: 0.45 }));
        this.add(head, lenses, glass).castShadow = false;
        return;
      }
      case "headset": {
        // Coiffure volumineuse : arceau passé derrière la nuque plutôt qu'au-dessus de la tête.
        const behindNeck = this.hairStyle === "afro" || this.hairStyle === "gele" || this.hairStyle === "bun";
        const cupX = HEAD_RADIUS * 1.04;
        const band = new THREE.TorusGeometry(cupX, 0.012, 6, 24, Math.PI);
        if (behindNeck) band.rotateX(-Math.PI / 2 - 0.35);
        else band.scale(1, 1.1, 1);
        band.translate(0, HEAD_CENTER_Y, 0);
        const parts = [
          band,
          ...[-1, 1].map((side) => place(new THREE.CylinderGeometry(0.045, 0.045, 0.032, 16), { x: side * (cupX + 0.008), y: HEAD_CENTER_Y, rotationZ: Math.PI / 2 })),
          place(new THREE.CylinderGeometry(0.006, 0.006, 0.15, 5), { x: -0.12, y: HEAD_CENTER_Y - 0.06, z: 0.075, rotationX: Math.PI / 2, rotationY: 0.55 }),
          place(new THREE.SphereGeometry(0.014, 8, 6), { x: -0.085, y: HEAD_CENTER_Y - 0.06, z: 0.135 }),
        ];
        this.add(head, mergeParts(parts), this.accessory);
        return;
      }
      case "cap": {
        // Le gele est déjà une coiffe : pas de casquette par-dessus.
        if (this.hairStyle === "gele") return;
        const crown = new THREE.SphereGeometry(HEAD_RADIUS * 1.13, 20, 10, 0, Math.PI * 2, 0, 1.5);
        crown.rotateX(-0.2);
        crown.scale(1, HEAD_STRETCH, 1);
        crown.translate(0, HEAD_CENTER_Y, 0);
        const brim = place(new THREE.CylinderGeometry(0.14, 0.14, 0.012, 20, 1, false, -Math.PI / 2, Math.PI), {
          y: HEAD_CENTER_Y + 0.075,
          z: HEAD_RADIUS * 0.8,
          rotationX: 0.15,
        });
        const button = place(new THREE.SphereGeometry(0.016, 8, 6), { y: HEAD_CENTER_Y + HEAD_RADIUS * 1.13 * HEAD_STRETCH - 0.004, z: -0.03 });
        this.add(head, mergeParts([crown, brim, button]), this.accessory);
        return;
      }
    }
  }

  /** Pistolet IEM dans la main droite, à la même place qu'avant, avec sa bobine lumineuse. */
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

/**
 * Construit l'agent à partir de sa config (déjà validée par parseAvatarConfig).
 * Rapide (quelques millisecondes) : le créateur peut reconstruire le modèle à chaque changement,
 * à condition d'appeler dispose() sur l'ancien.
 */
export function createAvatarRig(config: AvatarConfig): AvatarModel {
  return new AvatarBuilder(config).build();
}
