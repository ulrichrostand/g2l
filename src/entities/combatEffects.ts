import * as THREE from "three";

const UP = new THREE.Vector3(0, 1, 0);
const TRACER_LIFETIME_SECONDS = 0.12;
/** Une ligne WebGL fait toujours 1 pixel : le laser est un cylindre très fin, lisible à toute résolution. */
const LASER_RADIUS = 0.016;
const SPARK_CAPACITY = 240;
const SPARK_LIFETIME_SECONDS = 0.45;
const SPARK_GRAVITY = 9;
const MUZZLE_FLASH_SECONDS = 0.06;
/** Couleurs > 1 : elles dépassent le seuil du bloom et « brillent » (néons, balles). */
export const PLAYER_SHOT_COLOR = new THREE.Color(1.2, 3.5, 4.5);
export const ENEMY_SHOT_COLOR = new THREE.Color(5, 0.5, 0.4);
export const SUSPEND_SPARK_COLOR = new THREE.Color(0.6, 2.2, 4);
export const SHIELD_SPARK_COLOR = new THREE.Color(4, 3.2, 0.8);
export const WALL_SPARK_COLOR = new THREE.Color(3, 1.6, 0.6);

interface Tracer {
  mesh: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
  life: number;
}

/**
 * Tout le « jus » visuel du combat : traçantes, flash du canon, étincelles d'impact,
 * projectiles ennemis et laser de visée. Les ressources sont créées une fois et réutilisées :
 * aucun ajout de lumière en cours de partie (cela recompilerait tous les shaders, d'où des saccades).
 */
