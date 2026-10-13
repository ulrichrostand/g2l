import { t } from "../i18n/messages/entities";
import * as THREE from "three";
import { BossAndroid } from "./bossAndroid";
import type { SentinelAsset } from "./sentinelAndroid";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  BURST_SHOT_COUNT,
  BURST_SPACING_RADIANS,
  FAN_ARC_RADIANS,
  bossTuning,
  isAimedPattern,
  isSequencedPattern,
  patternAngles,
  patternForPhase,
  patternShotCount,
  type BossPattern,
  type BossTuning,
} from "../combat/bossPatterns";
import { castRay, hasLineOfSight, type Cell, type Grid } from "../core/grid";
import type { Room } from "../level/generator";

/**
 * dormant : éteint, il attend qu'on entre dans son arène ;
 * awakening : il se dresse et s'illumine (invulnérable) ;
 * fighting : il tire des salves annoncées, son armure encaisse les balles ;
 * exposed : armure à zéro, à genoux, cœur bleu clignotant : c'est le moment de taper la commande ;
 * defeated : la 3e commande l'a achevé, il s'effondre.
 */
export type BossState = "dormant" | "awakening" | "fighting" | "exposed" | "defeated";

/** Tir demandé par le boss : la mission crée le projectile (le boss ne connaît pas la scène). */
export interface BossShot {
  x: number;
  z: number;
  angle: number;
  speed: number;
}

export interface BossOptions {
  name: string;
  /** Couleur du boss (0xRRGGBB) : armure, visière, bouclier. */
  color: number;
  /** Index du module (0..15) : règle l'armure, la cadence et la vitesse des balles. */
  level: number;
  /** Salle que le boss ne quitte jamais (il garde une case de marge avec les murs). */
  arena: Room;
  random?: () => number;
  /** Androïde riggé (le même que les sentinelles) ; absent ou en échec : colosse procédural. */
  androidModel?: Promise<SentinelAsset> | null;
}

const PHASE_COUNT = 3;
const AWAKENING_SECONDS = 2;
/** Après le réveil : un temps pour comprendre ce qui se passe avant la toute première salve. */
const FIRST_VOLLEY_DELAY_SECONDS = 1;
/** Après une phase gagnée ou une exposition ratée : le temps de se relever et de se remettre à couvert. */
const RECOVERY_VOLLEY_DELAY_SECONDS = 1.5;
const RECOVERED_ARMOR_FRACTION = 0.5;
const COMMAND_FAILURE_PENALTY_SECONDS = 3;
const MIN_EXPOSED_SECONDS = 1;
const BURST_GAP_SECONDS = 0.14;
const SPIRAL_GAP_SECONDS = 0.05;
/** Salve visée avortée (le joueur a plongé à couvert pendant l'annonce) : nouvel essai peu après. */
const FIZZLE_RETRY_SECONDS = 0.5;
/** Un motif visé bloqué (joueur caché) cède la place au suivant : se terrer ne suffit pas en phase 3. */
const BLOCKED_PATTERN_SKIP_SECONDS = 1.2;
/** Au-delà, il ne vise plus : un joueur qui a quitté l'arène par un long couloir n'est plus sa cible. */
const SIGHT_RANGE = 16;
const HIT_RADIUS = 0.75;
/** Corps solide = silhouette touchable : ce qui arrête les balles du joueur arrête aussi le joueur. */
const BODY_RADIUS = HIT_RADIUS;
/** Les balles partent du torse, hors de la silhouette du boss. */
const MUZZLE_OFFSET = 0.85;
/**
 * Joueur collé au boss : la balle naît à cette distance avant lui sur sa trajectoire, sinon elle naîtrait
 * dans son dos et le raterait. Un peu plus que sa silhouette (0,3 dans la mission) : touché dès la 1re frame.
 */
const POINT_BLANK_MARGIN = 0.4;
/** Une balle ne doit jamais naître dans une caisse collée au boss. */
const MUZZLE_WALL_GAP = 0.05;
const ARENA_MARGIN = 1;
/** Face à la caméra (+Z) au repos : en entrant dans l'arène, on voit tout de suite son cœur. */
const DEFAULT_HEADING = Math.PI / 2;
const TURN_SPEED = 3.2;
const PREFERRED_DISTANCE = 5;
const STRAFE_STRIDE = 2.5;
const STRAFE_CANDIDATES = 6;
const MIN_STRAFE_DISTANCE = 0.9;
/** Part de l'écart à la bonne distance corrigée à chaque déplacement : il recule si on le colle. */
const RADIAL_CORRECTION = 0.6;
const STRAFE_FLIP_CHANCE = 0.3;
const STRAFE_PAUSE_MIN_SECONDS = 1.1;
const STRAFE_PAUSE_MAX_SECONDS = 2.4;
/** Pénalités du choix de case : voir le joueur compte plus que la distance idéale. */
const NO_SIGHT_PENALTY = 10;
const OTHER_SIDE_PENALTY = 0.75;
/** Demi-largeur du corps : le couloir entier doit être libre, pas seulement l'axe. */
const BODY_HALF_WIDTH = 0.35;
const ARRIVAL_EPSILON = 0.05;
const HIT_FLASH_SECONDS = 0.12;
const COLLAPSE_SECONDS = 1.6;

interface ArenaBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Tout ce que le modèle 3D doit savoir pour se dessiner : rempli à chaque frame, jamais réalloué. */
interface BossVisualState {
  state: BossState;
  heading: number;
  /** Avancement du réveil ∈ [0, 1]. */
  awakening: number;
  /** Avancement de l'effondrement ∈ [0, 1]. */
  collapse: number;
  /** Charge du télégraphe ∈ [0, 1] ; 1 pendant l'émission d'une salve. */
  charge: number;
  telegraphPattern: BossPattern | null;
  aimAngle: number;
  armorPoints: number;
  armorMax: number;
  phase: number;
  exposedRemaining: number;
  exposedTotal: number;
  hitFlash: number;
  clock: number;
}

export class Boss {
  readonly root = new THREE.Group();
  readonly position = new THREE.Vector3();
  readonly hitRadius = HIT_RADIUS;
  /** Rayon du corps solide : voir pushOutOfBody. */
  readonly bodyRadius = BODY_RADIUS;
  readonly phaseCount: 3 = PHASE_COUNT;

  private readonly tuning: BossTuning;
  private readonly level: number;
  private readonly random: () => number;
  private readonly bounds: ArenaBounds;
  private readonly home = new THREE.Vector3();
  private readonly model: BossModel;
  private androidDropped = false;
  private readonly visual: BossVisualState;

  private currentState: BossState = "dormant";
  private phase = 0;
  private armor = 0;
  /** Cap en convention mathématique : direction = (cos, sin) dans le plan XZ. */
  private heading = DEFAULT_HEADING;
  private aimAngle = DEFAULT_HEADING;
  private stateSeconds = 0;
  private exposedRemaining = 0;
  private volleyCooldown = 0;
  private telegraphRemaining = 0;
  private telegraphPattern: BossPattern = "burst";
  private volleyIndex = 0;
  private blockedSeconds = 0;
  /** Salve émise balle par balle (rafale, spirale) : angles restants et cadence. */
  private readonly sequenceAngles: number[] = [];
  private sequenceNext = 0;
  private sequenceTimer = 0;
  private sequenceGap = 0;
  /**
   * Deux files alternées : consumeShots rend l'une pendant que l'autre se remplit. Pas d'allocation
   * par frame, et le tableau rendu reste à l'appelant (modifiable) jusqu'à l'appel suivant.
   */
  private pendingShots: BossShot[] = [];
  private deliveredShots: BossShot[] = [];
  /** Distance au joueur à cette frame (Infinity s'il est imperceptible) : règle la bouche des tirs à bout portant. */
  private playerDistance = Infinity;
  private readonly moveTarget = new THREE.Vector3();
  private hasMoveTarget = false;
  private strafePause = 0;
  private strafeSide: 1 | -1 = 1;
  private hitFlash = 0;
  private clock = 0;

