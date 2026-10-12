import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { AVATAR_FIELDS, DEFAULT_AVATAR, HEIGHT_RANGE, isSameAvatar, parseAvatarConfig, type AvatarConfig } from "../avatar/avatarConfig";
import { createAvatarRig, type AvatarModel } from "../avatar/avatarModel";
import { poseRig } from "../entities/rig";

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
/** Point le plus haut de l'avatar à l'échelle 1 (crête + optiques), mesuré sur le modèle. */
const AVATAR_TOP_AT_UNIT_SCALE = 1.72;
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
/** Largeur à garder visible (bras écartés, sacs, boubou) et part de la largeur libre qu'elle peut occuper. */
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

/** Respiration (~16 par minute) et transfert du poids : l'agent attend, il ne marche pas. */
const BREATH_RATE = 1.7;
const SWAY_RATE = 0.55;
/** Bras légèrement écartés du buste : au repos strict, les mains frôlent les hanches et paraissent figées. */
const ARM_REST_SPREAD = 0.06;

/**
 * Ces champs se modifient sans reconstruire le modèle : le curseur de taille envoie un flot de valeurs,
 * et la couleur des optiques ne touche qu'un matériau.
 */
const IN_PLACE_FIELDS: readonly (keyof AvatarConfig)[] = ["height", "visorColor"];

/**
 * Couleurs choisies au sélecteur libre : glisser dedans envoie une valeur par image. Reconstruire l'agent
 * à chaque fois (une trentaine de meshes, textures du visage et du tissu) ferait saccader l'aperçu :
 * pendant le glisser, on repeint en place les matériaux concernés, puis on reconstruit une seule fois au repos.
 */
const PAINT_FIELDS = ["skinTone", "hairColor", "eyeColor", "topColor", "topAccent", "bottomColor", "shoesColor", "accessoryColor"] as const satisfies readonly (keyof AvatarConfig)[];
type PaintField = (typeof PAINT_FIELDS)[number];
/**
 * Deux changements du même champ à moins de ce délai, ou à une ou deux images d'écart (appareil lent : le
 * sélecteur envoie une valeur par image, si lente soit-elle) : c'est un glisser dans le sélecteur, pas un clic.
 * Prendre un clic pour un glisser ne coûte qu'un court délai avant la reconstruction exacte.
 */
const PAINT_DRAG_GAP_SECONDS = 0.3;
const PAINT_DRAG_GAP_FRAMES = 2;
/** Calme après le glisser : on reconstruit alors l'agent exact (textures du visage et des motifs comprises). */
const PAINT_SETTLE_SECONDS = 0.25;

/**
 * Matériau dont la couleur suit un champ : couleur = gain × couleur du champ + décalage, canal par canal
 * (espace linéaire). Couvre la teinte directe, les ombres (×0,6) et les éclaircis (mélange avec du blanc).
 */
interface PaintTarget {
  color: THREE.Color;
  gain: readonly [number, number, number];
  offset: readonly [number, number, number];
}

type ColoredMaterial = THREE.Material & { color: THREE.Color };

