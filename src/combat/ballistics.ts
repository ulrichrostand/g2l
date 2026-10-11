import { castRay, type Grid } from "../core/grid";
import type { Posture } from "../entities/player";

/**
 * Balistique du jeu, en 2D sur le plan du sol (tout le monde est au sol, la hauteur n'apporte rien).
 * Module pur, sans Three.js : testable et réutilisable par le joueur comme par les sentinelles.
 */

export interface ShotTarget<Id> {
  id: Id;
  x: number;
  z: number;
  /** Rayon de la silhouette : une balle qui passe plus loin rate la cible. */
  radius: number;
}

export interface ShotTrace<Id> {
  /** Cible touchée en premier, ou null si la balle finit dans un mur (ou au bout de sa portée). */
  hit: Id | null;
  distance: number;
  impactX: number;
  impactZ: number;
}

/** Distance le long du rayon jusqu'au cercle, ou null s'il le manque. Direction unitaire attendue. */
export function rayCircleDistance(
  originX: number,
  originZ: number,
  directionX: number,
  directionZ: number,
  centerX: number,
  centerZ: number,
  radius: number,
): number | null {
  const offsetX = originX - centerX;
  const offsetZ = originZ - centerZ;
  const projection = offsetX * directionX + offsetZ * directionZ;
  const squaredDistanceOutside = offsetX * offsetX + offsetZ * offsetZ - radius * radius;
  // Tireur collé à la cible (bout portant) : touché d'office.
  if (squaredDistanceOutside <= 0) return 0;
  const discriminant = projection * projection - squaredDistanceOutside;
  if (discriminant < 0) return null;
  const distance = -projection - Math.sqrt(discriminant);
  return distance >= 0 ? distance : null;
}

/**
 * Tir instantané : la balle suit exactement l'angle donné (dispersion déjà appliquée par l'appelant)
 * et touche la première silhouette avant le premier mur ou rack. O(cibles + distance).
 */
export function traceShot<Id>(
  grid: Grid,
  originX: number,
  originZ: number,
  angle: number,
  range: number,
  targets: readonly ShotTarget<Id>[],
): ShotTrace<Id> {
  const directionX = Math.cos(angle);
  const directionZ = Math.sin(angle);
  let hit: Id | null = null;
  let distance = castRay(grid, originX, originZ, angle, range);
  for (const target of targets) {
    const targetDistance = rayCircleDistance(originX, originZ, directionX, directionZ, target.x, target.z, target.radius);
    if (targetDistance !== null && targetDistance < distance) {
      distance = targetDistance;
      hit = target.id;
    }
  }
  return { hit, distance, impactX: originX + directionX * distance, impactZ: originZ + directionZ * distance };
}

export interface SpreadContext {
  posture: Posture;
  isMoving: boolean;
  /** Visée épaulée (clic droit maintenu / pad de tir) : bien plus précis qu'un tir à la hanche. */
  aiming: boolean;
  /** Recul accumulé par les tirs rapprochés, en radians. */
  recoil: number;
}

const BASE_SPREAD: Record<Posture | "still" | "crouchedStill", number> = {
  crouchedStill: 0.008,
  still: 0.014,
  crouching: 0.026,
  standing: 0.05,
  running: 0.12,
};
const AIMED_SPREAD_FACTOR = 0.55;
const HIP_FIRE_SPREAD_FACTOR = 1.5;

/** Demi-angle de dispersion (radians) : immobile, accroupi et en visée = tir précis ; en courant = au jugé. */
export function shotSpread(context: SpreadContext): number {
  const stance = context.isMoving ? context.posture : context.posture === "crouching" ? "crouchedStill" : "still";
  const factor = context.aiming ? AIMED_SPREAD_FACTOR : HIP_FIRE_SPREAD_FACTOR;
  return BASE_SPREAD[stance] * factor + context.recoil;
}

/** Applique la dispersion : `random` ∈ [0, 1[ (injectable pour les tests). */
export function applySpread(angle: number, spread: number, random: () => number): number {
  return angle + (random() * 2 - 1) * spread;
}

export interface SidearmConfig {
  magazineSize: number;
  maxReserve: number;
  fireCooldownSeconds: number;
  reloadSeconds: number;
  recoilPerShot: number;
  maxRecoil: number;
  recoilRecoveryPerSecond: number;
}

export const SIDEARM: SidearmConfig = {
  magazineSize: 8,
  maxReserve: 48,
  fireCooldownSeconds: 0.28,
  reloadSeconds: 1.3,
  recoilPerShot: 0.035,
  maxRecoil: 0.12,
  recoilRecoveryPerSecond: 0.16,
};