  constructor(
    private readonly grid: Grid,
    options: BossOptions,
  ) {
    const { arena } = options;
    if (![arena.x, arena.z, arena.width, arena.height].every(Number.isInteger) || arena.width <= 0 || arena.height <= 0) {
      throw new RangeError(`Boss : arène invalide (${arena.x}, ${arena.z}, ${arena.width}×${arena.height})`);
    }
    this.level = Number.isFinite(options.level) ? options.level : 0;
    this.tuning = bossTuning(this.level);
    this.random = options.random ?? Math.random;
    const name = typeof options.name === "string" && options.name.trim() !== "" ? options.name.trim() : "Boss";
    const color = Number.isInteger(options.color) && options.color >= 0 && options.color <= 0xffffff ? options.color : DEFAULT_BOSS_COLOR;

    const placement = placeInArena(grid, arena);
    this.bounds = placement.bounds;
    this.home.set(placement.home.x + 0.5, 0, placement.home.z + 0.5);

    this.model = new BossModel(name, color);
    this.root.add(this.model.group);
    if (options.androidModel) void this.attachAndroid(options.androidModel);
    this.visual = {
      state: "dormant",
      heading: DEFAULT_HEADING,
      awakening: 0,
      collapse: 0,
      charge: 0,
      telegraphPattern: null,
      aimAngle: DEFAULT_HEADING,
      armorPoints: 0,
      armorMax: 1,
      phase: 0,
      exposedRemaining: 0,
      exposedTotal: this.tuning.exposedSeconds,
      hitFlash: 0,
      clock: 0,
    };
    this.reset();
  }

  /** Vrai une fois le corps androïde affiché (sinon, c'est le colosse procédural). */
  get usesAndroidModel(): boolean {
    return this.model.usesAndroid;
  }

  /** Revient au colosse procédural, et empêche l'androïde de s'afficher s'il arrive après coup. */
  dropAndroid(): void {
    this.androidDropped = true;
    this.model.dropAndroid();
  }

  private async attachAndroid(androidModel: Promise<SentinelAsset>): Promise<void> {
    try {
      const asset = await androidModel;
      if (!this.androidDropped) this.model.attachAndroid(asset);
    } catch (error) {
      console.warn("Androïde du boss indisponible : le colosse procédural reste affiché.", error);
    }
  }

  get state(): BossState {
    return this.currentState;
  }

  /** Phase en cours (0..2) ; reste sur la dernière une fois le boss vaincu. */
  get phaseIndex(): number {
    return this.phase;
  }

  /** Armure restante ∈ [0, 1] : 0 quand il est exposé ou vaincu. */
  get armorFraction(): number {
    return this.armorMax > 0 ? this.armor / this.armorMax : 0;
  }

  get exposedSecondsLeft(): number {
    return this.currentState === "exposed" ? Math.max(0, this.exposedRemaining) : 0;
  }

  /** Une balle peut l'atteindre : seulement en combat (le réveil et la mise à genoux sont des temps morts). */
  get isTargetable(): boolean {
    return this.currentState === "fighting";
  }

  /** Le joueur est entré dans l'arène : le boss se dresse. Sans effet s'il est déjà réveillé. */
  awaken(): void {
    if (this.currentState !== "dormant") return;
    this.currentState = "awakening";
    this.stateSeconds = 0;
  }

  /** `player` à null = joueur imperceptible (invulnérabilité de réapparition) : ni visée ni nouvelle salve. */
  update(deltaSeconds: number, player: { position: THREE.Vector3 } | null): void {
    // Un pas de temps invalide (onglet en arrière-plan, NaN) ne doit ni figer ni téléporter le boss.
    const step = Number.isFinite(deltaSeconds) && deltaSeconds > 0 ? deltaSeconds : 0;
    this.clock += step;
    this.hitFlash = Math.max(0, this.hitFlash - step);
    switch (this.currentState) {
      case "dormant":
        break;
      case "awakening":
        this.stateSeconds += step;
        if (player) this.faceTowards(player.position, step);
        if (this.stateSeconds >= AWAKENING_SECONDS) this.enterFighting(FIRST_VOLLEY_DELAY_SECONDS);
        break;
      case "fighting":
        this.updateFighting(step, player);
        break;
      case "exposed":
        this.exposedRemaining -= step;
        if (this.exposedRemaining <= 0) this.recoverArmor();
        break;
      case "defeated":
        this.stateSeconds += step;
        break;
    }
    this.syncVisuals(step);
  }

  /** Balle du joueur. L'armure encaisse ; la dernière balle met le boss à genoux. */
  takeHit(): "armor" | "exposed" | "ignored" {
    if (this.currentState !== "fighting") return "ignored";
    this.hitFlash = HIT_FLASH_SECONDS;
    this.armor = Math.max(0, this.armor - 1);
    if (this.armor > 0) return "armor";
    this.expose();
    return "exposed";
  }

  /**
   * Tirs à faire partir (vide la file). Le tableau appartient à l'appelant jusqu'au prochain appel,
   * qui le recycle : le parcourir ou le copier tout de suite, ne pas le garder d'une frame à l'autre.
   */
  consumeShots(): BossShot[] {
    const shots = this.pendingShots;
    this.pendingShots = this.deliveredShots;
    // Ce que l'appelant a pu y ajouter à l'appel précédent ne doit pas repartir comme tir du boss.
    this.pendingShots.length = 0;
    this.deliveredShots = shots;
    return shots;
  }

  /**
   * Repousse un cercle (le joueur) hors du corps du boss : on ne traverse pas un robot de 3 m, et on ne
   * s'abrite pas dans sa silhouette. À appeler à chaque frame après les déplacements. Ne pousse jamais
   * dans un mur ou une caisse : renvoie false sans rien toucher si la place est prise ou s'il n'y a rien à faire.
   * L'épave du boss vaincu ne bloque plus le passage (la sortie peut être derrière).
   */
  pushOutOfBody(position: THREE.Vector3, radius: number): boolean {
    if (this.currentState === "defeated") return false;
    const safeRadius = Number.isFinite(radius) && radius > 0 ? radius : 0;
    const minimumDistance = BODY_RADIUS + safeRadius;
    let awayX = position.x - this.position.x;
    let awayZ = position.z - this.position.z;
    const distance = Math.hypot(awayX, awayZ);
    if (!(distance < minimumDistance)) return false;
    if (distance < 1e-6) {
      // Pile au centre : aucune direction naturelle, on le sort devant le boss (là où il regarde).
      awayX = Math.cos(this.heading);
      awayZ = Math.sin(this.heading);
    } else {
      awayX /= distance;
      awayZ /= distance;
    }
    const pushedX = this.position.x + awayX * minimumDistance;
    const pushedZ = this.position.z + awayZ * minimumDistance;
    if (!isCircleWalkable(this.grid, pushedX, pushedZ, safeRadius)) return false;
    position.x = pushedX;
    position.z = pushedZ;
    return true;
  }

  /** Bonne commande tapée pendant l'exposition : phase suivante, ou victoire après la 3e. */
  completePhase(): "next" | "defeated" {
    if (this.currentState !== "exposed") {
      throw new Error(`Boss.completePhase() : impossible dans l'état « ${this.currentState} », le boss doit être exposé (à genoux)`);
    }
    this.exposedRemaining = 0;
    if (this.phase >= PHASE_COUNT - 1) {
      this.currentState = "defeated";
      this.stateSeconds = 0;
      this.armor = 0;
      this.hasMoveTarget = false;
      return "defeated";
    }
    this.phase++;
    this.armor = this.armorMax;
    this.volleyIndex = 0;
    this.enterFighting(RECOVERY_VOLLEY_DELAY_SECONDS);
    return "next";
  }

  /** Commande ratée pendant l'exposition : il se relève plus tôt, sans que la fenêtre passe sous 1 s. */
  commandFailed(): void {
    if (this.currentState !== "exposed") return;
    // Math.min : une fenêtre déjà sous 1 s ne doit pas être rallongée par une erreur.
    this.exposedRemaining = Math.min(this.exposedRemaining, Math.max(MIN_EXPOSED_SECONDS, this.exposedRemaining - COMMAND_FAILURE_PENALTY_SECONDS));
  }

  /** Le joueur est tombé : le boss se rendort au centre de l'arène, phase 1, armure pleine. */
  reset(): void {
    this.currentState = "dormant";
    this.phase = 0;
    this.armor = this.armorMax;
    this.position.copy(this.home);
    this.heading = DEFAULT_HEADING;
    this.aimAngle = DEFAULT_HEADING;
    this.stateSeconds = 0;
    this.exposedRemaining = 0;
    this.volleyIndex = 0;
    this.hitFlash = 0;
    this.playerDistance = Infinity;
    this.cancelAttack();
    this.pendingShots.length = 0;
    this.hasMoveTarget = false;
    this.strafePause = 0;
    this.syncVisuals(0);
  }

  private get armorMax(): number {
    return this.tuning.armorPerPhase[this.phase] as number;
  }

  private get isEmitting(): boolean {
    return this.sequenceNext < this.sequenceAngles.length;
  }

  private enterFighting(volleyDelaySeconds: number): void {
    this.currentState = "fighting";
    this.stateSeconds = 0;
    this.cancelAttack();
    this.volleyCooldown = volleyDelaySeconds;
    this.strafePause = 0;
  }

