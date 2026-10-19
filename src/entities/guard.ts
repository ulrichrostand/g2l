import * as THREE from "three";
import { castRay, findPath, hasLineOfSight, type Cell, type Grid } from "../core/grid";
import type { GuardRoute } from "../level/generator";
import { cellToWorld } from "../level/levelScene";
import type { Posture } from "./player";
import { createSentinelRig, poseRig, type HumanoidRig } from "./rig";
import { SentinelAndroid, type SentinelAsset } from "./sentinelAndroid";

/**
 * patrol → suspicious → investigate → returning : l'infiltration classique.
 * combat → search : la sentinelle t'a vu, elle tire, te poursuit puis fouille la zone.
 * suspended : touchée par une balle IEM (SIGSTOP), à genoux le temps qu'on la termine avec une commande.
 */
export type GuardState = "patrol" | "suspicious" | "investigate" | "returning" | "combat" | "search" | "suspended";

export interface GuardTuning {
  walkSpeed: number;
  visionRange: number;
  fieldOfViewRadians: number;
  /** Multiplie la vitesse de remplissage de la jauge de détection. */
  detectionRate: number;
  /** Délai entre « je te vois » et le premier tir : la fenêtre pour réagir ou se mettre à couvert. */
  reactionSeconds: number;
  fireIntervalSeconds: number;
  /** Erreur de visée maximale (radians) : les sentinelles ne sont pas des tireurs d'élite. */
  aimErrorRadians: number;
  /** Balles nécessaires pour suspendre la sentinelle (bouclier des secteurs avancés). */
  hitsToSuspend: number;
}

export interface PlayerSnapshot {
  position: THREE.Vector3;
  posture: Posture;
  isMoving: boolean;
}

/** Tir demandé par la sentinelle : la mission crée le projectile (le garde ne connaît pas la scène). */
export interface GuardShot {
  x: number;
  z: number;
  angle: number;
}

export type HitOutcome = "suspended" | "shield" | "ignored";

/** Facteurs de discrétion : s'accroupir réduit fortement la portée de vue, courir l'augmente. */
const POSTURE_VISIBILITY: Record<Posture, number> = { crouching: 0.55, standing: 1, running: 1.2 };
const HEARING_RADIUS_RUNNING = 2.6;
const AWARENESS_DECAY_PER_SECOND = 0.28;
const SUSPICION_THRESHOLD = 0.3;
const INVESTIGATION_THRESHOLD = 0.5;
const PATROL_PAUSE_SECONDS = 1.3;
const INVESTIGATION_WAIT_SECONDS = 2.5;
const CONE_SEGMENTS = 22;
const ARRIVAL_EPSILON = 0.05;
const TAKEDOWN_RANGE = 1.35;
/** Le joueur doit être dans le dos : angle > ~110° par rapport au regard du garde. */
const TAKEDOWN_BEHIND_COSINE = -0.34;
const NOISE_AWARENESS_BOOST = 0.35;
const FALL_SPEED = 5;
/** Une sentinelle en alerte voit plus loin et plus large : elle te cherche activement. */
const HOSTILE_RANGE_FACTOR = 1.6;
const HOSTILE_FOV_FACTOR = 1.7;
const HOSTILE_SPEED_FACTOR = 1.7;
/** En deçà, la sentinelle arrête d'avancer et tire depuis sa position. */
const COMBAT_STANDOFF = 5;
const COMBAT_TURN_SPEED = 7;
/** Elle ne tire que si elle te fait (presque) face : pas de tir dans le dos en pivotant. */
const FIRE_ALIGNMENT_RADIANS = 0.3;
const REPATH_SECONDS = 0.6;
const SEARCH_SECONDS = 6;
/** Au-delà, la retrouver demande de nouveau un temps de réaction. */
const REACQUIRE_AFTER_SECONDS = 1;
const SUSPEND_SECONDS = 10;
/** Le bouclier se recharge si on ne tire plus dessus. */
const SHIELD_RESET_SECONDS = 4;
const HIT_FLASH_SECONDS = 0.14;
const MUZZLE_OFFSET = 0.45;
const CALM_CONE_COLOR = new THREE.Color(0xffd54a);
const ALERT_CONE_COLOR = new THREE.Color(0xff2d2d);
const VISOR_COLOR = new THREE.Color(0xff2d2d);
const SUSPENDED_VISOR_COLOR = new THREE.Color(0x4fc3ff);
/** Une sentinelle redémarrée se relève avant de tirer : le joueur a un instant pour réagir (multiple de son temps de réaction). */
const REBOOT_FIRE_DELAY_FACTOR = 2.5;
const HIT_FLASH_COLOR = new THREE.Color(0xffffff);

