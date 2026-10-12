import * as THREE from "three";
import { advanceProjectile, applySpread, createProjectile, Sidearm, shotSpread, traceShot, type Projectile, type ShotTarget } from "../combat/ballistics";
import { createCameraIdentity, createSentinelIdentity, type SentinelIdentity, type TargetKind } from "../combat/weapons";
import type { Cell } from "../core/grid";
import type { InputController } from "../core/input";
import type { QualityProfile } from "../core/settings";
import { seedFromString } from "../core/rng";
import type { AvatarConfig } from "../avatar/avatarConfig";
import type { DevOpsModule } from "../content/types";
import {
  CombatEffects,
  ENEMY_SHOT_COLOR,
  PLAYER_SHOT_COLOR,
  SHIELD_SPARK_COLOR,
  SUSPEND_SPARK_COLOR,
  WALL_SPARK_COLOR,
} from "../entities/combatEffects";
import { Boss, type BossState } from "../entities/boss";
import { Guard, type GuardShot } from "../entities/guard";
import { IntelPickup } from "../entities/intel";
import { SecurityCamera } from "../entities/securityCamera";
import { Player, type Posture } from "../entities/player";
import { ExtractionZone, HackTerminal } from "../entities/terminal";
import { generateLevel, type LevelLayout, type Room } from "../level/generator";
import { accentForModule, buildLevelScene, cellToWorld, disposeScene, type LevelVisuals } from "../level/levelScene";
import type { MissionDifficulty } from "./difficulty";

export type ContextActionKind = "takedown" | "hack";

/** Une cible du pistolet ou du gadget : une sentinelle ou une caméra, par son index. */
export interface TargetRef {
  kind: TargetKind;
  index: number;
}

/** Ce qu'une balle peut toucher : en plus des cibles du gadget, le boss de fin de secteur. */
type ShotTargetRef = TargetRef | { kind: "boss" };

/**
 * suspended : sentinelle à terre (SIGSTOP) ; shield : le bouclier a encaissé ; camera : caméra brouillée ;
 * bossArmor : l'armure du boss a encaissé ; bossExposed : la dernière plaque est tombée, il est à genoux.
 */
export type ShotResult = "suspended" | "shield" | "camera" | "bossArmor" | "bossExposed" | "miss";

/** Visée fournie par l'application : un point du sol (souris) ou une direction (pad tactile). */
export type AimInput = { kind: "point"; x: number; z: number; aiming: boolean } | { kind: "direction"; angle: number; aiming: boolean };

/** Ce qui se passe pendant un combat : l'application en fait des sons, des flashs et des messages. */
export type CombatEvent =
  | { type: "shot"; result: ShotResult; impact: THREE.Vector3 }
  | { type: "dryFire" }
  | { type: "reloadStarted" }
  | { type: "enemyShot" }
  | { type: "playerHit"; health: number }
  | { type: "alarm"; source: "sentinel" | "camera" }
  | { type: "sentinelWoke" }
  | { type: "bossAwakened" }
  | { type: "bossRecovered" }
  | { type: "bossPhaseCleared"; phase: number }
  | { type: "bossDefeated" };

/** État du boss affiché dans la barre en haut de l'écran. */
export interface BossHudState {
  name: string;
  state: BossState;
  /** Phase en cours, à partir de 1. */
  phase: number;
  phaseCount: number;
  armor: number;
  exposedSecondsLeft: number;
}

export interface CommandTargetInfo {
  kind: TargetKind | "boss";
  name: string;
  /** Temps avant que la cible ne se relève (sentinelle) ou ne se rallume (caméra). */
  secondsLeft: number;
}

export interface HudState {
  livesLeft: number;
  health: number;
  maxHealth: number;
  hackedCount: number;
  terminalCount: number;
  intelCollected: number;
  intelTotal: number;
  exposure: number;
  /** Au moins une sentinelle te traque. */
  alarm: boolean;
  posture: Posture;
  nightVision: boolean;
  aiming: boolean;
  /** Action de la touche E à cet instant (neutraliser ou pirater), ou null. */
  contextAction: { kind: ContextActionKind; label: string } | null;
  gadgetAvailable: boolean;
  /** Le boss de fin de secteur ne garde plus l'extraction. */
  bossDefeated: boolean;
  /** Cible touchée qu'on peut terminer avec une commande (touche F), ou null. */
  commandTarget: CommandTargetInfo | null;
  magazine: number;
  magazineSize: number;
  reserve: number;
  reloadProgress: number;
  /** null tant que le boss dort (ou une fois vaincu). */
  boss: BossHudState | null;
}

export type GuardStatus = "calm" | "hostile" | "suspended" | "down";

export interface MinimapSnapshot {
  layout: LevelLayout;
  player: THREE.Vector3;
  guards: { position: THREE.Vector3; heading: number; status: GuardStatus }[];
  cameras: { cell: Cell; active: boolean }[];
  terminals: { cell: Cell; hacked: boolean }[];
  intel: { cell: Cell; collected: boolean }[];
  exitUnlocked: boolean;
  /** Position du boss une fois réveillé, null sinon. */
  boss: THREE.Vector3 | null;
}

export interface MissionCallbacks {
  onTerminalRequested(terminalIndex: number): void;
  onIntelFound(): void;
  onCommandRequested(target: TargetRef): void;
  /** Boss à genoux : la commande qui l'achève (phase à partir de 0, secondes d'exposition restantes). */
  onBossCommandRequested(phaseIndex: number, secondsLeft: number): void;
  onTakedown(): void;
  onCombatEvent(event: CombatEvent): void;
  /** Le joueur est tombé : il perd une vie et repart du point d'insertion. */
  onPlayerDown(livesLeft: number): void;
  onMissionFailed(): void;
  onExtraction(): void;
  onPauseRequested(): void;
  onNotice(message: string): void;
}

/** Ce qui permet de reprendre une mission là où on l'a laissée (sans les données propres à l'interface). */
export interface MissionProgressState {
  hackedTerminals: number[];
  collectedIntel: number[];
  neutralizedGuards: number[];
  firewalledCameras: number[];
  ammo: number;
  livesLeft: number;
  detections: number;
  neutralizations: number;
  elapsedSeconds: number;
  playerCell: Cell;
  bossDefeated: boolean;
}

export interface MissionOptions {
  /** Gadgets appris pour chaque type de cible (aucun pendant l'introduction). */
  gadgetTargets: Record<TargetKind, boolean>;
  /** Position du module dans la campagne : donne la couleur d'ambiance du secteur. */
  moduleIndex: number;
  quality: QualityProfile;
  avatar: AvatarConfig;
  /** Identité du boss de fin de secteur (le contenu pédagogique reste côté application). */
  boss: { name: string; color: number };
}