  private expose(): void {
    this.currentState = "exposed";
    this.exposedRemaining = this.tuning.exposedSeconds;
    this.cancelAttack();
    this.pendingShots.length = 0;
    this.hasMoveTarget = false;
  }

  /** L'exposition n'a pas été exploitée : il se relève avec la moitié de son armure. */
  private recoverArmor(): void {
    this.exposedRemaining = 0;
    this.armor = Math.max(1, Math.ceil(this.armorMax * RECOVERED_ARMOR_FRACTION));
    this.enterFighting(RECOVERY_VOLLEY_DELAY_SECONDS);
  }

  private cancelAttack(): void {
    this.telegraphRemaining = 0;
    this.sequenceAngles.length = 0;
    this.sequenceNext = 0;
    this.sequenceTimer = 0;
    this.blockedSeconds = 0;
  }

  private updateFighting(deltaSeconds: number, player: { position: THREE.Vector3 } | null): void {
    const seesPlayer = player !== null && this.canSee(player.position);
    if (player) {
      this.aimAngle = Math.atan2(player.position.z - this.position.z, player.position.x - this.position.x);
      this.playerDistance = Math.hypot(player.position.x - this.position.x, player.position.z - this.position.z);
    } else {
      this.playerDistance = Infinity;
    }
    // Il se plante pour annoncer puis tirer : une salve annoncée part d'où l'annonce a été vue.
    // (Donc jamais de déplacement une frame où il tire : playerDistance reste exacte pour queueShot.)
    const isAttacking = this.telegraphRemaining > 0 || this.isEmitting;
    if (!isAttacking) this.updateStrafe(deltaSeconds, player);
    if (player) this.heading = turnTowards(this.heading, this.aimAngle, deltaSeconds * TURN_SPEED);
    this.updateVolley(deltaSeconds, player !== null, seesPlayer);
  }

  private updateVolley(deltaSeconds: number, hasPlayer: boolean, seesPlayer: boolean): void {
    if (this.isEmitting) {
      this.advanceSequence(deltaSeconds);
      return;
    }
    if (this.telegraphRemaining > 0) {
      this.telegraphRemaining -= deltaSeconds;
      if (this.telegraphRemaining <= 0) this.releaseVolley(hasPlayer, seesPlayer);
      return;
    }
    this.volleyCooldown -= deltaSeconds;
    if (this.volleyCooldown > 0 || !hasPlayer) return;
    const pattern = patternForPhase(this.phase, this.volleyIndex);
    if (isAimedPattern(pattern) && !seesPlayer) {
      this.blockedSeconds += deltaSeconds;
      if (this.blockedSeconds >= BLOCKED_PATTERN_SKIP_SECONDS) {
        this.volleyIndex++;
        this.blockedSeconds = 0;
      }
      return;
    }
    this.blockedSeconds = 0;
    this.telegraphPattern = pattern;
    // Garanti > 0 même si le pas de temps est nul : l'annonce dure toujours au moins une frame.
    this.telegraphRemaining = Math.max(this.tuning.telegraphSeconds, Number.EPSILON);
  }

  private releaseVolley(hasPlayer: boolean, seesPlayer: boolean): void {
    const pattern = this.telegraphPattern;
    // Le joueur a plongé à couvert pendant l'annonce : la salve visée avorte, c'est la bonne réaction.
    if (!hasPlayer || (isAimedPattern(pattern) && !seesPlayer)) {
      this.volleyCooldown = FIZZLE_RETRY_SECONDS;
      return;
    }
    const angles = patternAngles(pattern, this.aimAngle, patternShotCount(pattern, this.level), this.volleyIndex);
    this.volleyIndex++;
    if (isSequencedPattern(pattern)) {
      this.sequenceAngles.length = 0;
      for (const angle of angles) this.sequenceAngles.push(angle);
      this.sequenceNext = 0;
      this.sequenceTimer = 0;
      this.sequenceGap = pattern === "burst" ? BURST_GAP_SECONDS : SPIRAL_GAP_SECONDS;
      this.advanceSequence(0);
      return;
    }
    for (const angle of angles) this.queueShot(angle);
    this.volleyCooldown = this.volleyInterval;
  }

  private advanceSequence(deltaSeconds: number): void {
    this.sequenceTimer -= deltaSeconds;
    while (this.sequenceTimer <= 0 && this.isEmitting) {
      this.queueShot(this.sequenceAngles[this.sequenceNext] as number);
      this.sequenceNext++;
      this.sequenceTimer += this.sequenceGap;
    }
    if (!this.isEmitting) {
      this.sequenceAngles.length = 0;
      this.sequenceNext = 0;
      this.volleyCooldown = this.volleyInterval;
    }
  }

  private get volleyInterval(): number {
    return this.tuning.volleyIntervalSeconds[this.phase] as number;
  }

  /**
   * Distance du centre à laquelle naît une balle : MUZZLE_OFFSET, sauf si le joueur colle le boss
   * du côté où elle part. Elle naît alors juste avant lui, sinon elle naîtrait dans son dos.
   */
  private muzzleDistance(angle: number): number {
    if (!Number.isFinite(this.playerDistance)) return MUZZLE_OFFSET;
    const playerAlongShot = this.playerDistance * Math.cos(angle - this.aimAngle);
    // Balle qui part à l'opposé du joueur : elle ne peut pas le toucher, inutile de la faire naître dans le boss.
    if (playerAlongShot <= 0) return MUZZLE_OFFSET;
    return Math.min(MUZZLE_OFFSET, Math.max(0, playerAlongShot - POINT_BLANK_MARGIN));
  }

  private queueShot(angle: number): void {
    const clearance = castRay(this.grid, this.position.x, this.position.z, angle, this.muzzleDistance(angle));
    const offset = Math.max(0, clearance - MUZZLE_WALL_GAP);
    this.pendingShots.push({
      x: this.position.x + Math.cos(angle) * offset,
      z: this.position.z + Math.sin(angle) * offset,
      angle,
      speed: this.tuning.shotSpeed[this.phase] as number,
    });
  }

  private canSee(target: THREE.Vector3): boolean {
    const distance = Math.hypot(target.x - this.position.x, target.z - this.position.z);
    if (distance > SIGHT_RANGE) return false;
    return hasLineOfSight(this.grid, this.position.x, this.position.z, target.x, target.z);
  }

  private faceTowards(target: THREE.Vector3, deltaSeconds: number): void {
    const angle = Math.atan2(target.z - this.position.z, target.x - this.position.x);
    this.aimAngle = angle;
    this.heading = turnTowards(this.heading, angle, deltaSeconds * TURN_SPEED);
  }

  /** Pas chassés de côté entre deux pauses : une cible mouvante mais lente, facile à suivre au viseur. */
  private updateStrafe(deltaSeconds: number, player: { position: THREE.Vector3 } | null): void {
    if (this.hasMoveTarget) {
      if (this.moveTowardsTarget(deltaSeconds)) {
        this.hasMoveTarget = false;
        this.strafePause = THREE.MathUtils.lerp(STRAFE_PAUSE_MIN_SECONDS, STRAFE_PAUSE_MAX_SECONDS, this.random());
      }
      return;
    }
    this.strafePause -= deltaSeconds;
    if (this.strafePause > 0 || !player) return;
    this.chooseStrafeTarget(player.position);
    // Aucune case libre de ce côté : il reste en place et réessaie un peu plus tard.
    if (!this.hasMoveTarget) this.strafePause = STRAFE_PAUSE_MIN_SECONDS;
  }

