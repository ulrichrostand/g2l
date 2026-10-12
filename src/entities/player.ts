import * as THREE from "three";
import { DEFAULT_AVATAR, type AvatarConfig } from "../avatar/avatarConfig";
import { createAvatarRig, type AvatarModel } from "../avatar/avatarModel";
import { HumanCharacter, type HumanCharacterAsset } from "../avatar/humanCharacter";
import type { Grid } from "../core/grid";
import type { MoveIntent } from "../core/input";
import { poseRig, type HumanoidRig } from "./rig";

export type Posture = "standing" | "crouching" | "running";

const COLLISION_RADIUS = 0.28;
const SPEED_BY_POSTURE: Record<Posture, number> = { standing: 3, crouching: 1.6, running: 5 };
/** En visée, on avance lentement (et on ne court pas) : la précision se paie en mobilité. */
const AIMING_SPEED_FACTOR = 0.6;
const SHOT_POSE_SECONDS = 0.45;
/** Recul sous un impact : la durée de l'animation Hit_Chest. */
const HIT_REACTION_SECONDS = 0.35;
/** Effondrement à zéro de santé avant l'écran « À terre » : le temps de voir l'agent tomber. */
const KNOCKDOWN_SECONDS = 1.5;

export class Player {
  readonly root = new THREE.Group();
  readonly position = new THREE.Vector3();
  crouched = false;
  posture: Posture = "standing";
  isMoving = false;
  private readonly rig: HumanoidRig;
  private readonly avatar: AvatarModel;
  private facing = 0;
  private stepPhase = 0;
  private stride = 0;
  private crouchAmount = 0;
  /** Temps restant de la pose de tir (bras tendu). */
  private aimTimer = 0;
  /** Angle de visée (convention mathématique) tant que le joueur épaule, sinon null. */
  private aimAngle: number | null = null;
  /** Personnage humain riggé : null tant qu'il charge (ou s'il n'a pas pu charger), l'agent procédural le remplace. */
  private human: HumanCharacter | null = null;
  private disposed = false;
  private hitTimer = 0;
  private knockedDown = false;
  private readonly previousPosition = new THREE.Vector3();
  private groundSpeed = 0;

  /**
   * `humanModel` : modèle humain en cours de chargement. Il remplace l'agent procédural dès qu'il est prêt ;
   * sans lui (tests, échec réseau, fichier invalide), l'agent procédural reste affiché et le jeu est inchangé.
   */
  constructor(
    private readonly grid: Grid,
    avatar: AvatarConfig = DEFAULT_AVATAR,
    humanModel: Promise<HumanCharacterAsset> | null = null,
  ) {
    this.avatar = createAvatarRig(avatar);
    this.rig = this.avatar.rig;
    this.root.add(this.rig.root);
    if (humanModel) void this.attachHumanModel(humanModel, avatar);
    // Lampe frontale discrète : le joueur garde de la lisibilité dans les zones d'ombre.
    // Vert pâle plutôt que franc : l'ambiance vision nocturne reste, les couleurs des vêtements se lisent encore.
    const lamp = new THREE.PointLight(0xd2ffde, 2.2, 4.5, 1.6);
    lamp.position.set(0, 1.6, 0);
    this.root.add(lamp);
  }

  /**
   * Libère le modèle de l'agent et rend ses textures partagées (visage, tissu) au cache de l'avatar.
   * En fin de mission, disposeScene suffit : il libère les matériaux, ce qui rend aussi ces textures.
   * Indispensable en revanche quand on retire le joueur d'une scène qui continue de vivre (ou avant
   * d'en reconstruire un autre). L'appeler en plus de disposeScene est sans risque.
   */
  dispose(): void {
    this.disposed = true;
    this.root.removeFromParent();
    this.avatar.dispose();
    this.human?.dispose();
    this.human = null;
  }

  /** Recul sous un impact (personnage humain seulement : l'agent procédural n'a pas d'animation dédiée). */
  playHit(): void {
    this.hitTimer = HIT_REACTION_SECONDS;
  }

  /**
   * Zéro de santé : l'agent s'effondre. Renvoie la durée de la chute à laisser jouer avant de le relever
   * ailleurs, ou 0 si l'agent affiché n'a pas d'animation de chute (repli procédural : comportement d'avant).
   */
  knockDown(): number {
    if (!this.human) return 0;
    this.knockedDown = true;
    this.aimAngle = null;
    return KNOCKDOWN_SECONDS;
  }

  /** Relevé (nouvelle vie, point d'insertion) : fin de la chute et du recul. */
  recover(): void {
    this.knockedDown = false;
    this.hitTimer = 0;
  }

  /** Vrai une fois le personnage humain affiché (sinon, c'est l'agent procédural). */
  get usesHumanModel(): boolean {
    return this.human !== null;
  }

  private async attachHumanModel(humanModel: Promise<HumanCharacterAsset>, avatar: AvatarConfig): Promise<void> {
    try {
      const asset = await humanModel;
      // Mission terminée pendant le téléchargement : rien à attacher.
      if (this.disposed) return;
      const human = new HumanCharacter(asset, avatar);
      human.root.rotation.y = this.facing;
      this.root.add(human.root);
      this.rig.root.visible = false;
      this.human = human;
    } catch (error) {
      console.warn("Personnage humain indisponible : l'agent procédural reste affiché.", error);
    }
  }

  get isAiming(): boolean {
    return this.aimAngle !== null;
  }

