import { skillLevelLabel, type SkillReport } from "../game/skills";
import { ROADMAP_URL } from "../content/curriculum";
import { recapOf, type DevOpsModule } from "../content/types";
import type { MissionScore } from "../game/scoring";
import { formatGrade, GENERAL_EXAM_MIN_MODULES } from "../game/exam";
import type { ExamRecord, ModuleRecord } from "../game/progress";
import { describeSolution } from "./challengePanel";
import { lessonCard } from "./lessonPanel";
import { button, element, richText } from "./dom";

export interface CampaignEntry {
  module: DevOpsModule;
  unlocked: boolean;
  record: ModuleRecord | undefined;
  /** Une partie sauvegardée en cours existe pour ce module. */
  inProgress: boolean;
  examRecord: ExamRecord | undefined;
}

export interface CampaignMapActions {
  onPlay(module: DevOpsModule): void;
  onResume(module: DevOpsModule): void;
  onDossier(module: DevOpsModule): void;
  onExam(module: DevOpsModule): void;
  onGeneralExam(): void;
  onSkills(): void;
  onBack(): void;
}

/** Avancement de la campagne, résumé dans le « dossier de mission » de l'accueil. */
export interface CampaignSummary {
  completed: number;
  total: number;
  /** Prochain secteur à libérer (le premier débloqué et pas encore réussi), ou null si tout est libéré. */
  next: { codename: string; title: string; section: string } | null;
}

export interface TitleScreenOptions {
  hasProgress: boolean;
  campaign: CampaignSummary;
  resume: { label: string; detail: string; onResume(): void } | null;
  onCampaign(): void;
  /** Ouvre le créateur d'agent (apparence façon Sims). */
  onCustomize(): void;
  onSaveManager(): void;
  onSkills(): void;
  onReset(): void;
  qualityLabel: string;
  /** Passe à la qualité suivante et renvoie le nouveau libellé du bouton. */
  onCycleQuality(): string;
  soundLabel: string;
  /** Active ou coupe le son et renvoie le nouveau libellé du bouton. */
  onToggleSound(): string;
}

export interface PauseScreenOptions {
  persistent: boolean;
  qualityLabel: string;
  onCycleQuality(): string;
  soundLabel: string;
  onToggleSound(): string;
  onResume(): void;
  onQuit(): void;
  /** Absent si le plein écran n'a pas de sens (ordinateur, navigateur sans plein écran). Renvoie le libellé suivant. */
  fullscreen: { label: string; onToggle(): Promise<string> } | null;
}

export interface SaveManagerOptions {
  persistent: boolean;
  savedAt: string | null;
  summary: string;
  code: string;
  /** Renvoie un message d'erreur, ou null si l'import a réussi. */
  onImport(code: string): string | null;
  onImported(): void;
  onBack(): void;
}

export interface DebriefData {
  module: DevOpsModule;
  score: MissionScore;
  wrongAttemptsPerTerminal: number[];
  detections: number;
  neutralizations: number;
  intelCollected: number;
  intelTotal: number;
  elapsedSeconds: number;
  isLastModule: boolean;
  bossName: string;
}

const CONTROLS: [string, string][] = [
  ["ZQSD / WASD / flèches", "Se déplacer"],
  ["Clic droit (maintenu)", "Viser : laser, tir précis, déplacement lent"],
  ["Clic gauche / Espace", "Tirer là où pointe la souris — tu peux rater ! Une balle qui touche suspend la sentinelle 10 s"],
  ["R", "Recharger (chargeur de 8 balles)"],
  ["F", "Terminer la cible touchée avec une vraie commande (kill, docker, kubectl, pare-feu)"],
  ["E", "Pirater un terminal, ou neutraliser une sentinelle approchée par derrière"],
  ["Maj (maintenu)", "Courir — rapide mais bruyant, et le tir devient imprécis"],
  ["C", "S'accroupir — moins visible, tir plus précis"],
  ["N", "Vision nocturne"],
  ["Échap", "Pause"],
];

