import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import type { AvatarConfig, BodyBuild, BodyType, HairStyle } from "./avatarConfig";
import { LayeredAnimator, prepareClips, type ClipLayers } from "./layeredAnimator";
import { createPistolProp } from "./props";

/**
 * Personnage humain riggé (glTF) qui habille l'agent du joueur : corps, tête et vêtements Quaternius (CC0),
 * animé par la bibliothèque d'animations du même squelette. Purement visuel : déplacements, collisions et
 * détection restent ceux du Player (cercle de collision invisible), ce modèle ne fait que suivre.
 * Provenance, licences et reconstruction : public/models/characters/README.md.
 */

/** Un fichier par silhouette : squelettes aux proportions différentes, mêmes animations, mêmes pièces. */
export const HUMAN_AGENT_MODEL_URLS: Readonly<Record<BodyType, string>> = {
  male: `${import.meta.env.BASE_URL}models/characters/agent-male.glb`,
  female: `${import.meta.env.BASE_URL}models/characters/agent-female.glb`,
};

/** Animations que le jeu utilise : leur absence dans le fichier est une erreur de construction, pas un détail. */
export const REQUIRED_CLIPS = [
  "Idle_Loop",
  "Walk_Loop",
  "Jog_Fwd_Loop",
  "Sprint_Loop",
  "Crouch_Idle_Loop",
  "Crouch_Fwd_Loop",
  "Pistol_Aim_Neutral",
  "Pistol_Shoot",
] as const;
type ClipName = (typeof REQUIRED_CLIPS)[number];

/** Rôle de chaque pièce du modèle, reconnue au nom de son nœud glTF (three.js nomme chaque Mesh d'après lui). */
type PartRole = "shirt" | "trousers" | "vest" | "belts" | "boots" | "head" | "eyebrows" | "eyes" | HairPart;
type HairPart = "hairBuzz" | "hairShort" | "hairLong" | "hairBun" | "beard";

/** Ordre significatif : le premier motif qui correspond gagne (« _Ranger_Body » préfixe aussi les ceintures). */
export const PART_PATTERNS: readonly (readonly [PartRole, RegExp])[] = [
  ["belts", /_Ranger_Body_Belt/],
  ["vest", /_Ranger_Body/],
  ["shirt", /_Peasant_Arms/],
  ["trousers", /_Peasant_Legs/],
  ["boots", /_Ranger_Feet/],
  ["hairBuzz", /^Hair_Buzzed/],
  ["hairShort", /^Hair_SimpleParted/],
  ["hairLong", /^Hair_Long/],
  ["hairBun", /^Hair_Buns/],
  ["beard", /^Hair_Beard/],
  ["eyebrows", /^Eyebrows/],
  ["eyes", /^Eyes/],
  ["head", /^Super[Hh]ero_/],
];

/** Pièces indispensables à chaque silhouette : leur absence est une erreur de construction du fichier. */
export const REQUIRED_PARTS: Readonly<Record<BodyType, readonly PartRole[]>> = {
  male: ["shirt", "trousers", "vest", "belts", "boots", "head", "eyebrows", "hairBuzz", "hairShort", "hairLong", "hairBun", "beard"],
  female: ["shirt", "trousers", "vest", "belts", "boots", "head", "eyebrows", "hairBuzz", "hairShort", "hairLong", "hairBun"],
};

const HAIR_PART: Readonly<Record<HairStyle, HairPart | null>> = {
  buzz: "hairBuzz",
  short: "hairShort",
  long: "hairLong",
  bun: "hairBun",
  bald: null,
};

/** Largeur du corps selon la carrure (la tête garde ses proportions, voir applyBuild). */
const BUILD_WIDTH: Readonly<Record<BodyBuild, number>> = { slim: 0.92, regular: 1, strong: 1.1 };

export function partRole(nodeName: string): PartRole | null {
  return PART_PATTERNS.find(([, pattern]) => pattern.test(nodeName))?.[0] ?? null;
}

/**
 * Taille du modèle masculin source (cheveux compris) et taille de l'agent procédural qu'il remplace, en mètres-cases.
 * Même échelle pour les deux silhouettes : la silhouette féminine reste naturellement un peu plus petite.
 */
