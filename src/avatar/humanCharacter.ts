import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import type { AvatarConfig } from "./avatarConfig";

/**
 * Personnage humain riggé (glTF) qui habille l'agent du joueur : corps, tête et vêtements Quaternius (CC0),
 * animé par la bibliothèque d'animations du même squelette. Purement visuel : déplacements, collisions et
 * détection restent ceux du Player (cercle de collision invisible), ce modèle ne fait que suivre.
 * Provenance, licences et reconstruction : public/models/characters/README.md.
 */

export const HUMAN_AGENT_MODEL_URL = `${import.meta.env.BASE_URL}models/characters/agent.glb`;

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

/** Nœuds teintés avec la config de l'agent (three.js nomme chaque Mesh d'après son nœud glTF), préfixes compris. */
export const TINTED_MESHES = {
  shirt: "Male_Peasant_Arms",
  trousers: "Male_Peasant_Legs",
  vest: "Male_Ranger_Body",
  belts: "Male_Ranger_Body_Belt",
  boots: "Male_Ranger_Feet_Boots",
  hair: "Hair_Buzzed",
  eyebrows: "Eyebrows",
  head: "SuperHero_Male",
} as const;

/** Taille du modèle source (cheveux compris) et taille de l'agent procédural qu'il remplace, en mètres-cases. */
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
const SHOT_BLEND_SECONDS = 0.3;

/** Os du haut du corps : la visée les pilote pendant que les jambes continuent de marcher. */
const UPPER_BODY_PREFIXES = ["spine_", "neck_", "Head", "clavicle_", "upperarm_", "lowerarm_", "hand_", "index_", "middle_", "pinky_", "ring_", "thumb_"];