const TOUCH_CONTROLS: [string, string][] = [
  ["Joystick (pouce gauche)", "Se déplacer — il apparaît là où tu poses le pouce"],
  ["Pouce au-delà de l'anneau", "Courir — rapide mais bruyant"],
  ["Tirer (pouce droit)", "Glisse pour viser (laser), relâche pour tirer. Une simple tape tire droit devant"],
  ["Gadget", "S'allume quand une cible est touchée : termine-la avec une vraie commande"],
  ["Pirater / Neutraliser", "S'allume près d'un terminal ou dans le dos d'une sentinelle"],
  ["Accroupir", "Moins visible, tir plus précis"],
  ["Vision", "Vision nocturne"],
  ["❚❚", "Pause"],
];

/** Les deux listes sont rendues ; le CSS affiche celle du mode d'entrée actif (classe body.touch). */
function controlsList(): HTMLElement[] {
  const toList = (entries: [string, string][], className: string): HTMLElement =>
    element("dl", { className: `controls ${className}` }, entries.flatMap(([key, action]) => [element("dt", { text: key }), element("dd", { text: action })]));
  return [toList(CONTROLS, "keyboard-only"), toList(TOUCH_CONTROLS, "touch-only")];
}

export class ScreenManager {
  constructor(private readonly root: HTMLElement) {}

  hide(): void {
    this.root.hidden = true;
    this.root.replaceChildren();
  }

  showTitle(options: TitleScreenOptions): void {
    const resetButton = button("Réinitialiser la progression", () => {
      if (window.confirm("Effacer toute la progression de la campagne ? Pense à copier ton code de sauvegarde avant.")) options.onReset();
    }, "btn ghost small");
    resetButton.hidden = !options.hasProgress;
    const campaignButton = button(
      options.hasProgress ? "Carte des opérations" : "Commencer la campagne",
      options.onCampaign,
      options.resume ? "btn big" : "btn primary big",
    );
    const resumeButton = options.resume ? button(options.resume.label, options.resume.onResume, "btn primary big") : null;
    this.show(
      element("div", { className: "panel title-screen" }, [
        element("section", { className: "title-hero" }, [
          element("p", { className: "eyebrow", text: "Cellule Écho — dossier classifié" }),
          element("h1", { className: "logo", text: "SHADOW OPS" }),
          element("p", { className: "logo-sub", text: "DevOps Infiltration" }),
          element("p", {
            className: "lead",
            text: "ENTROPIA a pris le contrôle de l'infrastructure d'Helix Corp. Tu es Spectre, agent de la cellule Écho : traverse 16 secteurs, apprends le DevOps dans les dossiers, prouve-le sur les terminaux et neutralise les sentinelles avec de vraies commandes. Aucune connaissance requise.",
          }),
          element("div", { className: "title-actions" }, [resumeButton, campaignButton]),
          options.resume ? element("p", { className: "resume-detail", text: `Partie en cours · ${options.resume.detail}` }) : null,
          element("div", { className: "title-toolbar" }, [
            button("Personnaliser l'agent", options.onCustomize, "btn ghost small"),
            button("Mes compétences", options.onSkills, "btn ghost small"),
            // Retour au portail : le jeu n'est qu'un parcours parmi d'autres.
            button("Tous les parcours", () => window.location.assign(import.meta.env.BASE_URL), "btn ghost small"),
            button("Sauvegarde", options.onSaveManager, "btn ghost small"),
            qualityButton(options.qualityLabel, options.onCycleQuality),
            toggleButton(options.soundLabel, options.onToggleSound, "Ambiance sonore et effets du jeu."),
            resetButton,
          ]),
        ]),
        this.missionFile(options.campaign),
        this.roadmapCredit(),
      ]),
    );
    (resumeButton ?? campaignButton).focus({ preventScroll: true });
  }

