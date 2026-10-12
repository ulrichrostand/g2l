import * as THREE from "three";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import { LayeredAnimator } from "../avatar/layeredAnimator";
import type { BossState } from "./boss";
import type { SentinelAsset } from "./sentinelAndroid";

/**
 * Corps du boss : le même androïde que les sentinelles (mannequin Quaternius, CC0), à taille de colosse,
 * couvert de plaques d'armure dans la couleur du boss. Les matériaux viennent de BossModel, qui les pilote
 * déjà (charge avant une salve, flash à l'impact, bleu quand il est à genoux) : rien n'est dupliqué ici.
 */

/** Mannequin source (1,83 m) porté à la carrure du boss procédural (~3,1 m). */
const MODEL_SCALE = 1.7;
const WALK_GROUND_SPEED = 1.03 * MODEL_SCALE;
const MIN_TIME_SCALE = 0.5;
const MAX_TIME_SCALE = 1.8;

export interface BossAndroidMaterials {
  /** Plaques d'armure (couleur du boss, flash à l'impact). */
  armor: THREE.MeshStandardMaterial;
  /** Cœur lumineux du plastron. */
  core: THREE.MeshStandardMaterial;
  visor: THREE.MeshStandardMaterial;
  /** Lignes des articulations et bouche du canon : s'illuminent pendant la charge d'une salve. */
  charge: THREE.MeshStandardMaterial;
}

export interface BossAndroidMotion {
  state: BossState;
  /** Vitesse au sol réelle (cases par seconde). */
  speed: number;
  /** 0 = bras baissés, 1 = en joue. */
  aim: number;
}

type BoneName = "spine_03" | "Head" | "upperarm_l" | "upperarm_r" | "lowerarm_r";

export class BossAndroid {
  readonly root = new THREE.Group();
  /** Plaques dans l'ordre où elles tombent : épaulières, plastron, puis le capot du cœur. */
  readonly plates: THREE.Mesh[] = [];
  private readonly model: THREE.Object3D;
  private readonly animator: LayeredAnimator<"Idle_Loop" | "Walk_Loop" | "Jog_Fwd_Loop" | "Pistol_Aim_Neutral" | "Pistol_Shoot" | "Hit_Chest" | "Death01" | "Fixing_Kneeling">;
  private readonly ownedMaterials: THREE.Material[] = [];
  private readonly ownedGeometries: THREE.BufferGeometry[] = [];

  constructor(asset: SentinelAsset, materials: BossAndroidMaterials) {
    this.model = SkeletonUtils.clone(asset.scene);
    this.model.scale.setScalar(MODEL_SCALE);
    this.root.add(this.model);
    this.dressBody(materials.charge);
    this.attachArmor(materials);
    this.animator = new LayeredAnimator(this.model, asset.clips, {
      locomotion: ["Idle_Loop", "Walk_Loop"],
      idle: "Idle_Loop",
      aim: "Pistol_Aim_Neutral",
      shot: "Pistol_Shoot",
      poses: ["Fixing_Kneeling", "Death01"],
      oneShotPoses: ["Death01"],
    });
  }

  update(deltaSeconds: number, motion: BossAndroidMotion): void {
    const moving = motion.state === "fighting" && motion.speed > 0.05;
    // En veille et à genoux (exposé) : le colosse est agenouillé ; vaincu, il s'effondre.
    const pose = motion.state === "dormant" || motion.state === "exposed" ? "Fixing_Kneeling" : motion.state === "defeated" ? "Death01" : null;
    this.animator.update(deltaSeconds, {
      locomotion: moving ? "Walk_Loop" : "Idle_Loop",
      timeScale: moving ? THREE.MathUtils.clamp(motion.speed / WALK_GROUND_SPEED, MIN_TIME_SCALE, MAX_TIME_SCALE) : 1,
      aim: motion.state === "fighting" ? motion.aim : 0,
      pose,
    });
  }

  /** Les matériaux pilotés par BossModel ne lui appartiennent pas : seuls ceux créés ici sont libérés. */
  dispose(): void {
    this.animator.dispose();
    this.root.removeFromParent();
    for (const material of this.ownedMaterials) material.dispose();
    for (const geometry of this.ownedGeometries) geometry.dispose();
  }