/**
 * Studio du créateur d'agent : socle lumineux qui tourne, éclairage trois points et décor néon
 * dans la palette du jeu. Rendu par le pipeline habituel (bloom selon la qualité choisie).
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
  private model: AvatarModel;
  private angle = 0;
  private targetAngle = 0;
  private holdSeconds = 0;
  /** Vrai tant que le joueur garde la main sur l'orientation (glisser récent) : on ne la lui reprend pas. */
  private manualControl = false;
  private spinBlend = 1;
  private pulse = 0;
  private elapsedSeconds = 0;
  private disposed = false;
  /** Dernier champ de couleur modifié, et quand : sert à reconnaître un glisser dans le sélecteur. */
  private paintField: PaintField | null = null;
  private paintChangedAt = Number.NEGATIVE_INFINITY;
  private framesSincePaint = Number.POSITIVE_INFINITY;
  /** Matériaux repeints pendant le glisser en cours (null : pas encore repérés sur ce modèle). */
  private paintTargets: readonly PaintTarget[] | null = null;
  /** > 0 : le modèle a été repeint en place, reconstruction exacte prévue après ce délai de calme. */
  private settleSeconds = 0;
  private readonly paintColor = new THREE.Color();

  /**
   * Lève une exception si même l'agent par défaut ne peut pas être construit (canvas 2D indisponible…) :
   * les ressources déjà créées sont alors libérées, l'appelant n'a rien à nettoyer.
   */
  constructor(initial: AvatarConfig) {
    this.config = parseAvatarConfig(initial) ?? { ...DEFAULT_AVATAR };
    this.scene.background = new THREE.Color(BACKGROUND);
    this.scene.fog = this.fog;
    this.ringMaterial = this.track(new THREE.MeshStandardMaterial({ color: NEON_GREEN, emissive: NEON_GREEN, emissiveIntensity: RING_INTENSITY }));
    this.keyLight = this.addLights();
    try {
      this.buildSet();
      this.model = this.createInitialModel();
    } catch (error) {
      this.releaseSet();
      throw error;
    }
    this.turntable.position.y = PLINTH_HEIGHT;
    this.scene.add(this.turntable);
    this.turntable.add(this.model.rig.root);
    this.applyIdlePose(0);
  }

  /** Remplace l'agent affiché. Une config invalide est ignorée : l'aperçu garde le dernier agent valide. */
  setAvatar(config: AvatarConfig): void {
    if (this.disposed) return;
    const next = parseAvatarConfig(config);
    if (!next) return;
    const changed = AVATAR_FIELDS.filter((field) => next[field] !== this.config[field]);
    const [single] = changed;
    if (single === undefined) return;
    const paintField = changed.length === 1 && isPaintField(single) ? single : null;
    if (changed.every((field) => IN_PLACE_FIELDS.includes(field))) {
      this.model.rig.root.scale.setScalar(next.height);
      this.model.glow.color.set(next.visorColor);
      this.model.glow.emissive.set(next.visorColor);
    } else if (paintField !== null && this.isPaintDrag(paintField)) {
      // Repérage une seule fois par glisser (sur le modèle encore exact), puis simple changement de couleur.
      this.paintTargets ??= findPaintTargets(this.model, this.config, paintField);
      this.paintColor.set(next[paintField]);
      for (const target of this.paintTargets) paintTarget(target, this.paintColor);
      this.settleSeconds = PAINT_SETTLE_SECONDS;
    } else if (!this.rebuild(next)) {
      return;
    }
    if (paintField !== null) {
      this.paintField = paintField;
      this.paintChangedAt = this.elapsedSeconds;
      this.framesSincePaint = 0;
    } else if (!changed.every((field) => IN_PLACE_FIELDS.includes(field))) {
      this.paintField = null;
    }
    this.config = next;
    this.presentChange();
  }

  update(deltaSeconds: number, elapsedSeconds: number): void {
    if (this.disposed) return;
    const delta = THREE.MathUtils.clamp(deltaSeconds, 0, MAX_STEP_SECONDS);
    this.framesSincePaint++;
    if (this.settleSeconds > 0) {
      this.settleSeconds = Math.max(0, this.settleSeconds - delta);
      // Fin du glisser : textures du visage et du tissu, mélanges exacts. En cas d'échec, l'aperçu repeint reste.
      if (this.settleSeconds === 0) this.rebuild(this.config);
    }
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
    this.elapsedSeconds = elapsedSeconds;
    this.applyIdlePose(elapsedSeconds);
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
    this.settleSeconds = 0;
    this.paintTargets = null;
    this.turntable.remove(this.model.rig.root);
    this.model.dispose();
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
   * Agent demandé ou, s'il ne se construit pas (combinaison qui révèle un bug du modèle), agent par défaut :
   * le créateur reste utilisable. Si même celui-ci échoue, l'erreur remonte à l'appelant.
   */
  private createInitialModel(): AvatarModel {
    try {
      return createAvatarRig(this.config);
    } catch (error) {
      if (isSameAvatar(this.config, DEFAULT_AVATAR)) throw error;
      console.error("Construction de l'agent impossible : le studio affiche l'agent par défaut.", error);
      this.config = { ...DEFAULT_AVATAR };
      return createAvatarRig(this.config);
    }
  }

  /** Vrai si ce changement prolonge un glisser dans le sélecteur de couleur du même champ. */
  private isPaintDrag(field: PaintField): boolean {
    if (field !== this.paintField) return false;
    return this.framesSincePaint <= PAINT_DRAG_GAP_FRAMES || this.elapsedSeconds - this.paintChangedAt <= PAINT_DRAG_GAP_SECONDS;
  }

  /** Construit le nouveau modèle avant de libérer l'ancien : en cas d'échec, l'aperçu reste intact. */
  private rebuild(config: AvatarConfig): boolean {
    // Qu'elle réussisse ou non, plus de reconstruction différée : pas de nouvel essai à chaque image.
    this.settleSeconds = 0;
    let next: AvatarModel;
    try {
      next = createAvatarRig(config);
    } catch (error) {
      console.error("Construction de l'aperçu de l'agent impossible : on garde le précédent.", error);
      return false;
    }
    const previous = this.model;
    this.turntable.remove(previous.rig.root);
    previous.dispose();
    this.model = next;
    // Les matériaux repérés pour repeindre appartenaient à l'ancien modèle.
    this.paintTargets = null;
    this.turntable.add(next.rig.root);
    this.applyIdlePose(this.elapsedSeconds);
    return true;
  }

  /** Retour visuel d'un changement : le socle s'illumine et l'agent se tourne vers la caméra. */
  private presentChange(): void {
    this.pulse = 1;
    if (this.manualControl) return;
    this.targetAngle = Math.round(this.angle / TAU) * TAU;
    this.holdSeconds = PRESENT_HOLD_SECONDS;
  }

  /**
   * Pose d'attente : poseRig remet la posture neutre (debout, sans pas), puis on ajoute
   * respiration, balancement et regard. Les jambes compensent le bassin : les pieds restent au sol.
   */
  private applyIdlePose(elapsedSeconds: number): void {
    const rig = this.model.rig;
    poseRig(rig, 0, 0, 0);
    const breath = Math.sin(elapsedSeconds * BREATH_RATE);
    const sway = Math.sin(elapsedSeconds * SWAY_RATE);
    rig.hips.rotation.z = 0.02 * sway;
    rig.leftLeg.rotation.z = -0.02 * sway;
    rig.rightLeg.rotation.z = -0.02 * sway;
    rig.torso.rotation.z = -0.012 * sway;
    // La poitrine se soulève : le buste recule à peine.
    rig.torso.rotation.x = -0.012 * breath;
    const armSpread = ARM_REST_SPREAD + 0.012 * breath;
    rig.leftArm.rotation.z = -armSpread;
    rig.rightArm.rotation.z = armSpread;
    rig.leftArm.rotation.x += 0.035 * Math.sin(elapsedSeconds * 0.9);
    rig.rightArm.rotation.x += 0.035 * Math.sin(elapsedSeconds * 0.9 + 1.3);
    // Regard qui balaie lentement la pièce : deux sinus de périodes différentes évitent l'effet métronome.
    rig.head.rotation.y = 0.22 * Math.sin(elapsedSeconds * 0.31) * Math.sin(elapsedSeconds * 0.17 + 0.6);
    rig.head.rotation.x = 0.03 * Math.sin(elapsedSeconds * 0.45) + 0.008 * breath;
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

function isPaintField(field: keyof AvatarConfig): field is PaintField {
  return (PAINT_FIELDS as readonly string[]).includes(field);
}

/**
 * Repère les matériaux qui dépendent de `field` en comparant le modèle affiché (construit avec `config`) à une
 * sonde où seul ce champ change : même structure, seules les couleurs qui en dépendent diffèrent. Deux mesures
 * par canal donnent la relation affine qu'applique avatarModel, sans dupliquer ses règles ici.
 * Liste vide si la sonde échoue : l'aperçu attend alors simplement la reconstruction au repos.
 */
function findPaintTargets(model: AvatarModel, config: AvatarConfig, field: PaintField): PaintTarget[] {
  const probeHex = contrastingColor(config[field]);
  let probe: AvatarModel;
  try {
    probe = createAvatarRig({ ...config, [field]: probeHex });
  } catch (error) {
    console.warn("Repérage des couleurs de l'agent impossible : l'aperçu se mettra à jour au relâchement.", error);
    return [];
  }
  try {
    const shown = coloredMeshMaterials(model.rig.root);
    const probed = coloredMeshMaterials(probe.rig.root);
    if (shown.length !== probed.length) return [];
    const base = new THREE.Color(config[field]);
    const probeColor = new THREE.Color(probeHex);
    const targets = new Map<THREE.Material, PaintTarget>();
    for (let index = 0; index < shown.length; index++) {
      const material = shown[index];
      const reference = probed[index];
      if (!material || !reference) return [];
      if (targets.has(material) || material.color.equals(reference.color)) continue;
      const gain: [number, number, number] = [0, 0, 0];
      const offset: [number, number, number] = [0, 0, 0];
      for (let channel = 0; channel < 3; channel++) {
        const shownValue = colorChannel(material.color, channel);
        const baseValue = colorChannel(base, channel);
        // contrastingColor garantit un écart non nul sur chaque canal.
        const channelGain = (shownValue - colorChannel(reference.color, channel)) / (baseValue - colorChannel(probeColor, channel));
        gain[channel] = channelGain;
        offset[channel] = shownValue - channelGain * baseValue;
      }
      targets.set(material, { color: material.color, gain, offset });
    }
    return [...targets.values()];
  } finally {
    probe.dispose();
  }
}

function colorChannel(color: THREE.Color, channel: number): number {
  return channel === 0 ? color.r : channel === 1 ? color.g : color.b;
}

function paintTarget(target: PaintTarget, color: THREE.Color): void {
  const { gain, offset } = target;
  target.color.setRGB(gain[0] * color.r + offset[0], gain[1] * color.g + offset[1], gain[2] * color.b + offset[2]);
}

/** Couleur dont chaque canal est loin de celui d'origine : garantit une mesure fiable sur les trois canaux. */
function contrastingColor(hex: string): string {
  let result = "#";
  for (let start = 1; start < 7; start += 2) result += Number.parseInt(hex.slice(start, start + 2), 16) >= 128 ? "00" : "ff";
  return result;
}

/** Matériau colorable de chaque mesh, dans l'ordre de parcours (identique d'une construction à l'autre). */
function coloredMeshMaterials(root: THREE.Object3D): ColoredMaterial[] {
  const materials: ColoredMaterial[] = [];
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const list: unknown[] = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of list) {
      if (material instanceof THREE.Material && "color" in material && material.color instanceof THREE.Color) materials.push(material as ColoredMaterial);
    }
  });
  return materials;
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