export class Guard {
  readonly root = new THREE.Group();
  readonly position = new THREE.Vector3();
  /** Cap en convention mathématique : direction = (cos, sin) dans le plan XZ. */
  heading = 0;
  awareness = 0;
  state: GuardState = "patrol";
  /** Neutralisé (au corps à corps ou par commande) : définitif pour la mission. */
  neutralized = false;
  /** Un corps (cette sentinelle à terre) a déjà été découvert par une autre sentinelle : il ne déclenche l'alerte qu'une fois. */
  bodyDiscovered = false;

  private readonly body: THREE.Group;
  private readonly rig: HumanoidRig;
  private readonly visorMaterial: THREE.MeshStandardMaterial;
  /** Couleur de la visière avant toute neutralisation : on la rend quand la sentinelle est réactivée. */
  private readonly visorBaseColor: THREE.Color;
  private readonly badge: StatusBadge;
  private fallProgress = 0;
  private readonly lastPosition = new THREE.Vector3();
  private walkPhase = 0;
  private stride = 0;
  private aimAmount = 0;
  private kneelAmount = 0;
  private readonly cone: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private readonly conePositions: Float32Array;
  private patrolIndex = 0;
  private patrolDirection: 1 | -1 = 1;
  private detour: Cell[] = [];
  private detourIndex = 0;
  private waitTimer = 0;
  private lastSeenCell: Cell | null = null;
  private readonly lastKnownPosition = new THREE.Vector3();
  private seesPlayerNow = false;
  private lostSightSeconds = 0;
  private fireCooldown = 0;
  private repathTimer = 0;
  private searchTimer = 0;
  private suspendedRemaining = 0;
  private shieldHits = 0;
  private sinceLastHit = Infinity;
  private hitFlash = 0;
  /** Androïde riggé : null tant qu'il charge (ou s'il n'a pas pu charger), le robot procédural le remplace. */
  private android: SentinelAndroid | null = null;
  private androidDropped = false;
  private groundSpeed = 0;
  private pendingShot: GuardShot | null = null;
  private alarmPending = false;

  constructor(
    private readonly grid: Grid,
    private readonly route: GuardRoute,
    private readonly tuning: GuardTuning,
    private readonly random: () => number = Math.random,
    androidModel: Promise<SentinelAsset> | null = null,
  ) {
    const model = createSentinelRig();
    this.rig = model.rig;
    this.body = model.rig.root;
    this.visorMaterial = model.glow;
    this.visorBaseColor = this.visorMaterial.color.clone();
    this.root.add(this.body);
    this.badge = new StatusBadge();
    this.badge.sprite.position.y = 2.45;
    this.root.add(this.badge.sprite);
    const { mesh, positions } = createVisionCone();
    this.cone = mesh;
    this.conePositions = positions;
    this.reset();
    if (androidModel) void this.attachAndroid(androidModel);
  }

  /** Vrai une fois l'androïde affiché (sinon, c'est le robot procédural). */
  get usesAndroidModel(): boolean {
    return this.android !== null;
  }

  /**
   * Remplace le robot procédural par l'androïde dès qu'il est prêt. Sans lui (tests, échec réseau), le robot
   * procédural reste affiché : le jeu est inchangé.
   */
  private async attachAndroid(androidModel: Promise<SentinelAsset>): Promise<void> {
    try {
      const asset = await androidModel;
      // Renoncé pendant le téléchargement : l'appareil est trop lent, on ne l'affiche pas à l'arrivée.
      if (this.androidDropped) return;
      const android = new SentinelAndroid(asset, this.visorMaterial);
      android.root.rotation.y = this.body.rotation.y;
      this.root.add(android.root);
      this.body.visible = false;
      // Neutralisée pendant le téléchargement (ou restaurée à terre) : directement au sol.
      if (this.neutralized) android.snapFallen();
      this.android = android;
    } catch (error) {
      console.warn("Androïde des sentinelles indisponible : le robot procédural reste affiché.", error);
    }
  }

  /**
   * Revient au robot procédural (appareil qui n'arrive plus à suivre). Sans effet si l'androïde n'est pas affiché ;
   * une sentinelle déjà neutralisée garde sa pose couchée via le robot, comme avant l'androïde.
   */
  dropAndroid(): void {
    this.androidDropped = true;
    if (!this.android) return;
    this.android.dispose();
    this.android = null;
    this.body.visible = true;
  }

  /** Mesh à ajouter séparément : le cône est en coordonnées monde, pas enfant du garde. */
  get visionCone(): THREE.Object3D {
    return this.cone;
  }

  /** En combat ou en fouille : la sentinelle sait qu'un intrus est là. */
  get isHostile(): boolean {
    return this.state === "combat" || this.state === "search";
  }

  get isSuspended(): boolean {
    return this.state === "suspended";
  }

  get suspensionSecondsLeft(): number {
    return this.isSuspended ? this.suspendedRemaining : 0;
  }

  /** Le joueur est dans son champ en ce moment (mis à jour à chaque frame). */
  get seesPlayer(): boolean {
    return this.seesPlayerNow;
  }

