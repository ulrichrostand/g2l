import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import type { AvatarConfig, BodyBuild, BodyType, HairStyle } from "./avatarConfig";

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
const BLEND_RATE = 10;
const MISSION_GLOW_INTENSITY = 2.4;
const SHOT_BLEND_SECONDS = 0.3;

/** Os du haut du corps : la visée les pilote pendant que les jambes continuent de marcher. */
const UPPER_BODY_PREFIXES = ["spine_", "neck_", "Head", "clavicle_", "upperarm_", "lowerarm_", "hand_", "index_", "middle_", "pinky_", "ring_", "thumb_"];

export interface HumanCharacterAsset {
  body: BodyType;
  scene: THREE.Group;
  clips: ReadonlyMap<ClipName, { lower: THREE.AnimationClip; upper: THREE.AnimationClip }>;
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
  const clips = new Map<ClipName, { lower: THREE.AnimationClip; upper: THREE.AnimationClip }>();
  for (const name of REQUIRED_CLIPS) {
    const clip = gltf.animations.find((candidate) => candidate.name === name);
    if (!clip) throw new Error(`Modèle ${body} : animation « ${name} » absente`);
    clips.set(name, splitClip(clip));
  }
  const present = new Set<PartRole>();
  gltf.scene.traverse((object) => {
    const role = object instanceof THREE.Mesh ? partRole(object.name) : null;
    if (role) present.add(role);
  });
  const missing = REQUIRED_PARTS[body].filter((role) => !present.has(role));
  if (missing.length > 0) throw new Error(`Modèle ${body} : pièces absentes (${missing.join(", ")})`);
  return { body, scene: gltf.scene, clips };
}

export function isUpperBodyTrack(trackName: string): boolean {
  const boneName = trackName.split(".")[0] ?? "";
  return UPPER_BODY_PREFIXES.some((prefix) => boneName.startsWith(prefix));
}

/** Coupe un clip en deux couches indépendantes (jambes et bassin / buste et bras), mêlées ensuite par poids. */
function splitClip(clip: THREE.AnimationClip): { lower: THREE.AnimationClip; upper: THREE.AnimationClip } {
  const upperTracks = clip.tracks.filter((track) => isUpperBodyTrack(track.name));
  const lowerTracks = clip.tracks.filter((track) => !isUpperBodyTrack(track.name));
  return {
    lower: new THREE.AnimationClip(`${clip.name}:lower`, clip.duration, lowerTracks),
    upper: new THREE.AnimationClip(`${clip.name}:upper`, clip.duration, upperTracks),
  };
}

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

interface LayeredAction {
  lower: THREE.AnimationAction;
  upper: THREE.AnimationAction;
  weight: number;
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
  private readonly mixer: THREE.AnimationMixer;
  private readonly locomotion = new Map<ClipName, LayeredAction>();
  private readonly aimAction: THREE.AnimationAction;
  private readonly shotAction: THREE.AnimationAction;
  private readonly parts: TintedPart[] = [];
  private readonly ownedMaterials: THREE.Material[] = [];
  private readonly ownedGeometries: THREE.BufferGeometry[] = [];
  private readonly glow: THREE.MeshStandardMaterial;
  private readonly head: THREE.Object3D;
  private readonly hand: THREE.Object3D;
  private readonly skinTintScratch = new THREE.Color();
  private modelScale = 1;
  private aimWeight = 0;
  private shotTimer = 0;

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

    this.mixer = new THREE.AnimationMixer(this.model);
    for (const [name, layers] of asset.clips) {
      if (name === "Pistol_Aim_Neutral" || name === "Pistol_Shoot") continue;
      this.locomotion.set(name, { lower: this.startLayer(layers.lower), upper: this.startLayer(layers.upper), weight: name === "Idle_Loop" ? 1 : 0 });
    }
    this.aimAction = this.startLayer(requireClip(asset, "Pistol_Aim_Neutral").upper);
    const shot = requireClip(asset, "Pistol_Shoot").upper;
    this.shotAction = this.mixer.clipAction(shot);
    this.shotAction.setLoop(THREE.LoopOnce, 1);
    this.shotAction.clampWhenFinished = true;
    this.shotAction.setEffectiveWeight(0);
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
    this.shotTimer = SHOT_BLEND_SECONDS;
    this.shotAction.reset().play();
  }

  update(deltaSeconds: number, state: HumanMotionState): void {
    const smoothing = 1 - Math.exp(-deltaSeconds * BLEND_RATE);
    const activeClip = locomotionClip(state);
    this.aimWeight += (THREE.MathUtils.clamp(state.aim, 0, 1) - this.aimWeight) * smoothing;
    this.shotTimer = Math.max(0, this.shotTimer - deltaSeconds);
    const shotWeight = this.aimWeight * (this.shotTimer / SHOT_BLEND_SECONDS);
    const upperFree = 1 - this.aimWeight;

    let total = 0;
    for (const [name, layer] of this.locomotion) {
      layer.weight += ((name === activeClip ? 1 : 0) - layer.weight) * smoothing;
      total += layer.weight;
    }
    for (const [name, layer] of this.locomotion) {
      // Normalisé : la somme des poids reste 1, aucun os ne revient vers la pose de liaison (T-pose) en transition.
      const weight = total > 0 ? layer.weight / total : 0;
      const timeScale = locomotionTimeScale(name, state.speed, this.modelScale);
      layer.lower.setEffectiveWeight(weight).setEffectiveTimeScale(timeScale);
      layer.upper.setEffectiveWeight(weight * upperFree).setEffectiveTimeScale(timeScale);
    }
    this.aimAction.setEffectiveWeight(this.aimWeight - shotWeight);
    this.shotAction.setEffectiveWeight(shotWeight);
    this.mixer.update(deltaSeconds);
  }

  /** Géométries et textures appartiennent à l'asset partagé : seuls les clones propres à l'instance sont libérés. */
  dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.model);
    this.root.removeFromParent();
    for (const material of this.ownedMaterials) material.dispose();
    for (const geometry of this.ownedGeometries) geometry.dispose();
  }

  private startLayer(clip: THREE.AnimationClip): THREE.AnimationAction {
    const action = this.mixer.clipAction(clip);
    action.setEffectiveWeight(0).play();
    return action;
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

    // Repère de la main droite : Y suit les doigts (le canon), Z sort du dos de la main (le dessus de l'arme).
    const pistol = new THREE.Group();
    const slide = new THREE.Mesh(this.ownGeometry(new THREE.BoxGeometry(0.034, 0.2, 0.05)), gear);
    slide.position.set(0, 0.11, 0.06);
    const grip = new THREE.Mesh(this.ownGeometry(new THREE.BoxGeometry(0.03, 0.05, 0.09)), gear);
    grip.position.set(0, 0.06, 0.02);
    // Bobine IEM au bout du canon : CylinderGeometry est déjà dans l'axe Y, celui du canon.
    const coil = new THREE.Mesh(this.ownGeometry(new THREE.CylinderGeometry(0.024, 0.024, 0.04, 10)), this.glow);
    coil.position.set(0, 0.22, 0.06);
    pistol.add(slide, grip, coil);
    this.hand.add(pistol);

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

function requireClip(asset: HumanCharacterAsset, name: ClipName): { lower: THREE.AnimationClip; upper: THREE.AnimationClip } {
  const clip = asset.clips.get(name);
  if (!clip) throw new Error(`Modèle ${asset.body} : animation « ${name} » absente`);
  return clip;
}