const INTERACTION_RADIUS = 0.95;
const INTEL_PICKUP_RADIUS = 0.7;
const EXTRACTION_RADIUS = 0.8;
const RESPAWN_GRACE_SECONDS = 2.5;
const NOISE_ALERT_RADIUS = 11;
/** Un chargeur plein + deux de réserve au départ ; chaque terminal piraté en rapporte un. */
const STARTING_AMMO = 24;
const AMMO_PER_TERMINAL = 8;
const SHOT_RANGE = 14;
const SENTINEL_HIT_RADIUS = 0.42;
const CAMERA_HIT_RADIUS = 0.38;
/** Pistolet silencieux : on l'entend de près seulement. */
const SHOT_NOISE_RADIUS = 4.5;
/** Une balle perdue qui siffle près d'une sentinelle calme l'intrigue. */
const NEAR_MISS_RADIUS = 2.2;
const CAMERA_EMP_SECONDS = 12;
const CAMERA_CALL_RADIUS = 12;
const CAMERA_CALL_COOLDOWN_SECONDS = 4;
const CAMERA_ALARM_COOLDOWN_SECONDS = 6;
/** Rayon dans lequel les sentinelles accourent quand l'alarme est donnée. */
const ALARM_RADIUS = 13;
/** Le gadget agit par le réseau : pas besoin de voir la cible, seulement d'être dans le secteur. */
const COMMAND_RANGE = 14;
/** Une mauvaise commande « réveille » un peu le processus suspendu. */
const COMMAND_FAILURE_PENALTY_SECONDS = 3;
const MAX_HEALTH = 100;
const ENEMY_SHOT_DAMAGE = 20;
/** Les balles du boss font un peu moins mal : elles arrivent par salves entières. */
const BOSS_SHOT_DAMAGE = 15;
const ENEMY_SHOT_SPEED = 13;
const ENEMY_SHOT_RANGE = 16;
const PLAYER_HIT_RADIUS = 0.3;
const HEALTH_REGEN_DELAY_SECONDS = 4;
const HEALTH_REGEN_PER_SECOND = 12;
/** Pad tactile relâché : le tir part dans la dernière direction visée. */
const AIM_MEMORY_SECONDS = 0.35;
const SHOT_HEIGHT = 1.05;
const CAMERA_TARGET_HEIGHT = 2;
const CAMERA_OFFSET = new THREE.Vector3(0, 12.5, 7.5);
/** En visée, la caméra glisse vers la cible pour voir plus loin dans cette direction. */
const AIM_LEAD_FACTOR = 0.35;
const MAX_AIM_LEAD = 3.5;
const TOUCH_AIM_LEAD = 2.5;
const SHAKE_DECAY = 10;
const NOTICE_COOLDOWN_SECONDS = 3;
const FOG_NEAR = 14;
const FOG_FAR = 34;
const MAX_CAMERA_ZOOM = 1.8;
/** Lumière d'ombres : orientée en biais pour des ombres longues, façon infiltration. */
const SHADOW_LIGHT_OFFSET = new THREE.Vector3(5, 11, 3);
const SHADOW_AREA_HALF_SIZE = 11;

/**
 * Recul de caméra selon le format d'écran : en portrait (téléphone), le champ horizontal
 * devient très étroit, on recule donc pour garder les gardes visibles avant qu'ils ne repèrent le joueur.
 */
export function cameraZoomForAspect(aspect: number): number {
  if (!Number.isFinite(aspect) || aspect <= 0) return 1;
  return THREE.MathUtils.clamp(0.85 / aspect, 1, MAX_CAMERA_ZOOM);
}

interface EnemyShot {
  projectile: Projectile;
  mesh: THREE.Mesh;
  damage: number;
}

/** Une mission = un module de la roadmap joué dans un niveau généré. */
export class Mission {
  readonly scene = new THREE.Scene();
  readonly terminals: HackTerminal[];
  livesLeft: number;
  /** Nombre d'alertes déclenchées (une sentinelle ou une caméra t'a repéré). */
  detections = 0;
  neutralizations = 0;
  elapsedSeconds = 0;
  health = MAX_HEALTH;

  private readonly layout: LevelLayout;
  private readonly player: Player;
  private readonly guards: Guard[];
  private readonly identities: SentinelIdentity[];
  private readonly cameras: SecurityCamera[];
  private readonly cameraIdentities: SentinelIdentity[];
  private sidearm = new Sidearm(STARTING_AMMO);
  private readonly effects: CombatEffects;
  private readonly enemyShots: EnemyShot[] = [];
  private readonly wasSuspended: boolean[];
  private readonly boss: Boss;
  /** Salle d'extraction, où le boss garde la sortie. */
  private readonly arena: Room;
  private bossDefeated = false;
  private previousBossState: BossState = "dormant";
  private aim: AimInput | null = null;
  private lastAimAngle = 0;
  private lastAimAt = -Infinity;
  private lastDamageAt = -Infinity;
  private alarmActive = false;
  private cameraCallCooldown = 0;
  private cameraAlarmCooldown = 0;
  private shake = 0;
  private readonly intel: IntelPickup[];
  private readonly extraction: ExtractionZone;
  private readonly targetMarker: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private readonly visuals: LevelVisuals;
  private readonly shadowLight: THREE.DirectionalLight | null;
  private readonly cameraBase = new THREE.Vector3();
  private readonly cameraLead = new THREE.Vector3();
  /** Vecteurs de travail réutilisés à chaque frame : pas d'allocation dans la boucle de rendu. */
  private readonly leadScratch = new THREE.Vector3();
  private readonly focusScratch = new THREE.Vector3();
  private readonly referenceScratch = new THREE.Vector3();
  private readonly cameraOffset = CAMERA_OFFSET.clone();
  private paused = true;
  private finished = false;
  private nightVision = false;
  private graceSeconds = RESPAWN_GRACE_SECONDS;
  private noticeCooldown = 0;

