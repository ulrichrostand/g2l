/**
 * Tutoriel guidé du premier secteur : une suite d'étapes validées par ce que le joueur fait vraiment dans le jeu
 * (déplacement, dossier ramassé, terminal piraté, tir, accroupi, neutralisation), jamais par un « Suivant ».
 * Logique pure, sans DOM ni Three.js : la mission fournit un instantané à chaque image, l'interface affiche l'étape.
 */

export type TutorialStepId = "move" | "intel" | "terminal" | "aim" | "shoot" | "crouch" | "takedown";

/** Cible à montrer dans le monde pour une étape, ou aucune (les gestes se montrent par le texte). */
export type TutorialTargetKind = "intel" | "terminal" | "guard" | null;

export interface TutorialStep {
  id: TutorialStepId;
  target: TutorialTargetKind;
}

export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  { id: "move", target: null },
  { id: "intel", target: "intel" },
  { id: "terminal", target: "terminal" },
  { id: "aim", target: null },
  { id: "shoot", target: null },
  { id: "crouch", target: null },
  { id: "takedown", target: "guard" },
];

/** Distance à parcourir (en cases) pour valider le déplacement : assez pour avoir essayé, pas assez pour lasser. */
export const MOVE_GOAL_CELLS = 3;
/** Un saut de position plus grand que ça en une image est une téléportation (réapparition), pas un déplacement. */
const MAX_STEP_CELLS = 2;

/** Ce que la mission sait à un instant donné ; seuls des compteurs et des états, aucune référence au jeu. */
export interface TutorialSnapshot {
  x: number;
  z: number;
  aiming: boolean;
  crouching: boolean;
  intelCollected: number;
  hackedCount: number;
  neutralizations: number;
  shotsFired: number;
  /** Sentinelles encore debout : sans elles, l'étape de neutralisation n'a plus d'objet. */
  guardsRemaining: number;
}

export type TutorialPhase = "playing" | "finished" | "skipped";

export class TutorialSession {
  private index = 0;
  private phase: TutorialPhase = "playing";
  private travelled = 0;
  private lastX: number | null = null;
  private lastZ: number | null = null;
  private shotsAtStart = 0;

  get state(): TutorialPhase {
    return this.phase;
  }

  get isActive(): boolean {
    return this.phase === "playing";
  }

  /** Étape en cours, ou null une fois le tutoriel terminé ou passé. */
  get step(): TutorialStep | null {
    return this.phase === "playing" ? (TUTORIAL_STEPS[this.index] ?? null) : null;
  }

  /** Numéro de l'étape en cours à partir de 1. */
  get stepNumber(): number {
    return Math.min(this.index + 1, TUTORIAL_STEPS.length);
  }

  get stepCount(): number {
    return TUTORIAL_STEPS.length;
  }

  /** « Passer le tutoriel » : le joueur sait déjà jouer, ou veut explorer seul. */
  skip(): void {
    if (this.phase === "playing") this.phase = "skipped";
  }

  /**
   * Fait avancer le tutoriel avec l'état actuel du jeu. Renvoie le nombre d'étapes franchies pendant cet appel
   * (0 : rien de nouveau) : l'interface s'en sert pour le petit signal de réussite.
   */
  update(snapshot: TutorialSnapshot): number {
    if (this.phase !== "playing") return 0;
    this.trackMovement(snapshot);
    let completed = 0;
    // Un joueur pressé peut valider plusieurs étapes d'un coup (dossier déjà ramassé, par exemple).
    while (this.phase === "playing") {
      const step = TUTORIAL_STEPS[this.index];
      if (!step || !this.isDone(step.id, snapshot)) break;
      completed++;
      this.advance(snapshot);
    }
    return completed;
  }

  private trackMovement(snapshot: TutorialSnapshot): void {
    if (this.lastX !== null && this.lastZ !== null) {
      const step = Math.hypot(snapshot.x - this.lastX, snapshot.z - this.lastZ);
      if (Number.isFinite(step) && step <= MAX_STEP_CELLS) this.travelled += step;
    }
    this.lastX = snapshot.x;
    this.lastZ = snapshot.z;
  }

  private isDone(id: TutorialStepId, snapshot: TutorialSnapshot): boolean {
    switch (id) {
      case "move":
        return this.travelled >= MOVE_GOAL_CELLS;
      case "intel":
        return snapshot.intelCollected >= 1;
      case "terminal":
        return snapshot.hackedCount >= 1;
      case "aim":
        return snapshot.aiming;
      case "shoot":
        return snapshot.shotsFired > this.shotsAtStart;
      case "crouch":
        return snapshot.crouching;
      case "takedown":
        // Plus aucune sentinelle debout (neutralisées plus tôt) : rien à apprendre ici, on ne bloque pas le joueur.
        return snapshot.neutralizations >= 1 || snapshot.guardsRemaining === 0;
    }
  }