  /** Remet le garde en début de ronde, calme. Un garde neutralisé le reste. */
  reset(): void {
    if (this.neutralized) return;
    const firstCell = this.route.waypoints[0] as Cell;
    const secondCell = this.route.waypoints[1] ?? firstCell;
    this.position.copy(cellToWorld(firstCell));
    this.heading = Math.atan2(secondCell.z - firstCell.z, secondCell.x - firstCell.x);
    this.patrolIndex = 0;
    this.patrolDirection = 1;
    this.awareness = 0;
    this.state = "patrol";
    this.detour = [];
    this.waitTimer = 0;
    this.lastSeenCell = null;
    this.seesPlayerNow = false;
    this.fireCooldown = 0;
    this.suspendedRemaining = 0;
    this.shieldHits = 0;
    this.pendingShot = null;
    this.alarmPending = false;
    this.syncVisuals();
  }

  /** Bruit (mauvaise réponse, tir) : le garde vient vérifier la zone. Sans effet s'il est déjà en combat. */
  investigate(target: Cell): void {
    if (this.neutralized || this.isSuspended || this.isHostile) return;
    const path = findPath(this.grid, this.currentCell(), target);
    if (!path) return;
    this.state = "investigate";
    this.detour = path;
    this.detourIndex = 0;
    this.waitTimer = INVESTIGATION_WAIT_SECONDS;
  }

  /** Commande ratée contre ce garde : il sursaute et vient voir d'où ça vient. */
  alertTo(noiseCell: Cell): void {
    if (this.neutralized || this.isSuspended) return;
    // Plafonné sous 1 : le bruit attire la sentinelle mais ne déclenche pas l'alarme à lui seul.
    this.awareness = Math.min(0.9, this.awareness + NOISE_AWARENESS_BOOST);
    this.investigate(noiseCell);
  }

  /** Seule une sentinelle en service et encore calme remarque un corps : à genoux, à terre ou déjà en alerte, elle a d'autres soucis. */
  get canDiscoverBodies(): boolean {
    return !this.neutralized && !this.isSuspended && !this.isHostile;
  }

  /** Vrai si cette sentinelle voit le corps d'une autre : portée et champ de vision normaux, les murs et les racks bloquent la vue. */
  canSeeBodyOf(body: Guard): boolean {
    const deltaX = body.position.x - this.position.x;
    const deltaZ = body.position.z - this.position.z;
    if (Math.hypot(deltaX, deltaZ) > this.tuning.visionRange) return false;
    if (!this.isWithinFieldOfView(deltaX, deltaZ, this.tuning.fieldOfViewRadians)) return false;
    return hasLineOfSight(this.grid, this.position.x, this.position.z, body.position.x, body.position.z);
  }

  /** Corps découvert : la sentinelle passe en alerte et fonce vers lui, en cherchant l'intrus avec sa vue élargie. */
  discoverBody(bodyPosition: THREE.Vector3): void {
    if (!this.canDiscoverBodies) return;
    this.enterCombat(bodyPosition);
  }

  /** Alarme donnée par une autre sentinelle ou une caméra : on fonce vers la position signalée. */
  engage(position: THREE.Vector3): void {
    if (this.neutralized || this.isSuspended) return;
    if (this.state === "combat" && this.seesPlayerNow) return;
    this.enterCombat(position);
  }

  /**
   * Balle reçue. Le bouclier encaisse les premières balles des secteurs avancés,
   * puis la sentinelle est suspendue (SIGSTOP) : elle ne voit plus, ne tire plus, ne bouge plus.
   */
  takeHit(shooterPosition: THREE.Vector3): HitOutcome {
    if (this.neutralized) return "ignored";
    this.hitFlash = HIT_FLASH_SECONDS;
    this.sinceLastHit = 0;
    if (this.isSuspended) {
      // Une nouvelle balle sur une sentinelle à terre la maintient suspendue.
      this.suspendedRemaining = SUSPEND_SECONDS;
      return "suspended";
    }
    this.shieldHits++;
    if (this.shieldHits >= this.tuning.hitsToSuspend) {
      this.suspend();
      return "suspended";
    }
    // Le bouclier tient : la sentinelle sait d'où vient le tir.
    this.enterCombat(shooterPosition);
    return "shield";
  }

  /** Commande ratée pendant la suspension : le processus reprend plus vite (signal parasite). */
  shortenSuspension(seconds: number): void {
    if (!this.isSuspended) return;
    this.suspendedRemaining = Math.max(1, this.suspendedRemaining - seconds);
  }

  /** Tir à faire partir cette frame (consommé une seule fois). */
  consumeShot(): GuardShot | null {
    const shot = this.pendingShot;
    this.pendingShot = null;
    return shot;
  }

  /** Vrai une seule fois quand la sentinelle te repère elle-même : elle donne l'alarme. */
  consumeAlarm(): boolean {
    const alarm = this.alarmPending;
    this.alarmPending = false;
    return alarm;
  }

