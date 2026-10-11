export type GameAction = "interact" | "command" | "shoot" | "reload" | "crouch" | "nightVision" | "pause";

/** Mapping par code physique (KeyW...) : fonctionne en AZERTY (ZQSD) comme en QWERTY (WASD). */
const ACTION_KEYS: Record<GameAction, readonly string[]> = {
  interact: ["KeyE", "Enter"],
  // F : même position en AZERTY et en QWERTY, juste à côté de E.
  command: ["KeyF"],
  shoot: ["Space"],
  // R : même position en AZERTY et en QWERTY, la touche de rechargement de tous les jeux de tir.
  reload: ["KeyR"],
  crouch: ["KeyC", "ControlLeft"],
  nightVision: ["KeyN"],
  pause: ["Escape", "KeyP"],
};

const MOVE_KEYS = {
  forward: ["KeyW", "ArrowUp"],
  backward: ["KeyS", "ArrowDown"],
  left: ["KeyA", "ArrowLeft"],
  right: ["KeyD", "ArrowRight"],
  run: ["ShiftLeft", "ShiftRight"],
} as const;

export interface MoveIntent {
  x: number;
  z: number;
  running: boolean;
}

const NO_MOVE: MoveIntent = { x: 0, z: 0, running: false };
/** Bit de `PointerEvent.buttons` pour chaque valeur de `PointerEvent.button` (gauche, milieu, droit). */
const BUTTON_MASKS: Record<0 | 1 | 2, number> = { 0: 1, 1: 4, 2: 2 };

export class InputController {
  private readonly heldKeys = new Set<string>();
  private readonly pendingActions = new Set<GameAction>();
  /** Déplacement fourni par le joystick tactile, utilisé quand aucune touche n'est enfoncée. */
  private virtualMove: MoveIntent = NO_MOVE;
  /** Position de la souris en coordonnées normalisées (-1..1), null tant qu'aucune souris n'a bougé. */
  private aimPointer: { x: number; y: number } | null = null;
  /** Clic droit maintenu : visée épaulée. */
  private aimButtonHeld = false;
  /** Direction visée au pad tactile (radians, convention du jeu), null quand le pouce est levé. */
  private virtualAim: number | null = null;

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    // Ne jamais intercepter la saisie dans les champs de commande des terminaux.
    if (isTypingTarget(event.target)) return;
    if (!event.repeat) {
      for (const [action, codes] of Object.entries(ACTION_KEYS) as [GameAction, readonly string[]][]) {
        if (codes.includes(event.code)) this.pendingActions.add(action);
      }
    }
    if (isGameKey(event.code)) event.preventDefault();
    this.heldKeys.add(event.code);
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    this.heldKeys.delete(event.code);
  };

  // Évite un joueur qui « glisse » quand la fenêtre perd le focus touche enfoncée.
  private readonly handleBlur = (): void => {
    this.heldKeys.clear();
    this.virtualMove = NO_MOVE;
    this.virtualAim = null;
    this.aimButtonHeld = false;
  };

  constructor(private readonly target: Window) {
    target.addEventListener("keydown", this.handleKeyDown);
    target.addEventListener("keyup", this.handleKeyUp);
    target.addEventListener("blur", this.handleBlur);
  }

  moveIntent(): MoveIntent {
    const isHeld = (codes: readonly string[]): boolean => codes.some((code) => this.heldKeys.has(code));
    const x = (isHeld(MOVE_KEYS.right) ? 1 : 0) - (isHeld(MOVE_KEYS.left) ? 1 : 0);
    const z = (isHeld(MOVE_KEYS.backward) ? 1 : 0) - (isHeld(MOVE_KEYS.forward) ? 1 : 0);
    if (x === 0 && z === 0) return this.virtualMove;
    const length = Math.hypot(x, z);
    return { x: x / length, z: z / length, running: isHeld(MOVE_KEYS.run) };
  }

  /** Souris sur le canvas : le pointeur vise, clic droit maintenu = épauler, clic gauche = tirer. */
  attachPointerAim(surface: HTMLElement): void {
    /**
     * Un 2ᵉ bouton pressé pendant qu'un autre est enfoncé (tirer en visant) n'émet PAS de pointerdown :
     * le navigateur envoie un pointermove « chordé » où `button` désigne le bouton qui a changé.
     * On traite donc les boutons de la même façon sur pointerdown, pointermove et pointerup.
     */
    const handleButtons = (event: PointerEvent): void => {
      // -1 : simple déplacement ; > 2 : boutons précédent/suivant, sans usage en jeu.
      if (event.pointerType !== "mouse" || event.button < 0 || event.button > 2) return;
      const pressed = (event.buttons & BUTTON_MASKS[event.button as 0 | 1 | 2]) !== 0;
      if (event.button === 0 && pressed && event.target === surface) this.pendingActions.add("shoot");
      if (event.button === 2) this.aimButtonHeld = pressed;
    };
    surface.addEventListener("pointerdown", handleButtons);
    // Sur la fenêtre : un bouton relâché hors du canvas ne doit pas laisser la visée bloquée.
    this.target.addEventListener("pointermove", (event) => {
      if (event.pointerType !== "mouse") return;
      handleButtons(event);
      if (event.target !== surface) return;
      const bounds = surface.getBoundingClientRect();
      this.aimPointer = {
        x: ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
        y: -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
      };
    });
    this.target.addEventListener("pointerup", handleButtons);
    // Le clic droit sert à viser : pas de menu contextuel du navigateur par-dessus le jeu.
    surface.addEventListener("contextmenu", (event) => event.preventDefault());
  }

  get aimPosition(): { x: number; y: number } | null {
    return this.aimPointer;
  }

  get isAimButtonHeld(): boolean {
    return this.aimButtonHeld;
  }

  get virtualAimAngle(): number | null {
    return this.virtualAim;
  }

  setVirtualAim(angle: number | null): void {
    this.virtualAim = angle;
  }

  setVirtualMove(intent: MoveIntent): void {
    this.virtualMove = intent;
  }

  /** Déclenche une action depuis un bouton tactile, comme un appui clavier. */
  trigger(action: GameAction): void {
    this.pendingActions.add(action);
  }

  /** Consomme l'action : un appui = un déclenchement, même si la frame suivante la relit. */
  consume(action: GameAction): boolean {
    return this.pendingActions.delete(action);
  }

  clear(): void {
    this.pendingActions.clear();
    this.heldKeys.clear();
    this.aimButtonHeld = false;
  }

  dispose(): void {
    this.target.removeEventListener("keydown", this.handleKeyDown);
    this.target.removeEventListener("keyup", this.handleKeyUp);
    this.target.removeEventListener("blur", this.handleBlur);
  }
}

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
}

const GAME_KEYS = new Set<string>([
  ...Object.values(MOVE_KEYS).flat(),
  ...Object.values(ACTION_KEYS).flat().filter((code) => code !== "Enter"),
]);

function isGameKey(code: string): boolean {
  return GAME_KEYS.has(code);
}
