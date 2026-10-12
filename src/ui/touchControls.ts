import type { GameAction, InputController, MoveIntent } from "../core/input";
import { element } from "./dom";

const JOYSTICK_RADIUS_PX = 52;
/** En deçà, le pouce tremble : on ignore pour éviter un personnage qui dérive. */
const DEAD_ZONE = 0.15;
/** Pousser le pouce au-delà de l'anneau fait courir : un geste volontaire, pas accidentel. */
const RUN_THRESHOLD = 1.35;
/** Durée pendant laquelle le clic émis au relâchement du doigt est ignoré. */
const GHOST_CLICK_WINDOW_MS = 450;
/** Le bouton de visée reste dans l'anneau du pad (116 px) même si le pouce va plus loin. */
const AIM_PAD_RADIUS_PX = 46;
/** En deçà, c'est une simple tape : on tire droit devant au lieu de viser. */
const AIM_DEAD_ZONE_PX = 12;

/**
 * Pad de tir façon jeux mobiles : glisser le pouce vise (laser affiché), relâcher tire.
 * Renvoie l'angle de visée dans le repère du jeu, ou null pour une simple tape.
 */
export function aimPadAngle(deltaX: number, deltaY: number): number | null {
  if (Math.hypot(deltaX, deltaY) < AIM_DEAD_ZONE_PX) return null;
  // Même repère que le joystick : l'axe Y de l'écran suit l'axe Z du jeu.
  return Math.atan2(deltaY, deltaX);
}

export type AimPadRelease = "fire" | "cancel";

/**
 * Ce que fait le relâchement du pad de tir. Une simple tape tire droit devant ; mais si le pouce a visé puis
 * est revenu au centre, c'est une annulation (comme dans les jeux mobiles) : aucun coup ne doit partir.
 */
export function aimPadRelease(hasAimed: boolean, deltaX: number, deltaY: number): AimPadRelease {
  if (!hasAimed) return "fire";
  return aimPadAngle(deltaX, deltaY) === null ? "cancel" : "fire";
}

/** Silhouette accroupie : une icône se lit d'un coup d'œil et laisse le bouton rond (le mot « Accroupir » le débordait). */
function crouchIcon(): SVGSVGElement {
  const namespace = "http://www.w3.org/2000/svg";
  const icon = document.createElementNS(namespace, "svg");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("class", "touch-icon");
  icon.setAttribute("aria-hidden", "true");
  const head = document.createElementNS(namespace, "circle");
  head.setAttribute("cx", "15.5");
  head.setAttribute("cy", "5");
  head.setAttribute("r", "2.2");
  head.setAttribute("fill", "currentColor");
  icon.append(head);
  for (const path of ["M14 8.5 L10 13", "M13 10 L17.5 12.5", "M10 13 L15 15.5 L12.5 20.5", "M10 13 L6 17 L8 20.5"]) {
    const limb = document.createElementNS(namespace, "path");
    limb.setAttribute("d", path);
    icon.append(limb);
  }
  return icon;
}

/**
 * Convertit le déplacement du pouce (en pixels, Y écran vers le bas) en intention de mouvement.
 * Le Z du jeu suit le Y de l'écran : la caméra regarde vers -Z, donc « haut » = avancer.
 */
export function joystickIntent(deltaX: number, deltaY: number, radius = JOYSTICK_RADIUS_PX): MoveIntent {
  const distance = Math.hypot(deltaX, deltaY);
  const magnitude = distance / radius;
  if (magnitude < DEAD_ZONE) return { x: 0, z: 0, running: false };
  return { x: deltaX / distance, z: deltaY / distance, running: magnitude >= RUN_THRESHOLD };
}

/** Le jeu bascule en mode tactile si l'appareil a un pointeur grossier (doigt). */
export function prefersTouchControls(): boolean {
  return window.matchMedia?.("(pointer: coarse)").matches ?? false;
}

export class TouchControls {
  readonly root = element("div", { className: "touch-controls" });
  private readonly joystickZone = element("div", { className: "joystick-zone", attributes: { "aria-hidden": "true" } });
  private readonly joystickBase = element("div", { className: "joystick-base" });
  private readonly joystickKnob = element("div", { className: "joystick-knob" });
  private readonly interactButton: HTMLButtonElement;
  private readonly crouchButton: HTMLButtonElement;
  private readonly commandButton: HTMLButtonElement;
  private readonly exitFullscreenButton: HTMLButtonElement;
  private readonly aimPad = element("div", { className: "touch-btn aim-pad", attributes: { role: "button", "aria-label": "Tirer : glisser pour viser, relâcher pour tirer" } });
  private readonly aimKnob = element("div", { className: "aim-knob", text: "Tirer" });
  private aimPointerId: number | null = null;
  /** Le pouce est sorti de la zone morte depuis la pose : distingue une tape d'une visée annulée. */
  private hasAimed = false;
  private activePointerId: number | null = null;
  private originX = 0;
  private originY = 0;

