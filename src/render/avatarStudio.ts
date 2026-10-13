import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { DEFAULT_AVATAR, HEIGHT_RANGE, parseAvatarConfig, type AvatarConfig, type BodyType } from "../avatar/avatarConfig";
import { HumanCharacter, type HumanCharacterAsset } from "../avatar/humanCharacter";
import { t } from "../i18n/messages/creator";

/** "side" : interface à gauche (ordinateur, paysage) ; "bottom" : feuille en bas (téléphone en portrait). */
export type StudioLayout = "side" | "bottom";

/**
 * Part de l'écran masquée par l'interface (largeur en "side", hauteur en "bottom") quand l'appelant
 * ne la mesure pas : valeurs nominales de characterCreator.css.
 */
export const DEFAULT_PANEL_COVERAGE: Readonly<Record<StudioLayout, number>> = { side: 0.3, bottom: 0.55 };

const BACKGROUND = 0x05080c;
const NEON_GREEN = 0x39ff88;
const NEON_BLUE = 0x4fc3ff;

const PLINTH_RADIUS = 0.66;
const PLINTH_HEIGHT = 0.07;
/** Point le plus haut de l'agent à la taille 1 (chignon et optiques compris), mesuré sur le modèle. */
const AVATAR_TOP_AT_UNIT_SCALE = 1.68;
/**
 * Cadrage calculé pour la taille MAXIMALE : la caméra ne bouge pas quand on change la taille,
 * sinon l'agent paraîtrait toujours aussi grand et le curseur ne servirait à rien.
 */
const FRAME_TOP = PLINTH_HEIGHT + AVATAR_TOP_AT_UNIT_SCALE * HEIGHT_RANGE.max + 0.03;
/** Bord avant du socle, au sol : plus proche de la caméra, c'est lui qui descend le plus bas à l'écran. */
const FRAME_FRONT = PLINTH_RADIUS + 0.07;
/** Marges en haut et en bas, en part de la hauteur libre : un peu d'air, comme une photo en pied. */
const FRAME_MARGIN_TOP = 0.06;
const FRAME_MARGIN_BOTTOM = 0.07;
/** Largeur à garder visible (bras le long du corps, carrure costaude) et part de la largeur libre qu'elle peut occuper. */
const FRAME_WIDTH = 1;
const FRAME_FILL_X = 0.9;
const MIN_CAMERA_DISTANCE = 1.5;
/**
 * Légère plongée : on voit le dessus du socle. Quand l'agent doit s'afficher dans le haut de l'écran
 * (feuille en bas), la caméra plonge davantage au lieu de descendre : sinon on verrait le socle par la tranche.
 */
const CAMERA_PITCH = 0.12;
const MAX_PANEL_COVERAGE = 0.75;
const FOG_START_BEHIND_SUBJECT = 1.4;
const FOG_END_BEHIND_SUBJECT = 11;

/** Un tour complet en une vingtaine de secondes : assez lent pour observer la tenue. */
const AUTO_SPIN_SPEED = 0.32;
/** Après un glisser, on laisse le joueur regarder l'angle qu'il a choisi avant de relancer la rotation. */
const DRAG_HOLD_SECONDS = 4;
/** Après un changement, l'agent fait face à la caméra le temps qu'on voie le résultat. */
const PRESENT_HOLD_SECONDS = 2.5;
const SPIN_RAMP_SECONDS = 1.2;
const ROTATION_SMOOTHING = 9;
/** Pas de temps maximal : après un onglet en arrière-plan, pas de saut de rotation. */
const MAX_STEP_SECONDS = 0.1;
const TAU = Math.PI * 2;

/**
 * Le bloom ajoute la couleur ENTIÈRE de tout pixel au-dessus de son seuil : au repos, l'anneau du socle reste
 * juste en dessous (sinon tout le studio baigne dans le vert), seul le flash d'un changement le franchit.
 */
const RING_INTENSITY = 1;
const RING_PULSE_INTENSITY = 1.6;
const PULSE_DECAY_PER_SECOND = 2.4;

/** Optiques en gros plan : assez vives pour se lire, sans que le bloom ne noie le visage. */
const STUDIO_GLOW_INTENSITY = 0.9;
/** Au repos : l'animation d'attente du modèle (respiration, poids qui bascule) suffit à le rendre vivant. */
const IDLE_MOTION = { speed: 0, crouching: false, aim: 0 } as const;