  /**
   * Case de décalage : de côté par rapport au joueur, à bonne distance de lui, de préférence avec vue sur lui,
   * toujours dans l'arène et atteignable en ligne droite sans frôler de caisse.
   */
  private chooseStrafeTarget(playerPosition: THREE.Vector3): void {
    let awayX = this.position.x - playerPosition.x;
    let awayZ = this.position.z - playerPosition.z;
    const distance = Math.hypot(awayX, awayZ);
    if (distance < 1e-6) {
      awayX = 1;
      awayZ = 0;
    } else {
      awayX /= distance;
      awayZ /= distance;
    }
    const radial = THREE.MathUtils.clamp(PREFERRED_DISTANCE - distance, -STRAFE_STRIDE, STRAFE_STRIDE) * RADIAL_CORRECTION;
    if (this.random() < STRAFE_FLIP_CHANCE) this.strafeSide = this.strafeSide === 1 ? -1 : 1;

    let bestScore = Infinity;
    let bestX = 0;
    let bestZ = 0;
    let bestSide: 1 | -1 = this.strafeSide;
    for (let attempt = 0; attempt < STRAFE_CANDIDATES; attempt++) {
      const side: 1 | -1 = attempt % 2 === 0 ? this.strafeSide : this.strafeSide === 1 ? -1 : 1;
      const stride = STRAFE_STRIDE * (0.5 + 0.5 * this.random());
      const wantedX = this.position.x - awayZ * side * stride + awayX * radial;
      const wantedZ = this.position.z + awayX * side * stride + awayZ * radial;
      const cellX = Math.floor(THREE.MathUtils.clamp(wantedX, this.bounds.minX, this.bounds.maxX));
      const cellZ = Math.floor(THREE.MathUtils.clamp(wantedZ, this.bounds.minZ, this.bounds.maxZ));
      const targetX = cellX + 0.5;
      const targetZ = cellZ + 0.5;
      if (Math.hypot(targetX - this.position.x, targetZ - this.position.z) < MIN_STRAFE_DISTANCE) continue;
      if (!this.grid.isWalkable(cellX, cellZ) || !this.isClearPath(targetX, targetZ)) continue;
      const seesFromThere = hasLineOfSight(this.grid, targetX, targetZ, playerPosition.x, playerPosition.z);
      const score =
        Math.abs(Math.hypot(targetX - playerPosition.x, targetZ - playerPosition.z) - PREFERRED_DISTANCE) +
        (seesFromThere ? 0 : NO_SIGHT_PENALTY) +
        (side === this.strafeSide ? 0 : OTHER_SIDE_PENALTY);
      if (score < bestScore) {
        bestScore = score;
        bestX = targetX;
        bestZ = targetZ;
        bestSide = side;
      }
    }
    if (bestScore === Infinity) return;
    this.moveTarget.set(bestX, 0, bestZ);
    this.hasMoveTarget = true;
    // Va-et-vient : le prochain pas repart de l'autre côté (sauf retournement aléatoire).
    this.strafeSide = bestSide === 1 ? -1 : 1;
  }

  /** L'axe et les deux flancs du corps doivent passer : sinon le boss mordrait sur une caisse. */
  private isClearPath(toX: number, toZ: number): boolean {
    const deltaX = toX - this.position.x;
    const deltaZ = toZ - this.position.z;
    const length = Math.hypot(deltaX, deltaZ);
    if (length < 1e-6) return true;
    const sideX = (-deltaZ / length) * BODY_HALF_WIDTH;
    const sideZ = (deltaX / length) * BODY_HALF_WIDTH;
    const { x, z } = this.position;
    return (
      hasLineOfSight(this.grid, x, z, toX, toZ) &&
      hasLineOfSight(this.grid, x + sideX, z + sideZ, toX + sideX, toZ + sideZ) &&
      hasLineOfSight(this.grid, x - sideX, z - sideZ, toX - sideX, toZ - sideZ)
    );
  }

  /** Renvoie true une fois la case cible atteinte. */
  private moveTowardsTarget(deltaSeconds: number): boolean {
    const deltaX = this.moveTarget.x - this.position.x;
    const deltaZ = this.moveTarget.z - this.position.z;
    const distance = Math.hypot(deltaX, deltaZ);
    if (distance < ARRIVAL_EPSILON) return true;
    const step = Math.min(distance, this.tuning.moveSpeed * deltaSeconds);
    this.position.x += (deltaX / distance) * step;
    this.position.z += (deltaZ / distance) * step;
    return step >= distance - ARRIVAL_EPSILON;
  }

  private syncVisuals(deltaSeconds: number): void {
    const visual = this.visual;
    visual.state = this.currentState;
    visual.heading = this.heading;
    visual.awakening = this.currentState === "awakening" ? Math.min(1, this.stateSeconds / AWAKENING_SECONDS) : this.currentState === "dormant" ? 0 : 1;
    visual.collapse = this.currentState === "defeated" ? Math.min(1, this.stateSeconds / COLLAPSE_SECONDS) : 0;
    visual.charge = this.isEmitting ? 1 : this.telegraphRemaining > 0 ? 1 - this.telegraphRemaining / this.tuning.telegraphSeconds : 0;
    visual.telegraphPattern = this.telegraphRemaining > 0 || this.isEmitting ? this.telegraphPattern : null;
    visual.aimAngle = this.aimAngle;
    visual.armorPoints = this.armor;
    visual.armorMax = this.armorMax;
    visual.phase = this.phase;
    visual.exposedRemaining = this.exposedSecondsLeft;
    visual.exposedTotal = this.tuning.exposedSeconds;
    visual.hitFlash = this.hitFlash / HIT_FLASH_SECONDS;
    visual.clock = this.clock;
    this.root.position.copy(this.position);
    this.model.update(deltaSeconds, visual, this.position);
  }
}

/**
 * Case de départ (la plus proche du centre de l'arène) et bornes de déplacement (centres de cases,
 * une case de marge avec les murs). Arène trop petite ou encombrée : on renonce à la marge plutôt qu'au boss.
 */
function placeInArena(grid: Grid, arena: Room): { home: Cell; bounds: ArenaBounds } {
  for (const margin of [ARENA_MARGIN, 0]) {
    // Une salle de 2 cases de large n'a pas de « milieu » à 1 case des murs : la marge s'adapte.
    const marginX = Math.min(margin, Math.floor((arena.width - 1) / 2));
    const marginZ = Math.min(margin, Math.floor((arena.height - 1) / 2));
    const minCellX = arena.x + marginX;
    const maxCellX = arena.x + arena.width - 1 - marginX;
    const minCellZ = arena.z + marginZ;
    const maxCellZ = arena.z + arena.height - 1 - marginZ;
    const centerX = arena.x + Math.floor(arena.width / 2);
    const centerZ = arena.z + Math.floor(arena.height / 2);
    let home: Cell | null = null;
    let bestDistance = Infinity;
    for (let z = minCellZ; z <= maxCellZ; z++) {
      for (let x = minCellX; x <= maxCellX; x++) {
        if (!grid.isWalkable(x, z)) continue;
        const distance = Math.hypot(x - centerX, z - centerZ);
        if (distance < bestDistance) {
          bestDistance = distance;
          home = { x, z };
        }
      }
    }
    if (home) return { home, bounds: { minX: minCellX + 0.5, maxX: maxCellX + 0.5, minZ: minCellZ + 0.5, maxZ: maxCellZ + 0.5 } };
  }
  throw new Error(`Boss : aucune case praticable dans l'arène (${arena.x}, ${arena.z}, ${arena.width}×${arena.height})`);
}

/** Même règle que la collision du joueur : toutes les cases sous la boîte englobante du cercle sont praticables. */
function isCircleWalkable(grid: Grid, centerX: number, centerZ: number, radius: number): boolean {
  const maxCellX = Math.floor(centerX + radius);
  const maxCellZ = Math.floor(centerZ + radius);
  for (let cellZ = Math.floor(centerZ - radius); cellZ <= maxCellZ; cellZ++) {
    for (let cellX = Math.floor(centerX - radius); cellX <= maxCellX; cellX++) {
      if (!grid.isWalkable(cellX, cellZ)) return false;
    }
  }
  return true;
}

function turnTowards(current: number, target: number, maxStep: number): number {
  const difference = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  if (Math.abs(difference) <= maxStep) return target;
  return current + Math.sign(difference) * maxStep;
}

/** Clignotement carré à `rate` rad/s, calé sur l'horloge du boss (déterministe, pas de performance.now). */
function isBlinkOn(clock: number, rate: number): boolean {
  return Math.sin(clock * rate) > 0;
}

function smoothstep(progress: number): number {
  const clamped = THREE.MathUtils.clamp(progress, 0, 1);
  return clamped * clamped * (3 - 2 * clamped);
}