  /** Encadré « dossier de mission » : où en est la campagne, quel secteur vient ensuite, et la boucle de jeu. */
  private missionFile(campaign: CampaignSummary): HTMLElement {
    const percent = campaign.total > 0 ? Math.round((campaign.completed / campaign.total) * 100) : 0;
    const fill = element("div", { className: "progress-fill" });
    fill.style.width = `${percent}%`;
    const next = campaign.next
      ? element("div", { className: "mission-next" }, [
          element("span", { className: "mission-label", text: campaign.completed === 0 ? "Premier secteur" : "Prochain secteur" }),
          element("strong", { text: campaign.next.codename }),
          element("span", { text: campaign.next.title }),
          element("span", { className: "mission-section", text: campaign.next.section }),
        ])
      : element("div", { className: "mission-next" }, [
          element("span", { className: "mission-label", text: "Campagne terminée" }),
          element("strong", { text: "Les 16 secteurs sont libérés" }),
          element("span", { text: "Rejoue un secteur pour viser trois étoiles, ou passe l'examen général." }),
        ]);
    const steps: [string, string, string][] = [
      ["01", "Apprendre", "Ramasse les dossiers : chaque notion expliquée simplement, avec un exemple."],
      ["02", "Prouver", "Pirate les terminaux en répondant ou en tapant la vraie commande."],
      ["03", "Neutraliser", "Touche une sentinelle au pistolet, puis termine-la avec kill, docker ou kubectl."],
    ];
    return element("aside", { className: "mission-file", attributes: { "aria-label": "Dossier de mission" } }, [
      element("p", { className: "mission-label", text: "Dossier de mission" }),
      element("div", { className: "mission-progress" }, [
        element("span", { className: "mission-count", text: `${campaign.completed}/${campaign.total}` }),
        element("span", { className: "mission-label", text: "secteurs libérés" }),
      ]),
      element("div", { className: "progress-track" }, [fill]),
      next,
      element(
        "ol",
        { className: "mission-steps" },
        steps.map(([number, title, text]) =>
          element("li", {}, [element("span", { className: "step-number", text: number }), element("div", {}, [element("strong", { text: title }), element("p", { text })])]),
        ),
      ),
    ]);
  }

  showSaveManager(options: SaveManagerOptions): void {
    const codeField = element("textarea", {
      className: "save-code",
      attributes: { readonly: "", rows: "4", spellcheck: "false", "aria-label": "Ton code de sauvegarde" },
    });
    codeField.value = options.code;
    const copyStatus = element("p", { className: "save-status", attributes: { role: "status", "aria-live": "polite" } });
    const copyButton = button("Copier le code", () => {
      void copyToClipboard(codeField).then((copied) => {
        copyStatus.textContent = copied
          ? "✔ Code copié. Colle-le dans le jeu sur ton autre appareil (menu Sauvegarde)."
          : "Copie automatique impossible : le code est sélectionné, copie-le manuellement (appui long ou Ctrl+C).";
      });
    }, "btn primary");

    const importField = element("textarea", {
      className: "save-code",
      attributes: { rows: "4", spellcheck: "false", placeholder: "Colle ici un code SHADOWOPS1…", "aria-label": "Code de sauvegarde à importer" },
    });
    const importStatus = element("p", { className: "save-status", attributes: { role: "status", "aria-live": "polite" } });
    const importButton = button("Importer ce code", () => {
      if (!window.confirm("Importer ce code remplacera toute ta progression actuelle sur cet appareil. Continuer ?")) return;
      const error = options.onImport(importField.value);
      if (error) {
        importStatus.textContent = `✖ ${error}`;
        importStatus.dataset.state = "error";
        return;
      }
      options.onImported();
    }, "btn");

    const backButton = button("← Menu", options.onBack, "btn ghost");
    this.show(
      element("div", { className: "panel save-manager" }, [
        element("p", { className: "eyebrow", text: "Sauvegarde" }),
        element("h1", { text: "Ta progression" }),
        element("p", { className: "lead", text: options.summary }),
        element("p", {
          className: options.persistent ? "save-status" : "save-status warn",
          text: options.persistent
            ? `Sauvegarde automatique activée${options.savedAt ? ` · dernière sauvegarde : ${formatDate(options.savedAt)}` : ""}. Elle a lieu à chaque terminal piraté, dossier ramassé, sentinelle neutralisée et à chaque pause.`
            : "Ton navigateur bloque le stockage (navigation privée ?) : la progression sera perdue en fermant la page. Utilise le code ci-dessous pour la garder.",
        }),
        element("h2", { text: "Changer d'appareil" }),
        element("p", { text: "La sauvegarde est enregistrée dans ce navigateur. Pour continuer sur un autre appareil (téléphone ↔ PC), copie ce code puis importe-le là-bas." }),
        codeField,
        element("div", { className: "row" }, [copyButton]),
        copyStatus,
        element("h2", { text: "Importer une sauvegarde" }),
        importField,
        element("div", { className: "row" }, [importButton]),
        importStatus,
        element("div", { className: "row" }, [backButton]),
      ]),
    );
    backButton.focus({ preventScroll: true });
  }