const SOURCE_HEIGHT = 1.81;
const AGENT_HEIGHT = 1.62;
/** Teinte de peau moyenne des textures de peau du pack : sert de référence pour teinter vers celle de l'agent. */
const SOURCE_SKIN_TONE = new THREE.Color("#b07a58");

/**
 * Vitesse au sol de chaque cycle, mesurée sur le modèle à l'échelle 1 (écart du pied au bassin sur un cycle) :
 * la cadence suit la vitesse réelle du joueur, les pieds ne glissent pas.
 */
const CLIP_GROUND_SPEED: Partial<Record<ClipName, number>> = {
  Walk_Loop: 1.03,
  Jog_Fwd_Loop: 2.68,
  Sprint_Loop: 3.52,
  Crouch_Fwd_Loop: 0.84,
};
const MIN_TIME_SCALE = 0.6;
const MAX_TIME_SCALE = 2.2;
/** En dessous, on marche ; au-dessus, on trottine (un agent à 3 cases/s ne marche pas). */
const WALK_TO_JOG_SPEED = 2;
const MISSION_GLOW_INTENSITY = 2.4;


export interface HumanCharacterAsset {
  body: BodyType;
  scene: THREE.Group;
  clips: ReadonlyMap<ClipName, ClipLayers>;
}

export interface HumanMotionState {
  /** Vitesse au sol réelle, en cases par seconde. */
  speed: number;
  crouching: boolean;
  /** 0 = arme rangée, 1 = visée épaulée (ou pose de tir à la hanche). */
  aim: number;
}

const assetRequests = new Map<BodyType, Promise<HumanCharacterAsset>>();

/** Un seul téléchargement par silhouette pour toute la session ; un échec est relancé au prochain appel (réseau revenu). */
export function loadHumanCharacterAsset(body: BodyType): Promise<HumanCharacterAsset> {
  const pending = assetRequests.get(body);
  if (pending) return pending;
  const request = new GLTFLoader()
    .loadAsync(HUMAN_AGENT_MODEL_URLS[body])
    .then((gltf) => prepareAsset(gltf, body))
    .catch((error: unknown) => {
      assetRequests.delete(body);
      throw error;
    });
  assetRequests.set(body, request);
  return request;
}

function prepareAsset(gltf: GLTF, body: BodyType): HumanCharacterAsset {
  const clips = prepareClips(gltf.animations, REQUIRED_CLIPS, `Modèle ${body}`);
  const present = new Set<PartRole>();
  gltf.scene.traverse((object) => {
    const role = object instanceof THREE.Mesh ? partRole(object.name) : null;
    if (role) present.add(role);
  });
  const missing = REQUIRED_PARTS[body].filter((role) => !present.has(role));
  if (missing.length > 0) throw new Error(`Modèle ${body} : pièces absentes (${missing.join(", ")})`);
  return { body, scene: gltf.scene, clips };
}

export { isUpperBodyTrack } from "./layeredAnimator";

/** Choix du cycle de locomotion selon la posture et la vitesse réelle. */
export function locomotionClip(state: HumanMotionState): ClipName {
  const moving = state.speed > 0.05;
  if (state.crouching) return moving ? "Crouch_Fwd_Loop" : "Crouch_Idle_Loop";
  if (!moving) return "Idle_Loop";
  if (state.speed < WALK_TO_JOG_SPEED) return "Walk_Loop";
  return state.speed > 4 ? "Sprint_Loop" : "Jog_Fwd_Loop";
}

/** Cadence du cycle pour que la foulée corresponde à la vitesse au sol (bornée : au-delà, l'animation s'affole). */
export function locomotionTimeScale(clip: ClipName, speed: number, modelScale: number): number {
  const groundSpeed = CLIP_GROUND_SPEED[clip];
  if (groundSpeed === undefined || !(modelScale > 0)) return 1;
  return THREE.MathUtils.clamp(speed / (groundSpeed * modelScale), MIN_TIME_SCALE, MAX_TIME_SCALE);
}

/** Teinte à appliquer à une texture de peau pour obtenir la peau de l'agent (la texture garde ses détails). */
export function skinTint(skinTone: string, target: THREE.Color = new THREE.Color()): THREE.Color {
  target.set(skinTone);
  return target.setRGB(
    Math.min(2, target.r / SOURCE_SKIN_TONE.r),
    Math.min(2, target.g / SOURCE_SKIN_TONE.g),
    Math.min(2, target.b / SOURCE_SKIN_TONE.b),
  );
}