/**
 * Studio du créateur d'agent : socle lumineux qui tourne, éclairage trois points et décor néon
 * dans la palette du jeu. Rendu par le pipeline habituel (bloom selon la qualité choisie).
 * L'agent est le personnage humain du jeu : ce que l'on voit ici est exactement ce que l'on jouera.
 */
export class AvatarStudio {
  readonly scene = new THREE.Scene();
  private readonly fog = new THREE.Fog(BACKGROUND, 6, 16);
  /** Plateau tournant : porte l'avatar et les repères du socle (qui rendent la rotation lisible). */
  private readonly turntable = new THREE.Group();
  private readonly ringMaterial: THREE.MeshStandardMaterial;
  private readonly keyLight: THREE.DirectionalLight;
  private readonly disposables: { dispose(): void }[] = [];
  private config: AvatarConfig;
  /** null le temps de télécharger le modèle de la silhouette demandée. */
  private character: HumanCharacter | null = null;
  /** Silhouette du dernier modèle demandé : une réponse arrivée trop tard (changement entre-temps) est ignorée. */
  private requestedBody: BodyType | null = null;
  private angle = 0;
  private targetAngle = 0;
  private holdSeconds = 0;
  /** Vrai tant que le joueur garde la main sur l'orientation (glisser récent) : on ne la lui reprend pas. */
  private manualControl = false;
  private spinBlend = 1;
  private pulse = 0;
  private disposed = false;

  /**
   * `loadAsset` fournit le modèle de chaque silhouette (téléchargé une fois pour la session).
   * `onPreviewError` prévient l'interface si l'aperçu 3D ne peut pas s'afficher : les choix restent enregistrables.
   */
  constructor(
    initial: AvatarConfig,
    private readonly loadAsset: (body: BodyType) => Promise<HumanCharacterAsset>,
    private readonly onPreviewError: (message: string) => void,
  ) {
    this.config = parseAvatarConfig(initial) ?? { ...DEFAULT_AVATAR };
    this.scene.background = new THREE.Color(BACKGROUND);
    this.scene.fog = this.fog;
    this.ringMaterial = this.track(new THREE.MeshStandardMaterial({ color: NEON_GREEN, emissive: NEON_GREEN, emissiveIntensity: RING_INTENSITY }));
    this.keyLight = this.addLights();
    try {
      this.buildSet();
    } catch (error) {
      this.releaseSet();
      throw error;
    }
    this.turntable.position.y = PLINTH_HEIGHT;
    this.scene.add(this.turntable);
    this.requestCharacter(this.config.body);
  }

  /** Vrai tant que le modèle de la silhouette choisie n'est pas affiché. */
  get isLoading(): boolean {
    return this.character === null || this.character.body !== this.config.body;
  }

  /** Change l'agent affiché. Une config invalide est ignorée : l'aperçu garde le dernier agent valide. */
  setAvatar(config: AvatarConfig): void {
    if (this.disposed) return;
    const next = parseAvatarConfig(config);
    if (!next) return;
    this.config = next;
    if (this.character && this.character.body === next.body) {
      // Retour à la silhouette affichée : un téléchargement de l'autre, encore en cours, n'est plus attendu.
      this.requestedBody = next.body;
      // Simples affectations de couleurs et d'échelles : supporte le flot d'un glisser dans le sélecteur.
      this.character.setAppearance(next);
    } else {
      this.requestCharacter(next.body);
    }
    this.presentChange();
  }

  update(deltaSeconds: number, _elapsedSeconds: number): void {
    if (this.disposed) return;
    const delta = THREE.MathUtils.clamp(deltaSeconds, 0, MAX_STEP_SECONDS);
    if (this.holdSeconds > 0) {
      this.holdSeconds = Math.max(0, this.holdSeconds - delta);
      if (this.holdSeconds === 0) this.manualControl = false;
      this.spinBlend = 0;
    } else {
      // Reprise progressive : un démarrage sec de la rotation attire l'œil inutilement.
      this.spinBlend = Math.min(1, this.spinBlend + delta / SPIN_RAMP_SECONDS);
      this.targetAngle += AUTO_SPIN_SPEED * this.spinBlend * delta;
    }
    this.angle += (this.targetAngle - this.angle) * (1 - Math.exp(-ROTATION_SMOOTHING * delta));
    // Angles ramenés dans [0, 2π) ensemble : pas de dérive des flottants après des heures d'ouverture.
    const turns = Math.floor(this.angle / TAU);
    if (turns !== 0) {
      this.angle -= turns * TAU;
      this.targetAngle -= turns * TAU;
    }
    this.turntable.rotation.y = this.angle;

    this.pulse = Math.max(0, this.pulse - delta * PULSE_DECAY_PER_SECOND);
    this.ringMaterial.emissiveIntensity = RING_INTENSITY + this.pulse * RING_PULSE_INTENSITY;
    this.character?.update(delta, IDLE_MOTION);
  }