  /** Affiche un écran construit ailleurs (examen) dans le même calque que les autres écrans. */
  present(content: HTMLElement): void {
    this.show(content);
  }

  /**
   * Carte façon roadmap.sh : une colonne vertébrale verticale qui se colore avec la progression, chaque secteur
   * comme un nœud dessus, ses notions en pastilles d'un côté, son état et ses actions de l'autre (en alternance),
   * et l'examen général comme nœud final.
   */
  showCampaignMap(entries: CampaignEntry[], generalExamRecord: ExamRecord | undefined, actions: CampaignMapActions): void {
    const completedCount = entries.filter((entry) => entry.record).length;
    const progressPercent = Math.round((completedCount / entries.length) * 100);
    const progressFill = element("div", { className: "progress-fill" });
    progressFill.style.width = `${progressPercent}%`;

    const timeline = element("ol", { className: "timeline" });
    entries.forEach((entry, index) => timeline.append(this.timelineItem(entry, index, actions)));
    timeline.append(this.generalExamNode(completedCount, generalExamRecord, actions.onGeneralExam));

    this.show(
      element("div", { className: "panel campaign" }, [
        element("div", { className: "campaign-header" }, [
          element("div", {}, [element("p", { className: "eyebrow", text: "Carte des opérations" }), element("h1", { text: "Parcours DevOps" })]),
          element("div", { className: "row" }, [button("Mes compétences", actions.onSkills, "btn ghost small"), button("← Menu", actions.onBack, "btn ghost")]),
        ]),
        element("div", { className: "progress" }, [
          element("div", { className: "progress-track" }, [progressFill]),
          element("span", { text: `${completedCount}/${entries.length} secteurs libérés · ${progressPercent}%` }),
        ]),
        element("ul", { className: "timeline-legend", attributes: { "aria-label": "Légende" } }, [
          element("li", { className: "legend-completed", text: "Libéré" }),
          element("li", { className: "legend-available", text: "Disponible" }),
          element("li", { className: "legend-in-progress", text: "En cours" }),
          element("li", { className: "legend-locked", text: "Verrouillé" }),
        ]),
        timeline,
        this.roadmapCredit(),
      ]),
    );
    timeline.querySelector<HTMLButtonElement>(".campaign-card.in-progress .btn.primary, .campaign-card.available .btn.primary")?.focus({ preventScroll: false });
  }