const DEFAULT_BOSS_COLOR = 0xff4060;
/** ~1,8× une sentinelle : il domine les murs (1,8 m) et se repère de loin. */
const MODEL_SCALE = 1.8;
/** Proportions dans le repère du modèle, avant MODEL_SCALE. Bas des pieds à -HIP_HEIGHT. */
const HIP_HEIGHT = 0.62;
const THIGH_LENGTH = 0.3;
/** À genoux : cuisses légèrement avancées, tibias à plat au sol, pointes de pied vers l'arrière. */
const KNEEL_THIGH_ANGLE = 0.35;
/** Axe du genou un peu sous l'épaisseur du tibia : il repose sur le sol au lieu de flotter. */
const KNEEL_KNEE_HEIGHT = 0.06;
const KNEEL_HIP_DROP = HIP_HEIGHT - (THIGH_LENGTH * Math.cos(KNEEL_THIGH_ANGLE) + KNEEL_KNEE_HEIGHT);
/** Les genoux, devant les pieds une fois à genoux : c'est sur eux qu'il bascule à la défaite. */
const KNEE_FORWARD = THIGH_LENGTH * Math.sin(KNEEL_THIGH_ANGLE) * MODEL_SCALE;
const FOOT_CENTER_BELOW_KNEE = HIP_HEIGHT - THIGH_LENGTH - 0.04;
const LEG_OFFSET_X = 0.17;
const SHOULDER_X = 0.5;
const SHOULDER_Y = 0.66;
const HEAD_PIVOT_Y = 0.78;
const CHEST_Y = 0.5;
const CHEST_FRONT = 0.21;
/** Bascule vers l'avant à la défaite, autour des genoux : il finit face contre terre. */
const FALL_ANGLE = 1.0;
const POSE_SMOOTHING = 7;
const SHIELD_CENTER_Y = 1.6;
const SHIELD_RADIUS = 1.2;
const SHIELD_STRETCH_Y = 1.45;
const SHIELD_GLOW = 1.8;
const AIMED_TELEGRAPH_RADIUS = 1.6;
const RADIAL_TELEGRAPH_RADIUS = 2.8;
const SECTOR_RADIUS = 3.6;
/** Marge d'angle autour des balles : le secteur annonce une zone, pas une ligne au pixel près. */
const SECTOR_PADDING_RADIANS = 0.12;
/**
 * Ancrage commun de l'étiquette et du pictogramme pause, juste au-dessus de la tête du boss debout (~3,1 m).
 * Ils s'empilent à partir de là par Sprite.center, donc dans le repère de la caméra : avec la vue plongeante
 * (~58°), un écart de hauteur dans le monde est divisé par deux à l'écran et les deux se recouvraient.
 */
const LABEL_ANCHOR_HEIGHT = 3.2;
/** Tailles des sprites, en mètres. */
const NAMEPLATE_WIDTH = 3.2;
const NAMEPLATE_HEIGHT = 0.8;
const BADGE_SIZE = 1.3;
const LABEL_GAP = 0.1;
/** À genoux, le pictogramme occupe la place juste au-dessus du boss : l'étiquette monte au-dessus de lui. */
const EXPOSED_NAMEPLATE_CENTER_Y = -(BADGE_SIZE + LABEL_GAP) / NAMEPLATE_HEIGHT;
/** Bleu des processus suspendus, comme les sentinelles : « tape la commande maintenant ». */
const EXPOSED_COLOR = new THREE.Color(0x4fc3ff);
const HIT_FLASH_COLOR = new THREE.Color(0xffffff);
/** Couleurs > 1 : elles dépassent le seuil du bloom. Orange = salve visée, rouge = toutes directions. */
const AIMED_TELEGRAPH_COLOR = new THREE.Color(4, 1.7, 0.4);
const RADIAL_TELEGRAPH_COLOR = new THREE.Color(4.5, 0.45, 1.1);

/**
 * Robot massif : un squelette de pivots (comme les sentinelles) habillé de ~30 meshes.
 * Géométries partagées entre gauche et droite ; tout est enfant de `group`, donc libéré par disposeScene.
 */
class BossModel {
  readonly group = new THREE.Group();
  private readonly yaw = new THREE.Group();
  /** Bascule de la défaite, pivot sur la ligne des genoux. */
  private readonly fall = new THREE.Group();
  private readonly chassis = new THREE.Group();
  private readonly hips = new THREE.Group();
  private readonly torso = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly leftArm = new THREE.Group();
  private readonly rightArm = new THREE.Group();
  private readonly leftLeg = new THREE.Group();
  private readonly rightLeg = new THREE.Group();
  private readonly leftKnee = new THREE.Group();
  private readonly rightKnee = new THREE.Group();
  private readonly leftAnkle = new THREE.Group();
  private readonly rightAnkle = new THREE.Group();
  private readonly armorMaterial: THREE.MeshStandardMaterial;
  private readonly coreMaterial: THREE.MeshStandardMaterial;
  private readonly visorMaterial: THREE.MeshStandardMaterial;
  private readonly chargeMaterial: THREE.MeshStandardMaterial;
  /**
   * Plaques d'armure, dans l'ordre où elles tombent : épaulières d'abord, plastron ensuite, le cœur en dernier.
   * Celles du corps affiché : du colosse procédural, ou de l'androïde une fois chargé.
   */
  private plates: THREE.Mesh[] = [];
  private proceduralPlates: THREE.Mesh[] = [];
  private android: BossAndroid | null = null;
  private androidSpeed = 0;
  private readonly shieldFill: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private readonly shieldWire: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private readonly telegraphRing: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private readonly burstSector: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private readonly fanSector: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private readonly nameplate: BossNameplate;
  private readonly badge: ExposedBadge;
  private readonly bossColor: THREE.Color;
  private readonly coreColor: THREE.Color;
  /** Couleur du bouclier poussée au-delà de 1 : les arêtes accrochent le bloom. */
  private readonly shieldColor: THREE.Color;
  private readonly lastPosition = new THREE.Vector3();
  private hasLastPosition = false;
  private walkPhase = 0;
  private stride = 0;
  private kneel = 1;
  private slump = 1;
  private aim = 0;