  /**
   * Cadre l'agent en pied dans la partie de l'écran que l'interface laisse libre, sans décentrer
   * l'optique (pas de setViewOffset : la caméra est partagée avec les missions, rien ne doit rester).
   * `panelCoverage` : part de la largeur ("side") ou de la hauteur ("bottom") couverte par l'interface.
   */
  frameCamera(camera: THREE.PerspectiveCamera, layout: StudioLayout, panelCoverage: number = DEFAULT_PANEL_COVERAGE[layout]): void {
    const coverage = Number.isFinite(panelCoverage) ? THREE.MathUtils.clamp(panelCoverage, 0, MAX_PANEL_COVERAGE) : DEFAULT_PANEL_COVERAGE[layout];
    // Zone libre en coordonnées normalisées de l'écran (-1..1).
    const minX = layout === "side" ? -1 + 2 * coverage : -1;
    const minY = layout === "bottom" ? -1 + 2 * coverage : -1;
    const spanX = 1 - minX;
    const spanY = 1 - minY;
    const targetTop = 1 - FRAME_MARGIN_TOP * spanY;
    const targetBottom = minY + FRAME_MARGIN_BOTTOM * spanY;
    const tanVertical = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const tanHorizontal = tanVertical * Math.max(camera.aspect, 0.01);
    const pitch = CAMERA_PITCH + Math.atan(((minY + 1) / 2) * tanVertical);
    const sinPitch = Math.sin(pitch);
    const cosPitch = Math.cos(pitch);

    // Repères projetés sur les axes « haut » et « avant » de la caméra inclinée.
    const topUp = FRAME_TOP * cosPitch;
    const topForward = -FRAME_TOP * sinPitch;
    const frontUp = -FRAME_FRONT * sinPitch;
    const frontForward = -FRAME_FRONT * cosPitch;
    // Hauteur à l'écran d'un repère : (repère·haut + élévation) / ((repère·avant + recul) × tan).
    // Sommet du crâne et bord avant du socle tombent pile sur leurs cibles : deux équations, deux inconnues
    // (recul et élévation), résolues directement, sans tâtonner.
    let distance = ((topUp - frontUp) / tanVertical - targetTop * topForward + targetBottom * frontForward) / (targetTop - targetBottom);
    let lift = targetTop * (topForward + distance) * tanVertical - topUp;
    const widthDistance = FRAME_WIDTH / (FRAME_FILL_X * spanX * tanHorizontal);
    if (widthDistance > distance || distance < MIN_CAMERA_DISTANCE) {
      // Écran très étroit : c'est la largeur qui impose le recul, on centre alors verticalement.
      distance = Math.max(widthDistance, distance, MIN_CAMERA_DISTANCE);
      const targetMiddle = (targetTop + targetBottom) / 2;
      lift = (targetMiddle * (topForward + distance) * tanVertical - topUp + targetMiddle * (frontForward + distance) * tanVertical - frontUp) / 2;
    }
    // Décalage latéral : l'agent tombe au centre de la zone libre (à droite du panneau).
    const shift = ((minX + 1) / 2) * distance * tanHorizontal;
    camera.position.set(-shift, distance * sinPitch - lift * cosPitch, distance * cosPitch + lift * sinPitch);
    camera.rotation.set(-pitch, 0, 0);
    // Brouillard calé derrière l'agent : le décor s'estompe, l'agent jamais, quel que soit le recul.
    this.fog.near = distance + FOG_START_BEHIND_SUBJECT;
    this.fog.far = distance + FOG_END_BEHIND_SUBJECT;
  }

  /** Rotation au doigt ou à la souris (radians, positif = l'avant de l'agent part vers la droite). */
  setDragRotation(deltaRadians: number): void {
    if (this.disposed || !Number.isFinite(deltaRadians)) return;
    this.targetAngle += deltaRadians;
    this.holdSeconds = DRAG_HOLD_SECONDS;
    this.manualControl = true;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.character?.dispose();
    this.character = null;
    this.releaseSet();
  }