  /** Bilan de compétences : ce qui est acquis, ce qu'il faut consolider, les notions à relire. */
  showSkills(report: SkillReport, onBack: () => void, onOpenCampaign: () => void): void {
    const stat = (value: string, label: string): HTMLElement =>
      element("div", { className: "skills-stat" }, [element("strong", { text: value }), element("span", { text: label })]);
    const grade = (value: number | null): string => (value === null ? "—" : formatGrade(value));
    const total = report.entries.length;

    const review =
      report.reviewList.length === 0
        ? element("p", { className: "skills-empty", text: report.completedCount === 0 ? "Termine un secteur : les notions à revoir apparaîtront ici." : "Rien à revoir : aucune faute lors de tes dernières missions." })
        : element(
            "ul",
            { className: "skills-review" },
            report.reviewList.map((notion) =>
              element("li", {}, [
                element("p", { className: "skills-review-title" }, [element("strong", { text: notion.title }), element("span", { className: "tag", text: notion.codename })]),
                richText("p", notion.keyPoint, "skills-review-point"),
              ]),
            ),
          );

    const rows = report.entries.map((entry) => {
      const examText = entry.examGrade === null ? null : `Examen ${formatGrade(entry.examGrade)}`;
      return element("li", { className: `skills-row level-${entry.level}` }, [
        element("div", { className: "skills-row-head" }, [
          element("div", {}, [element("p", { className: "skills-row-title", text: entry.codename }), element("p", { className: "skills-row-section", text: entry.roadmapSection })]),
          element("div", { className: "skills-row-status" }, [element("span", { className: `skills-badge level-${entry.level}`, text: skillLevelLabel(entry.level) }), entry.stars > 0 ? starPips(entry.stars) : null, examText ? element("span", { className: "skills-row-meta", text: examText }) : null]),
        ]),
        element("ul", { className: "chips" }, entry.topics.map((topic) => element("li", { text: topic }))),
      ]);
    });

    const backButton = button("← Retour", onBack, "btn ghost");
    this.show(
      element("div", { className: "panel skills" }, [
        element("div", { className: "campaign-header" }, [
          element("div", {}, [element("p", { className: "eyebrow", text: "Bilan" }), element("h1", { text: "Mes compétences" })]),
          backButton,
        ]),
        element("div", { className: "skills-stats" }, [
          stat(`${report.completedCount}/${total}`, "secteurs terminés"),
          stat(`${report.masteredCount}`, "maîtrisés"),
          stat(grade(report.averageExamGrade), "moyenne aux examens"),
          stat(grade(report.generalExamGrade), "examen général"),
        ]),
        element("h2", { text: "À revoir" }),
        review,
        element("h2", { text: "Par secteur" }),
        element("p", { className: "skills-legend", text: "Maîtrisé : sans faute et examen réussi. Acquis : sans faute. À consolider : des défis ratés ou un score minimal." }),
        element("ul", { className: "skills-list" }, rows),
        element("div", { className: "row" }, [button("Carte des opérations", onOpenCampaign, "btn primary")]),
        this.roadmapCredit(),
      ]),
    );
    backButton.focus({ preventScroll: true });
  }

  /** `addTip` : l'appelant ajoute un encart au briefing (conseil d'orientation sur mobile) dans le conteneur donné. */
  showBriefing(module: DevOpsModule, moduleNumber: number, warning: string | null, onLaunch: () => void, onBack: () => void, addTip?: (container: HTMLElement) => void): void {
    const launchButton = button("Lancer l'infiltration", onLaunch, "btn primary big");
    const tipContainer = element("div", { className: "briefing-tip" });
    addTip?.(tipContainer);
    this.show(
      element("div", { className: "panel briefing" }, [
        element("p", { className: "eyebrow", text: `Module ${moduleNumber} · ${module.roadmapSection}` }),
        element("h1", { text: module.codename }),
        element("h2", { className: "subtitle", text: module.title }),
        element("p", { className: "lead", text: module.briefing }),
        element("h3", { text: "Notions de la roadmap couvertes" }),
        element("ul", { className: "chips" }, module.roadmapTopics.map((topic) => element("li", { text: topic }))),
        element("h3", { text: "Commandes" }),
        ...controlsList(),
        element("p", {
          className: "tip",
          text: "Astuce : les dossiers jaunes contiennent les leçons. Les racks bloquent la vue et les balles des sentinelles : observe leurs rondes avant de bouger. Si elles te voient, elles tirent.",
        }),
        warning ? element("p", { className: "save-status warn", text: warning }) : null,
        tipContainer,
        element("div", { className: "row" }, [launchButton, button("Retour", onBack, "btn ghost")]),
      ]),
    );
    launchButton.focus({ preventScroll: true });
  }