  constructor(
    parent: HTMLElement,
    private readonly input: InputController,
    private readonly handlers: { onExitFullscreen: () => void },
  ) {
    this.joystickBase.append(this.joystickKnob);
    this.joystickZone.append(this.joystickBase);
    this.interactButton = this.actionButton("Pirater", "interact", "touch-btn primary");
    this.crouchButton = this.actionButton("Accroupir", "crouch", "touch-btn crouch", crouchIcon());
    this.commandButton = this.actionButton("Gadget", "command", "touch-btn gadget");
    this.exitFullscreenButton = element("button", { className: "touch-pill exit-fullscreen", text: "Réduire", attributes: { type: "button", "aria-label": "Quitter le plein écran", title: "Quitter le plein écran" } });
    this.exitFullscreenButton.hidden = true;
    this.exitFullscreenButton.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      this.handlers.onExitFullscreen();
      swallowGhostClick();
    });
    this.root.append(
      this.joystickZone,
      // Pause en haut de l'écran, loin des pouces : on ne l'appuie pas par erreur en plein combat.
      element("div", { className: "touch-topbar" }, [this.exitFullscreenButton, this.actionButton("Pause", "pause", "touch-pill pause")]),
      // Disposition façon jeux mobiles : le gros pad de tir dans le coin, les actions en arc autour (voir style.css).
      element("div", { className: "touch-actions" }, [this.crouchButton, this.interactButton, this.commandButton, this.actionButton("Vision", "nightVision", "touch-btn vision"), this.aimPad]),
    );
    this.aimPad.append(this.aimKnob);
    this.bindJoystick();
    this.bindAimPad();
    this.root.hidden = true;
    parent.append(this.root);
  }

  show(): void {
    this.root.hidden = false;
  }

  hide(): void {
    this.root.hidden = true;
    this.releaseJoystick();
    this.releaseAimPad();
  }

  /** Le bouton « Quitter le plein écran » n'existe que tant qu'on y est : sinon c'est du bruit. */
  setFullscreen(active: boolean): void {
    this.exitFullscreenButton.hidden = !active;
  }

  /** Mise à jour à chaque frame : on ne touche au DOM que si l'état change. */
  sync(state: { contextLabel: string | null; crouched: boolean; gadgetVisible: boolean; gadgetReady: boolean; shootReady: boolean }): void {
    const interactLabel = state.contextLabel ?? "Action";
    if (this.interactButton.textContent !== interactLabel) {
      this.interactButton.textContent = interactLabel;
      this.interactButton.setAttribute("aria-label", interactLabel);
    }
    setIfChanged(this.interactButton, "disabled", state.contextLabel === null);
    setIfChanged(this.commandButton, "hidden", !state.gadgetVisible);
    setIfChanged(this.commandButton, "disabled", !state.gadgetReady);
    if (this.aimPad.classList.contains("dry") === state.shootReady) this.aimPad.classList.toggle("dry", !state.shootReady);
    if (this.crouchButton.classList.contains("active") !== state.crouched) this.crouchButton.classList.toggle("active", state.crouched);
  }

  private actionButton(label: string, action: GameAction, className: string, icon?: SVGElement): HTMLButtonElement {
    const node = element("button", { className, text: icon ? undefined : label, attributes: { type: "button", "aria-label": label } });
    if (icon) node.append(icon);
    // pointerdown plutôt que click : réaction immédiate, sans attendre le relâchement du doigt.
    node.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      if (node.disabled) return;
      this.input.trigger(action);
      swallowGhostClick();
    });
    return node;
  }

  private bindJoystick(): void {
    this.joystickZone.addEventListener("pointerdown", (event) => {
      if (this.activePointerId !== null) return;
      event.preventDefault();
      this.activePointerId = event.pointerId;
      this.joystickZone.setPointerCapture(event.pointerId);
      // Joystick « flottant » : il apparaît sous le pouce, où qu'il se pose dans la zone.
      // L'anneau reste entièrement visible même si le pouce se pose au bord de l'écran.
      const zoneBounds = this.joystickZone.getBoundingClientRect();
      const margin = JOYSTICK_RADIUS_PX + 4;
      this.originX = clamp(event.clientX, zoneBounds.left + margin, zoneBounds.right - margin);
      this.originY = clamp(event.clientY, zoneBounds.top + margin, zoneBounds.bottom - margin);
      this.joystickBase.style.left = `${this.originX - zoneBounds.left}px`;
      this.joystickBase.style.top = `${this.originY - zoneBounds.top}px`;
      this.joystickBase.classList.add("visible");
      this.updateJoystick(event);
    });
    this.joystickZone.addEventListener("pointermove", (event) => {
      if (event.pointerId === this.activePointerId) this.updateJoystick(event);
    });
    const release = (event: PointerEvent): void => {
      if (event.pointerId === this.activePointerId) this.releaseJoystick();
    };
    this.joystickZone.addEventListener("pointerup", release);
    this.joystickZone.addEventListener("pointercancel", release);
  }

  private bindAimPad(): void {
    this.aimPad.addEventListener("pointerdown", (event) => {
      if (this.aimPointerId !== null) return;
      event.preventDefault();
      this.aimPointerId = event.pointerId;
      this.hasAimed = false;
      this.aimPad.setPointerCapture(event.pointerId);
      this.aimPad.classList.add("aiming");
    });
    this.aimPad.addEventListener("pointermove", (event) => {
      if (event.pointerId !== this.aimPointerId) return;
      const { deltaX, deltaY } = this.aimPadDelta(event);
      if (aimPadAngle(deltaX, deltaY) !== null) this.hasAimed = true;
      this.input.setVirtualAim(aimPadAngle(deltaX, deltaY));
      const distance = Math.hypot(deltaX, deltaY);
      const clampScale = distance > AIM_PAD_RADIUS_PX ? AIM_PAD_RADIUS_PX / distance : 1;
      this.aimKnob.style.transform = `translate(${deltaX * clampScale}px, ${deltaY * clampScale}px)`;
    });
    this.aimPad.addEventListener("pointerup", (event) => {
      if (event.pointerId !== this.aimPointerId) return;
      const { deltaX, deltaY } = this.aimPadDelta(event);
      // Le tir part au relâchement, dans la dernière direction visée (la mission s'en souvient un instant),
      // sauf si le pouce est revenu au centre : visée annulée.
      if (aimPadRelease(this.hasAimed, deltaX, deltaY) === "fire") this.input.trigger("shoot");
      swallowGhostClick();
      this.releaseAimPad();
    });
    this.aimPad.addEventListener("pointercancel", (event) => {
      if (event.pointerId === this.aimPointerId) this.releaseAimPad();
    });
  }

  private aimPadDelta(event: PointerEvent): { deltaX: number; deltaY: number } {
    const bounds = this.aimPad.getBoundingClientRect();
    return { deltaX: event.clientX - (bounds.left + bounds.width / 2), deltaY: event.clientY - (bounds.top + bounds.height / 2) };
  }

  private releaseAimPad(): void {
    this.aimPointerId = null;
    this.hasAimed = false;
    this.input.setVirtualAim(null);
    this.aimKnob.style.transform = "";
    this.aimPad.classList.remove("aiming");
  }

  private updateJoystick(event: PointerEvent): void {
    const deltaX = event.clientX - this.originX;
    const deltaY = event.clientY - this.originY;
    const intent = joystickIntent(deltaX, deltaY);
    this.input.setVirtualMove(intent);
    // Le bouton reste visuellement dans l'anneau, même si le pouce le dépasse pour courir.
    const distance = Math.hypot(deltaX, deltaY);
    const clampScale = distance > JOYSTICK_RADIUS_PX ? JOYSTICK_RADIUS_PX / distance : 1;
    this.joystickKnob.style.transform = `translate(${deltaX * clampScale}px, ${deltaY * clampScale}px)`;
    this.joystickKnob.classList.toggle("running", intent.running);
  }

  private releaseJoystick(): void {
    this.activePointerId = null;
    this.input.setVirtualMove({ x: 0, z: 0, running: false });
    this.joystickKnob.style.transform = "";
    this.joystickKnob.classList.remove("running");
    this.joystickBase.classList.remove("visible");
  }
}

function setIfChanged(node: HTMLButtonElement, property: "disabled" | "hidden", value: boolean): void {
  if (node[property] !== value) node[property] = value;
}

function clamp(value: number, min: number, max: number): number {
  // Zone trop petite pour l'anneau (écran minuscule) : on centre plutôt que de produire min > max.
  if (min > max) return (min + max) / 2;
  return Math.min(Math.max(value, min), max);
}

/**
 * L'action part au pointerdown, donc un panneau (question, pause) peut s'ouvrir sous le doigt
 * avant qu'il ne se lève : le « click » émis au relâchement validerait alors une réponse au hasard.
 * On intercepte ce clic unique en phase de capture.
 */
function swallowGhostClick(): void {
  const deadline = performance.now() + GHOST_CLICK_WINDOW_MS;
  const swallow = (event: MouseEvent): void => {
    window.removeEventListener("click", swallow, true);
    if (performance.now() > deadline) return;
    event.preventDefault();
    event.stopPropagation();
  };
  window.addEventListener("click", swallow, true);
  window.setTimeout(() => window.removeEventListener("click", swallow, true), GHOST_CLICK_WINDOW_MS);
}