  /** Décor, lumières et shadow map : libérés par dispose(), ou si le constructeur échoue. */
  private releaseSet(): void {
    for (const resource of this.disposables) resource.dispose();
    this.disposables.length = 0;
    // Libère la shadow map de la lumière principale (allouée si les ombres sont actives).
    this.keyLight.dispose();
    this.scene.clear();
  }

  /**
   * Affiche le modèle de la silhouette demandée dès qu'il est prêt. L'ancien reste visible pendant le
   * téléchargement : on ne voit jamais le socle vide, sauf à la toute première ouverture.
   */
  private requestCharacter(body: BodyType): void {
    if (this.requestedBody === body) return;
    this.requestedBody = body;
    this.loadAsset(body)
      .then((asset) => {
        // Studio fermé, ou autre silhouette choisie entre-temps : ce modèle n'est plus attendu.
        if (this.disposed || this.requestedBody !== body) return;
        const character = new HumanCharacter(asset, this.config, STUDIO_GLOW_INTENSITY);
        this.character?.dispose();
        this.character = character;
        this.turntable.add(character.root);
        this.presentChange();
      })
      .catch((error: unknown) => {
        if (this.disposed || this.requestedBody !== body) return;
        // Autorise un nouvel essai au prochain changement de silhouette.
        this.requestedBody = this.character?.body ?? null;
        console.error("Modèle de l'agent indisponible pour l'aperçu.", error);
        this.onPreviewError(t("previewUnavailable"));
      });
  }

  /** Retour visuel d'un changement : le socle s'illumine et l'agent se tourne vers la caméra. */
  private presentChange(): void {
    this.pulse = 1;
    if (this.manualControl) return;
    this.targetAngle = Math.round(this.angle / TAU) * TAU;
    this.holdSeconds = PRESENT_HOLD_SECONDS;
  }

  private track<T extends { dispose(): void }>(resource: T): T {
    this.disposables.push(resource);
    return resource;
  }

  /** Éclairage trois points : clé chaude (le visage), contre-jour bleu (la silhouette), remplissage doux. */
  private addLights(): THREE.DirectionalLight {
    this.scene.add(new THREE.HemisphereLight(0x8fb4d8, 0x0a0d12, 0.75));

    const key = new THREE.DirectionalLight(0xffd6b0, 2.9);
    key.position.set(-2.2, 3.6, 3.2);
    key.target.position.set(0, 0.9, 0);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    // Ombre serrée autour de l'agent et du socle : une petite shadow map suffit à une ombre nette.
    const shadowCamera = key.shadow.camera;
    shadowCamera.left = -1.2;
    shadowCamera.right = 1.2;
    shadowCamera.top = 1.4;
    shadowCamera.bottom = -1.4;
    shadowCamera.near = 0.5;
    shadowCamera.far = 10;
    key.shadow.bias = -0.0005;
    key.shadow.normalBias = 0.025;
    this.scene.add(key, key.target);

    const rim = new THREE.DirectionalLight(NEON_BLUE, 2.8);
    rim.position.set(2.2, 3, -3.4);
    const fill = new THREE.DirectionalLight(0xa9c9ff, 0.6);
    fill.position.set(3, 1.2, 2.6);
    // Reflet vert du socle sur les chaussures et le bas : l'agent « pose » sur son néon.
    const underGlow = new THREE.PointLight(NEON_GREEN, 0.2, 2.4, 2);
    underGlow.position.set(0, 0.14, 0.8);
    this.scene.add(rim, fill, underGlow);
    return key;
  }