  constructor(
    readonly module: DevOpsModule,
    difficulty: MissionDifficulty,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly input: InputController,
    private readonly callbacks: MissionCallbacks,
    private readonly options: MissionOptions,
  ) {
    this.livesLeft = difficulty.lives;
    const seed = seedFromString(module.id);
    this.layout = generateLevel({
      seed,
      // + 1 : la console principale (scénario d'intervention) en plus des terminaux à question.
      terminalCount: module.challenges.length + 1,
      guardCount: difficulty.guardCount,
      intelCount: module.lessons.length,
      cameraCount: difficulty.cameraCount,
      width: difficulty.mapWidth,
      height: difficulty.mapHeight,
    });
    this.visuals = buildLevelScene(this.scene, this.layout, {
      accent: accentForModule(options.moduleIndex),
      profile: options.quality,
      seed,
    });
    this.shadowLight = options.quality.shadows ? createShadowLight() : null;
    if (this.shadowLight) this.scene.add(this.shadowLight, this.shadowLight.target);

    this.player = new Player(this.layout.grid, options.avatar);
    this.player.placeAt(cellToWorld(this.layout.start));
    this.scene.add(this.player.root);

    this.terminals = this.layout.terminals.map((slot, index) =>
      index < module.challenges.length
        ? new HackTerminal(slot, `NODE-${String(index + 1).padStart(2, "0")}`)
        : new HackTerminal(slot, "CONSOLE", "console"),
    );
    for (const terminal of this.terminals) this.scene.add(terminal.root);

    this.intel = this.layout.intel.map((cell) => new IntelPickup(cell));
    for (const pickup of this.intel) this.scene.add(pickup.root);

    this.guards = this.layout.guards.map((route) => new Guard(this.layout.grid, route, difficulty.guardTuning));
    this.identities = this.guards.map((_, index) => createSentinelIdentity(seed, index + 1));
    this.wasSuspended = this.guards.map(() => false);
    for (const guard of this.guards) this.scene.add(guard.root, guard.visionCone);

    this.cameras = this.layout.cameras.map((slot) => new SecurityCamera(this.layout.grid, slot));
    this.cameraIdentities = this.cameras.map((_, index) => createCameraIdentity(seed, index + 1));
    for (const camera of this.cameras) this.scene.add(camera.root);

    this.arena = arenaContaining(this.layout, this.layout.exit);
    this.boss = new Boss(this.layout.grid, { name: options.boss.name, color: options.boss.color, level: options.moduleIndex, arena: this.arena });
    this.scene.add(this.boss.root);

    this.effects = new CombatEffects(this.scene, options.quality.bloom);
    this.targetMarker = createTargetMarker(0x4fc3ff);
    this.scene.add(this.targetMarker);

    this.extraction = new ExtractionZone(cellToWorld(this.layout.exit));
    this.scene.add(this.extraction.root);
    this.snapCamera();
  }

  get isPaused(): boolean {
    return this.paused;
  }

  get hackedCount(): number {
    return this.terminals.filter((terminal) => terminal.hacked).length;
  }

  get intelCollected(): number {
    return this.intel.filter((pickup) => pickup.collected).length;
  }

  get intelTotal(): number {
    return this.intel.length;
  }

  get isNightVisionOn(): boolean {
    return this.nightVision;
  }

  /** Munitions totales (chargeur + réserve). */
  get ammo(): number {
    return this.sidearm.total;
  }

  targetIdentity(target: TargetRef): SentinelIdentity {
    const identity = target.kind === "sentinel" ? this.identities[target.index] : this.cameraIdentities[target.index];
    if (!identity) throw new RangeError(`Cible ${target.kind} ${target.index} inexistante`);
    return identity;
  }

  /** Visée du joueur, recalculée par l'application à chaque frame (null = aucune visée en cours). */
  setAim(aim: AimInput | null): void {
    this.aim = aim;
    if (!aim) return;
    this.lastAimAngle = this.angleOf(aim);
    this.lastAimAt = this.elapsedSeconds;
  }

  pause(): void {
    this.paused = true;
  }

