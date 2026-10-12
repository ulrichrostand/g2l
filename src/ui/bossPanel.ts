import { canonicalCommand, isStepCommandCorrect, simulateWrongCommand } from "../challenges/scenario";
import type { BossDefinition, BossPhase } from "../content/bosses";
import { button, element, richText } from "./dom";
import "./bossPanel.css";

export interface BossPanelCallbacks {
  onWrongCommand(): void;
  onSuccess(): void;
  onCancel(): void;
}

/** L'indice arrive dès la première erreur : sous pression, un débutant bloqué panique au lieu d'apprendre. */
const ATTEMPTS_BEFORE_HINT = 1;
/** Après 2 erreurs on montre la commande, mais il faut quand même la taper : c'est le geste qui s'apprend. */
const ATTEMPTS_BEFORE_SOLUTION = 2;
const PROMPT = "spectre@helix:~$";
const TITLE_ID = "boss-panel-title";
const CONTEXT_LABEL_ID = "boss-context-label";
/** Une commande qui réussit sans rien afficher déroute un débutant : on explique ce silence. */
const SILENT_SUCCESS_NOTE = "(aucune sortie : sous Linux, une commande qui réussit reste souvent silencieuse)";

/**
 * Console de combat contre un boss : le temps de jeu est figé pendant qu'elle est ouverte,
 * et une seule vraie commande, déduite de la sortie affichée, porte le coup de la phase.
 */
export class BossPanel {
  private readonly phase: BossPhase;
  private readonly isFinalPhase: boolean;
  private wrongAttempts = 0;
  private solved = false;
  private finished = false;
  private readonly history: string[] = [];
  private historyCursor = 0;
  private readonly freezeNotice = element("p", { className: "challenge-note boss-freeze", attributes: { "aria-live": "polite" } });
  private readonly goalBox = element("div", { className: "boss-goal" });
  private readonly scrollback = element("div", {
    className: "shell-scrollback boss-scrollback",
    attributes: { role: "log", "aria-live": "polite", "aria-label": "Terminal" },
  });
  private readonly feedback = element("div", { className: "boss-feedback", attributes: { "aria-live": "polite" } });
  private readonly actions = element("div", { className: "challenge-actions" });
  private readonly input = element("input", {
    className: "command-input",
    attributes: { type: "text", autocomplete: "off", autocapitalize: "off", spellcheck: "false", maxlength: "200", "aria-label": "Commande" },
  });

  constructor(
    private readonly container: HTMLElement,
    private readonly boss: BossDefinition,
    private readonly phaseIndex: number,
    private secondsLeft: number,
    private readonly callbacks: BossPanelCallbacks,
  ) {
    const phase = Number.isInteger(phaseIndex) ? boss.phases[phaseIndex] : undefined;
    if (!phase) throw new RangeError(`Phase ${phaseIndex} inexistante pour le boss ${boss.name}`);
    this.phase = phase;
    this.isFinalPhase = phaseIndex === boss.phases.length - 1;
  }