  /**
   * Neutralisation silencieuse possible : garde actif, ni en alerte ni suspendu, joueur tout proche et dans son dos.
   * Une sentinelle suspendue se termine à la commande, pas au corps à corps : c'est là qu'on apprend.
   */
  canBeTakenDownFrom(playerPosition: THREE.Vector3): boolean {
    if (this.neutralized || this.isSuspended || this.isHostile || this.awareness >= INVESTIGATION_THRESHOLD) return false;
    const deltaX = playerPosition.x - this.position.x;
    const deltaZ = playerPosition.z - this.position.z;
    const distance = Math.hypot(deltaX, deltaZ);
    if (distance > TAKEDOWN_RANGE || distance === 0) return false;
    const facingDot = (Math.cos(this.heading) * deltaX + Math.sin(this.heading) * deltaZ) / distance;
    return facingDot <= TAKEDOWN_BEHIND_COSINE;
  }

  /** `instant` : déjà au sol (restauration d'une sauvegarde), sans animation de chute. */
  neutralize(instant = false): void {
    if (this.neutralized) return;
    this.neutralized = true;
    this.bodyDiscovered = false;
    if (instant) {
      this.fallProgress = 0.999;
      this.animateFall(1);
      this.android?.snapFallen();
    }
    this.awareness = 0;
    this.seesPlayerNow = false;
    this.pendingShot = null;
    this.cone.visible = false;
    this.badge.show("none");
    this.visorMaterial.emissiveIntensity = 0;
    this.visorMaterial.color.setHex(0x331111);
  }

  /**
   * Redémarrage par la sécurité : une sentinelle neutralisée se relève sur place et fonce vers `target` (la position du joueur
   * au moment de l'alerte). Elle laisse un instant avant son premier tir. Sans effet sur une sentinelle encore en service.
   */
  reactivate(target: THREE.Vector3): void {
    if (!this.neutralized) return;
    this.neutralized = false;
    this.bodyDiscovered = false;
    this.fallProgress = 0;
    this.body.rotation.x = 0;
    this.body.position.y = 0;
    this.visorMaterial.color.copy(this.visorBaseColor);
    this.shieldHits = 0;
    this.suspendedRemaining = 0;
    this.hitFlash = 0;
    this.pendingShot = null;
    this.detour = [];
    this.enterCombat(target);
    this.fireCooldown = this.tuning.reactionSeconds * REBOOT_FIRE_DELAY_FACTOR;
  }

  /** `player` à null = joueur imperceptible (invulnérabilité de réapparition). */
  update(deltaSeconds: number, player: PlayerSnapshot | null): boolean {
    if (this.neutralized) {
      this.animateFall(deltaSeconds);
      return false;
    }
    this.hitFlash = Math.max(0, this.hitFlash - deltaSeconds);
    this.sinceLastHit += deltaSeconds;
    if (this.sinceLastHit > SHIELD_RESET_SECONDS && !this.isSuspended) this.shieldHits = 0;

    if (this.isSuspended) {
      this.seesPlayerNow = false;
      this.suspendedRemaining -= deltaSeconds;
      if (this.suspendedRemaining <= 0) this.wake(player);
      this.syncVisuals(deltaSeconds);
      return false;
    }

    const seesPlayer = player !== null && (this.isHostile ? this.canSeeWhileHostile(player) : this.canPerceive(player));
    this.seesPlayerNow = seesPlayer;
    if (this.isHostile) {
      this.updateCombat(deltaSeconds, seesPlayer ? player : null);
    } else {
      this.updateAwareness(deltaSeconds, seesPlayer ? player : null);
      if (this.awareness >= 1 && player) {
        this.enterCombat(player.position);
        this.alarmPending = true;
      } else {
        this.updateCalmState(deltaSeconds, seesPlayer ? player : null);
      }
    }
    this.syncVisuals(deltaSeconds);
    return seesPlayer;
  }

  private updateCalmState(deltaSeconds: number, seenPlayer: PlayerSnapshot | null): void {
    switch (this.state) {
      case "patrol":
        this.updatePatrol(deltaSeconds);
        break;
      case "suspicious":
        this.updateSuspicious(deltaSeconds, seenPlayer);
        break;
      case "investigate":
        this.updateInvestigate(deltaSeconds);
        break;
      case "returning":
        if (this.followDetour(deltaSeconds)) this.state = "patrol";
        break;
      default:
        break;
    }
  }

  private enterCombat(target: THREE.Vector3): void {
    const wasEngaged = this.state === "combat" && this.lostSightSeconds < REACQUIRE_AFTER_SECONDS;
    this.state = "combat";
    this.awareness = 1;
    this.lastKnownPosition.set(target.x, 0, target.z);
    this.lostSightSeconds = 0;
    this.repathTimer = 0;
    if (!wasEngaged) this.fireCooldown = Math.max(this.fireCooldown, this.tuning.reactionSeconds);
  }