  private buildSet(): void {
    const floor = new THREE.Mesh(
      this.track(new THREE.CircleGeometry(14, 48)),
      this.track(new THREE.MeshStandardMaterial({ color: 0x0b1118, roughness: 0.82, metalness: 0.25 })),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;

    // Cercles holographiques au sol : donnent l'échelle et la profondeur sans charger l'image.
    const halos = this.track(mergeOwned([flatRing(0.98, 0.996), flatRing(1.46, 1.47), flatRing(2.2, 2.208)]));
    halos.translate(0, 0.003, 0);
    const halo = new THREE.Mesh(halos, this.track(new THREE.MeshBasicMaterial({ color: NEON_BLUE, transparent: true, opacity: 0.3, depthWrite: false })));

    const plinthGeometry = this.track(new THREE.CylinderGeometry(PLINTH_RADIUS, PLINTH_RADIUS + 0.05, PLINTH_HEIGHT, 56));
    plinthGeometry.translate(0, PLINTH_HEIGHT / 2, 0);
    const plinth = new THREE.Mesh(plinthGeometry, this.track(new THREE.MeshStandardMaterial({ color: 0x121b24, roughness: 0.45, metalness: 0.55 })));
    plinth.receiveShadow = true;

    const topRing = this.track(new THREE.TorusGeometry(PLINTH_RADIUS - 0.015, 0.009, 6, 72));
    topRing.rotateX(Math.PI / 2);
    topRing.translate(0, PLINTH_HEIGHT, 0);
    const ring = new THREE.Mesh(topRing, this.ringMaterial);

    const baseRingGeometry = this.track(new THREE.TorusGeometry(PLINTH_RADIUS + 0.052, 0.008, 6, 72));
    baseRingGeometry.rotateX(Math.PI / 2);
    baseRingGeometry.translate(0, 0.006, 0);
    const baseRing = new THREE.Mesh(baseRingGeometry, this.track(new THREE.MeshStandardMaterial({ color: NEON_BLUE, emissive: NEON_BLUE, emissiveIntensity: 1.4 })));

    // Repères gravés sur le plateau : sans eux, un disque qui tourne paraît immobile.
    const notchParts: THREE.BufferGeometry[] = [];
    const notchCount = 24;
    for (let index = 0; index < notchCount; index++) {
      const azimuth = (index / notchCount) * TAU;
      const notch = new THREE.BoxGeometry(0.014, 0.004, index % 6 === 0 ? 0.08 : 0.045);
      notch.translate(0, 0.002, PLINTH_RADIUS - 0.08);
      notch.rotateY(azimuth);
      notchParts.push(notch);
    }
    const notches = new THREE.Mesh(
      this.track(mergeOwned(notchParts)),
      this.track(new THREE.MeshStandardMaterial({ color: NEON_GREEN, emissive: NEON_GREEN, emissiveIntensity: 0.55 })),
    );
    this.turntable.add(notches);

    this.scene.add(floor, halo, plinth, ring, baseRing, ...this.buildBackdrop());
  }

  /**
   * Colonnes de néons en arc derrière l'agent, écartées de sa silhouette : l'ambiance « salle serveur »
   * du jeu, estompée par le brouillard. Sous le seuil du bloom : elles éclairent le décor, pas l'image.
   */
  private buildBackdrop(): THREE.Mesh[] {
    const radius = 5;
    const columns: { azimuth: number; height: number; green: boolean }[] = [
      { azimuth: -1.2, height: 2.4, green: false },
      { azimuth: -0.85, height: 3.3, green: true },
      { azimuth: -0.5, height: 2.8, green: false },
      { azimuth: 0.5, height: 2.8, green: false },
      { azimuth: 0.85, height: 3.3, green: false },
      { azimuth: 1.2, height: 2.4, green: true },
    ];
    const meshes: THREE.Mesh[] = [];
    for (const green of [false, true]) {
      const parts = columns
        .filter((column) => column.green === green)
        .map((column) => new THREE.BoxGeometry(0.04, column.height, 0.04).translate(Math.sin(column.azimuth) * radius, column.height / 2, -Math.cos(column.azimuth) * radius));
      const material = this.track(
        new THREE.MeshStandardMaterial({ color: 0x000000, emissive: green ? NEON_GREEN : NEON_BLUE, emissiveIntensity: green ? 1 : 1.5 }),
      );
      meshes.push(new THREE.Mesh(this.track(mergeOwned(parts)), material));
    }
    return meshes;
  }
}

/** Anneau plat posé au sol (dans le plan XZ). */
function flatRing(innerRadius: number, outerRadius: number): THREE.BufferGeometry {
  return new THREE.RingGeometry(innerRadius, outerRadius, 96).rotateX(-Math.PI / 2);
}

/** Fusionne des pièces de même matériau en un seul mesh et libère les pièces. */
function mergeOwned(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts) as THREE.BufferGeometry | null;
  for (const part of parts) part.dispose();
  if (!merged) throw new Error("Fusion des pièces du studio impossible (attributs incompatibles)");
  return merged;
}