export class CombatEffects {
  private readonly tracers: Tracer[] = [];
  private readonly tracerGeometry = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);
  private readonly projectileGeometry = new THREE.CapsuleGeometry(0.06, 0.34, 2, 6);
  private readonly projectileMaterial = new THREE.MeshBasicMaterial({ color: ENEMY_SHOT_COLOR, toneMapped: false });
  /** null en qualité basse : même éteinte, une lumière de plus alourdit l'éclairage de chaque pixel. */
  private readonly muzzleLight: THREE.PointLight | null;
  private muzzleTimer = 0;
  private readonly sparkPositions = new Float32Array(SPARK_CAPACITY * 3);
  private readonly sparkColors = new Float32Array(SPARK_CAPACITY * 3);
  private readonly sparkBaseColors = new Float32Array(SPARK_CAPACITY * 3);
  private readonly sparkVelocities = new Float32Array(SPARK_CAPACITY * 3);
  private readonly sparkLife = new Float32Array(SPARK_CAPACITY);
  private nextSpark = 0;
  private readonly sparks: THREE.Points;
  private readonly laser: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
  private readonly laserDot: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  private readonly laserDirection = new THREE.Vector3();

  constructor(
    private readonly scene: THREE.Scene,
    withMuzzleLight: boolean,
  ) {
    this.muzzleLight = withMuzzleLight ? new THREE.PointLight(0x9fe8ff, 0, 5, 2) : null;
    if (this.muzzleLight) scene.add(this.muzzleLight);

    const sparkGeometry = new THREE.BufferGeometry();
    sparkGeometry.setAttribute("position", new THREE.BufferAttribute(this.sparkPositions, 3));
    sparkGeometry.setAttribute("color", new THREE.BufferAttribute(this.sparkColors, 3));
    this.sparks = new THREE.Points(
      sparkGeometry,
      new THREE.PointsMaterial({ size: 0.09, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
    );
    // Les étincelles bougent partout dans le niveau : pas de boîte englobante fiable pour le culling.
    this.sparks.frustumCulled = false;
    scene.add(this.sparks);

    this.laser = new THREE.Mesh(
      this.tracerGeometry,
      new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.2, 0.2), transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
    );
    this.laser.visible = false;
    this.laserDot = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.3, 0.3), toneMapped: false }));
    this.laserDot.visible = false;
    scene.add(this.laser, this.laserDot);
  }

  tracer(from: THREE.Vector3, to: THREE.Vector3, color: THREE.Color, radius = 0.03): void {
    const length = from.distanceTo(to);
    if (length < 0.01) return;
    const mesh = new THREE.Mesh(this.tracerGeometry, new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, toneMapped: false }));
    mesh.scale.set(radius, length, radius);
    mesh.position.copy(from).add(to).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(UP, to.clone().sub(from).normalize());
    this.scene.add(mesh);
    this.tracers.push({ mesh, life: TRACER_LIFETIME_SECONDS });
  }

  muzzleFlash(position: THREE.Vector3, intensity = 9): void {
    // Sans lumière (qualité basse), la traçante et les étincelles suffisent à lire le tir.
    this.burst(position, PLAYER_SHOT_COLOR, 3);
    if (!this.muzzleLight) return;
    this.muzzleLight.position.copy(position);
    this.muzzleLight.intensity = intensity;
    this.muzzleTimer = MUZZLE_FLASH_SECONDS;
  }

  /** Gerbe d'étincelles : `normalAngle` oriente la gerbe (rebond sur un mur), sinon dans toutes les directions. */
  burst(position: THREE.Vector3, color: THREE.Color, count: number, normalAngle: number | null = null): void {
    for (let spark = 0; spark < count; spark++) {
      const index = this.nextSpark;
      this.nextSpark = (this.nextSpark + 1) % SPARK_CAPACITY;
      const angle = normalAngle === null ? Math.random() * Math.PI * 2 : normalAngle + (Math.random() - 0.5) * 2.2;
      const speed = 1.5 + Math.random() * 3.5;
      this.sparkPositions.set([position.x, position.y, position.z], index * 3);
      this.sparkVelocities.set([Math.cos(angle) * speed, 1 + Math.random() * 3, Math.sin(angle) * speed], index * 3);
      this.sparkBaseColors.set([color.r, color.g, color.b], index * 3);
      this.sparkLife[index] = SPARK_LIFETIME_SECONDS * (0.6 + Math.random() * 0.4);
    }
  }

  createProjectileMesh(): THREE.Mesh {
    const mesh = new THREE.Mesh(this.projectileGeometry, this.projectileMaterial);
    this.scene.add(mesh);
    return mesh;
  }

  /** Les ressources du projectile sont partagées : on le retire de la scène sans les libérer. */
  removeProjectileMesh(mesh: THREE.Mesh): void {
    this.scene.remove(mesh);
  }

  /** Laser de visée du muzzle jusqu'au premier obstacle ; `onTarget` le fait briller davantage. */
  showLaser(from: THREE.Vector3, to: THREE.Vector3, onTarget: boolean): void {
    const length = from.distanceTo(to);
    if (length < 0.01) {
      this.hideLaser();
      return;
    }
    this.laser.scale.set(LASER_RADIUS, length, LASER_RADIUS);
    this.laser.position.copy(from).add(to).multiplyScalar(0.5);
    this.laserDirection.copy(to).sub(from).normalize();
    this.laser.quaternion.setFromUnitVectors(UP, this.laserDirection);
    this.laser.material.opacity = onTarget ? 1 : 0.55;
    this.laser.visible = true;
    this.laserDot.position.copy(to);
    this.laserDot.scale.setScalar(onTarget ? 1.6 : 1);
    this.laserDot.visible = true;
  }

  hideLaser(): void {
    this.laser.visible = false;
    this.laserDot.visible = false;
  }

  update(deltaSeconds: number): void {
    this.muzzleTimer = Math.max(0, this.muzzleTimer - deltaSeconds);
    if (this.muzzleTimer === 0 && this.muzzleLight) this.muzzleLight.intensity = 0;
    this.updateTracers(deltaSeconds);
    this.updateSparks(deltaSeconds);
  }

  private updateTracers(deltaSeconds: number): void {
    for (let index = this.tracers.length - 1; index >= 0; index--) {
      const tracer = this.tracers[index] as Tracer;
      tracer.life -= deltaSeconds;
      tracer.mesh.material.opacity = Math.max(0, tracer.life / TRACER_LIFETIME_SECONDS);
      if (tracer.life > 0) continue;
      this.scene.remove(tracer.mesh);
      // Géométrie partagée : seul le matériau (propre à la traçante, pour son fondu) est libéré.
      tracer.mesh.material.dispose();
      this.tracers.splice(index, 1);
    }
  }

  private updateSparks(deltaSeconds: number): void {
    for (let index = 0; index < SPARK_CAPACITY; index++) {
      const life = this.sparkLife[index] ?? 0;
      const offset = index * 3;
      if (life <= 0) {
        // Étincelle éteinte : noire en mélange additif, donc invisible.
        this.sparkColors.fill(0, offset, offset + 3);
        continue;
      }
      const remaining = Math.max(0, life - deltaSeconds);
      this.sparkLife[index] = remaining;
      const velocityY = (this.sparkVelocities[offset + 1] ?? 0) - SPARK_GRAVITY * deltaSeconds;
      this.sparkVelocities[offset + 1] = velocityY;
      for (let axis = 0; axis < 3; axis++) {
        const position = (this.sparkPositions[offset + axis] ?? 0) + (this.sparkVelocities[offset + axis] ?? 0) * deltaSeconds;
        this.sparkPositions[offset + axis] = axis === 1 ? Math.max(0.02, position) : position;
        this.sparkColors[offset + axis] = (this.sparkBaseColors[offset + axis] ?? 0) * (remaining / SPARK_LIFETIME_SECONDS);
      }
    }
    const geometry = this.sparks.geometry;
    (geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (geometry.getAttribute("color") as THREE.BufferAttribute).needsUpdate = true;
  }
}