  private suspend(): void {
    this.state = "suspended";
    this.suspendedRemaining = SUSPEND_SECONDS;
    this.awareness = 0;
    this.seesPlayerNow = false;
    this.pendingShot = null;
    this.detour = [];
  }

  /** Fin de la suspension : le processus reprend (SIGCONT) et la sentinelle se relève, furieuse. */
  private wake(player: PlayerSnapshot | null): void {
    this.shieldHits = 0;
    this.state = "patrol";
    this.enterCombat(player?.position ?? this.position);
    // Elle se relève : un peu plus de temps avant son premier tir.
    this.fireCooldown = this.tuning.reactionSeconds * 1.5;
  }

  private updateCombat(deltaSeconds: number, seenPlayer: PlayerSnapshot | null): void {
    this.fireCooldown = Math.max(0, this.fireCooldown - deltaSeconds);
    this.repathTimer -= deltaSeconds;
    if (seenPlayer) {
      if (this.lostSightSeconds > REACQUIRE_AFTER_SECONDS) this.fireCooldown = Math.max(this.fireCooldown, this.tuning.reactionSeconds * 0.6);
      this.state = "combat";
      this.lostSightSeconds = 0;
      this.lastKnownPosition.set(seenPlayer.position.x, 0, seenPlayer.position.z);
      const distance = Math.hypot(seenPlayer.position.x - this.position.x, seenPlayer.position.z - this.position.z);
      if (distance > COMBAT_STANDOFF) this.chase(deltaSeconds, this.lastKnownPosition);
      const angleToPlayer = Math.atan2(seenPlayer.position.z - this.position.z, seenPlayer.position.x - this.position.x);
      this.heading = turnTowards(this.heading, angleToPlayer, deltaSeconds * COMBAT_TURN_SPEED);
      const misalignment = Math.abs(Math.atan2(Math.sin(angleToPlayer - this.heading), Math.cos(angleToPlayer - this.heading)));
      if (this.fireCooldown === 0 && misalignment <= FIRE_ALIGNMENT_RADIANS) this.fire(angleToPlayer);
      return;
    }

    this.lostSightSeconds += deltaSeconds;
    if (this.state === "combat") {
      // Plus de contact : on file à la dernière position connue, puis on fouille.
      if (this.chase(deltaSeconds, this.lastKnownPosition)) {
        this.state = "search";
        this.searchTimer = SEARCH_SECONDS;
      }
      return;
    }
    this.heading += deltaSeconds * 2.2;
    this.searchTimer -= deltaSeconds;
    if (this.searchTimer <= 0) {
      // Fausse alerte (pour elle) : reste méfiante un moment, puis retourne à sa ronde.
      this.awareness = 0.45;
      this.returnToPatrol();
    }
  }

  private fire(angleToPlayer: number): void {
    const error = (this.random() * 2 - 1) * this.tuning.aimErrorRadians;
    this.pendingShot = {
      x: this.position.x + Math.cos(this.heading) * MUZZLE_OFFSET,
      z: this.position.z + Math.sin(this.heading) * MUZZLE_OFFSET,
      angle: angleToPlayer + error,
    };
    this.android?.playShot();
    this.fireCooldown = this.tuning.fireIntervalSeconds * (0.8 + this.random() * 0.4);
  }

  /** Poursuite par le plus court chemin, recalculé régulièrement. Renvoie true une fois sur place. */
  private chase(deltaSeconds: number, target: THREE.Vector3): boolean {
    const targetCell = { x: Math.floor(target.x), z: Math.floor(target.z) };
    if (this.repathTimer <= 0 || this.detour.length === 0) {
      this.detour = findPath(this.grid, this.currentCell(), targetCell) ?? [];
      this.detourIndex = 0;
      this.repathTimer = REPATH_SECONDS;
    }
    return this.followDetour(deltaSeconds);
  }

  private canPerceive(player: PlayerSnapshot): boolean {
    const deltaX = player.position.x - this.position.x;
    const deltaZ = player.position.z - this.position.z;
    const distance = Math.hypot(deltaX, deltaZ);
    const hasSight = (): boolean =>
      hasLineOfSight(this.grid, this.position.x, this.position.z, player.position.x, player.position.z);

    if (player.posture === "running" && player.isMoving && distance < HEARING_RADIUS_RUNNING) return hasSight();

    const effectiveRange = this.tuning.visionRange * POSTURE_VISIBILITY[player.posture];
    if (distance > effectiveRange) return false;
    if (!this.isWithinFieldOfView(deltaX, deltaZ, this.tuning.fieldOfViewRadians)) return false;
    return hasSight();
  }

