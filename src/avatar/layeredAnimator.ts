import * as THREE from "three";

/**
 * Animation par couches des personnages riggés (agent et sentinelles, même squelette « Universal ») :
 * les jambes suivent la locomotion pendant que le buste vise ou tire, et une pose plein corps (à genoux,
 * chute) peut tout recouvrir. Les poids sont pilotés à la main : chaque os reçoit toujours un total de 1,
 * donc aucun ne revient vers la pose de liaison (T-pose) pendant une transition.
 */

export interface ClipLayers {
  /** Bassin et jambes (et racine). */
  lower: THREE.AnimationClip;
  /** Colonne, tête, bras et mains. */
  upper: THREE.AnimationClip;
}

/** Os du haut du corps : la visée les pilote pendant que les jambes continuent de marcher. */
const UPPER_BODY_PREFIXES = ["spine_", "neck_", "Head", "clavicle_", "upperarm_", "lowerarm_", "hand_", "index_", "middle_", "pinky_", "ring_", "thumb_"];
const BLEND_RATE = 10;
const SHOT_BLEND_SECONDS = 0.3;

export function isUpperBodyTrack(trackName: string): boolean {
  const boneName = trackName.split(".")[0] ?? "";
  return UPPER_BODY_PREFIXES.some((prefix) => boneName.startsWith(prefix));
}

/** Coupe un clip en deux couches indépendantes (jambes et bassin / buste et bras), mêlées ensuite par poids. */
export function splitClip(clip: THREE.AnimationClip): ClipLayers {
  return {
    lower: new THREE.AnimationClip(`${clip.name}:lower`, clip.duration, clip.tracks.filter((track) => !isUpperBodyTrack(track.name))),
    upper: new THREE.AnimationClip(`${clip.name}:upper`, clip.duration, clip.tracks.filter((track) => isUpperBodyTrack(track.name))),
  };
}

/** Prépare les clips exigés ; un clip absent est une erreur de construction du fichier, pas un détail. */
export function prepareClips<N extends string>(animations: readonly THREE.AnimationClip[], names: readonly N[], label: string): Map<N, ClipLayers> {
  const clips = new Map<N, ClipLayers>();
  for (const name of names) {
    const clip = animations.find((candidate) => candidate.name === name);
    if (!clip) throw new Error(`${label} : animation « ${name} » absente`);
    clips.set(name, splitClip(clip));
  }
  return clips;
}

export interface AnimatorSetup<N extends string> {
  /** Cycles de déplacement : un seul actif à la fois, fondus entre eux. */
  locomotion: readonly N[];
  /** Cycle actif au départ (à l'arrêt). */
  idle: N;
  /** Pose de visée du buste, et recul du tir rejoué par-dessus. */
  aim: N;
  shot: N;
  /** Poses plein corps qui recouvrent tout (à genoux, chute). */
  poses?: readonly N[];
  /** Parmi les poses : celles qui se jouent une fois et restent sur leur dernière image (chute). */
  oneShotPoses?: readonly N[];
}

export interface AnimatorState<N extends string> {
  locomotion: N;
  /** Cadence du cycle de déplacement (1 = vitesse d'origine). */
  timeScale: number;
  /** 0 = arme baissée, 1 = visée épaulée. */
  aim: number;
  /** Pose plein corps demandée, ou null. */
  pose: N | null;
}

interface LayeredAction {
  lower: THREE.AnimationAction;
  upper: THREE.AnimationAction;
  weight: number;
}

export class LayeredAnimator<N extends string> {
  private readonly mixer: THREE.AnimationMixer;
  private readonly locomotion = new Map<N, LayeredAction>();
  private readonly poses = new Map<N, LayeredAction>();
  private readonly aimAction: THREE.AnimationAction;
  private readonly shotAction: THREE.AnimationAction;
  private readonly oneShotPoses: ReadonlySet<N>;
  private aimWeight = 0;
  private poseWeight = 0;
  private activePose: N | null = null;
  private shotTimer = 0;