  constructor(name: string, color: number) {
    this.bossColor = new THREE.Color(color);
    this.coreColor = this.bossColor.clone().lerp(HIT_FLASH_COLOR, 0.55);
    this.shieldColor = this.bossColor.clone().multiplyScalar(SHIELD_GLOW);
    const chassisMaterial = new THREE.MeshStandardMaterial({ color: 0x1b1d24, roughness: 0.55, metalness: 0.55 });
    const seamMaterial = new THREE.MeshStandardMaterial({ color: 0x0b0c10, roughness: 0.8, metalness: 0.3 });
    this.armorMaterial = new THREE.MeshStandardMaterial({
      color: this.bossColor.clone().multiplyScalar(0.75),
      roughness: 0.3,
      metalness: 0.65,
      emissive: this.bossColor,
      emissiveIntensity: 0.12,
    });
    this.coreMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: this.coreColor, emissiveIntensity: 0.2 });
    this.visorMaterial = new THREE.MeshStandardMaterial({ color: this.bossColor, emissive: this.bossColor, emissiveIntensity: 0 });
    this.chargeMaterial = new THREE.MeshStandardMaterial({ color: this.bossColor, emissive: this.bossColor, emissiveIntensity: 0 });

    this.chassis.scale.setScalar(MODEL_SCALE);
    this.fall.position.z = KNEE_FORWARD;
    this.chassis.position.z = -KNEE_FORWARD;
    this.group.add(this.yaw);
    this.yaw.add(this.fall);
    this.fall.add(this.chassis);
    this.hips.position.y = HIP_HEIGHT;
    this.chassis.add(this.hips);
    this.hips.add(this.torso);
    this.head.position.y = HEAD_PIVOT_Y;
    this.torso.add(this.head);
    this.leftArm.position.set(-SHOULDER_X, SHOULDER_Y, 0);
    this.rightArm.position.set(SHOULDER_X, SHOULDER_Y, 0);
    this.torso.add(this.leftArm, this.rightArm);
    this.leftLeg.position.x = -LEG_OFFSET_X;
    this.rightLeg.position.x = LEG_OFFSET_X;
    this.hips.add(this.leftLeg, this.rightLeg);
    this.leftKnee.position.y = -THIGH_LENGTH;
    this.rightKnee.position.y = -THIGH_LENGTH;
    this.leftLeg.add(this.leftKnee);
    this.rightLeg.add(this.rightKnee);
    this.leftAnkle.position.y = -FOOT_CENTER_BELOW_KNEE;
    this.rightAnkle.position.y = -FOOT_CENTER_BELOW_KNEE;
    this.leftKnee.add(this.leftAnkle);
    this.rightKnee.add(this.rightAnkle);

    this.buildBody(chassisMaterial, seamMaterial);

    const shieldGeometry = new THREE.IcosahedronGeometry(SHIELD_RADIUS, 1);
    this.shieldFill = new THREE.Mesh(
      shieldGeometry,
      new THREE.MeshBasicMaterial({ color: this.bossColor, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    this.shieldWire = new THREE.Mesh(
      shieldGeometry,
      new THREE.MeshBasicMaterial({ color: this.shieldColor, wireframe: true, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }),
    );
    for (const shell of [this.shieldFill, this.shieldWire]) {
      shell.position.y = SHIELD_CENTER_Y;
      shell.scale.set(1, SHIELD_STRETCH_Y, 1);
      shell.visible = false;
      this.group.add(shell);
    }

    this.telegraphRing = new THREE.Mesh(
      new THREE.RingGeometry(0.82, 1, 48).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: AIMED_TELEGRAPH_COLOR, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }),
    );
    this.telegraphRing.position.y = 0.04;
    this.telegraphRing.visible = false;
    this.group.add(this.telegraphRing);

    const sectorMaterial = new THREE.MeshBasicMaterial({ color: AIMED_TELEGRAPH_COLOR, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
    this.burstSector = new THREE.Mesh(createSectorGeometry(BURST_SPACING_RADIANS * (BURST_SHOT_COUNT - 1) + SECTOR_PADDING_RADIANS), sectorMaterial);
    this.fanSector = new THREE.Mesh(createSectorGeometry(FAN_ARC_RADIANS + SECTOR_PADDING_RADIANS), sectorMaterial);
    for (const sector of [this.burstSector, this.fanSector]) {
      sector.position.y = 0.03;
      sector.visible = false;
      this.group.add(sector);
    }

    this.nameplate = new BossNameplate(name, `#${this.bossColor.getHexString()}`);
    this.badge = new ExposedBadge();
    for (const label of [this.nameplate.sprite, this.badge.sprite]) {
      label.position.y = LABEL_ANCHOR_HEIGHT;
      // Dessinés au-dessus de l'ancrage : la sphère de culling de Three.js, centrée sur lui, ne les couvre plus.
      label.frustumCulled = false;
      this.group.add(label);
    }
  }

  get usesAndroid(): boolean {
    return this.android !== null;
  }

  /**
   * Remplace le colosse procédural par l'androïde : mêmes matériaux (couleur, charge, flash, bleu exposé),
   * donc mêmes effets ; ses propres plaques prennent le relais pour montrer l'armure restante.
   */
  attachAndroid(asset: SentinelAsset): void {
    const android = new BossAndroid(asset, { armor: this.armorMaterial, core: this.coreMaterial, visor: this.visorMaterial, charge: this.chargeMaterial });
    android.root.rotation.y = this.yaw.rotation.y;
    this.group.add(android.root);
    this.yaw.visible = false;
    this.proceduralPlates = this.plates;
    this.plates = android.plates;
    this.android = android;
  }

  /** Revient au colosse procédural, plaques comprises (appareil qui n'arrive plus à suivre). */
  dropAndroid(): void {
    if (!this.android) return;
    this.android.dispose();
    this.android = null;
    this.plates = this.proceduralPlates;
    this.yaw.visible = true;
  }

  update(deltaSeconds: number, view: BossVisualState, position: THREE.Vector3): void {
    // Pas de temps nul (reset) : la pose saute directement à sa cible au lieu d'y glisser.
    const smoothing = deltaSeconds > 0 ? 1 - Math.exp(-deltaSeconds * POSE_SMOOTHING) : 1;
    const travelled = this.hasLastPosition ? Math.hypot(position.x - this.lastPosition.x, position.z - this.lastPosition.z) : 0;
    this.lastPosition.copy(position);
    this.hasLastPosition = deltaSeconds > 0;
    const speed = deltaSeconds > 0 ? travelled / deltaSeconds : 0;
    this.walkPhase += travelled * 3.2;
    this.stride += (Math.min(1, speed / 1.2) - this.stride) * smoothing;

    const down = view.state === "dormant" || view.state === "exposed" || view.state === "defeated";
    // Le réveil suit sa propre courbe : il doit être debout pile quand le combat commence.
    if (view.state === "awakening") this.kneel = 1 - smoothstep(view.awakening);
    else this.kneel += ((down ? 1 : 0) - this.kneel) * smoothing;
    const slumped = view.state === "dormant" || view.state === "defeated";
    this.slump += ((slumped ? 1 : view.state === "awakening" ? 1 - view.awakening : 0) - this.slump) * smoothing;
    const aimTarget = view.state === "fighting" ? (view.charge > 0 ? 1 : 0.45) : 0;
    this.aim += (aimTarget - this.aim) * smoothing;

    this.pose(view);
    if (this.android) {
      this.androidSpeed += (speed - this.androidSpeed) * smoothing;
      this.android.root.rotation.y = this.yaw.rotation.y;
      // Pas de temps nul (reset) : l'animateur doit quand même appliquer la pose demandée.
      this.android.update(deltaSeconds > 0 ? deltaSeconds : 1, { state: view.state, speed: this.androidSpeed, aim: this.aim });
    }
    this.syncGlow(view);
    this.syncArmor(view);
    this.syncTelegraph(view);
    const awake = view.state === "awakening" || view.state === "fighting" || view.state === "exposed";
    this.nameplate.show(awake, view.armorPoints, view.armorMax, view.phase, view.state === "exposed");
    this.badge.show(view.state === "exposed", view.exposedRemaining, view.exposedTotal);
  }

  private pose(view: BossVisualState): void {
    const kneel = this.kneel;
    const swing = Math.sin(this.walkPhase) * 0.45 * this.stride * (1 - kneel);
    const breathe = Math.sin(view.clock * 1.8) * 0.012 * (1 - view.collapse);
    this.hips.position.y = HIP_HEIGHT - kneel * KNEEL_HIP_DROP + Math.abs(Math.cos(this.walkPhase)) * 0.02 * this.stride;
    this.leftLeg.rotation.x = swing - kneel * KNEEL_THIGH_ANGLE;
    this.rightLeg.rotation.x = -swing - kneel * KNEEL_THIGH_ANGLE;
    const kneeBend = kneel * (Math.PI / 2 + KNEEL_THIGH_ANGLE);
    this.leftKnee.rotation.x = kneeBend;
    this.rightKnee.rotation.x = kneeBend;
    // Pieds à plat en marchant (robot lourd), pointes vers l'arrière à genoux : jamais plantés dans le sol.
    this.leftAnkle.rotation.x = -(this.leftLeg.rotation.x + kneeBend) + kneel * Math.PI;
    this.rightAnkle.rotation.x = -(this.rightLeg.rotation.x + kneeBend) + kneel * Math.PI;
    this.torso.position.y = breathe;
    this.torso.rotation.x = kneel * 0.3 + this.slump * 0.25;
    this.head.rotation.x = kneel * 0.35 + this.slump * 0.3;
    const raise = this.aim * (1 - kneel);
    this.leftArm.rotation.x = -swing * 0.6 - raise * 1.35 + kneel * 0.15;
    this.rightArm.rotation.x = swing * 0.6 - raise * 1.35 + kneel * 0.15;
    this.leftArm.rotation.z = -0.14 - this.slump * 0.1;
    this.rightArm.rotation.z = 0.14 + this.slump * 0.1;
    // Le modèle regarde vers +Z : conversion du cap mathématique vers la rotation Y de Three.js.
    this.yaw.rotation.y = Math.PI / 2 - view.heading;
    // Chute qui accélère (carré) : un robot lourd qui bascule, pas un ralenti.
    this.fall.rotation.x = view.collapse * view.collapse * FALL_ANGLE;
  }

  private syncGlow(view: BossVisualState): void {
    switch (view.state) {
      case "dormant":
        // Veille : le cœur respire faiblement, on devine qu'il n'est pas mort.
        this.coreMaterial.emissive.copy(this.coreColor);
        this.coreMaterial.emissiveIntensity = 0.15 + 0.2 * (Math.sin(view.clock * 1.3) + 1) * 0.5;
        this.visorMaterial.emissiveIntensity = 0;
        this.chargeMaterial.emissiveIntensity = 0;
        break;
      case "awakening": {
        // Démarrage : ça grésille d'abord, puis tout s'allume franchement.
        const sputter = view.awakening < 0.55 && !isBlinkOn(view.clock, 38) ? 0.25 : 1;
        this.coreMaterial.emissive.copy(this.coreColor);
        this.coreMaterial.emissiveIntensity = THREE.MathUtils.lerp(0.2, 3, view.awakening) * sputter;
        this.visorMaterial.emissiveIntensity = 3 * view.awakening * sputter;
        this.chargeMaterial.emissiveIntensity = view.awakening;
        break;
      }
      case "fighting":
        // Le cœur se charge pendant l'annonce : plus il brille, plus la salve est proche.
        this.coreMaterial.emissive.copy(view.hitFlash > 0 ? HIT_FLASH_COLOR : this.coreColor);
        this.coreMaterial.emissiveIntensity = 2.5 + view.charge * 6;
        this.visorMaterial.emissiveIntensity = 3;
        this.chargeMaterial.emissiveIntensity = 1 + view.charge * 5;
        break;
      case "exposed": {
        // Comme une sentinelle suspendue : bleu clignotant, plus vite quand il va se relever.
        this.coreMaterial.emissive.copy(EXPOSED_COLOR);
        this.coreMaterial.emissiveIntensity = isBlinkOn(view.clock, view.exposedRemaining < 3 ? 14 : 5) ? 7 : 1.2;
        this.visorMaterial.emissiveIntensity = 0.6;
        this.chargeMaterial.emissiveIntensity = 0;
        break;
      }
      case "defeated":
        this.coreMaterial.emissive.copy(this.coreColor);
        this.coreMaterial.emissiveIntensity = (1 - view.collapse) * (isBlinkOn(view.clock, 30) ? 4 : 0.5);
        this.visorMaterial.emissiveIntensity = (1 - view.collapse) * 1.5;
        this.chargeMaterial.emissiveIntensity = 0;
        break;
    }
  }

  /** Plaques et bouclier : l'armure restante se lit sur le corps, sans regarder la barre. */
  private syncArmor(view: BossVisualState): void {
    const fraction = view.armorMax > 0 ? view.armorPoints / view.armorMax : 0;
    const intact = view.state === "dormant" || view.state === "awakening" ? this.plates.length : Math.ceil(fraction * this.plates.length);
    for (let index = 0; index < this.plates.length; index++) {
      (this.plates[index] as THREE.Mesh).visible = index >= this.plates.length - intact;
    }
    const flashing = view.hitFlash > 0;
    this.armorMaterial.emissive.copy(flashing ? HIT_FLASH_COLOR : this.bossColor);
    this.armorMaterial.emissiveIntensity = flashing ? 1.6 * view.hitFlash : 0.12;

    const shielded = view.state === "fighting" || view.state === "awakening";
    this.shieldFill.visible = shielded;
    this.shieldWire.visible = shielded;
    if (!shielded) return;
    const strength = fraction * (view.state === "awakening" ? view.awakening : 1);
    this.shieldFill.material.opacity = 0.03 + 0.09 * strength + (flashing ? 0.12 * view.hitFlash : 0);
    this.shieldWire.material.opacity = 0.06 + 0.4 * strength + (flashing ? 0.5 * view.hitFlash : 0);
    this.shieldWire.material.color.copy(flashing ? HIT_FLASH_COLOR : this.shieldColor);
    // Le bouclier tourne lentement : on comprend que c'est une énergie, pas une coque fixe.
    this.shieldWire.rotation.y = view.clock * 0.35;
    this.shieldFill.rotation.y = this.shieldWire.rotation.y;
  }

  /** Anneau au sol + secteur de tir : on voit d'où et vers où la salve va partir. */
  private syncTelegraph(view: BossVisualState): void {
    const pattern = view.state === "fighting" ? view.telegraphPattern : null;
    this.telegraphRing.visible = pattern !== null;
    this.burstSector.visible = pattern === "burst";
    this.fanSector.visible = pattern === "fan";
    if (pattern === null) return;
    const aimed = isAimedPattern(pattern);
    const radius = (aimed ? AIMED_TELEGRAPH_RADIUS : RADIAL_TELEGRAPH_RADIUS) * (0.3 + 0.7 * view.charge);
    this.telegraphRing.scale.set(radius, 1, radius);
    this.telegraphRing.material.color.copy(aimed ? AIMED_TELEGRAPH_COLOR : RADIAL_TELEGRAPH_COLOR);
    // Pulsation qui s'accélère avec la charge : le rythme dit « ça va partir ».
    const pulse = 0.5 + 0.5 * Math.sin(view.clock * (8 + view.charge * 14));
    this.telegraphRing.material.opacity = 0.3 + 0.45 * view.charge + 0.2 * pulse;
    if (!aimed) return;
    const sector = pattern === "burst" ? this.burstSector : this.fanSector;
    // Secteur dessiné autour de +X : rotation.y = -angle l'oriente selon la convention mathématique.
    sector.rotation.y = -view.aimAngle;
    sector.material.opacity = 0.12 + 0.4 * view.charge;
  }

  private buildBody(chassisMaterial: THREE.Material, seamMaterial: THREE.Material): void {
    const add = (parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh => {
      const part = new THREE.Mesh(geometry, material);
      part.position.set(x, y, z);
      part.castShadow = true;
      parent.add(part);
      return part;
    };

    const thigh = new RoundedBoxGeometry(0.2, 0.3, 0.22, 2, 0.05);
    const shin = new RoundedBoxGeometry(0.23, 0.26, 0.25, 2, 0.06);
    const foot = new RoundedBoxGeometry(0.27, 0.08, 0.36, 2, 0.03);
    for (const [leg, knee, ankle] of [
      [this.leftLeg, this.leftKnee, this.leftAnkle],
      [this.rightLeg, this.rightKnee, this.rightAnkle],
    ] as const) {
      add(leg, thigh, chassisMaterial, 0, -THIGH_LENGTH / 2, 0);
      add(knee, shin, this.armorMaterial, 0, -0.14, 0.01);
      add(ankle, foot, chassisMaterial, 0, 0, 0.05);
    }

    add(this.torso, new RoundedBoxGeometry(0.44, 0.14, 0.3, 2, 0.05), chassisMaterial, 0, 0.03, 0);
    add(this.torso, new THREE.CylinderGeometry(0.17, 0.2, 0.24, 16), seamMaterial, 0, 0.18, 0);
    add(this.torso, new RoundedBoxGeometry(0.72, 0.46, 0.42, 3, 0.1), chassisMaterial, 0, CHEST_Y, 0);
    // Le point faible : un cœur lumineux serti au milieu du plastron, visible de loin.
    add(this.torso, new THREE.TorusGeometry(0.105, 0.025, 8, 24), seamMaterial, 0, CHEST_Y, CHEST_FRONT + 0.005);
    add(this.torso, new THREE.SphereGeometry(0.085, 18, 12), this.coreMaterial, 0, CHEST_Y, CHEST_FRONT - 0.01);
    add(this.torso, new RoundedBoxGeometry(0.46, 0.38, 0.18, 2, 0.05), chassisMaterial, 0, CHEST_Y + 0.02, -0.27);
    add(
      this.torso,
      mergedGeometry([
        new THREE.CylinderGeometry(0.06, 0.06, 0.3, 12).translate(-0.12, CHEST_Y + 0.02, -0.37),
        new THREE.CylinderGeometry(0.06, 0.06, 0.3, 12).translate(0.12, CHEST_Y + 0.02, -0.37),
      ]),
      this.chargeMaterial,
    );

    const pauldron = new THREE.SphereGeometry(0.2, 18, 12).scale(1.1, 0.62, 1.15);
    const chestPlate = new RoundedBoxGeometry(0.22, 0.3, 0.06, 2, 0.025);
    const leftPauldron = add(this.torso, pauldron, this.armorMaterial, -SHOULDER_X + 0.04, SHOULDER_Y + 0.06, 0);
    leftPauldron.rotation.z = 0.3;
    const rightPauldron = add(this.torso, pauldron, this.armorMaterial, SHOULDER_X - 0.04, SHOULDER_Y + 0.06, 0);
    rightPauldron.rotation.z = -0.3;
    const leftPlate = add(this.torso, chestPlate, this.armorMaterial, -0.235, CHEST_Y + 0.02, CHEST_FRONT + 0.005);
    leftPlate.rotation.y = 0.18;
    const rightPlate = add(this.torso, chestPlate, this.armorMaterial, 0.235, CHEST_Y + 0.02, CHEST_FRONT + 0.005);
    rightPlate.rotation.y = -0.18;
    this.plates.push(leftPauldron, rightPauldron, leftPlate, rightPlate);

    add(this.head, new RoundedBoxGeometry(0.3, 0.22, 0.3, 3, 0.07), this.armorMaterial, 0, 0.07, 0);
    add(this.head, new RoundedBoxGeometry(0.25, 0.05, 0.04, 2, 0.015), this.visorMaterial, 0, 0.08, 0.15);
    // Cornes et col : la silhouette de boss se reconnaît même en ombre chinoise.
    add(
      this.head,
      mergedGeometry([
        new THREE.ConeGeometry(0.035, 0.2, 8).rotateZ(0.5).translate(-0.17, 0.24, -0.02),
        new THREE.ConeGeometry(0.035, 0.2, 8).rotateZ(-0.5).translate(0.17, 0.24, -0.02),
        new THREE.CylinderGeometry(0.1, 0.13, 0.12, 12).translate(0, -0.07, 0),
      ]),
      seamMaterial,
    );

    const upperArm = new THREE.CapsuleGeometry(0.09, 0.18, 4, 10);
    const cannon = new RoundedBoxGeometry(0.2, 0.36, 0.22, 2, 0.06);
    const muzzle = new THREE.CylinderGeometry(0.065, 0.065, 0.05, 14);
    for (const arm of [this.leftArm, this.rightArm]) {
      add(arm, upperArm, chassisMaterial, 0, -0.15, 0);
      add(arm, cannon, this.armorMaterial, 0, -0.44, 0);
      add(arm, muzzle, this.chargeMaterial, 0, -0.64, 0);
    }
  }
}

function mergedGeometry(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const geometry = mergeGeometries(parts) as THREE.BufferGeometry | null;
  for (const part of parts) part.dispose();
  if (!geometry) throw new Error("Fusion des pièces du boss impossible (attributs incompatibles)");
  return geometry;
}

/** Secteur plat centré sur +X, opaque près du boss et transparent au bout (dégradé par sommet). */
function createSectorGeometry(arc: number): THREE.BufferGeometry {
  const geometry = new THREE.CircleGeometry(SECTOR_RADIUS, Math.max(6, Math.ceil(arc * 16)), -arc / 2, arc);
  geometry.rotateX(-Math.PI / 2);
  const vertexCount = geometry.getAttribute("position").count;
  const colors = new Float32Array(vertexCount * 4);
  // Sommet 0 = centre du cercle (convention de CircleGeometry).
  for (let vertex = 0; vertex < vertexCount; vertex++) colors.set([1, 1, 1, vertex === 0 ? 0.85 : 0.04], vertex * 4);
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 4));
  return geometry;
}

