import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import { LayeredAnimator, prepareClips, type ClipLayers } from "../avatar/layeredAnimator";
import { createPistolProp } from "../avatar/props";

/**
 * Androïde d'ENTROPIA qui habille une sentinelle : le mannequin de l'Universal Animation Library (Quaternius,
 * CC0), sur le même squelette que l'agent, en métal noir parcouru de lignes rouges lumineuses. Purement visuel :
 * rondes, vision, combat et suspension restent ceux de Guard, ce modèle ne fait que les montrer.
 */

export const SENTINEL_MODEL_URL = `${import.meta.env.BASE_URL}models/characters/sentinel.glb`;

export const SENTINEL_CLIPS = ["Idle_Loop", "Walk_Loop", "Jog_Fwd_Loop", "Pistol_Aim_Neutral", "Pistol_Shoot", "Hit_Chest", "Death01", "Fixing_Kneeling"] as const;
type SentinelClip = (typeof SENTINEL_CLIPS)[number];

/** Pose plein corps : à genoux quand elle est suspendue (SIGSTOP), effondrée une fois neutralisée. */
export type SentinelPose = "kneel" | "fallen" | null;

export interface SentinelAsset {
  scene: THREE.Group;
  clips: ReadonlyMap<SentinelClip, ClipLayers>;
}

export interface SentinelMotion {
  /** Vitesse au sol réelle, en cases par seconde. */
  speed: number;
  /** En combat ou en fouille : elle court au lieu de marcher. */
  hostile: boolean;
  /** 0 = arme baissée, 1 = en joue. */
  aim: number;
  pose: SentinelPose;
}

/** Mannequin source (1,83 m) ramené à la taille de la sentinelle procédurale qu'il remplace. */
const MODEL_SCALE = 1.77 / 1.83;
/** Vitesse au sol des cycles à l'échelle 1, mesurée sur le mannequin (écart du pied au bassin sur un cycle). */
const WALK_GROUND_SPEED = 1.03;
const JOG_GROUND_SPEED = 2.68;
const MIN_TIME_SCALE = 0.5;
const MAX_TIME_SCALE = 2;
/** Les lignes rouges suivent la visière, en plus discret : la silhouette se lit dans le noir sans éblouir. */
const JOINT_GLOW_RATIO = 0.5;
/**
 * Lueur minimale des lignes, même visière éteinte (neutralisée) ou au creux d'un clignotement (suspendue) :
 * sans elle, un androïde noir à terre disparaît complètement sur un sol sombre.
 */
const JOINT_MIN_GLOW = 0.35;

let assetRequest: Promise<SentinelAsset> | null = null;

/** Un seul téléchargement pour toute la session ; un échec est relancé au prochain appel (réseau revenu). */
export function loadSentinelAsset(): Promise<SentinelAsset> {
  assetRequest ??= new GLTFLoader()
    .loadAsync(SENTINEL_MODEL_URL)
    .then((gltf) => {
      const clips = prepareClips(gltf.animations, SENTINEL_CLIPS, "Modèle des sentinelles");
      if (!gltf.scene.getObjectByName("Head") || !gltf.scene.getObjectByName("hand_r")) throw new Error("Modèle des sentinelles : os Head ou hand_r introuvable");
      return { scene: gltf.scene, clips };
    })
    .catch((error: unknown) => {
      assetRequest = null;
      throw error;
    });
  return assetRequest;
}

/** Cycle de déplacement et sa cadence, calée sur la vitesse réelle (les pieds ne glissent pas). */
export function sentinelLocomotion(motion: Pick<SentinelMotion, "speed" | "hostile">): { clip: "Idle_Loop" | "Walk_Loop" | "Jog_Fwd_Loop"; timeScale: number } {
  if (!(motion.speed > 0.05)) return { clip: "Idle_Loop", timeScale: 1 };
  const jogging = motion.hostile && motion.speed > 1.6;
  const groundSpeed = (jogging ? JOG_GROUND_SPEED : WALK_GROUND_SPEED) * MODEL_SCALE;
  return { clip: jogging ? "Jog_Fwd_Loop" : "Walk_Loop", timeScale: THREE.MathUtils.clamp(motion.speed / groundSpeed, MIN_TIME_SCALE, MAX_TIME_SCALE) };
}

export class SentinelAndroid {
  readonly root = new THREE.Group();
  private readonly model: THREE.Object3D;
  private readonly animator: LayeredAnimator<SentinelClip>;
  private readonly jointMaterials: THREE.MeshStandardMaterial[] = [];
  private readonly ownedMaterials: THREE.Material[] = [];
  private readonly ownedGeometries: THREE.BufferGeometry[] = [];