export type FireResult = "fired" | "empty" | "reloading" | "cooldown";

/** Pistolet du joueur : chargeur, réserve, cadence, rechargement et recul. */
export class Sidearm {
  magazine: number;
  reserve: number;
  recoil = 0;
  private cooldown = 0;
  private reloadRemaining = 0;

  constructor(
    totalAmmo: number,
    private readonly config: SidearmConfig = SIDEARM,
  ) {
    const total = Math.max(0, Math.floor(totalAmmo));
    this.magazine = Math.min(config.magazineSize, total);
    this.reserve = Math.min(config.maxReserve, total - this.magazine);
  }

  get total(): number {
    return this.magazine + this.reserve;
  }

  get magazineSize(): number {
    return this.config.magazineSize;
  }

  get isReloading(): boolean {
    return this.reloadRemaining > 0;
  }

  /** Avancement du rechargement ∈ [0, 1] (0 si on ne recharge pas). */
  get reloadProgress(): number {
    return this.isReloading ? 1 - this.reloadRemaining / this.config.reloadSeconds : 0;
  }

  tryFire(): FireResult {
    if (this.isReloading) return "reloading";
    if (this.cooldown > 0) return "cooldown";
    if (this.magazine === 0) {
      // Chargeur vide : on enchaîne sur le rechargement, comme dans tout jeu de tir.
      this.startReload();
      return "empty";
    }
    this.magazine--;
    this.cooldown = this.config.fireCooldownSeconds;
    this.recoil = Math.min(this.config.maxRecoil, this.recoil + this.config.recoilPerShot);
    return "fired";
  }

  /** Renvoie false si le rechargement est inutile (chargeur plein) ou impossible (réserve vide). */
  startReload(): boolean {
    if (this.isReloading || this.magazine === this.config.magazineSize || this.reserve === 0) return false;
    this.reloadRemaining = this.config.reloadSeconds;
    return true;
  }

  update(deltaSeconds: number): void {
    this.cooldown = Math.max(0, this.cooldown - deltaSeconds);
    this.recoil = Math.max(0, this.recoil - this.config.recoilRecoveryPerSecond * deltaSeconds);
    if (!this.isReloading) return;
    this.reloadRemaining = Math.max(0, this.reloadRemaining - deltaSeconds);
    if (this.reloadRemaining > 0) return;
    const moved = Math.min(this.config.magazineSize - this.magazine, this.reserve);
    this.magazine += moved;
    this.reserve -= moved;
  }

  addAmmo(rounds: number): void {
    this.reserve = Math.min(this.config.maxReserve, this.reserve + Math.max(0, Math.floor(rounds)));
  }
}

export interface Projectile {
  x: number;
  z: number;
  directionX: number;
  directionZ: number;
  speed: number;
  travelled: number;
  maxRange: number;
}

export type ProjectileOutcome = "flying" | "wall" | "hit" | "expired";

export function createProjectile(x: number, z: number, angle: number, speed: number, maxRange: number): Projectile {
  return { x, z, directionX: Math.cos(angle), directionZ: Math.sin(angle), speed, travelled: 0, maxRange };
}

/**
 * Fait avancer un tir ennemi (visible et esquivable, contrairement au tir instantané du joueur).
 * La trajectoire de la frame est testée en entier : une balle rapide ne traverse ni mur ni joueur.
 */
export function advanceProjectile(
  grid: Grid,
  projectile: Projectile,
  deltaSeconds: number,
  target: { x: number; z: number; radius: number } | null,
): ProjectileOutcome {
  const step = Math.min(projectile.speed * deltaSeconds, projectile.maxRange - projectile.travelled);
  const angle = Math.atan2(projectile.directionZ, projectile.directionX);
  const wallDistance = castRay(grid, projectile.x, projectile.z, angle, step);
  const hitDistance = target
    ? rayCircleDistance(projectile.x, projectile.z, projectile.directionX, projectile.directionZ, target.x, target.z, target.radius)
    : null;
  const moveBy = (distance: number): void => {
    projectile.x += projectile.directionX * distance;
    projectile.z += projectile.directionZ * distance;
    projectile.travelled += distance;
  };
  if (hitDistance !== null && hitDistance <= Math.min(step, wallDistance)) {
    moveBy(hitDistance);
    return "hit";
  }
  if (wallDistance < step) {
    moveBy(wallDistance);
    return "wall";
  }
  moveBy(step);
  // Filet de sécurité : une balle posée pile sur la frontière d'un mur ne doit pas passer à travers.
  if (grid.blocksSight(Math.floor(projectile.x), Math.floor(projectile.z))) return "wall";
  return projectile.travelled >= projectile.maxRange ? "expired" : "flying";
}