  /** En alerte : vue plus longue et plus large, la posture ne trompe plus personne. */
  private canSeeWhileHostile(player: PlayerSnapshot): boolean {
    const deltaX = player.position.x - this.position.x;
    const deltaZ = player.position.z - this.position.z;
    if (Math.hypot(deltaX, deltaZ) > this.hostileRange) return false;
    if (!this.isWithinFieldOfView(deltaX, deltaZ, this.hostileFieldOfView)) return false;
    return hasLineOfSight(this.grid, this.position.x, this.position.z, player.position.x, player.position.z);
  }

  private get hostileRange(): number {
    return this.tuning.visionRange * HOSTILE_RANGE_FACTOR;
  }

  private get hostileFieldOfView(): number {
    return Math.min(Math.PI * 1.5, this.tuning.fieldOfViewRadians * HOSTILE_FOV_FACTOR);
  }

  private isWithinFieldOfView(deltaX: number, deltaZ: number, fieldOfView: number): boolean {
    const angleToPlayer = Math.atan2(deltaZ, deltaX);
    const angleDifference = Math.abs(Math.atan2(Math.sin(angleToPlayer - this.heading), Math.cos(angleToPlayer - this.heading)));
    return angleDifference <= fieldOfView / 2;
  }

  private updateAwareness(deltaSeconds: number, seenPlayer: PlayerSnapshot | null): void {
    if (seenPlayer) {
      const player = seenPlayer;
      const distance = Math.hypot(player.position.x - this.position.x, player.position.z - this.position.z);
      const closeness = 1 - Math.min(distance / this.tuning.visionRange, 1);
      // Plus le joueur est proche, plus la détection est rapide : on laisse une chance à distance.
      this.awareness += deltaSeconds * this.tuning.detectionRate * (0.55 + 1.5 * closeness);
      this.lastSeenCell = { x: Math.floor(player.position.x), z: Math.floor(player.position.z) };
      if (this.awareness >= SUSPICION_THRESHOLD && this.state !== "suspicious") this.state = "suspicious";
    } else {
      this.awareness -= deltaSeconds * AWARENESS_DECAY_PER_SECOND;
    }
    this.awareness = THREE.MathUtils.clamp(this.awareness, 0, 1);
  }

  private updatePatrol(deltaSeconds: number): void {
    if (this.waitTimer > 0) {
      this.waitTimer -= deltaSeconds;
      // Balayage du regard pendant la pause : les extrémités de ronde restent dangereuses.
      this.heading += Math.sin(this.waitTimer * 2.4) * deltaSeconds * 1.6;
      return;
    }
    const target = this.route.waypoints[this.patrolIndex] as Cell;
    if (!this.moveTowards(target, deltaSeconds)) return;

    const lastIndex = this.route.waypoints.length - 1;
    const nextIndex = this.patrolIndex + this.patrolDirection;
    if (nextIndex < 0 || nextIndex > lastIndex) {
      this.patrolDirection = this.patrolDirection === 1 ? -1 : 1;
      this.waitTimer = PATROL_PAUSE_SECONDS;
    }
    this.patrolIndex = THREE.MathUtils.clamp(this.patrolIndex + this.patrolDirection, 0, lastIndex);
  }

  private updateSuspicious(deltaSeconds: number, seenPlayer: PlayerSnapshot | null): void {
    if (seenPlayer) {
      const player = seenPlayer;
      const angleToPlayer = Math.atan2(player.position.z - this.position.z, player.position.x - this.position.x);
      this.heading = turnTowards(this.heading, angleToPlayer, deltaSeconds * 4);
      return;
    }
    if (this.awareness >= INVESTIGATION_THRESHOLD && this.lastSeenCell) {
      this.investigate(this.lastSeenCell);
      return;
    }
    if (this.awareness <= 0) this.returnToPatrol();
  }

  private updateInvestigate(deltaSeconds: number): void {
    if (!this.followDetour(deltaSeconds)) return;
    this.waitTimer -= deltaSeconds;
    this.heading += deltaSeconds * 1.8;
    if (this.waitTimer <= 0) this.returnToPatrol();
  }

  private returnToPatrol(): void {
    const target = this.route.waypoints[this.patrolIndex] as Cell;
    const path = findPath(this.grid, this.currentCell(), target);
    this.detour = path ?? [];
    this.detourIndex = 0;
    this.state = path ? "returning" : "patrol";
  }

  /** Avance le long du détour ; renvoie true une fois arrivé au bout. */
  private followDetour(deltaSeconds: number): boolean {
    const target = this.detour[this.detourIndex];
    if (!target) return true;
    if (this.moveTowards(target, deltaSeconds)) this.detourIndex++;
    return this.detourIndex >= this.detour.length;
  }