  /** Visée épaulée : le corps suit la visée en permanence (null = on range l'arme). */
  setAim(angle: number | null): void {
    this.aimAngle = angle;
  }

  /** Se tourne d'un coup vers la direction du tir et tend le bras (tir à la hanche compris). */
  faceShot(angle: number): void {
    this.facing = toRigFacing(angle);
    this.aimTimer = SHOT_POSE_SECONDS;
    this.human?.playShot();
  }

  /** Direction du regard en convention mathématique (cos → X, sin → Z), utile pour les tirs sans cible. */
  get facingMathAngle(): number {
    return Math.atan2(Math.cos(this.facing), Math.sin(this.facing));
  }

  /** Position de la bouche du pistolet (départ du tir), en coordonnées monde. */
  muzzlePosition(): THREE.Vector3 {
    return new THREE.Vector3(this.position.x + Math.sin(this.facing) * 0.55, 1.05 - this.crouchAmount * 0.25, this.position.z + Math.cos(this.facing) * 0.55);
  }

  placeAt(position: THREE.Vector3): void {
    this.position.copy(position);
    this.previousPosition.copy(position);
    this.root.position.copy(position);
  }

  update(deltaSeconds: number, intent: MoveIntent): void {
    this.isMoving = intent.x !== 0 || intent.z !== 0;
    const canRun = intent.running && this.isMoving && !this.isAiming;
    this.posture = this.crouched ? "crouching" : canRun ? "running" : "standing";
    const distance = SPEED_BY_POSTURE[this.posture] * deltaSeconds * (this.isAiming ? AIMING_SPEED_FACTOR : 1);

    if (this.isMoving) {
      // Axes résolus séparément : le joueur glisse le long des murs au lieu de se bloquer.
      this.tryMove(intent.x * distance, 0);
      this.tryMove(0, intent.z * distance);
      // En visée, on se déplace en crabe : le regard reste sur la cible.
      if (!this.isAiming) this.facing = rotateTowards(this.facing, Math.atan2(intent.x, intent.z), deltaSeconds * 12);
      this.stepPhase += deltaSeconds * (this.posture === "running" ? 16 : 10);
    }
    if (this.aimAngle !== null) this.facing = rotateTowards(this.facing, toRigFacing(this.aimAngle), deltaSeconds * 20);
    this.animate(deltaSeconds);
  }

  private tryMove(deltaX: number, deltaZ: number): void {
    const nextX = this.position.x + deltaX;
    const nextZ = this.position.z + deltaZ;
    if (this.collides(nextX, nextZ)) return;
    this.position.x = nextX;
    this.position.z = nextZ;
  }

  private collides(x: number, z: number): boolean {
    const minX = Math.floor(x - COLLISION_RADIUS);
    const maxX = Math.floor(x + COLLISION_RADIUS);
    const minZ = Math.floor(z - COLLISION_RADIUS);
    const maxZ = Math.floor(z + COLLISION_RADIUS);
    for (let cellZ = minZ; cellZ <= maxZ; cellZ++) {
      for (let cellX = minX; cellX <= maxX; cellX++) {
        if (!this.grid.isWalkable(cellX, cellZ)) return true;
      }
    }
    return false;
  }

  private animate(deltaSeconds: number): void {
    this.root.position.copy(this.position);
    this.rig.root.rotation.y = this.facing;
    // Transitions lissées : on passe en douceur de l'arrêt à la course, et de debout à accroupi.
    const smoothing = 1 - Math.exp(-deltaSeconds * 10);
    const targetStride = this.isMoving ? (this.posture === "running" ? 1 : this.posture === "crouching" ? 0.45 : 0.7) : 0;
    this.stride += (targetStride - this.stride) * smoothing;
    this.crouchAmount += ((this.crouched ? 1 : 0) - this.crouchAmount) * smoothing;
    this.aimTimer = Math.max(0, this.aimTimer - deltaSeconds);
    const aim = this.isAiming ? 1 : Math.min(1, this.aimTimer * 4);
    // Vitesse réellement parcourue (murs compris) : un agent bloqué contre un mur ne fait pas du sur-place en courant.
    const travelled = deltaSeconds > 0 ? Math.hypot(this.position.x - this.previousPosition.x, this.position.z - this.previousPosition.z) / deltaSeconds : 0;
    this.groundSpeed += (travelled - this.groundSpeed) * smoothing;
    this.previousPosition.copy(this.position);
    this.hitTimer = Math.max(0, this.hitTimer - deltaSeconds);
    if (this.human) {
      this.human.root.rotation.y = this.facing;
      const reaction = this.knockedDown ? "down" : this.hitTimer > 0 ? "hit" : null;
      this.human.update(deltaSeconds, { speed: this.groundSpeed, crouching: this.crouched, aim: this.knockedDown ? 0 : aim, reaction });
      return;
    }
    poseRig(this.rig, this.stepPhase, this.stride, this.crouchAmount, aim);
  }
}

/** Angle mathématique (cos → X, sin → Z) vers la rotation Y du modèle, qui regarde vers +Z. */
function toRigFacing(mathAngle: number): number {
  return Math.atan2(Math.cos(mathAngle), Math.sin(mathAngle));
}

export function rotateTowards(current: number, target: number, maxStep: number): number {
  let difference = target - current;
  difference = Math.atan2(Math.sin(difference), Math.cos(difference));
  if (Math.abs(difference) <= maxStep) return target;
  return current + Math.sign(difference) * maxStep;
}