  setCameraZoom(zoom: number): void {
    this.cameraOffset.copy(CAMERA_OFFSET).multiplyScalar(zoom);
    // Le brouillard est mesuré depuis la caméra : il recule avec elle, sinon tout serait noyé.
    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.near = FOG_NEAR * zoom;
      this.scene.fog.far = FOG_FAR * zoom;
    }
    this.snapCamera();
  }

  resume(): void {
    if (this.finished) return;
    this.paused = false;
    // Les touches pressées pendant un menu ne doivent pas déclencher d'action en jeu.
    this.input.clear();
  }

  markTerminalHacked(terminalIndex: number): void {
    const terminal = this.terminals[terminalIndex];
    if (!terminal) throw new RangeError(`Terminal ${terminalIndex} inexistant`);
    terminal.markHacked();
    // Chaque terminal piraté rapporte des munitions : apprendre donne des moyens d'agir.
    this.sidearm.addAmmo(AMMO_PER_TERMINAL);
    if (!this.allTerminalsHacked) return;
    if (this.bossDefeated) {
      this.refreshExtractionLock();
      this.callbacks.onNotice("Tous les terminaux sont piratés : rejoins le point d'extraction (faisceau vert).");
    } else {
      this.callbacks.onNotice(`Tous les terminaux sont piratés. ${this.options.boss.name} garde la salle d'extraction : entre pour l'affronter.`);
    }
  }

  private get allTerminalsHacked(): boolean {
    return this.terminals.every((terminal) => terminal.hacked);
  }

  /** L'extraction ne s'ouvre qu'une fois les terminaux piratés ET le boss vaincu. */
  private refreshExtractionLock(): void {
    if (this.allTerminalsHacked && this.bossDefeated && !this.extraction.unlocked) this.extraction.unlock();
  }

  /** Commande juste contre le boss : phase suivante, ou victoire et extraction ouverte. */
  completeBossPhase(): "next" | "defeated" {
    const outcome = this.boss.completePhase();
    this.previousBossState = this.boss.state;
    if (outcome === "defeated") {
      this.bossDefeated = true;
      this.refreshExtractionLock();
      this.callbacks.onCombatEvent({ type: "bossDefeated" });
    } else {
      this.callbacks.onCombatEvent({ type: "bossPhaseCleared", phase: this.boss.phaseIndex });
    }
    return outcome;
  }

  /** Secondes d'exposition restantes : le panneau de commande les affiche et les met à jour après une erreur. */
  get bossExposedSecondsLeft(): number {
    return this.boss.exposedSecondsLeft;
  }

  /** Commande ratée contre le boss : il se relève plus tôt, et le bruit attire les sentinelles proches. */
  bossCommandFailed(): void {
    this.boss.commandFailed();
    this.alertGuardsNear(this.player.position, SHOT_NOISE_RADIUS * 2, this.playerCell());
  }

  /** Mauvaise réponse = bruit : les gardes proches viennent inspecter le terminal. */
  raiseNoiseAt(terminalIndex: number): void {
    const terminal = this.terminals[terminalIndex];
    if (!terminal) throw new RangeError(`Terminal ${terminalIndex} inexistant`);
    const noiseCell = terminal.slot.accessCell;
    const noisePosition = cellToWorld(noiseCell);
    for (const guard of this.guards) {
      if (guard.position.distanceTo(noisePosition) <= NOISE_ALERT_RADIUS) guard.investigate(noiseCell);
    }
  }

  captureState(): MissionProgressState {
    const indexesWhere = <T>(items: T[], predicate: (item: T) => boolean): number[] =>
      items.flatMap((item, index) => (predicate(item) ? [index] : []));
    return {
      hackedTerminals: indexesWhere(this.terminals, (terminal) => terminal.hacked),
      collectedIntel: indexesWhere(this.intel, (pickup) => pickup.collected),
      neutralizedGuards: indexesWhere(this.guards, (guard) => guard.neutralized),
      firewalledCameras: indexesWhere(this.cameras, (camera) => camera.firewalled),
      ammo: this.sidearm.total,
      livesLeft: this.livesLeft,
      detections: this.detections,
      neutralizations: this.neutralizations,
      elapsedSeconds: this.elapsedSeconds,
      playerCell: { x: Math.floor(this.player.position.x), z: Math.floor(this.player.position.z) },
      bossDefeated: this.bossDefeated,
    };
  }

  /**
   * Réapplique un état sauvegardé. Renvoie false (sans rien modifier) si l'état ne correspond pas
   * à ce niveau : une sauvegarde d'une ancienne version du jeu ne doit pas produire un état incohérent.
   */
  restoreState(state: MissionProgressState): boolean {
    const inRange = (indexes: number[], length: number): boolean => indexes.every((index) => index >= 0 && index < length);
    const isValid =
      inRange(state.hackedTerminals, this.terminals.length) &&
      inRange(state.collectedIntel, this.intel.length) &&
      inRange(state.neutralizedGuards, this.guards.length) &&
      inRange(state.firewalledCameras, this.cameras.length) &&
      state.livesLeft > 0;
    if (!isValid) return false;

    for (const index of state.hackedTerminals) this.terminals[index]?.markHacked();
    for (const index of state.collectedIntel) this.intel[index]?.collect();
    for (const index of state.neutralizedGuards) this.guards[index]?.neutralize(true);
    for (const index of state.firewalledCameras) this.cameras[index]?.firewall();
    this.sidearm = new Sidearm(state.ammo);
    this.bossDefeated = state.bossDefeated;
    // Boss déjà vaincu avant la sauvegarde : il ne réapparaît pas.
    this.boss.root.visible = !this.bossDefeated;
    this.refreshExtractionLock();
    this.livesLeft = state.livesLeft;
    this.detections = state.detections;
    this.neutralizations = state.neutralizations;
    this.elapsedSeconds = state.elapsedSeconds;
    // Position sauvegardée seulement si elle est praticable ; sinon retour au point d'insertion.
    const cell = this.layout.grid.isWalkable(state.playerCell.x, state.playerCell.z) ? state.playerCell : this.layout.start;
    this.player.placeAt(cellToWorld(cell));
    this.graceSeconds = RESPAWN_GRACE_SECONDS;
    this.snapCamera();
    return true;
  }

  /** Commande juste : sentinelle terminée ou caméra coupée au pare-feu, définitivement. */
  neutralizeByCommand(target: TargetRef): void {
    if (target.kind === "camera") {
      this.cameras[target.index]?.firewall();
      return;
    }
    const guard = this.requireGuard(target.index);
    if (guard.neutralized) return;
    guard.neutralize();
    this.neutralizations++;
  }

  /** Commande ratée : du bruit autour du joueur, et le processus suspendu reprend plus tôt. */
  commandFailedOn(target: TargetRef): void {
    if (target.kind === "sentinel") this.requireGuard(target.index).shortenSuspension(COMMAND_FAILURE_PENALTY_SECONDS);
    this.alertGuardsNear(this.player.position, SHOT_NOISE_RADIUS * 2, this.playerCell());
  }

  hudState(): HudState {
    const commandTarget = this.commandTarget();
    return {
      livesLeft: this.livesLeft,
      health: Math.ceil(this.health),
      maxHealth: MAX_HEALTH,
      hackedCount: this.hackedCount,
      terminalCount: this.terminals.length,
      intelCollected: this.intelCollected,
      intelTotal: this.intelTotal,
      exposure: this.exposure(),
      alarm: this.alarmActive,
      posture: this.player.posture,
      nightVision: this.nightVision,
      aiming: this.player.isAiming,
      contextAction: this.contextAction(),
      gadgetAvailable: this.hasAnyGadget,
      bossDefeated: this.bossDefeated,
      commandTarget: this.bossCommandAvailable()
        ? { kind: "boss", name: this.options.boss.name, secondsLeft: this.boss.exposedSecondsLeft }
        : commandTarget
          ? this.describeCommandTarget(commandTarget)
          : null,
      magazine: this.sidearm.magazine,
      magazineSize: this.sidearm.magazineSize,
      reserve: this.sidearm.reserve,
      reloadProgress: this.sidearm.reloadProgress,
      boss: this.bossHudState(),
    };
  }

  private bossHudState(): BossHudState | null {
    if (this.bossDefeated || this.boss.state === "dormant") return null;
    return {
      name: this.options.boss.name,
      state: this.boss.state,
      phase: Math.min(this.boss.phaseIndex + 1, this.boss.phaseCount),
      phaseCount: this.boss.phaseCount,
      armor: this.boss.armorFraction,
      exposedSecondsLeft: this.boss.exposedSecondsLeft,
    };
  }

  minimapSnapshot(): MinimapSnapshot {
    return {
      layout: this.layout,
      player: this.player.position,
      guards: this.guards.map((guard) => ({ position: guard.position, heading: guard.heading, status: guardStatus(guard) })),
      cameras: this.cameras.map((camera) => ({ cell: camera.slot.floorCell, active: camera.isActive(this.elapsedSeconds) })),
      terminals: this.terminals.map((terminal) => ({ cell: terminal.slot.cell, hacked: terminal.hacked })),
      intel: this.intel.map((pickup) => ({ cell: pickup.cell, collected: pickup.collected })),
      exitUnlocked: this.extraction.unlocked,
      boss: this.bossDefeated || this.boss.state === "dormant" ? null : this.boss.position,
    };
  }

  tick(deltaSeconds: number, elapsedSeconds: number): void {
    this.visuals.update(elapsedSeconds);
    for (const terminal of this.terminals) terminal.update(elapsedSeconds);
    for (const pickup of this.intel) pickup.update(elapsedSeconds);
    this.extraction.update(elapsedSeconds);
    if (this.paused || this.finished) return;

    this.elapsedSeconds += deltaSeconds;
    this.noticeCooldown = Math.max(0, this.noticeCooldown - deltaSeconds);
    this.cameraCallCooldown = Math.max(0, this.cameraCallCooldown - deltaSeconds);
    this.cameraAlarmCooldown = Math.max(0, this.cameraAlarmCooldown - deltaSeconds);
    this.effects.update(deltaSeconds);
    this.sidearm.update(deltaSeconds);
    this.player.setAim(this.aim?.aiming ? this.angleOf(this.aim) : null);
    if (this.handleActions()) return;

    this.player.update(deltaSeconds, this.input.moveIntent());
    // Le boss est un corps solide : on ne le traverse pas (et on ne se met pas « dans » lui pour esquiver ses tirs).
    if (!this.bossDefeated && this.boss.state !== "dormant") this.boss.pushOutOfBody(this.player.position, PLAYER_HIT_RADIUS);
    if (this.collectNearbyIntel()) return;
    this.updateGuards(deltaSeconds);
    if (this.finished || this.paused) return;
    this.updateBoss(deltaSeconds);
    this.updateEnemyShots(deltaSeconds);
    if (this.finished || this.paused) return;
    this.regenerateHealth(deltaSeconds);
    this.updateLaser();
    this.updateTargetMarker(elapsedSeconds);
    this.checkExtraction();
    this.followCamera(deltaSeconds);
  }

  dispose(): void {
    this.player.dispose();
    disposeScene(this.scene);
  }

  /** Renvoie true si une action a interrompu la frame (menu ouvert). */
  private handleActions(): boolean {
    if (this.input.consume("pause")) {
      this.pause();
      this.callbacks.onPauseRequested();
      return true;
    }
    if (this.input.consume("crouch")) this.player.crouched = !this.player.crouched;
    if (this.input.consume("nightVision")) this.nightVision = !this.nightVision;
    if (this.input.consume("interact") && this.performContextAction()) return true;
    if (this.input.consume("command")) return this.requestCommand();
    if (this.input.consume("reload") && this.sidearm.startReload()) this.callbacks.onCombatEvent({ type: "reloadStarted" });
    if (this.input.consume("shoot")) this.shoot();
    return false;
  }

  /** Neutraliser passe avant pirater : une sentinelle dans le dos est une urgence. */
  private contextAction(): HudState["contextAction"] {
    if (this.takedownCandidate()) return { kind: "takedown", label: "Neutraliser la sentinelle" };
    const terminal = this.nearbyTerminal();
    if (!terminal) return null;
    return { kind: "hack", label: terminal.kind === "console" ? "Ouvrir la console principale" : `Pirater ${terminal.label}` };
  }

  private performContextAction(): boolean {
    const guard = this.takedownCandidate();
    if (guard) {
      guard.neutralize();
      this.neutralizations++;
      this.callbacks.onTakedown();
      return false;
    }
    const terminal = this.nearbyTerminal();
    if (!terminal) return false;
    this.pause();
    this.callbacks.onTerminalRequested(this.terminals.indexOf(terminal));
    return true;
  }

  private get hasAnyGadget(): boolean {
    return this.options.gadgetTargets.sentinel || this.options.gadgetTargets.camera;
  }

  /** La commande n'est possible que sur une cible qu'on vient de toucher : pas de balle au but, pas de kill. */
  private requestCommand(): boolean {
    // Le boss s'achève toujours à la commande, même avant d'avoir débloqué le moindre gadget.
    if (this.bossCommandAvailable()) {
      this.pause();
      this.callbacks.onBossCommandRequested(this.boss.phaseIndex, this.boss.exposedSecondsLeft);
      return true;
    }
    if (!this.hasAnyGadget) {
      this.notice("Aucun gadget pour l'instant : approche les sentinelles par derrière (E) pour les neutraliser.");
      return false;
    }
    const target = this.commandTarget();
    if (!target) {
      this.notice(
        this.options.gadgetTargets.camera
          ? "Touche d'abord ta cible au pistolet : une sentinelle touchée est suspendue, une caméra touchée est brouillée. Ensuite seulement, F pour la commande."
          : "Touche d'abord une sentinelle au pistolet : la balle la suspend (SIGSTOP). Ensuite seulement, F pour la terminer avec kill.",
      );
      return false;
    }
    this.pause();
    this.callbacks.onCommandRequested(target);
    return true;
  }

  private takedownCandidate(): Guard | null {
    return this.guards.find((guard) => guard.canBeTakenDownFrom(this.player.position)) ?? null;
  }

  /**
   * Cible du gadget : une sentinelle suspendue ou une caméra brouillée par une balle.
   * À la souris, celle qu'on pointe ; sinon la plus proche.
   */
  private commandTarget(): TargetRef | null {
    if (!this.hasAnyGadget) return null;
    const candidates: { ref: TargetRef; position: THREE.Vector3 }[] = [];
    if (this.options.gadgetTargets.sentinel) {
      this.guards.forEach((guard, index) => {
        if (guard.isSuspended && !guard.neutralized) candidates.push({ ref: { kind: "sentinel", index }, position: guard.position });
      });
    }
    if (this.options.gadgetTargets.camera) {
      this.cameras.forEach((camera, index) => {
        if (camera.disabledSecondsLeft(this.elapsedSeconds) > 0) candidates.push({ ref: { kind: "camera", index }, position: camera.position });
      });
    }
    const inRange = candidates.filter((candidate) => planarDistance(candidate.position, this.player.position) <= COMMAND_RANGE);
    const reference = this.aim?.kind === "point" ? this.referenceScratch.set(this.aim.x, 0, this.aim.z) : this.player.position;
    let best: TargetRef | null = null;
    let bestDistance = Infinity;
    for (const candidate of inRange) {
      const distance = planarDistance(candidate.position, reference);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = candidate.ref;
      }
    }
    return best;
  }

  private bossCommandAvailable(): boolean {
    return !this.bossDefeated && this.boss.state === "exposed" && planarDistance(this.boss.position, this.player.position) <= COMMAND_RANGE;
  }

  private describeCommandTarget(target: TargetRef): CommandTargetInfo {
    const secondsLeft =
      target.kind === "sentinel"
        ? this.requireGuard(target.index).suspensionSecondsLeft
        : (this.cameras[target.index]?.disabledSecondsLeft(this.elapsedSeconds) ?? 0);
    return { kind: target.kind, name: this.targetIdentity(target).containerName, secondsLeft };
  }

  private angleOf(aim: AimInput): number {
    return aim.kind === "direction" ? aim.angle : Math.atan2(aim.z - this.player.position.z, aim.x - this.player.position.x);
  }

  /** Direction du tir : la visée en cours, sinon la dernière (pad relâché), sinon droit devant. */
  private currentAimAngle(): number {
    if (this.aim) return this.angleOf(this.aim);
    if (this.elapsedSeconds - this.lastAimAt <= AIM_MEMORY_SECONDS) return this.lastAimAngle;
    return this.player.facingMathAngle;
  }

  /** Tout ce qu'une balle peut toucher : sentinelles debout ou à terre, caméras pas encore coupées, boss en combat. */
  private shotTargets(): ShotTarget<ShotTargetRef>[] {
    const targets: ShotTarget<ShotTargetRef>[] = [];
    if (!this.bossDefeated && this.boss.isTargetable) {
      targets.push({ id: { kind: "boss" }, x: this.boss.position.x, z: this.boss.position.z, radius: this.boss.hitRadius });
    }
    this.guards.forEach((guard, index) => {
      if (!guard.neutralized) targets.push({ id: { kind: "sentinel", index }, x: guard.position.x, z: guard.position.z, radius: SENTINEL_HIT_RADIUS });
    });
    this.cameras.forEach((camera, index) => {
      if (!camera.firewalled) targets.push({ id: { kind: "camera", index }, x: camera.position.x, z: camera.position.z, radius: CAMERA_HIT_RADIUS });
    });
    return targets;
  }

  /**
   * Tir réel : la balle part dans la direction visée, dispersion comprise, et ne touche que ce
   * qu'elle croise. On peut rater, et un mur ou un rack arrête la balle.
   */
  private shoot(): void {
    const spread = shotSpread({ posture: this.player.posture, isMoving: this.player.isMoving, aiming: this.player.isAiming, recoil: this.sidearm.recoil });
    const fire = this.sidearm.tryFire();
    if (fire === "empty") {
      this.callbacks.onCombatEvent({ type: "dryFire" });
      if (this.sidearm.isReloading) this.callbacks.onCombatEvent({ type: "reloadStarted" });
      else this.notice("Plus de munitions : pirate un terminal pour en récupérer, ou neutralise en silence par derrière (E).");
      return;
    }
    if (fire !== "fired") return;

    const aimAngle = this.currentAimAngle();
    const angle = applySpread(aimAngle, spread, Math.random);
    const trace = traceShot(this.layout.grid, this.player.position.x, this.player.position.z, angle, SHOT_RANGE, this.shotTargets());
    this.player.faceShot(aimAngle);
    const muzzle = this.player.muzzlePosition();
    const result = this.applyShotHit(trace.hit);
    const impact = new THREE.Vector3(trace.impactX, result === "camera" ? CAMERA_TARGET_HEIGHT : SHOT_HEIGHT, trace.impactZ);
    this.showShotImpact(impact, result, angle);
    this.effects.tracer(muzzle, impact, PLAYER_SHOT_COLOR);
    this.effects.muzzleFlash(muzzle);
    this.shake = Math.max(this.shake, 0.05);
    if (result === "miss") this.alertGuardsNear(impact, NEAR_MISS_RADIUS, this.playerCell());
    // Silencieux, mais pas muet : les sentinelles tout près entendent le tir.
    this.alertGuardsNear(this.player.position, SHOT_NOISE_RADIUS, this.playerCell());
    this.callbacks.onCombatEvent({ type: "shot", result, impact });
  }

  private applyShotHit(hit: ShotTargetRef | null): ShotResult {
    if (!hit) return "miss";
    if (hit.kind === "boss") {
      const outcome = this.boss.takeHit();
      if (outcome === "exposed") this.previousBossState = "exposed";
      return outcome === "exposed" ? "bossExposed" : outcome === "armor" ? "bossArmor" : "miss";
    }
    if (hit.kind === "camera") {
      this.cameras[hit.index]?.disableUntil(this.elapsedSeconds + CAMERA_EMP_SECONDS);
      return "camera";
    }
    const outcome = this.requireGuard(hit.index).takeHit(this.player.position);
    if (outcome === "suspended") return "suspended";
    // Le bouclier a tenu : la sentinelle sait où tu es et donne l'alarme.
    if (outcome === "shield") this.raiseAlarm("sentinel");
    return outcome === "shield" ? "shield" : "miss";
  }

  private showShotImpact(impact: THREE.Vector3, result: ShotResult, angle: number): void {
    if (result === "suspended" || result === "camera" || result === "bossExposed") this.effects.burst(impact, SUSPEND_SPARK_COLOR, result === "bossExposed" ? 30 : 18);
    else if (result === "shield" || result === "bossArmor") this.effects.burst(impact, SHIELD_SPARK_COLOR, 14);
    // Ricochet : la gerbe repart vers le tireur, comme sur un vrai mur.
    else this.effects.burst(impact, WALL_SPARK_COLOR, 8, angle + Math.PI);
  }

  /** Alarme : compte une détection (une seule par alerte) et fait converger les sentinelles proches. */
  private raiseAlarm(source: "sentinel" | "camera"): void {
    if (!this.alarmActive) {
      this.detections++;
      this.callbacks.onCombatEvent({ type: "alarm", source });
    }
    this.alarmActive = true;
    for (const guard of this.guards) {
      if (!guard.neutralized && planarDistance(guard.position, this.player.position) <= ALARM_RADIUS) guard.engage(this.player.position);
    }
  }

  private alertGuardsNear(origin: THREE.Vector3, radius: number, noiseCell: Cell): void {
    for (const guard of this.guards) {
      if (!guard.neutralized && planarDistance(guard.position, origin) <= radius) guard.alertTo(noiseCell);
    }
  }

  private collectNearbyIntel(): boolean {
    const pickup = this.intel.find(
      (candidate) =>
        !candidate.collected &&
        Math.hypot(this.player.position.x - candidate.position.x, this.player.position.z - candidate.position.z) <= INTEL_PICKUP_RADIUS,
    );
    if (!pickup) return false;
    pickup.collect();
    this.pause();
    this.callbacks.onIntelFound();
    return true;
  }

  private updateGuards(deltaSeconds: number): void {
    this.graceSeconds = Math.max(0, this.graceSeconds - deltaSeconds);
    const playerSnapshot =
      this.graceSeconds > 0
        ? null
        : { position: this.player.position, posture: this.player.posture, isMoving: this.player.isMoving };
    this.guards.forEach((guard, index) => {
      guard.update(deltaSeconds, playerSnapshot);
      if (guard.consumeAlarm()) this.raiseAlarm("sentinel");
      const shot = guard.consumeShot();
      if (shot && playerSnapshot) this.fireGuardShot(shot);
      if (this.wasSuspended[index] && !guard.isSuspended && !guard.neutralized) {
        this.callbacks.onCombatEvent({ type: "sentinelWoke" });
        this.notice(`${this.identities[index]?.containerName ?? "Une sentinelle"} reprend du service (SIGCONT) : elle est furieuse !`);
      }
      this.wasSuspended[index] = guard.isSuspended;
    });
    for (const camera of this.cameras) {
      camera.update(deltaSeconds, this.elapsedSeconds, playerSnapshot);
      // Une caméra qui te voit appelle les sentinelles proches avant même de déclencher l'alarme.
      if (camera.alarm >= 0.5 && this.cameraCallCooldown === 0) {
        this.alertGuardsNear(camera.position, CAMERA_CALL_RADIUS, this.playerCell());
        this.cameraCallCooldown = CAMERA_CALL_COOLDOWN_SECONDS;
        this.notice("Une caméra t'a repéré : des sentinelles arrivent !");
      }
      if (camera.alarm >= 1 && this.cameraAlarmCooldown === 0) {
        this.raiseAlarm("camera");
        camera.resetAlarm();
        this.cameraAlarmCooldown = CAMERA_ALARM_COOLDOWN_SECONDS;
      }
    }
    this.alarmActive = this.guards.some((guard) => !guard.neutralized && guard.isHostile);
  }

  private fireGuardShot(shot: GuardShot): void {
    this.spawnEnemyProjectile(shot.x, shot.z, shot.angle, ENEMY_SHOT_SPEED, ENEMY_SHOT_DAMAGE);
    this.callbacks.onCombatEvent({ type: "enemyShot" });
  }

  private spawnEnemyProjectile(x: number, z: number, angle: number, speed: number, damage: number): void {
    const projectile = createProjectile(x, z, angle, speed, ENEMY_SHOT_RANGE);
    const mesh = this.effects.createProjectileMesh();
    mesh.position.set(x, SHOT_HEIGHT, z);
    // La capsule est verticale par défaut : on la couche dans l'axe du tir.
    mesh.quaternion.setFromUnitVectors(UP_AXIS, new THREE.Vector3(projectile.directionX, 0, projectile.directionZ));
    this.enemyShots.push({ projectile, mesh, damage });
    this.effects.burst(mesh.position, ENEMY_SHOT_COLOR, 4, angle);
  }

  /**
   * Le boss dort jusqu'à ce que l'agent entre dans la salle d'extraction avec tous les terminaux piratés :
   * le combat arrive au moment où l'on a appris tout ce qu'il faut pour le gagner.
   */
  private updateBoss(deltaSeconds: number): void {
    if (this.bossDefeated) {
      // Vaincu pendant cette partie : on laisse jouer l'effondrement (et disparaître ses étiquettes).
      if (this.boss.root.visible) this.boss.update(deltaSeconds, null);
      return;
    }
    if (this.boss.state === "dormant") {
      if (!this.allTerminalsHacked || this.graceSeconds > 0 || !isInsideRoom(this.arena, this.player.position)) return;
      this.boss.awaken();
      this.callbacks.onCombatEvent({ type: "bossAwakened" });
    }
    this.boss.update(deltaSeconds, this.graceSeconds > 0 ? null : { position: this.player.position });
    const shots = this.boss.consumeShots();
    for (const shot of shots) this.spawnEnemyProjectile(shot.x, shot.z, shot.angle, shot.speed, BOSS_SHOT_DAMAGE);
    // Un seul son par salve : un anneau de 14 balles ne doit pas faire 14 détonations.
    if (shots.length > 0) this.callbacks.onCombatEvent({ type: "enemyShot" });
    // L'exposition n'a pas été exploitée à temps : le boss se relève avec une partie de son armure.
    if (this.previousBossState === "exposed" && this.boss.state === "fighting") this.callbacks.onCombatEvent({ type: "bossRecovered" });
    this.previousBossState = this.boss.state;
  }

  private updateEnemyShots(deltaSeconds: number): void {
    const target = this.graceSeconds > 0 ? null : { x: this.player.position.x, z: this.player.position.z, radius: PLAYER_HIT_RADIUS };
    for (let index = this.enemyShots.length - 1; index >= 0; index--) {
      const shot = this.enemyShots[index] as EnemyShot;
      const outcome = advanceProjectile(this.layout.grid, shot.projectile, deltaSeconds, target);
      shot.mesh.position.set(shot.projectile.x, SHOT_HEIGHT, shot.projectile.z);
      if (outcome === "flying") continue;
      if (outcome === "wall") {
        const backwards = Math.atan2(-shot.projectile.directionZ, -shot.projectile.directionX);
        this.effects.burst(shot.mesh.position, ENEMY_SHOT_COLOR, 6, backwards);
      }
      this.effects.removeProjectileMesh(shot.mesh);
      this.enemyShots.splice(index, 1);
      if (outcome === "hit") {
        this.effects.burst(shot.mesh.position, ENEMY_SHOT_COLOR, 12);
        this.damagePlayer(shot.damage);
        if (this.finished || this.paused) return;
      }
    }
  }

  private clearEnemyShots(): void {
    for (const shot of this.enemyShots) this.effects.removeProjectileMesh(shot.mesh);
    this.enemyShots.length = 0;
  }

  private damagePlayer(amount: number): void {
    this.health = Math.max(0, this.health - amount);
    this.lastDamageAt = this.elapsedSeconds;
    this.shake = Math.max(this.shake, 0.22);
    this.callbacks.onCombatEvent({ type: "playerHit", health: this.health });
    if (this.health === 0) this.playerDown();
  }

  /** Santé à zéro : une vie en moins, retour au point d'insertion. Terminaux et sentinelles terminées restent acquis. */
  private playerDown(): void {
    this.livesLeft--;
    this.clearEnemyShots();
    if (this.livesLeft <= 0) {
      this.finished = true;
      this.callbacks.onMissionFailed();
      return;
    }
    this.player.placeAt(cellToWorld(this.layout.start));
    this.player.crouched = false;
    this.health = MAX_HEALTH;
    for (const guard of this.guards) guard.reset();
    for (const camera of this.cameras) camera.resetAlarm();
    // Combat de boss perdu : il se rendort, armure pleine ; on revient l'affronter.
    if (!this.bossDefeated) this.boss.reset();
    this.previousBossState = "dormant";
    this.wasSuspended.fill(false);
    this.alarmActive = false;
    this.graceSeconds = RESPAWN_GRACE_SECONDS;
    this.snapCamera();
    this.pause();
    this.callbacks.onPlayerDown(this.livesLeft);
  }

  /** Comme dans la plupart des jeux d'action : quelques secondes à l'abri et la santé remonte. */
  private regenerateHealth(deltaSeconds: number): void {
    if (this.health >= MAX_HEALTH || this.elapsedSeconds - this.lastDamageAt < HEALTH_REGEN_DELAY_SECONDS) return;
    this.health = Math.min(MAX_HEALTH, this.health + HEALTH_REGEN_PER_SECOND * deltaSeconds);
  }

  private exposure(): number {
    if (this.alarmActive) return 1;
    if (!this.bossDefeated && this.boss.state !== "dormant" && this.boss.state !== "defeated") return 1;
    const guardAwareness = this.guards.reduce((highest, guard) => (guard.neutralized || guard.isSuspended ? highest : Math.max(highest, guard.awareness)), 0);
    return Math.max(guardAwareness, this.cameras.reduce((highest, camera) => Math.max(highest, camera.alarm), 0));
  }

  /** Laser de visée : on voit exactement l'axe du canon (la dispersion peut quand même dévier la balle). */
  private updateLaser(): void {
    if (!this.player.isAiming) {
      this.effects.hideLaser();
      return;
    }
    const angle = this.currentAimAngle();
    const muzzle = this.player.muzzlePosition();
    const trace = traceShot(this.layout.grid, this.player.position.x, this.player.position.z, angle, SHOT_RANGE, this.shotTargets());
    this.effects.showLaser(muzzle, new THREE.Vector3(trace.impactX, muzzle.y, trace.impactZ), trace.hit !== null);
  }

  private checkExtraction(): void {
    const distance = Math.hypot(
      this.player.position.x - this.extraction.position.x,
      this.player.position.z - this.extraction.position.z,
    );
    if (distance > EXTRACTION_RADIUS) return;
    if (this.extraction.unlocked) {
      this.finished = true;
      this.paused = true;
      this.callbacks.onExtraction();
      return;
    }
    const remaining = this.terminals.length - this.hackedCount;
    this.notice(`Extraction verrouillée : encore ${remaining} terminal(aux) à pirater.`);
  }

  private notice(message: string): void {
    if (this.noticeCooldown > 0) return;
    this.callbacks.onNotice(message);
    this.noticeCooldown = NOTICE_COOLDOWN_SECONDS;
  }

  private nearbyTerminal(): HackTerminal | null {
    for (const terminal of this.terminals) {
      if (terminal.hacked) continue;
      const distance = Math.hypot(
        this.player.position.x - terminal.interactionPoint.x,
        this.player.position.z - terminal.interactionPoint.z,
      );
      if (distance <= INTERACTION_RADIUS) return terminal;
    }
    return null;
  }

  /** Anneau bleu sous la cible qu'on peut terminer à la commande (touche F). */
  private updateTargetMarker(elapsedSeconds: number): void {
    const target = this.commandTarget();
    const position = target ? this.targetPosition(target) : null;
    this.targetMarker.visible = position !== null;
    if (!position) return;
    this.targetMarker.position.set(position.x, 0.05, position.z);
    this.targetMarker.rotation.z = elapsedSeconds * 1.5;
  }

  private targetPosition(target: TargetRef): THREE.Vector3 | null {
    return target.kind === "sentinel" ? (this.guards[target.index]?.position ?? null) : (this.cameras[target.index]?.position ?? null);
  }

  private requireGuard(guardIndex: number): Guard {
    const guard = this.guards[guardIndex];
    if (!guard) throw new RangeError(`Sentinelle ${guardIndex} inexistante`);
    return guard;
  }

  private playerCell(): Cell {
    return { x: Math.floor(this.player.position.x), z: Math.floor(this.player.position.z) };
  }

  private followCamera(deltaSeconds: number): void {
    this.followShadowLight();
    // Lissage indépendant du framerate (exponentiel) : même ressenti à 30 ou 144 FPS.
    this.cameraLead.lerp(this.aimLead(), 1 - Math.exp(-deltaSeconds * 4));
    this.focusScratch.set(this.player.position.x + this.cameraLead.x, 0, this.player.position.z + this.cameraLead.z).add(this.cameraOffset);
    this.cameraBase.lerp(this.focusScratch, 1 - Math.exp(-deltaSeconds * 6));
    // Secousse appliquée par-dessus la position lissée : elle ne « traîne » pas dans le suivi.
    this.shake *= Math.exp(-deltaSeconds * SHAKE_DECAY);
    this.camera.position.set(
      this.cameraBase.x + (Math.random() - 0.5) * 2 * this.shake,
      this.cameraBase.y + (Math.random() - 0.5) * 2 * this.shake,
      this.cameraBase.z + (Math.random() - 0.5) * 2 * this.shake,
    );
    this.camera.lookAt(this.cameraBase.x - this.cameraOffset.x, 0.5, this.cameraBase.z - this.cameraOffset.z);
  }

  /** En visée, la caméra anticipe : on voit plus loin là où l'on vise, comme dans les jeux de tir vus de dessus. */
  private aimLead(): THREE.Vector3 {
    const lead = this.leadScratch.set(0, 0, 0);
    if (!this.player.isAiming || !this.aim) return lead;
    if (this.aim.kind === "direction") return lead.set(Math.cos(this.aim.angle), 0, Math.sin(this.aim.angle)).multiplyScalar(TOUCH_AIM_LEAD);
    return lead.set(this.aim.x - this.player.position.x, 0, this.aim.z - this.player.position.z).multiplyScalar(AIM_LEAD_FACTOR).clampLength(0, MAX_AIM_LEAD);
  }

  /** La carte d'ombres ne couvre que les alentours du joueur : on la déplace avec lui (bien plus net que tout le niveau). */
  private followShadowLight(): void {
    if (!this.shadowLight) return;
    this.shadowLight.target.position.copy(this.player.position);
    this.shadowLight.position.copy(this.player.position).add(SHADOW_LIGHT_OFFSET);
  }

  private snapCamera(): void {
    this.followShadowLight();
    this.cameraLead.set(0, 0, 0);
    this.shake = 0;
    this.cameraBase.copy(this.player.position).setY(0).add(this.cameraOffset);
    this.camera.position.copy(this.cameraBase);
    this.camera.lookAt(this.player.position.x, 0.5, this.player.position.z);
  }
}