  /** Châssis anthracite peu métallique (lisible sans carte d'environnement) ; articulations aux lignes de charge. */
  private dressBody(charge: THREE.MeshStandardMaterial): void {
    const chassis = new THREE.MeshStandardMaterial({ name: "BossChassis", color: 0x2a2e36, metalness: 0.3, roughness: 0.45 });
    this.ownedMaterials.push(chassis);
    this.model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.castShadow = true;
      const materials: THREE.Material[] = Array.isArray(object.material) ? object.material : [object.material];
      const dressed = materials.map((material) => (material.name === "M_Joints" ? charge : chassis));
      object.material = Array.isArray(object.material) ? dressed : (dressed[0] as THREE.Material);
    });
  }

  /**
   * Armure accrochée aux os (repères du squelette « Universal ») : sur le torse et la tête, Y monte et Z pointe
   * vers l'avant ; sur les bras, Y descend le long du membre et X pointe vers l'intérieur à gauche, l'extérieur à droite.
   */
  private attachArmor(materials: BossAndroidMaterials): void {
    const bone = (name: BoneName): THREE.Object3D => {
      const found = this.model.getObjectByName(name);
      if (!found) throw new Error(`Modèle du boss : os ${name} introuvable`);
      return found;
    };
    const plate = (parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, position: [number, number, number], rotation: [number, number, number] = [0, 0, 0]): THREE.Mesh => {
      const mesh = new THREE.Mesh(this.own(geometry), material);
      mesh.position.set(...position);
      mesh.rotation.set(...rotation);
      mesh.castShadow = true;
      parent.add(mesh);
      return mesh;
    };

    // Épaulières : coques larges et plates (une demi-sphère écrasée), côté extérieur du haut des bras.
    const pauldronGeometry = new THREE.SphereGeometry(0.13, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.25, 0.5, 1.2);
    const leftPauldron = plate(bone("upperarm_l"), pauldronGeometry, materials.armor, [-0.035, 0.04, 0], [0, 0, Math.PI / 2]);
    const rightPauldron = plate(bone("upperarm_r"), pauldronGeometry.clone(), materials.armor, [0.035, 0.04, 0], [0, 0, -Math.PI / 2]);
    // Plastron en deux plaques, puis le capot qui protège le cœur.
    const chest = bone("spine_03");
    const upperChest = plate(chest, new THREE.BoxGeometry(0.3, 0.13, 0.05), materials.armor, [0, 0.1, 0.13], [-0.15, 0, 0]);
    const lowerChest = plate(chest, new THREE.BoxGeometry(0.24, 0.1, 0.05), materials.armor, [0, -0.04, 0.12]);
    const coreCover = plate(chest, new THREE.CylinderGeometry(0.075, 0.075, 0.025, 6), materials.armor, [0, 0.03, 0.155], [Math.PI / 2, 0, 0]);
    this.plates.push(leftPauldron, rightPauldron, upperChest, lowerChest, coreCover);

    // Réacteur dorsal : c'est le dos que voit la caméra du dessus ; ses évents s'allument avec la charge d'une salve.
    plate(chest, new THREE.BoxGeometry(0.28, 0.3, 0.12), materials.armor, [0, 0.04, -0.17], [0.12, 0, 0]);
    for (const offsetX of [-0.07, 0.07]) plate(chest, new THREE.BoxGeometry(0.05, 0.22, 0.02), materials.charge, [offsetX, 0.04, -0.24], [0.12, 0, 0]);

    // Ce qui reste quand l'armure est tombée : le cœur, la visière, la crête et le canon du bras droit.
    plate(chest, new THREE.CylinderGeometry(0.05, 0.05, 0.03, 12), materials.core, [0, 0.03, 0.14], [Math.PI / 2, 0, 0]);
    const head = bone("Head");
    plate(head, new THREE.BoxGeometry(0.17, 0.035, 0.05), materials.visor, [0, 0.11, 0.1]);
    plate(head, new THREE.BoxGeometry(0.03, 0.05, 0.2), materials.armor, [0, 0.2, -0.01]);
    const forearm = bone("lowerarm_r");
    plate(forearm, new THREE.CylinderGeometry(0.045, 0.055, 0.22, 10), materials.armor, [0, 0.14, 0]);
    plate(forearm, new THREE.CylinderGeometry(0.03, 0.03, 0.02, 10), materials.charge, [0, 0.26, 0]);
  }

  private own<T extends THREE.BufferGeometry>(geometry: T): T {
    this.ownedGeometries.push(geometry);
    return geometry;
  }
}