  private advance(snapshot: TutorialSnapshot): void {
    this.index++;
    // Les tirs précédents ne comptent pas pour l'étape « tirer » : on veut le geste fait à ce moment-là.
    this.shotsAtStart = snapshot.shotsFired;
    if (this.index >= TUTORIAL_STEPS.length) this.phase = "finished";
  }
}

/** Consigne de chaque étape : le texte change selon le mode d'entrée (clavier et souris, ou écran tactile). */
export function tutorialInstruction(id: TutorialStepId, touch: boolean): { title: string; hint: string } {
  switch (id) {
    case "move":
      return touch
        ? { title: "Déplace-toi", hint: "Pose le pouce gauche sur l'écran et glisse : un joystick apparaît là où tu poses le doigt." }
        : { title: "Déplace-toi", hint: "Utilise Z, Q, S, D (ou les flèches du clavier)." };
    case "intel":
      return { title: "Ramasse un dossier", hint: "Marche jusqu'au dossier jaune indiqué : il contient une leçon qui prépare les terminaux." };
    case "terminal":
      return touch
        ? { title: "Pirate un terminal", hint: "Approche du terminal rouge indiqué puis touche le bouton Pirater, et réponds à la question." }
        : { title: "Pirate un terminal", hint: "Approche du terminal rouge indiqué, appuie sur E, puis réponds à la question." };
    case "aim":
      return touch
        ? { title: "Épaule ton arme", hint: "Pose le pouce sur le pad Tirer et glisse : un laser rouge montre où tu vises." }
        : { title: "Épaule ton arme", hint: "Maintiens le clic droit : un laser rouge montre où tu vises, et le tir devient précis." };
    case "shoot":
      return touch
        ? { title: "Tire", hint: "Relâche le pad Tirer pour faire feu. Tu peux rater : une balle qui touche suspend une sentinelle." }
        : { title: "Tire", hint: "Clic gauche ou Espace. Tu peux rater : une balle qui touche suspend une sentinelle." };
    case "crouch":
      return touch
        ? { title: "Accroupis-toi", hint: "Touche le bouton à l'icône de personnage accroupi : tu es moins visible et moins bruyant." }
        : { title: "Accroupis-toi", hint: "Appuie sur C : tu es moins visible et moins bruyant. Rappuie pour te relever." };
    case "takedown":
      return touch
        ? { title: "Neutralise une sentinelle", hint: "Approche-la par derrière sans te faire voir, puis touche le bouton Neutraliser." }
        : { title: "Neutralise une sentinelle", hint: "Approche-la par derrière sans te faire voir, puis appuie sur E." };
  }
}

/**
 * Où dessiner le repère d'une cible à l'écran : sur la cible si elle est visible, sinon collé au bord
 * le plus proche, avec l'angle de la flèche qui indique la direction. Coordonnées normalisées (-1 à 1).
 */
export interface MarkerPlacement {
  /** Position en fraction de l'écran (0 à 1), origine en haut à gauche. */
  left: number;
  top: number;
  /** La cible est dans l'écran : on dessine un anneau, pas une flèche. */
  onScreen: boolean;
  /** Angle de la flèche en radians (0 = vers la droite), pertinent hors écran. */
  angle: number;
}

export function placeMarker(ndcX: number, ndcY: number, behindCamera: boolean, margin: number): MarkerPlacement {
  const safeMargin = Math.min(0.45, Math.max(0, margin));
  const limit = 1 - safeMargin * 2;
  // Derrière la caméra, les coordonnées projetées sont inversées : on les retourne pour viser le bon bord.
  const x = Number.isFinite(ndcX) ? (behindCamera ? -ndcX : ndcX) : 0;
  const y = Number.isFinite(ndcY) ? (behindCamera ? -ndcY : ndcY) : 0;
  const onScreen = !behindCamera && Math.abs(x) <= limit && Math.abs(y) <= limit;
  const angle = Math.atan2(-y, x);
  if (onScreen) return { left: (x + 1) / 2, top: (1 - y) / 2, onScreen, angle };
  // Rabattre le point sur le bord du rectangle, en gardant la direction depuis le centre.
  const scale = Math.max(Math.abs(x), Math.abs(y), 1e-6);
  const edgeX = (x / scale) * limit;
  const edgeY = (y / scale) * limit;
  return { left: (edgeX + 1) / 2, top: (1 - edgeY) / 2, onScreen, angle };
}