/** null hors navigateur (tests unitaires sous Node) : la logique du boss ne dépend pas de ses étiquettes. */
function createLabelCanvas(width: number, height: number): { canvas: HTMLCanvasElement; texture: THREE.CanvasTexture } | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return { canvas, texture };
}

const NAMEPLATE_WIDTH_PX = 512;
const NAMEPLATE_HEIGHT_PX = 128;
const NAMEPLATE_MAX_TEXT_PX = 470;

/** Nom du boss, barre d'armure segmentée (une case par balle) et pastilles de phase. */
class BossNameplate {
  readonly sprite: THREE.Sprite;
  private readonly canvas: HTMLCanvasElement | null;
  private readonly texture: THREE.CanvasTexture | null;
  /** Ce qui est affiché : comparé champ par champ à chaque frame (une clé texte serait une allocation par frame). */
  private shownVisible = false;
  private shownArmorPoints = -1;
  private shownArmorMax = -1;
  private shownPhase = -1;
  private shownExposed = false;

  constructor(
    private readonly name: string,
    private readonly accent: string,
  ) {
    const label = createLabelCanvas(NAMEPLATE_WIDTH_PX, NAMEPLATE_HEIGHT_PX);
    this.canvas = label?.canvas ?? null;
    this.texture = label?.texture ?? null;
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.texture, transparent: true, depthWrite: false }));
    this.sprite.scale.set(NAMEPLATE_WIDTH, NAMEPLATE_HEIGHT, 1);
    // Ancré par son bord bas : il se pose sur la tête du boss au lieu de la chevaucher.
    this.sprite.center.set(0.5, 0);
    this.sprite.visible = false;
  }

  show(visible: boolean, armorPoints: number, armorMax: number, phase: number, exposed: boolean): void {
    // Redessiné seulement quand l'affichage change : une texture par balle encaissée, pas par frame.
    const unchanged =
      visible === this.shownVisible &&
      (!visible ||
        (armorPoints === this.shownArmorPoints && armorMax === this.shownArmorMax && phase === this.shownPhase && exposed === this.shownExposed));
    if (unchanged) return;
    this.shownVisible = visible;
    this.shownArmorPoints = armorPoints;
    this.shownArmorMax = armorMax;
    this.shownPhase = phase;
    this.shownExposed = exposed;
    this.sprite.visible = visible && this.texture !== null;
    this.sprite.center.y = exposed ? EXPOSED_NAMEPLATE_CENTER_Y : 0;
    if (!visible || !this.canvas || !this.texture) return;
    const context = this.canvas.getContext("2d");
    if (!context) return;
    const width = NAMEPLATE_WIDTH_PX;
    context.clearRect(0, 0, width, NAMEPLATE_HEIGHT_PX);
    context.fillStyle = "rgba(6, 8, 14, 0.72)";
    context.fillRect(0, 0, width, NAMEPLATE_HEIGHT_PX);
    context.fillStyle = this.accent;
    context.fillRect(0, 0, width, 4);

    context.textAlign = "center";
    context.textBaseline = "middle";
    let fontSize = 40;
    context.font = `bold ${fontSize}px system-ui, sans-serif`;
    while (context.measureText(this.name).width > NAMEPLATE_MAX_TEXT_PX && fontSize > 20) {
      fontSize -= 2;
      context.font = `bold ${fontSize}px system-ui, sans-serif`;
    }
    context.fillStyle = "#f4f6ff";
    context.fillText(this.name, width / 2, 34);

    const barLeft = 32;
    const barWidth = width - barLeft * 2;
    const segments = Math.max(1, armorMax);
    const gap = 4;
    const segmentWidth = (barWidth - gap * (segments - 1)) / segments;
    for (let segment = 0; segment < segments; segment++) {
      context.fillStyle = exposed ? "rgba(79, 195, 255, 0.18)" : segment < armorPoints ? this.accent : "rgba(255, 255, 255, 0.12)";
      context.fillRect(barLeft + segment * (segmentWidth + gap), 62, segmentWidth, 26);
    }
    if (exposed) {
      context.fillStyle = "#4fc3ff";
      context.font = "bold 22px system-ui, sans-serif";
      context.fillText(t("bossKneelPrompt"), width / 2, 76);
    }

    for (let pip = 0; pip < PHASE_COUNT; pip++) {
      const centerX = width / 2 + (pip - (PHASE_COUNT - 1) / 2) * 30;
      context.beginPath();
      context.arc(centerX, 108, 8, 0, Math.PI * 2);
      if (pip < phase) {
        context.fillStyle = "rgba(255, 255, 255, 0.85)";
        context.fill();
      } else if (pip === phase) {
        context.fillStyle = this.accent;
        context.fill();
      } else {
        context.strokeStyle = "rgba(255, 255, 255, 0.4)";
        context.lineWidth = 2;
        context.stroke();
      }
    }
    this.texture.needsUpdate = true;
  }
}

