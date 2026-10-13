import { placeMarker, tutorialInstruction, type MarkerPlacement, type TutorialStep } from "../game/tutorial";
import { t } from "../i18n/messages/tutorial";
import { button, element } from "./dom";

/** Marge (part de l'écran) gardée libre autour du repère quand il est collé au bord : sous les blocs du HUD. */
const MARKER_EDGE_MARGIN = 0.12;
const SUCCESS_FLASH_MS = 700;
const COMPLETION_VISIBLE_MS = 9000;

export interface TutorialGuideCallbacks {
  onSkip(): void;
}

/**
 * Affichage du tutoriel : une carte de consigne (étape, texte, avancement, « Passer ») et un repère qui montre
 * la cible dans le monde. Aucune logique de jeu ici : TutorialSession décide, ce composant dessine.
 */
export class TutorialGuide {
  private readonly card: HTMLElement;
  private readonly eyebrow = element("p", { className: "tutorial-eyebrow" });
  private readonly title = element("h2", { className: "tutorial-title" });
  private readonly hint = element("p", { className: "tutorial-hint" });
  private readonly pips = element("div", { className: "tutorial-pips", attributes: { "aria-hidden": "true" } });
  private readonly skipButton: HTMLButtonElement;
  private readonly marker = element("div", { className: "tutorial-marker", attributes: { "aria-hidden": "true" } }, [
    element("span", { className: "tutorial-marker-ring" }),
    element("span", { className: "tutorial-marker-arrow" }),
  ]);
  private flashTimer: number | undefined;
  private completionTimer: number | undefined;
  private renderedKey = "";

  constructor(
    parent: HTMLElement,
    private readonly callbacks: TutorialGuideCallbacks,
  ) {
    this.skipButton = button(t("skip"), () => this.callbacks.onSkip(), "btn ghost small");
    this.card = element("section", { className: "tutorial-card", attributes: { role: "status", "aria-live": "polite", "aria-label": t("label") } }, [
      this.eyebrow,
      this.title,
      this.hint,
      element("div", { className: "tutorial-footer" }, [this.pips, this.skipButton]),
    ]);
    this.card.hidden = true;
    this.marker.hidden = true;
    parent.append(this.card, this.marker);
  }

  /** Affiche l'étape en cours. Ne touche au DOM que si l'étape ou le mode d'entrée a changé. */
  showStep(step: TutorialStep, stepNumber: number, stepCount: number, touch: boolean): void {
    const key = `${step.id}:${touch}:${stepNumber}`;
    if (key === this.renderedKey && !this.card.hidden) return;
    this.renderedKey = key;
    window.clearTimeout(this.completionTimer);
    const instruction = tutorialInstruction(step.id, touch);
    this.eyebrow.textContent = t("eyebrow", { step: stepNumber, total: stepCount });
    this.title.textContent = instruction.title;
    this.hint.textContent = instruction.hint;
    this.pips.replaceChildren(
      ...Array.from({ length: stepCount }, (_, index) => element("span", { className: index < stepNumber - 1 ? "pip done" : index === stepNumber - 1 ? "pip current" : "pip" })),
    );
    this.skipButton.hidden = false;
    this.card.classList.remove("complete");
    this.card.hidden = false;
  }

  /** Petit signal quand une étape vient d'être franchie (le texte change aussitôt après). */
  flashSuccess(): void {
    this.card.classList.add("success");
    window.clearTimeout(this.flashTimer);
    this.flashTimer = window.setTimeout(() => this.card.classList.remove("success"), SUCCESS_FLASH_MS);
  }

  /** Fin du tutoriel : un message de passage de relais, qui s'efface tout seul. */
  showCompletion(): void {
    this.renderedKey = "complete";
    this.eyebrow.textContent = t("doneEyebrow");
    this.title.textContent = t("doneTitle");
    this.hint.textContent = t("doneHint");
    this.pips.replaceChildren(...Array.from({ length: 7 }, () => element("span", { className: "pip done" })));
    this.skipButton.hidden = true;
    this.card.classList.add("complete");
    this.card.hidden = false;
    this.hideMarker();
    window.clearTimeout(this.completionTimer);
    this.completionTimer = window.setTimeout(() => this.hide(), COMPLETION_VISIBLE_MS);
  }

  /** Repère de la cible : anneau sur la cible visible, flèche collée au bord sinon. */
  showMarker(placement: MarkerPlacement): void {
    this.marker.hidden = false;
    this.marker.style.left = `${(placement.left * 100).toFixed(2)}%`;
    this.marker.style.top = `${(placement.top * 100).toFixed(2)}%`;
    this.marker.classList.toggle("off-screen", !placement.onScreen);
    this.marker.style.setProperty("--marker-angle", `${placement.angle}rad`);
  }

  hideMarker(): void {
    this.marker.hidden = true;
  }

  hide(): void {
    window.clearTimeout(this.flashTimer);
    window.clearTimeout(this.completionTimer);
    this.card.hidden = true;
    this.card.classList.remove("success", "complete");
    this.renderedKey = "";
    this.hideMarker();
  }
}

export { MARKER_EDGE_MARGIN, placeMarker };