  /** Renvoie true si la cible est atteinte. */
  private moveTowards(cell: Cell, deltaSeconds: number): boolean {
    const targetX = cell.x + 0.5;
    const targetZ = cell.z + 0.5;
    const deltaX = targetX - this.position.x;
    const deltaZ = targetZ - this.position.z;
    const distance = Math.hypot(deltaX, deltaZ);
    if (distance < ARRIVAL_EPSILON) return true;
    const speedFactor = this.isHostile ? HOSTILE_SPEED_FACTOR : this.state === "investigate" ? 1.35 : 1;
    const step = Math.min(distance, this.tuning.walkSpeed * speedFactor * deltaSeconds);
    this.position.x += (deltaX / distance) * step;
    this.position.z += (deltaZ / distance) * step;
    this.heading = turnTowards(this.heading, Math.atan2(deltaZ, deltaX), deltaSeconds * 6);
    return step >= distance - ARRIVAL_EPSILON;
  }

  private animateFall(deltaSeconds: number): void {
    // L'androïde a sa propre animation d'effondrement.
    this.android?.update(deltaSeconds, { speed: 0, hostile: false, aim: 0, pose: "fallen" });
    if (this.fallProgress >= 1) return;
    this.fallProgress = Math.min(1, this.fallProgress + deltaSeconds * FALL_SPEED * (0.4 + this.fallProgress));
    // Bascule vers l'arrière autour des pieds, comme un robot qui s'effondre.
    this.body.rotation.x = -this.fallProgress * (Math.PI / 2);
    this.body.position.y = this.fallProgress * 0.18;
  }

  private currentCell(): Cell {
    return { x: Math.floor(this.position.x), z: Math.floor(this.position.z) };
  }

  private syncVisuals(deltaSeconds = 0): void {
    const travelled = Math.hypot(this.position.x - this.lastPosition.x, this.position.z - this.lastPosition.z);
    this.lastPosition.copy(this.position);
    if (deltaSeconds > 0) {
      // La foulée suit la vitesse réelle : pause en bout de ronde = jambes immobiles.
      const speed = travelled / deltaSeconds;
      this.groundSpeed += (speed - this.groundSpeed) * (1 - Math.exp(-deltaSeconds * 8));
      this.walkPhase += travelled * 5.5;
      const smoothing = 1 - Math.exp(-deltaSeconds * 8);
      this.stride += (Math.min(1, speed / 2) - this.stride) * smoothing;
      this.aimAmount += ((this.isHostile ? (this.seesPlayerNow ? 1 : 0.5) : 0) - this.aimAmount) * smoothing;
      this.kneelAmount += ((this.isSuspended ? 1 : 0) - this.kneelAmount) * smoothing;
      poseRig(this.rig, this.walkPhase, this.stride * (1 - this.kneelAmount), this.kneelAmount, this.aimAmount * (1 - this.kneelAmount));
      // À genoux, tête basse : on lit tout de suite qu'elle est hors d'état de nuire.
      this.rig.head.rotation.x = this.kneelAmount * 0.6;
    }
    this.root.position.copy(this.position);
    // Le modèle regarde vers +Z : conversion du cap mathématique vers la rotation Y de Three.js.
    this.body.rotation.y = Math.PI / 2 - this.heading;
    if (this.android && deltaSeconds > 0) {
      this.android.root.rotation.y = this.body.rotation.y;
      this.android.update(deltaSeconds, {
        speed: this.groundSpeed,
        hostile: this.isHostile,
        aim: this.aimAmount * (1 - this.kneelAmount),
        pose: this.isSuspended ? "kneel" : null,
      });
    }
    this.syncVisor();
    this.badge.show(this.badgeKind(), this.suspendedRemaining / SUSPEND_SECONDS);
    this.updateCone();
  }

  private syncVisor(): void {
    if (this.hitFlash > 0) {
      this.visorMaterial.emissive.copy(HIT_FLASH_COLOR);
      this.visorMaterial.emissiveIntensity = 6;
      return;
    }
    this.visorMaterial.emissive.copy(this.isSuspended ? SUSPENDED_VISOR_COLOR : VISOR_COLOR);
    // Suspendue : la visière clignote comme un processus figé ; plus vite quand elle va se relever.
    const blinkRate = this.suspendedRemaining < 3 ? 14 : 5;
    this.visorMaterial.emissiveIntensity = this.isSuspended ? (Math.sin(performance.now() * 0.001 * blinkRate) > 0 ? 3 : 0.6) : 3;
  }

  private badgeKind(): BadgeKind {
    if (this.isSuspended) return "suspended";
    if (this.state === "combat") return "combat";
    if (this.state === "search" || this.state === "suspicious" || this.state === "investigate") return "suspicious";
    return "none";
  }