interface TintedPart {
  role: PartRole;
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
}

/**
 * Une instance par personnage : clone du squelette, matériaux propres (teintés), mixeur d'animations.
 * L'apparence (couleurs, coupe, barbe, carrure, taille) se change sur place avec setAppearance : rien n'est
 * reconstruit, le créateur peut l'appeler à chaque image d'un glisser dans le sélecteur de couleur.
 */
export class HumanCharacter {
  readonly root = new THREE.Group();
  readonly body: BodyType;
  private readonly model: THREE.Object3D;
  private readonly animator: LayeredAnimator<ClipName>;
  private readonly parts: TintedPart[] = [];
  private readonly ownedMaterials: THREE.Material[] = [];
  private readonly ownedGeometries: THREE.BufferGeometry[] = [];
  private readonly glow: THREE.MeshStandardMaterial;
  private readonly head: THREE.Object3D;
  private readonly hand: THREE.Object3D;
  private readonly skinTintScratch = new THREE.Color();
  private modelScale = 1;

  /**
   * `glowIntensity` : éclat des optiques et de la bobine. Fort en mission (quelques pixels vus de dessus, la
   * silhouette doit rester lisible dans le noir), plus doux en gros plan où le bloom masquerait le visage.
   */
  constructor(asset: HumanCharacterAsset, avatar: AvatarConfig, glowIntensity: number = MISSION_GLOW_INTENSITY) {
    if (avatar.body !== asset.body) throw new Error(`Silhouette ${avatar.body} demandée avec le modèle ${asset.body}`);
    this.glow = new THREE.MeshStandardMaterial({ emissiveIntensity: glowIntensity });
    this.body = asset.body;
    this.model = SkeletonUtils.clone(asset.scene);
    this.root.add(this.model);
    const head = this.model.getObjectByName("Head");
    const hand = this.model.getObjectByName("hand_r");
    if (!head || !hand) throw new Error("Modèle humain : os Head ou hand_r introuvable");
    this.head = head;
    this.hand = hand;
    this.ownedMaterials.push(this.glow);
    this.collectParts();
    this.attachProps();
    this.setAppearance(avatar);

    this.animator = new LayeredAnimator(this.model, asset.clips, {
      locomotion: ["Idle_Loop", "Walk_Loop", "Jog_Fwd_Loop", "Sprint_Loop", "Crouch_Idle_Loop", "Crouch_Fwd_Loop"],
      idle: "Idle_Loop",
      aim: "Pistol_Aim_Neutral",
      shot: "Pistol_Shoot",
    });
  }

  /** Échelle du modèle (taille de l'agent comprise) : sert à caler la cadence des pas sur la vitesse. */
  get scale(): number {
    return this.modelScale;
  }

  /**
   * Applique une apparence de même silhouette (changer de silhouette demande l'autre modèle, donc une autre
   * instance). Couleurs, coupe, barbe, carrure et taille : de simples affectations, sans allocation.
   */
  setAppearance(avatar: AvatarConfig): void {
    if (avatar.body !== this.body) throw new Error(`Silhouette ${avatar.body} demandée sur une instance ${this.body}`);
    const skin = skinTint(avatar.skinTone, this.skinTintScratch);
    const visibleHair = HAIR_PART[avatar.hairStyle];
    for (const { role, mesh, material } of this.parts) {
      // Les mains (deuxième primitive des manches de l'homme) utilisent la texture de peau.
      if (material.name.startsWith("MI_Regular_")) {
        material.color.copy(skin);
        continue;
      }
      switch (role) {
        case "head":
          material.color.copy(skin);
          break;
        case "vest":
          material.color.set(avatar.topColor);
          break;
        // Chemise sous le gilet et ceintures : couleur d'accent, pour lire deux pièces de vêtement.
        case "shirt":
        case "belts":
          material.color.set(avatar.topAccent);
          break;
        case "trousers":
          material.color.set(avatar.bottomColor);
          break;
        case "boots":
          material.color.set(avatar.shoesColor);
          break;
        case "eyebrows":
          material.color.set(avatar.hairColor);
          break;
        case "eyes":
          break;
        case "beard":
          material.color.set(avatar.hairColor);
          mesh.visible = avatar.beard;
          break;
        default:
          material.color.set(avatar.hairColor);
          mesh.visible = role === visibleHair;
      }
    }
    this.glow.color.set(avatar.visorColor);
    this.glow.emissive.set(avatar.visorColor);
    this.applyBuild(avatar.build, avatar.height);
  }