export interface HumanCharacterAsset {
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

let assetRequest: Promise<HumanCharacterAsset> | null = null;

/** Un seul téléchargement pour toute la session ; un échec est relancé au prochain appel (réseau revenu). */
export function loadHumanCharacterAsset(url: string = HUMAN_AGENT_MODEL_URL): Promise<HumanCharacterAsset> {
  assetRequest ??= new GLTFLoader()
    .loadAsync(url)
    .then(prepareAsset)
    .catch((error: unknown) => {
      assetRequest = null;
      throw error;
    });
  return assetRequest;
}

function prepareAsset(gltf: GLTF): HumanCharacterAsset {
  const clips = new Map<ClipName, { lower: THREE.AnimationClip; upper: THREE.AnimationClip }>();
  for (const name of REQUIRED_CLIPS) {
    const clip = gltf.animations.find((candidate) => candidate.name === name);
    if (!clip) throw new Error(`agent.glb : animation « ${name} » absente`);
    clips.set(name, splitClip(clip));
  }
  const missingMeshes = Object.values(TINTED_MESHES).filter((name) => !gltf.scene.getObjectByName(name) && !hasMeshStartingWith(gltf.scene, name));
  if (missingMeshes.length > 0) throw new Error(`agent.glb : maillages absents (${missingMeshes.join(", ")})`);
  return { scene: gltf.scene, clips };
}

function hasMeshStartingWith(root: THREE.Object3D, prefix: string): boolean {
  let found = false;
  root.traverse((object) => {
    if (object instanceof THREE.Mesh && object.name.startsWith(prefix)) found = true;
  });
  return found;
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
export function skinTint(skinTone: string): THREE.Color {
  const target = new THREE.Color(skinTone);
  return new THREE.Color(
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

/** Une instance par personnage : clone du squelette, matériaux teintés propres, mixeur d'animations. */
export class HumanCharacter {
  readonly root = new THREE.Group();
  private readonly model: THREE.Object3D;
  private readonly mixer: THREE.AnimationMixer;
  private readonly locomotion = new Map<ClipName, LayeredAction>();
  private readonly aimAction: THREE.AnimationAction;
  private readonly shotAction: THREE.AnimationAction;
  private readonly ownedMaterials: THREE.Material[] = [];
  private readonly ownedGeometries: THREE.BufferGeometry[] = [];
  private readonly modelScale: number;
  private aimWeight = 0;
  private shotTimer = 0;

  constructor(asset: HumanCharacterAsset, avatar: AvatarConfig) {
    this.model = SkeletonUtils.clone(asset.scene);
    this.modelScale = (AGENT_HEIGHT / SOURCE_HEIGHT) * avatar.height;
    this.model.scale.setScalar(this.modelScale);
    this.root.add(this.model);
    this.applyAvatar(avatar);
    this.attachProps(avatar);

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

  /** Matériaux clonés par maillage : chaque pièce de vêtement prend sa couleur sans toucher l'asset partagé. */
  private applyAvatar(avatar: AvatarConfig): void {
    const skin = skinTint(avatar.skinTone);
    // Ordre significatif : le premier préfixe qui correspond gagne, et « Male_Ranger_Body » préfixe aussi les ceintures.
    const tintByMesh: [string, THREE.Color][] = [
      [TINTED_MESHES.belts, new THREE.Color(avatar.topAccent)],
      [TINTED_MESHES.vest, new THREE.Color(avatar.topColor)],
      [TINTED_MESHES.trousers, new THREE.Color(avatar.bottomColor)],
      [TINTED_MESHES.boots, new THREE.Color(avatar.shoesColor)],
      [TINTED_MESHES.hair, new THREE.Color(avatar.hairColor)],
      [TINTED_MESHES.eyebrows, new THREE.Color(avatar.hairColor)],
      [TINTED_MESHES.head, skin],
    ];
    this.model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.castShadow = true;
      // Le modèle chauve garde ses sourcils, pas sa coupe rase.
      if (object.name.startsWith(TINTED_MESHES.hair) && avatar.hairStyle === "bald") object.visible = false;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      const tinted = materials.map((material: THREE.Material) => {
        const clone = material.clone();
        this.ownedMaterials.push(clone);
        if (clone instanceof THREE.MeshStandardMaterial) this.tint(object.name, clone, tintByMesh, skin, avatar);
        return clone;
      });
      object.material = Array.isArray(object.material) ? tinted : (tinted[0] as THREE.Material);
    });
  }

  private tint(meshName: string, material: THREE.MeshStandardMaterial, tintByMesh: [string, THREE.Color][], skin: THREE.Color, avatar: AvatarConfig): void {
    // Les mains (deuxième primitive des manches) utilisent la texture de peau : elles prennent la teinte de peau.
    if (material.name.startsWith("MI_Regular_Male")) {
      material.color.copy(skin);
      return;
    }
    if (meshName.startsWith(TINTED_MESHES.shirt)) {
      // Manches de la chemise sous le gilet : couleur d'accent, pour lire deux pièces de vêtement.
      material.color.set(avatar.topAccent);
      return;
    }
    const match = tintByMesh.find(([prefix]) => meshName.startsWith(prefix));
    if (match) material.color.copy(match[1]);
  }

  /**
   * Accessoires (pas le corps) : pistolet IEM dans la main droite et optiques de vision nocturne sur le front,
   * lumineuses (couleur visorColor) pour garder la silhouette lisible dans les zones sombres.
   */
  private attachProps(avatar: AvatarConfig): void {
    const glow = new THREE.MeshStandardMaterial({ color: avatar.visorColor, emissive: avatar.visorColor, emissiveIntensity: 2.4 });
    const gear = new THREE.MeshStandardMaterial({ color: 0x1b2026, roughness: 0.5, metalness: 0.6 });
    this.ownedMaterials.push(glow, gear);
    const hand = this.model.getObjectByName("hand_r");
    const head = this.model.getObjectByName("Head");
    if (!hand || !head) throw new Error("agent.glb : os hand_r ou Head introuvable");

    // Repère de la main droite : Y suit les doigts (le canon), Z sort du dos de la main (le dessus de l'arme).
    const pistol = new THREE.Group();
    const slide = new THREE.Mesh(this.ownGeometry(new THREE.BoxGeometry(0.034, 0.2, 0.05)), gear);
    slide.position.set(0, 0.11, 0.06);
    const grip = new THREE.Mesh(this.ownGeometry(new THREE.BoxGeometry(0.03, 0.05, 0.09)), gear);
    grip.position.set(0, 0.06, 0.02);
    // Bobine IEM au bout du canon : CylinderGeometry est déjà dans l'axe Y, celui du canon.
    const coil = new THREE.Mesh(this.ownGeometry(new THREE.CylinderGeometry(0.024, 0.024, 0.04, 10)), glow);
    coil.position.set(0, 0.22, 0.06);
    pistol.add(slide, grip, coil);
    hand.add(pistol);

    // Repère de la tête : Y vers le haut, Z vers l'avant. Optiques relevées sur le front, lentilles vers le ciel
    // (et donc vers la caméra du dessus), comme sur l'agent procédural.
    const lensGeometry = this.ownGeometry(new THREE.CylinderGeometry(0.02, 0.024, 0.05, 10));
    const goggles = new THREE.Group();
    for (const offset of [-0.036, 0.036]) {
      const lens = new THREE.Mesh(lensGeometry, glow);
      lens.position.x = offset;
      goggles.add(lens);
    }
    goggles.position.set(0, GOGGLES_HEIGHT, GOGGLES_FORWARD);
    goggles.rotation.x = GOGGLES_TILT;
    head.add(goggles);
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
  if (!clip) throw new Error(`agent.glb : animation « ${name} » absente`);
  return clip;
}