const UP_AXIS = new THREE.Vector3(0, 1, 0);

/** La salle qui contient la sortie ; à défaut (sortie dans un couloir), la salle dont le centre en est le plus proche. */
function arenaContaining(layout: LevelLayout, cell: Cell): Room {
  const containing = layout.rooms.find((room) => isInsideRoom(room, { x: cell.x + 0.5, z: cell.z + 0.5 }));
  if (containing) return containing;
  const byDistance = [...layout.rooms].sort(
    (first, second) =>
      Math.hypot(first.x + first.width / 2 - cell.x, first.z + first.height / 2 - cell.z) -
      Math.hypot(second.x + second.width / 2 - cell.x, second.z + second.height / 2 - cell.z),
  );
  const nearest = byDistance[0];
  if (!nearest) throw new Error("Niveau sans salle : impossible de placer le boss");
  return nearest;
}

function isInsideRoom(room: Room, position: { x: number; z: number }): boolean {
  return position.x >= room.x && position.x < room.x + room.width && position.z >= room.z && position.z < room.z + room.height;
}

function guardStatus(guard: Guard): GuardStatus {
  if (guard.neutralized) return "down";
  if (guard.isSuspended) return "suspended";
  return guard.isHostile ? "hostile" : "calm";
}

function planarDistance(first: THREE.Vector3, second: THREE.Vector3): number {
  return Math.hypot(first.x - second.x, first.z - second.z);
}

/** Réticule au sol sous la cible du gadget. */
function createTargetMarker(color: number): THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial> {
  const marker = new THREE.Mesh(
    new THREE.RingGeometry(0.5, 0.62, 4, 1),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }),
  );
  marker.rotation.x = -Math.PI / 2;
  marker.visible = false;
  return marker;
}

function createShadowLight(): THREE.DirectionalLight {
  const light = new THREE.DirectionalLight(0xa8c4ff, 0.9);
  light.castShadow = true;
  light.shadow.mapSize.set(1024, 1024);
  light.shadow.bias = -0.0008;
  light.shadow.normalBias = 0.03;
  const shadowCamera = light.shadow.camera;
  shadowCamera.left = -SHADOW_AREA_HALF_SIZE;
  shadowCamera.right = SHADOW_AREA_HALF_SIZE;
  shadowCamera.top = SHADOW_AREA_HALF_SIZE;
  shadowCamera.bottom = -SHADOW_AREA_HALF_SIZE;
  shadowCamera.near = 1;
  shadowCamera.far = 30;
  return light;
}