  /** Recul du tir : rejoue la pose de tir du buste, qui s'efface en quelques dixièmes de seconde. */
  playShot(): void {
    this.animator.playShot();
  }

  update(deltaSeconds: number, state: HumanMotionState): void {
    const locomotion = locomotionClip(state);
    this.animator.update(deltaSeconds, {
      locomotion,
      timeScale: locomotionTimeScale(locomotion, state.speed, this.modelScale),
      aim: state.aim,
      pose: null,
    });
  }

  /** Géométries et textures appartiennent à l'asset partagé : seuls les clones propres à l'instance sont libérés. */
  dispose(): void {
    this.animator.dispose();
    this.root.removeFromParent();
    for (const material of this.ownedMaterials) material.dispose();
    for (const geometry of this.ownedGeometries) geometry.dispose();
  }

  /** Matériaux clonés par pièce : chacune prend sa couleur sans toucher l'asset partagé entre instances. */
  private collectParts(): void {
    this.model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.castShadow = true;
      const role = partRole(object.name);
      const materials: THREE.Material[] = Array.isArray(object.material) ? object.material : [object.material];
      const clones = materials.map((material) => {
        const clone = material.clone();
        this.ownedMaterials.push(clone);
        if (role && clone instanceof THREE.MeshStandardMaterial) this.parts.push({ role, mesh: object, material: clone });
        return clone;
      });
      object.material = Array.isArray(object.material) ? clones : (clones[0] as THREE.Material);
    });
  }

  /**
   * Carrure : le corps s'élargit (axes X et Z du modèle), la tête est contre-étirée pour garder ses proportions.
   * Les animations ne pilotent pas l'échelle des os (pistes retirées à la construction) : le réglage tient.
   */
  private applyBuild(build: BodyBuild, height: number): void {
    const width = BUILD_WIDTH[build];
    this.modelScale = (AGENT_HEIGHT / SOURCE_HEIGHT) * height;
    this.model.scale.set(this.modelScale * width, this.modelScale, this.modelScale * width);
    this.head.scale.set(1 / width, 1, 1 / width);
  }

  /**
   * Accessoires (pas le corps) : pistolet IEM dans la main droite et optiques de vision nocturne sur le front,
   * lumineuses (couleur visorColor) pour garder la silhouette lisible dans les zones sombres.
   */
  private attachProps(): void {
    const gear = new THREE.MeshStandardMaterial({ color: 0x1b2026, roughness: 0.5, metalness: 0.6 });
    this.ownedMaterials.push(gear);

    this.hand.add(createPistolProp(gear, this.glow, (geometry) => this.ownGeometry(geometry)));

    // Repère de la tête : Y vers le haut, Z vers l'avant. Optiques relevées sur le front, lentilles vers le ciel
    // (et donc vers la caméra du dessus), comme sur l'agent procédural.
    const lensGeometry = this.ownGeometry(new THREE.CylinderGeometry(0.02, 0.024, 0.05, 10));
    const goggles = new THREE.Group();
    for (const offset of [-0.036, 0.036]) {
      const lens = new THREE.Mesh(lensGeometry, this.glow);
      lens.position.x = offset;
      goggles.add(lens);
    }
    goggles.position.set(0, GOGGLES_HEIGHT, GOGGLES_FORWARD);
    goggles.rotation.x = GOGGLES_TILT;
    this.head.add(goggles);
  }

  private ownGeometry<T extends THREE.BufferGeometry>(geometry: T): T {
    this.ownedGeometries.push(geometry);
    return geometry;
  }
}

/** Optiques sur le front, dans le repère de l'os de la tête (origine à la base du crâne). */
const GOGGLES_HEIGHT = 0.19;
const GOGGLES_FORWARD = 0.08;
const GOGGLES_TILT = 0.5;