  showDebrief(data: DebriefData, onNext: () => void, onReplay: () => void, onMap: () => void): void {
    const { module, score } = data;
    const nextButton = button(data.isLastModule ? "Retour à la carte" : "Mission suivante →", data.isLastModule ? onMap : onNext, "btn primary big");
    this.show(
      element("div", { className: "panel debrief" }, [
        element("p", { className: "eyebrow", text: "Débriefing de mission" }),
        element("h1", { text: `${module.codename} — réussie` }),
        data.isLastModule
          ? element("p", { className: "lead victory", text: "ENTROPIA est neutralisée. Tu as parcouru toute la roadmap DevOps : il est temps de pratiquer sur de vrais projets !" })
          : null,
        element("div", { className: "stats" }, [
          this.stat("Évaluation", "★".repeat(score.stars) + "☆".repeat(3 - score.stars)),
          this.stat("Score", `${score.score} / ${score.maxScore}`),
          this.stat("Précision 1er essai", `${Math.round(score.firstTryAccuracy * 100)} %`),
          this.stat("Dossiers", `${data.intelCollected}/${data.intelTotal}`),
          this.stat("Détections", score.ghost ? "0 — Fantôme" : String(data.detections)),
          this.stat("Neutralisations", String(data.neutralizations)),
          this.stat("Boss vaincu", data.bossName),
          this.stat("Durée", formatDuration(data.elapsedSeconds)),
        ]),
        ...this.recapSections(module, data.wrongAttemptsPerTerminal, false),
        element("div", { className: "row" }, [nextButton, button("Rejouer", onReplay, "btn"), button("Carte", onMap, "btn ghost")]),
      ]),
    );
    nextButton.focus({ preventScroll: true });
  }

  showDossier(module: DevOpsModule, onBack: () => void): void {
    const backButton = button("← Retour à la carte", onBack, "btn primary");
    this.show(
      element("div", { className: "panel debrief" }, [
        element("p", { className: "eyebrow", text: `Dossier · ${module.roadmapSection}` }),
        element("h1", { text: module.title }),
        ...this.recapSections(module, null, true),
        element("div", { className: "row" }, [backButton]),
      ]),
    );
    backButton.focus({ preventScroll: true });
  }

  showPause(options: PauseScreenOptions): void {
    const { persistent } = options;
    const resumeButton = button("Reprendre", options.onResume, "btn primary");
    this.show(
      element("div", { className: "panel small" }, [
        element("h1", { text: "Pause" }),
        element("p", {
          className: persistent ? "save-status" : "save-status warn",
          text: persistent
            ? "Progression sauvegardée. Tu peux quitter et reprendre plus tard depuis l'écran titre."
            : "Stockage bloqué par le navigateur : la progression sera perdue en fermant la page.",
        }),
        ...controlsList(),
        element("div", { className: "row" }, [
          resumeButton,
          ...(options.fullscreen ? [fullscreenButton(options.fullscreen)] : []),
          qualityButton(options.qualityLabel, options.onCycleQuality),
          toggleButton(options.soundLabel, options.onToggleSound, "Ambiance sonore et effets du jeu."),
          button("Quitter la mission", options.onQuit, "btn ghost"),
        ]),
      ]),
    );
    resumeButton.focus({ preventScroll: true });
  }

  showPlayerDown(livesLeft: number, onContinue: () => void): void {
    const continueButton = button("Reprendre l'infiltration", onContinue, "btn primary");
    this.show(
      element("div", { className: "panel small alert" }, [
        element("h1", { text: "À TERRE" }),
        element("p", { text: `Spectre a été abattu. Retour au point d'insertion. Vies restantes : ${livesLeft}. Les terminaux piratés et les sentinelles terminées restent acquis.` }),
        element("p", {
          className: "tip",
          text: "Les racks arrêtent les balles : mets-toi à couvert, vise (clic droit ou pad de tir) et touche les sentinelles pour les suspendre. Quelques secondes à l'abri et ta santé remonte.",
        }),
        element("div", { className: "row" }, [continueButton]),
      ]),
    );
    continueButton.focus({ preventScroll: true });
  }

  showFailed(onRetry: () => void, onMap: () => void): void {
    const retryButton = button("Réessayer", onRetry, "btn primary");
    this.show(
      element("div", { className: "panel small alert" }, [
        element("h1", { text: "Mission compromise" }),
        element("p", { text: "Spectre est tombé trop souvent. La cellule Écho t'exfiltre." }),
        element("p", { className: "tip", text: "Les rondes sont toujours identiques pour un même secteur : observe-les et planifie ton chemin." }),
        element("div", { className: "row" }, [retryButton, button("Carte", onMap, "btn ghost")]),
      ]),
    );
    retryButton.focus({ preventScroll: true });
  }

