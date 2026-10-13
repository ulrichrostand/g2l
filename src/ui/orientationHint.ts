import { enterLandscapeFullscreen, fullscreenSupported, type FullscreenHost, type LandscapeOutcome, type OrientationHost } from "../core/orientation";
import { t } from "../i18n/messages/orientation";
import { button, element } from "./dom";

function outcomeMessage(outcome: LandscapeOutcome): string {
  switch (outcome) {
    case "locked":
      return t("locked");
    case "fullscreen-only":
      return t("fullscreenOnly");
    case "unavailable":
      return t("unavailable");
  }
}
/** Le conseil s'efface seul : il ne doit pas rester sur l'écran pendant toute la mission. */
const AUTO_HIDE_MS = 14_000;
const OUTCOME_VISIBLE_MS = 4_000;

export interface OrientationHintOptions {
  /** Délai avant disparition ; null : reste affiché (écran de briefing, où le joueur lit à son rythme). */
  autoHideMs?: number | null;
  /** Dans le flux d'un écran plutôt que flottant au-dessus du jeu. */
  inline?: boolean;
}

export interface OrientationHintCallbacks {
  /** Le joueur écarte le conseil : on ne le lui remontre pas pendant cette session. */
  onDismiss(): void;
}

/**
 * Bandeau « le paysage est plus confortable » : ni bloquant ni répété. Montre le bouton « Plein écran »
 * seulement quand le navigateur sait le faire (pas sur iPhone, où l'on ne peut que conseiller de tourner).
 */
export class OrientationHint {
  private readonly root: HTMLElement;
  private readonly message = element("p", { className: "orientation-hint-text" });
  private readonly fullscreenButton: HTMLButtonElement;
  private hideTimer: number | undefined;
  private busy = false;

  constructor(
    parent: HTMLElement,
    private readonly fullscreenHost: FullscreenHost,
    private readonly orientationHost: OrientationHost,
    private readonly callbacks: OrientationHintCallbacks,
    private readonly options: OrientationHintOptions = {},
  ) {
    this.fullscreenButton = button(t("fullscreen"), () => void this.goFullscreen(), "btn primary small");
    const dismissButton = button(t("later"), () => this.dismiss(), "btn ghost small");
    this.root = element("aside", { className: this.options.inline ? "orientation-hint inline" : "orientation-hint", attributes: { role: "status", "aria-live": "polite" } }, [
      this.message,
      element("div", { className: "orientation-hint-actions" }, [this.fullscreenButton, dismissButton]),
    ]);
    this.root.hidden = true;
    parent.append(this.root);
  }

  get isVisible(): boolean {
    return !this.root.hidden;
  }

  show(): void {
    if (!this.root.hidden) return;
    const canFullscreen = fullscreenSupported(this.fullscreenHost);
    this.message.textContent = canFullscreen
      ? t("hintFullscreen")
      : t("hintRotate");
    this.fullscreenButton.hidden = !canFullscreen;
    this.root.hidden = false;
    window.clearTimeout(this.hideTimer);
    const autoHideMs = this.options.autoHideMs === undefined ? AUTO_HIDE_MS : this.options.autoHideMs;
    if (autoHideMs !== null) this.hideTimer = window.setTimeout(() => this.hide(), autoHideMs);
  }

  hide(): void {
    window.clearTimeout(this.hideTimer);
    this.root.hidden = true;
    this.busy = false;
  }

  private dismiss(): void {
    this.hide();
    this.callbacks.onDismiss();
  }

  private async goFullscreen(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    const outcome = await enterLandscapeFullscreen(this.fullscreenHost, this.orientationHost);
    // Le joueur a agi sur le conseil : inutile de le lui remontrer en mission, quel qu'ait été le résultat.
    this.callbacks.onDismiss();
    this.message.textContent = outcomeMessage(outcome);
    this.fullscreenButton.hidden = true;
    window.clearTimeout(this.hideTimer);
    this.hideTimer = window.setTimeout(() => this.hide(), OUTCOME_VISIBLE_MS);
    this.busy = false;
  }
}