const BADGE_SIZE_PX = 128;
/** Le compte à rebours est redessiné par crans : inutile de régénérer la texture à chaque frame. */
const BADGE_STEPS = 40;

/** « ⏸ » + anneau qui se vide + secondes restantes : le même langage que les sentinelles suspendues. */
class ExposedBadge {
  readonly sprite: THREE.Sprite;
  private readonly canvas: HTMLCanvasElement | null;
  private readonly texture: THREE.CanvasTexture | null;
  /** Ce qui est affiché : comparé à chaque frame sans construire de clé texte (pas d'allocation). */
  private shownVisible = false;
  private shownStep = -1;
  private shownSeconds = -1;

  constructor() {
    const label = createLabelCanvas(BADGE_SIZE_PX, BADGE_SIZE_PX);
    this.canvas = label?.canvas ?? null;
    this.texture = label?.texture ?? null;
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.texture, transparent: true, depthWrite: false }));
    this.sprite.scale.set(BADGE_SIZE, BADGE_SIZE, 1);
    // Ancré par son bord bas, sous l'étiquette remontée : les deux s'empilent sans se toucher.
    this.sprite.center.set(0.5, 0);
    this.sprite.visible = false;
  }

  show(visible: boolean, secondsLeft: number, totalSeconds: number): void {
    const progress = totalSeconds > 0 ? THREE.MathUtils.clamp(secondsLeft / totalSeconds, 0, 1) : 0;
    const step = Math.ceil(progress * BADGE_STEPS);
    const seconds = Math.ceil(Math.max(0, secondsLeft));
    const unchanged = visible === this.shownVisible && (!visible || (step === this.shownStep && seconds === this.shownSeconds));
    if (unchanged) return;
    this.shownVisible = visible;
    this.shownStep = step;
    this.shownSeconds = seconds;
    this.sprite.visible = visible && this.texture !== null;
    if (!visible || !this.canvas || !this.texture) return;
    const context = this.canvas.getContext("2d");
    if (!context) return;
    const center = BADGE_SIZE_PX / 2;
    context.clearRect(0, 0, BADGE_SIZE_PX, BADGE_SIZE_PX);
    context.lineWidth = 9;
    context.strokeStyle = "rgba(79, 195, 255, 0.25)";
    context.beginPath();
    context.arc(center, center, 54, 0, Math.PI * 2);
    context.stroke();
    context.strokeStyle = "#4fc3ff";
    context.beginPath();
    context.arc(center, center, 54, -Math.PI / 2, -Math.PI / 2 + (step / BADGE_STEPS) * Math.PI * 2);
    context.stroke();
    context.fillStyle = "#4fc3ff";
    context.fillRect(center - 17, center - 34, 12, 30);
    context.fillRect(center + 5, center - 34, 12, 30);
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = "bold 30px system-ui, sans-serif";
    context.fillText(`${seconds} s`, center, center + 22);
    this.texture.needsUpdate = true;
  }
}