  private updateCone(): void {
    this.cone.visible = !this.isSuspended;
    if (!this.cone.visible) return;
    const hostile = this.isHostile;
    const fieldOfView = hostile ? this.hostileFieldOfView : this.tuning.fieldOfViewRadians;
    const range = hostile ? this.hostileRange : this.tuning.visionRange;
    for (let segment = 0; segment <= CONE_SEGMENTS; segment++) {
      const angle = this.heading - fieldOfView / 2 + (fieldOfView * segment) / CONE_SEGMENTS;
      const reach = castRay(this.grid, this.position.x, this.position.z, angle, range);
      const offset = (segment + 1) * 3;
      this.conePositions[offset] = Math.cos(angle) * reach;
      this.conePositions[offset + 2] = Math.sin(angle) * reach;
    }
    const geometry = this.cone.geometry;
    (geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    geometry.computeBoundingSphere();
    this.cone.position.set(this.position.x, 0.04, this.position.z);
    this.cone.material.color.copy(CALM_CONE_COLOR).lerp(ALERT_CONE_COLOR, this.awareness);
    this.cone.material.opacity = hostile ? 0.2 : 0.32 + this.awareness * 0.4;
  }
}

type BadgeKind = "none" | "suspicious" | "combat" | "suspended";

const BADGE_SIZE_PX = 128;
/** Le compte à rebours est redessiné par crans : inutile de régénérer la texture à chaque frame. */
const BADGE_STEPS = 40;

/**
 * Pictogramme au-dessus de la sentinelle, lisible d'un coup d'œil comme dans les jeux d'infiltration :
 * « ? » méfiante, « ! » en combat, « ⏸ » + anneau qui se vide quand elle est suspendue.
 */
class StatusBadge {
  readonly sprite: THREE.Sprite;
  /** null hors navigateur (tests unitaires sous Node) : la logique du garde ne dépend pas du pictogramme. */
  private readonly canvas: HTMLCanvasElement | null;
  private readonly texture: THREE.CanvasTexture | null;
  private lastKey = "";

  constructor() {
    this.canvas = typeof document === "undefined" ? null : document.createElement("canvas");
    this.texture = this.canvas ? createBadgeTexture(this.canvas) : null;
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.texture, transparent: true, depthWrite: false }));
    this.sprite.scale.set(0.9, 0.9, 1);
    this.sprite.visible = false;
  }

  show(kind: BadgeKind, progress = 0): void {
    const step = kind === "suspended" ? Math.ceil(THREE.MathUtils.clamp(progress, 0, 1) * BADGE_STEPS) : 0;
    const key = `${kind}:${step}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    this.sprite.visible = kind !== "none" && this.texture !== null;
    if (kind === "none" || !this.canvas || !this.texture) return;
    const context = this.canvas.getContext("2d");
    if (!context) return;
    const center = BADGE_SIZE_PX / 2;
    context.clearRect(0, 0, BADGE_SIZE_PX, BADGE_SIZE_PX);
    context.lineWidth = 10;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = "bold 76px system-ui, sans-serif";
    if (kind === "suspended") {
      context.strokeStyle = "rgba(79, 195, 255, 0.25)";
      context.beginPath();
      context.arc(center, center, 50, 0, Math.PI * 2);
      context.stroke();
      context.strokeStyle = "#4fc3ff";
      context.beginPath();
      context.arc(center, center, 50, -Math.PI / 2, -Math.PI / 2 + (step / BADGE_STEPS) * Math.PI * 2);
      context.stroke();
      context.fillStyle = "#4fc3ff";
      context.fillRect(center - 22, center - 26, 14, 52);
      context.fillRect(center + 8, center - 26, 14, 52);
    } else {
      context.fillStyle = kind === "combat" ? "#ff2d2d" : "#ffd54a";
      context.fillText(kind === "combat" ? "!" : "?", center, center + 4);
    }
    this.texture.needsUpdate = true;
  }
}

function createBadgeTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  canvas.width = BADGE_SIZE_PX;
  canvas.height = BADGE_SIZE_PX;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function turnTowards(current: number, target: number, maxStep: number): number {
  const difference = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  if (Math.abs(difference) <= maxStep) return target;
  return current + Math.sign(difference) * maxStep;
}

function createVisionCone(): { mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>; positions: Float32Array } {
  // Éventail : sommet au centre (index 0) puis CONE_SEGMENTS + 1 points sur l'arc.
  const vertexCount = CONE_SEGMENTS + 2;
  const positions = new Float32Array(vertexCount * 3);
  // Couleur RGBA par sommet : opaque près du garde, transparent au bout du regard (dégradé gratuit).
  const colors = new Float32Array(vertexCount * 4);
  for (let vertex = 0; vertex < vertexCount; vertex++) {
    colors.set([1, 1, 1, vertex === 0 ? 1 : 0.08], vertex * 4);
  }
  const indices: number[] = [];
  for (let segment = 1; segment <= CONE_SEGMENTS; segment++) indices.push(0, segment + 1, segment);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 4));
  geometry.setIndex(indices);
  const material = new THREE.MeshBasicMaterial({
    color: CALM_CONE_COLOR,
    vertexColors: true,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  return { mesh: new THREE.Mesh(geometry, material), positions };
}