  constructor(
    private readonly model: THREE.Object3D,
    clips: ReadonlyMap<N, ClipLayers>,
    setup: AnimatorSetup<N>,
  ) {
    this.mixer = new THREE.AnimationMixer(model);
    this.oneShotPoses = new Set(setup.oneShotPoses ?? []);
    for (const name of setup.locomotion) this.locomotion.set(name, this.startLayers(requireLayers(clips, name), name === setup.idle ? 1 : 0));
    for (const name of setup.poses ?? []) {
      const layers = this.startLayers(requireLayers(clips, name), 0);
      if (this.oneShotPoses.has(name)) {
        for (const action of [layers.lower, layers.upper]) {
          action.setLoop(THREE.LoopOnce, 1);
          action.clampWhenFinished = true;
        }
      }
      this.poses.set(name, layers);
    }
    this.aimAction = this.start(requireLayers(clips, setup.aim).upper);
    this.shotAction = this.mixer.clipAction(requireLayers(clips, setup.shot).upper);
    this.shotAction.setLoop(THREE.LoopOnce, 1);
    this.shotAction.clampWhenFinished = true;
    this.shotAction.setEffectiveWeight(0);
  }

  /** Recul du tir : rejoue la pose de tir du buste, qui s'efface en quelques dixièmes de seconde. */
  playShot(): void {
    this.shotTimer = SHOT_BLEND_SECONDS;
    this.shotAction.reset().play();
  }

  /**
   * Saute directement à la fin d'une pose jouée une fois (personnage déjà à terre au chargement d'une
   * sauvegarde) : pas d'animation de chute rejouée.
   */
  snapToPose(pose: N): void {
    const layers = this.poses.get(pose);
    if (!layers) return;
    this.activePose = pose;
    this.poseWeight = 1;
    for (const [name, other] of this.poses) other.weight = name === pose ? 1 : 0;
    for (const action of [layers.lower, layers.upper]) {
      action.reset().play();
      action.time = action.getClip().duration;
    }
  }

  update(deltaSeconds: number, state: AnimatorState<N>): void {
    const smoothing = 1 - Math.exp(-deltaSeconds * BLEND_RATE);
    this.aimWeight += (THREE.MathUtils.clamp(state.aim, 0, 1) - this.aimWeight) * smoothing;
    this.shotTimer = Math.max(0, this.shotTimer - deltaSeconds);
    this.updatePose(state.pose, smoothing);
    const free = 1 - this.poseWeight;
    const shotWeight = this.aimWeight * (this.shotTimer / SHOT_BLEND_SECONDS);

    let total = 0;
    for (const [name, layer] of this.locomotion) {
      layer.weight += ((name === state.locomotion ? 1 : 0) - layer.weight) * smoothing;
      total += layer.weight;
    }
    for (const [name, layer] of this.locomotion) {
      const weight = total > 0 ? layer.weight / total : 0;
      const timeScale = name === state.locomotion ? state.timeScale : 1;
      layer.lower.setEffectiveWeight(weight * free).setEffectiveTimeScale(timeScale);
      layer.upper.setEffectiveWeight(weight * (1 - this.aimWeight) * free).setEffectiveTimeScale(timeScale);
    }
    this.aimAction.setEffectiveWeight((this.aimWeight - shotWeight) * free);
    this.shotAction.setEffectiveWeight(shotWeight * free);
    this.mixer.update(deltaSeconds);
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.model);
  }

  private updatePose(requested: N | null, smoothing: number): void {
    if (requested !== null && requested !== this.activePose && this.poses.has(requested)) {
      this.activePose = requested;
      // Une chute repart du début à chaque fois qu'elle est demandée.
      if (this.oneShotPoses.has(requested)) {
        const layers = this.poses.get(requested);
        layers?.lower.reset().play();
        layers?.upper.reset().play();
      }
    }
    if (requested === null) this.activePose = null;
    this.poseWeight += ((requested === null ? 0 : 1) - this.poseWeight) * smoothing;
    let total = 0;
    for (const [name, layer] of this.poses) {
      layer.weight += ((name === this.activePose ? 1 : 0) - layer.weight) * smoothing;
      total += layer.weight;
    }
    for (const layer of this.poses.values()) {
      const weight = total > 0 ? (layer.weight / total) * this.poseWeight : 0;
      layer.lower.setEffectiveWeight(weight);
      layer.upper.setEffectiveWeight(weight);
    }
  }

  private startLayers(layers: ClipLayers, weight: number): LayeredAction {
    return { lower: this.start(layers.lower), upper: this.start(layers.upper), weight };
  }

  private start(clip: THREE.AnimationClip): THREE.AnimationAction {
    const action = this.mixer.clipAction(clip);
    action.setEffectiveWeight(0).play();
    return action;
  }
}

function requireLayers<N extends string>(clips: ReadonlyMap<N, ClipLayers>, name: N): ClipLayers {
  const layers = clips.get(name);
  if (!layers) throw new Error(`Animation « ${name} » absente`);
  return layers;
}