  /**
   * `visor` : matériau de la visière, fourni (et piloté) par Guard : il le fait clignoter, flasher à l'impact,
   * passer au bleu une fois suspendue et l'éteint à la neutralisation. Les lignes rouges du corps le suivent.
   */
  constructor(
    asset: SentinelAsset,
    private readonly visor: THREE.MeshStandardMaterial,
  ) {
    this.model = SkeletonUtils.clone(asset.scene);
    this.model.scale.setScalar(MODEL_SCALE);
    this.root.add(this.model);
    this.dressModel();
    this.attachProps();
    this.animator = new LayeredAnimator(this.model, asset.clips, {
      locomotion: ["Idle_Loop", "Walk_Loop", "Jog_Fwd_Loop"],
      idle: "Idle_Loop",
      aim: "Pistol_Aim_Neutral",
      shot: "Pistol_Shoot",
      poses: ["Fixing_Kneeling", "Death01"],
      oneShotPoses: ["Death01"],
    });
  }

  playShot(): void {
    this.animator.playShot();
  }

  /** Déjà à terre (sauvegarde restaurée) : directement la dernière image de la chute. */
  snapFallen(): void {
    this.animator.snapToPose("Death01");
  }

  update(deltaSeconds: number, motion: SentinelMotion): void {
    const locomotion = sentinelLocomotion(motion);
    const pose = motion.pose === "kneel" ? "Fixing_Kneeling" : motion.pose === "fallen" ? "Death01" : null;
    this.animator.update(deltaSeconds, { locomotion: locomotion.clip, timeScale: locomotion.timeScale, aim: motion.aim, pose });
    for (const material of this.jointMaterials) {
      material.emissive.copy(this.visor.emissive);
      material.emissiveIntensity = Math.max(JOINT_MIN_GLOW, this.visor.emissiveIntensity * JOINT_GLOW_RATIO);
    }
  }

  /** Géométries du mannequin partagées entre sentinelles : seuls les clones propres à l'instance sont libérés. */
  dispose(): void {
    this.animator.dispose();
    this.root.removeFromParent();
    for (const material of this.ownedMaterials) material.dispose();
    for (const geometry of this.ownedGeometries) geometry.dispose();
  }

  /**
   * Plaques en métal noir satiné ; articulations sombres qui portent les lignes rouges lumineuses
   * (matériau propre à chaque sentinelle : en éteindre une n'éteint pas les autres).
   */
  private dressModel(): void {
    // Gris anthracite peu métallique : les niveaux n'ont pas de carte d'environnement à refléter, un métal franc
    // y paraîtrait noir partout hors de la lumière directe. Il se lit ainsi comme du métal sombre, même dans l'ombre.
    const plating = new THREE.MeshStandardMaterial({ name: "SentinelPlating", color: 0x3a4048, metalness: 0.25, roughness: 0.45 });
    this.ownedMaterials.push(plating);
    this.model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.castShadow = true;
      const materials: THREE.Material[] = Array.isArray(object.material) ? object.material : [object.material];
      const dressed = materials.map((material) => {
        if (material.name !== "M_Joints") return plating;
        const joints = new THREE.MeshStandardMaterial({ name: "SentinelJoints", color: 0x0d0f12, metalness: 0.2, roughness: 0.5 });
        this.ownedMaterials.push(joints);
        this.jointMaterials.push(joints);
        return joints;
      });
      object.material = Array.isArray(object.material) ? dressed : (dressed[0] as THREE.Material);
    });
  }

  /** Visière en bandeau sur le visage et pistolet dans la main droite (repères des os du squelette « Universal »). */
  private attachProps(): void {
    const head = this.model.getObjectByName("Head");
    const hand = this.model.getObjectByName("hand_r");
    if (!head || !hand) throw new Error("Modèle des sentinelles : os Head ou hand_r introuvable");
    const visorBand = new THREE.Mesh(this.ownGeometry(new THREE.BoxGeometry(0.17, 0.035, 0.05)), this.visor);
    visorBand.position.set(0, VISOR_HEIGHT, VISOR_FORWARD);
    head.add(visorBand);
    const gear = new THREE.MeshStandardMaterial({ color: 0x101215, roughness: 0.5, metalness: 0.7 });
    this.ownedMaterials.push(gear);
    hand.add(createPistolProp(gear, this.visor, (geometry) => this.ownGeometry(geometry)));
  }

  private ownGeometry<T extends THREE.BufferGeometry>(geometry: T): T {
    this.ownedGeometries.push(geometry);
    return geometry;
  }
}

/** Bandeau de la visière, dans le repère de l'os de la tête (origine à la base du crâne, Z vers l'avant). */
const VISOR_HEIGHT = 0.11;
const VISOR_FORWARD = 0.1;