  private show(content: HTMLElement): void {
    this.root.replaceChildren(content);
    this.root.hidden = false;
    this.root.scrollTop = 0;
  }

  /** L'examen général se débloque dès que deux secteurs sont libérés : avant, il doublerait l'examen du module. */
  /** Nœud final de la timeline : l'examen général, ouvert après quelques secteurs libérés. */
  private generalExamNode(completedCount: number, record: ExamRecord | undefined, onGeneralExam: () => void): HTMLLIElement {
    const available = completedCount >= GENERAL_EXAM_MIN_MODULES;
    const examButton = button("Examen général", onGeneralExam, available ? "btn primary" : "btn ghost");
    examButton.disabled = !available;
    const detail = !available
      ? `Disponible après ${GENERAL_EXAM_MIN_MODULES} secteurs libérés : des questions mélangées de tous tes modules, chronométrées.`
      : record
        ? `Meilleure note : ${formatGrade(record.bestGrade)} · ${record.attempts} tentative${record.attempts > 1 ? "s" : ""}`
        : "Des questions mélangées de tous les secteurs libérés, chronométrées et notées sur 20.";
    const status = record ? "completed" : available ? "available" : "locked";
    return element("li", { className: `timeline-item timeline-final ${status}` }, [
      element("div", { className: "timeline-node" }, [element("span", { className: "node-section", text: "Validation finale" }), element("strong", { text: "Examen général" })]),
      element("div", { className: "campaign-card final-card" }, [element("p", { className: "card-detail", text: detail }), element("div", { className: "card-actions" }, [examButton])]),
    ]);
  }

  /** Un secteur de la timeline : nœud sur la colonne, notions d'un côté, état et actions de l'autre. */
  private timelineItem(entry: CampaignEntry, index: number, handlers: CampaignMapActions): HTMLLIElement {
    const { module, unlocked, record, inProgress, examRecord } = entry;
    const status = inProgress ? "in-progress" : record ? "completed" : unlocked ? "available" : "locked";
    const actions = element("div", { className: "card-actions" });
    if (inProgress) actions.append(button("Reprendre", () => handlers.onResume(module), "btn primary"));
    if (unlocked) actions.append(button(record ? "Rejouer" : inProgress ? "Recommencer" : "Infiltrer", () => handlers.onPlay(module), inProgress ? "btn ghost" : "btn primary"));
    if (record) actions.append(button("Dossier", () => handlers.onDossier(module), "btn ghost"));
    // L'examen d'un module n'est proposé qu'une fois le module joué : on ne note pas ce qu'on n'a pas appris.
    if (record) actions.append(button("Examen", () => handlers.onExam(module), "btn ghost"));
    const statusLabel = inProgress ? "En cours" : record ? "Libéré" : unlocked ? "Disponible" : "Verrouillé";
    const tags = element("div", { className: "card-tags" }, [
      element("span", { className: "card-status", text: statusLabel }),
      record ? starPips(record.stars) : null,
      record?.ghost ? element("span", { className: "tag", text: "Fantôme" }) : null,
      examRecord ? element("span", { className: "card-exam", text: `Examen ${formatGrade(examRecord.bestGrade)}` }) : null,
    ]);
    const side = index % 2 === 0 ? "left" : "right";
    return element("li", { className: `timeline-item ${status} topics-${side}` }, [
      element("ul", { className: "timeline-topics", attributes: { "aria-label": "Notions de la roadmap" } }, module.roadmapTopics.map((topic) => element("li", { text: topic }))),
      element("div", { className: "timeline-node" }, [
        element("span", { className: "node-index", text: `Secteur ${String(index).padStart(2, "0")}` }),
        element("strong", { text: module.title }),
        element("span", { className: "node-section", text: module.roadmapSection }),
      ]),
      element("div", { className: `campaign-card ${status}` }, [element("p", { className: "card-codename", text: module.codename }), tags, actions]),
    ]);
  }