  open(): void {
    const form = element("form", { className: "command-form" }, [element("span", { className: "prompt-symbol", text: PROMPT }), this.input]);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      this.execute(this.input.value);
    });
    this.input.addEventListener("keydown", (event) => this.browseHistory(event));
    this.input.addEventListener("focus", () => (this.historyCursor = this.history.length));

    this.container.replaceChildren(
      element(
        "div",
        { className: "panel challenge-panel boss-panel", attributes: { role: "dialog", "aria-modal": "true", "aria-labelledby": TITLE_ID } },
        [
          element("div", { className: "challenge-header boss-header" }, [
            element("span", { className: "blink", text: "●", attributes: { "aria-hidden": "true" } }),
            element("span", {
              className: "boss-heading",
              text: `BOSS — ${this.boss.name} · Phase ${this.phaseIndex + 1}/${this.boss.phases.length}`,
              attributes: { id: TITLE_ID },
            }),
            element("span", { className: "tag boss-tag", text: "Exposé" }),
          ]),
          element("p", { className: "boss-subtitle", text: this.boss.title }),
          this.phaseTrack(),
          this.freezeNotice,
          element("p", { className: "boss-label boss-context-label", text: "Sortie du terminal — lis-la", attributes: { id: CONTEXT_LABEL_ID } }),
          element("pre", {
            className: "terminal-output boss-context",
            text: this.phase.context.join("\n"),
            // Focalisable : la sortie défile horizontalement et doit rester lisible au clavier.
            // Région nommée par le libellé visible : aria-label est interdit sur un <pre> (rôle generic),
            // et une région annonce son nom puis laisse lire les lignes, où se trouve le PID ou le nom à recopier.
            attributes: { tabindex: "0", role: "region", "aria-labelledby": CONTEXT_LABEL_ID },
          }),
          this.goalBox,
          this.scrollback,
          form,
          this.feedback,
          this.actions,
        ],
      ),
    );
    this.renderFreezeNotice();
    this.container.hidden = false;
    this.renderFighting();
  }

  /**
   * Chaque erreur raccourcit l'exposition du boss (règle tenue par le boss, pas par ce panneau) : l'appelant
   * redonne ici le temps restant, sinon le joueur se replierait en comptant sur un délai qui n'existe plus.
   */
  updateSecondsLeft(seconds: number): void {
    this.secondsLeft = seconds;
    this.renderFreezeNotice();
  }

  close(): void {
    this.container.hidden = true;
    this.container.replaceChildren();
  }

  /** Jauge des 3 phases : voir le chemin parcouru motive à finir le combat. */
  private phaseTrack(): HTMLElement {
    return element(
      "div",
      { className: "boss-phase-track", attributes: { "aria-hidden": "true" } },
      this.boss.phases.map((_, index) => {
        const state = index < this.phaseIndex ? "done" : index === this.phaseIndex ? "current" : "pending";
        return element("span", { className: `boss-pip ${state}` });
      }),
    );
  }

  private formattedSecondsLeft(): string {
    return String(Number.isFinite(this.secondsLeft) ? Math.max(0, Math.ceil(this.secondsLeft)) : 0);
  }

  /** La pénalité est annoncée d'emblée : le joueur doit savoir qu'essayer au hasard lui coûte du temps. */
  private renderFreezeNotice(): void {
    this.freezeNotice.textContent = `Le temps est figé : il reste ${this.formattedSecondsLeft()} s d'exposition quand tu reprendras (chaque erreur en retire).`;
  }

  private renderFighting(): void {
    this.goalBox.replaceChildren(element("span", { className: "boss-label", text: "Objectif" }), richText("p", this.phase.goal));
    this.actions.replaceChildren(
      button("Exécuter ⏎", () => this.execute(this.input.value), "btn primary"),
      button("Se replier", () => this.callbacks.onCancel(), "btn ghost"),
    );
    this.input.disabled = false;
    // Sans défilement : sur un écran bas (téléphone couché), l'overlay sauterait jusqu'au champ et cacherait
    // l'en-tête et la sortie à lire. Le navigateur ramène le champ à l'écran dès qu'on tape ou que le clavier s'ouvre.
    this.input.focus({ preventScroll: true });
  }

  private renderFeedback(): void {
    const hints: HTMLElement[] = [];
    if (this.wrongAttempts >= ATTEMPTS_BEFORE_HINT) hints.push(richText("p", `Indice : ${this.phase.hint}`, "hint"));
    if (this.wrongAttempts >= ATTEMPTS_BEFORE_SOLUTION) {
      hints.push(
        element("div", { className: "solution" }, [
          element("strong", { text: "Commande attendue : " }),
          element("code", { text: canonicalCommand(this.phase) }),
          element("span", { text: " — tape-la pour porter le coup." }),
        ]),
      );
    }
    this.feedback.replaceChildren(...hints);
  }

  private browseHistory(event: KeyboardEvent): void {
    // Flèches haut/bas : historique des commandes, comme dans un vrai terminal.
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    if (event.key === "ArrowUp") this.historyCursor = Math.max(0, this.historyCursor - 1);
    else this.historyCursor = Math.min(this.history.length, this.historyCursor + 1);
    this.input.value = this.history[this.historyCursor] ?? "";
  }

  private execute(rawCommand: string): void {
    const command = rawCommand.trim();
    if (this.solved || command.length === 0) return;
    this.history.push(command);
    this.historyCursor = this.history.length;
    this.input.value = "";
    this.appendLine(`${PROMPT} ${command}`, "command");

    if (!isStepCommandCorrect(this.phase, command)) {
      this.wrongAttempts++;
      for (const line of simulateWrongCommand(command)) this.appendLine(line, "error");
      this.renderFeedback();
      this.callbacks.onWrongCommand();
      this.revealHintAndInput();
      this.input.focus();
      return;
    }

    this.solved = true;
    if (this.phase.output.length === 0) this.appendLine(SILENT_SUCCESS_NOTE, "muted");
    for (const line of this.phase.output) this.appendLine(line, "output");
    this.renderStrike();
  }

  /**
   * L'erreur et l'indice allongent le panneau : sur un écran bas, le champ glisserait sous le bord sans que
   * rien ne le ramène, puisqu'il a déjà le focus. Le champ passe en dernier : c'est lui qui doit rester visible.
   */
  private revealHintAndInput(): void {
    this.feedback.scrollIntoView({ block: "nearest" });
    this.input.scrollIntoView({ block: "nearest" });
  }

  private renderStrike(): void {
    this.input.disabled = true;
    this.feedback.replaceChildren();
    this.goalBox.replaceChildren(
      ...(this.isFinalPhase
        ? [element("p", { className: "granted boss-granted", text: "BOSS VAINCU ✔" }), richText("p", this.boss.defeat, "explanation")]
        : [
            element("p", { className: "granted boss-granted", text: `COUP PORTÉ ✔ — phase ${this.phaseIndex + 1}/${this.boss.phases.length}` }),
            element("p", { className: "boss-next", text: "Le boss va se relever : casse à nouveau son armure, puis reviens l'achever." }),
          ]),
    );
    const strike = button(this.isFinalPhase ? "Achever le boss" : "Continuer le combat", () => this.finish(strike), "btn primary");
    this.actions.replaceChildren(strike);
    strike.focus();
  }

  /** Un double clic ne doit pas compter deux coups au boss. */
  private finish(strike: HTMLButtonElement): void {
    if (this.finished) return;
    this.finished = true;
    strike.disabled = true;
    this.callbacks.onSuccess();
  }

  private appendLine(text: string, kind: "command" | "output" | "error" | "muted"): void {
    this.scrollback.append(element("div", { className: `shell-line ${kind}`, text: text.length === 0 ? " " : text }));
    this.scrollback.scrollTop = this.scrollback.scrollHeight;
  }
}