  /** Récapitulatif + cours + revue de chaque terminal : le cœur pédagogique de fin de module. */
  private recapSections(module: DevOpsModule, wrongAttemptsPerTerminal: number[] | null, lessonsOpen: boolean): HTMLElement[] {
    const review = element("ol", { className: "review" });
    module.challenges.forEach((challenge, index) => {
      const hadErrors = (wrongAttemptsPerTerminal?.[index] ?? 0) > 0;
      review.append(
        element("li", { className: hadErrors ? "review-item to-review" : "review-item" }, [
          richText("p", challenge.prompt, "review-prompt"),
          element("p", { className: "review-answer" }, [element("strong", { text: "Réponse : " }), richText("span", describeSolution(challenge))]),
          richText("p", challenge.explanation, "review-explanation"),
          hadErrors ? element("span", { className: "tag warn", text: "À revoir" }) : null,
        ]),
      );
    });
    // Chaque dossier est dépliable : on relit le cours sans noyer le récapitulatif.
    const lessons = module.lessons.map((lesson, index) => {
      const details = element("details", { className: "lesson-details" }, [
        element("summary", { text: `Dossier ${index + 1} — ${lesson.title}` }),
        lessonCard(lesson),
      ]);
      details.open = lessonsOpen && index === 0;
      return details;
    });
    return [
      element("h2", { text: "Récapitulatif — à retenir" }),
      element("ul", { className: "recap" }, recapOf(module).map((point) => richText("li", point))),
      element("h2", { text: "Les dossiers du module" }),
      element("div", { className: "lesson-list" }, lessons),
      element("h2", { text: "Revue des terminaux" }),
      review,
    ];
  }

  private stat(label: string, value: string): HTMLElement {
    return element("div", { className: "stat" }, [element("span", { className: "stat-value", text: value }), element("span", { className: "stat-label", text: label })]);
  }

  private roadmapCredit(): HTMLElement {
    return element("p", { className: "credit" }, [
      document.createTextNode("Parcours basé sur la roadmap "),
      element("a", { text: "roadmap.sh/devops", attributes: { href: ROADMAP_URL, target: "_blank", rel: "noopener noreferrer" } }),
    ]);
  }
}

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes} min ${String(seconds).padStart(2, "0")} s`;
}

function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return "inconnue";
  return date.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

/** API presse-papiers si disponible (contexte sécurisé), sinon sélection du texte pour copie manuelle. */
async function copyToClipboard(field: HTMLTextAreaElement): Promise<boolean> {
  try {
    if (!navigator.clipboard) throw new Error("API presse-papiers indisponible");
    await navigator.clipboard.writeText(field.value);
    return true;
  } catch (error) {
    console.warn("Copie automatique impossible, sélection manuelle proposée.", error);
    field.focus();
    field.select();
    return false;
  }
}

/** Étoiles du record (0 à 3) en pastilles dessinées en CSS, lisibles par les lecteurs d'écran. */
function starPips(stars: number): HTMLElement {
  const pips = [0, 1, 2].map((index) => element("span", { className: index < stars ? "pip on" : "pip", attributes: { "aria-hidden": "true" } }));
  return element("span", { className: "pips", attributes: { role: "img", "aria-label": `${stars} étoile${stars > 1 ? "s" : ""} sur 3` } }, pips);
}

function qualityButton(label: string, onCycle: () => string): HTMLButtonElement {
  return toggleButton(label, onCycle, "Haute : ombres et effets lumineux. Basse : le plus fluide sur les appareils modestes.");
}

/** Le plein écran est asynchrone : le libellé change une fois la réponse du navigateur connue, pas avant. */
function fullscreenButton(options: { label: string; onToggle(): Promise<string> }): HTMLButtonElement {
  const node = button(options.label, () => {
    void options.onToggle().then((label) => {
      node.textContent = label;
    });
  }, "btn small");
  return node;
}

/** Bouton de réglage dont le libellé reflète la valeur courante (renvoyée par le callback). */
function toggleButton(label: string, onToggle: () => string, title: string): HTMLButtonElement {
  const node = button(label, () => {
    node.textContent = onToggle();
  }, "btn ghost small");
  node.title = title;
  return node;
}
