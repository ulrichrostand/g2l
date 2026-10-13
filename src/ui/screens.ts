import { skillLevelLabel, type SkillReport } from "../game/skills";
import { ROADMAP_URL } from "../content/curriculum";
import { recapOf, type DevOpsModule } from "../content/types";
import type { MissionScore } from "../game/scoring";
import { formatGrade, GENERAL_EXAM_MIN_MODULES } from "../game/exam";
import type { ExamRecord, ModuleRecord } from "../game/progress";
import { describeSolution } from "./challengePanel";
import { lessonCard } from "./lessonPanel";
import { createLanguageSwitch } from "../i18n/switcher";
import { createSettingsMenu, languageRow } from "./settingsMenu";
import { LANG, LOCALE, isSingular } from "../i18n/lang";
import { portalPath } from "../i18n/routes";
import { t } from "../i18n/messages/screens";
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
  brightnessLabel: string;
  /** Passe à la luminosité suivante et renvoie le nouveau libellé du bouton. */
  onCycleBrightness(): string;
  soundLabel: string;
  /** Active ou coupe le son et renvoie le nouveau libellé du bouton. */
  onToggleSound(): string;
}

export interface PauseScreenOptions {
  persistent: boolean;
  qualityLabel: string;
  onCycleQuality(): string;
  brightnessLabel: string;
  /** Passe à la luminosité suivante et renvoie le nouveau libellé du bouton. */
  onCycleBrightness(): string;
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

const controls = (): [string, string][] => [
  [t("keyMove"), t("actionMove")],
  [t("keyAim"), t("actionAim")],
  [t("keyShoot"), t("actionShoot")],
  [t("keyReload"), t("actionReload")],
  [t("keyGadget"), t("actionGadget")],
  [t("keyInteract"), t("actionInteract")],
  [t("keyRun"), t("actionRun")],
  [t("keyCrouch"), t("actionCrouch")],
  [t("keyNight"), t("actionNight")],
  [t("keyPause"), t("actionPause")],
];

const touchControls = (): [string, string][] => [
  [t("touchJoystick"), t("touchJoystickAction")],
  [t("touchRun"), t("touchRunAction")],
  [t("touchFire"), t("touchFireAction")],
  [t("touchGadget"), t("touchGadgetAction")],
  [t("touchHack"), t("touchHackAction")],
  [t("touchCrouch"), t("touchCrouchAction")],
  [t("touchVision"), t("touchVisionAction")],
  [t("touchPause"), t("touchPauseAction")],
];

/** Les deux listes sont rendues ; le CSS affiche celle du mode d'entrée actif (classe body.touch). */
function controlsList(): HTMLElement[] {
  const toList = (entries: [string, string][], className: string): HTMLElement =>
    element("dl", { className: `controls ${className}` }, entries.flatMap(([key, action]) => [element("dt", { text: key }), element("dd", { text: action })]));
  return [toList(controls(), "keyboard-only"), toList(touchControls(), "touch-only")];
}

export class ScreenManager {
  constructor(private readonly root: HTMLElement) {}

  hide(): void {
    this.root.hidden = true;
    this.root.replaceChildren();
  }

  showTitle(options: TitleScreenOptions): void {
    const resetButton = button(t("resetProgress"), () => {
      if (window.confirm(t("confirmReset"))) options.onReset();
    }, "btn ghost small");
    resetButton.hidden = !options.hasProgress;
    const switcher = createLanguageSwitch(window.location.pathname, import.meta.env.BASE_URL);
    const campaignButton = button(
      options.hasProgress ? t("operationsMap") : t("startCampaign"),
      options.onCampaign,
      options.resume ? "btn big" : "btn primary big",
    );
    const resumeButton = options.resume ? button(options.resume.label, options.resume.onResume, "btn primary big") : null;
    this.show(
      element("div", { className: "panel title-screen" }, [
        element("section", { className: "title-hero" }, [
          element("p", { className: "eyebrow", text: t("titleEyebrow") }),
          element("h1", { className: "logo", text: "SHADOW OPS" }),
          element("p", { className: "logo-sub", text: "DevOps Infiltration" }),
          element("p", {
            className: "lead",
            text: t("titleLead"),
          }),
          element("div", { className: "title-actions" }, [resumeButton, campaignButton]),
          options.resume ? element("p", { className: "resume-detail", text: t("gameInProgress", { detail: options.resume.detail }) }) : null,
          element("div", { className: "title-toolbar" }, [
            button(t("customizeAgent"), options.onCustomize, "btn ghost small"),
            button(t("mySkills"), options.onSkills, "btn ghost small"),
            // Retour au portail : le jeu n'est qu'un parcours parmi d'autres.
            button(t("allGames"), () => window.location.assign(portalPath(LANG, import.meta.env.BASE_URL)), "btn ghost small"),
            button(t("saveMenu"), options.onSaveManager, "btn ghost small"),
            createSettingsMenu([
              ...(switcher ? [languageRow(switcher)] : []),
              qualityButton(options.qualityLabel, options.onCycleQuality),
              brightnessButton(options.brightnessLabel, options.onCycleBrightness),
              toggleButton(options.soundLabel, options.onToggleSound, t("soundTitle")),
              resetButton,
            ]),
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
          element("span", { className: "mission-label", text: campaign.completed === 0 ? t("firstSector") : t("nextSector") }),
          element("strong", { text: campaign.next.codename }),
          element("span", { text: campaign.next.title }),
          element("span", { className: "mission-section", text: campaign.next.section }),
        ])
      : element("div", { className: "mission-next" }, [
          element("span", { className: "mission-label", text: t("campaignDone") }),
          element("strong", { text: t("allSectorsFreed") }),
          element("span", { text: t("replayHint") }),
        ]);
    const steps: [string, string, string][] = [
      ["01", t("stepLearn"), t("stepLearnText")],
      ["02", t("stepProve"), t("stepProveText")],
      ["03", t("stepTakeDown"), t("stepTakeDownText")],
    ];
    return element("aside", { className: "mission-file", attributes: { "aria-label": t("missionFile") } }, [
      element("p", { className: "mission-label", text: t("missionFile") }),
      element("div", { className: "mission-progress" }, [
        element("span", { className: "mission-count", text: `${campaign.completed}/${campaign.total}` }),
        element("span", { className: "mission-label", text: t("sectorsFreed") }),
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
      attributes: { readonly: "", rows: "4", spellcheck: "false", "aria-label": t("saveCodeLabel") },
    });
    codeField.value = options.code;
    const copyStatus = element("p", { className: "save-status", attributes: { role: "status", "aria-live": "polite" } });
    const copyButton = button(t("copyCode"), () => {
      void copyToClipboard(codeField).then((copied) => {
        copyStatus.textContent = copied
          ? t("codeCopied")
          : t("copyFailed");
      });
    }, "btn primary");

    const importField = element("textarea", {
      className: "save-code",
      attributes: { rows: "4", spellcheck: "false", placeholder: t("importPlaceholder"), "aria-label": t("importCodeLabel") },
    });
    const importStatus = element("p", { className: "save-status", attributes: { role: "status", "aria-live": "polite" } });
    const importButton = button(t("importCode"), () => {
      if (!window.confirm(t("confirmImport"))) return;
      const error = options.onImport(importField.value);
      if (error) {
        importStatus.textContent = t("importError", { error });
        importStatus.dataset.state = "error";
        return;
      }
      options.onImported();
    }, "btn");

    const backButton = button(t("backToMenu"), options.onBack, "btn ghost");
    this.show(
      element("div", { className: "panel save-manager" }, [
        element("p", { className: "eyebrow", text: t("saveEyebrow") }),
        element("h1", { text: t("yourProgress") }),
        element("p", { className: "lead", text: options.summary }),
        element("p", {
          className: options.persistent ? "save-status" : "save-status warn",
          text: options.persistent
            ? options.savedAt
              ? t("autosaveOnDated", { date: formatDate(options.savedAt) })
              : t("autosaveOn")
            : t("storageBlocked"),
        }),
        element("h2", { text: t("changeDevice") }),
        element("p", { text: t("changeDeviceText") }),
        codeField,
        element("div", { className: "row" }, [copyButton]),
        copyStatus,
        element("h2", { text: t("importSave") }),
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
          element("div", {}, [element("p", { className: "eyebrow", text: t("operationsMap") }), element("h1", { text: t("pageTitleDevOps") })]),
          element("div", { className: "row" }, [button(t("mySkills"), actions.onSkills, "btn ghost small"), button(t("backToMenu"), actions.onBack, "btn ghost")]),
        ]),
        element("div", { className: "progress" }, [
          element("div", { className: "progress-track" }, [progressFill]),
          element("span", { text: t("progressSummary", { completed: completedCount, total: entries.length, percent: progressPercent }) }),
        ]),
        element("ul", { className: "timeline-legend", attributes: { "aria-label": t("legend") } }, [
          element("li", { className: "legend-completed", text: t("legendCompleted") }),
          element("li", { className: "legend-available", text: t("legendAvailable") }),
          element("li", { className: "legend-in-progress", text: t("legendInProgress") }),
          element("li", { className: "legend-locked", text: t("legendLocked") }),
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
        ? element("p", { className: "skills-empty", text: report.completedCount === 0 ? t("reviewEmptyNoProgress") : t("reviewEmptyAllGood") })
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
      const examText = entry.examGrade === null ? null : t("examGradeText", { grade: formatGrade(entry.examGrade) });
      return element("li", { className: `skills-row level-${entry.level}` }, [
        element("div", { className: "skills-row-head" }, [
          element("div", {}, [element("p", { className: "skills-row-title", text: entry.codename }), element("p", { className: "skills-row-section", text: entry.roadmapSection })]),
          element("div", { className: "skills-row-status" }, [element("span", { className: `skills-badge level-${entry.level}`, text: skillLevelLabel(entry.level) }), entry.stars > 0 ? starPips(entry.stars) : null, examText ? element("span", { className: "skills-row-meta", text: examText }) : null]),
        ]),
        element("ul", { className: "chips" }, entry.topics.map((topic) => element("li", { text: topic }))),
      ]);
    });

    const backButton = button(t("back"), onBack, "btn ghost");
    this.show(
      element("div", { className: "panel skills" }, [
        element("div", { className: "campaign-header" }, [
          element("div", {}, [element("p", { className: "eyebrow", text: t("skillsEyebrow") }), element("h1", { text: t("mySkills") })]),
          backButton,
        ]),
        element("div", { className: "skills-stats" }, [
          stat(`${report.completedCount}/${total}`, t("statSectorsDone")),
          stat(`${report.masteredCount}`, t("statMastered")),
          stat(grade(report.averageExamGrade), t("statAverageExam")),
          stat(grade(report.generalExamGrade), t("statGeneralExam")),
        ]),
        element("h2", { text: t("toReview") }),
        review,
        element("h2", { text: t("bySector") }),
        element("p", { className: "skills-legend", text: t("skillsLegend") }),
        element("ul", { className: "skills-list" }, rows),
        element("div", { className: "row" }, [button(t("operationsMap"), onOpenCampaign, "btn primary")]),
        this.roadmapCredit(),
      ]),
    );
    backButton.focus({ preventScroll: true });
  }

  /** `addTip` : l'appelant ajoute un encart au briefing (conseil d'orientation sur mobile) dans le conteneur donné. */
  showBriefing(module: DevOpsModule, moduleNumber: number, warning: string | null, onLaunch: () => void, onBack: () => void, addTip?: (container: HTMLElement) => void): void {
    const launchButton = button(t("launchInfiltration"), onLaunch, "btn primary big");
    const tipContainer = element("div", { className: "briefing-tip" });
    addTip?.(tipContainer);
    this.show(
      element("div", { className: "panel briefing" }, [
        element("p", { className: "eyebrow", text: t("briefingEyebrow", { number: moduleNumber, section: module.roadmapSection }) }),
        element("h1", { text: module.codename }),
        element("h2", { className: "subtitle", text: module.title }),
        element("p", { className: "lead", text: module.briefing }),
        element("h3", { text: t("roadmapTopicsCovered") }),
        element("ul", { className: "chips" }, module.roadmapTopics.map((topic) => element("li", { text: topic }))),
        element("h3", { text: t("commands") }),
        ...controlsList(),
        element("p", {
          className: "tip",
          text: t("briefingTip"),
        }),
        warning ? element("p", { className: "save-status warn", text: warning }) : null,
        tipContainer,
        element("div", { className: "row" }, [launchButton, button(t("backShort"), onBack, "btn ghost")]),
      ]),
    );
    launchButton.focus({ preventScroll: true });
  }

  showDebrief(data: DebriefData, onNext: () => void, onReplay: () => void, onMap: () => void): void {
    const { module, score } = data;
    const nextButton = button(data.isLastModule ? t("backToMap") : t("nextMission"), data.isLastModule ? onMap : onNext, "btn primary big");
    this.show(
      element("div", { className: "panel debrief" }, [
        element("p", { className: "eyebrow", text: t("debriefEyebrow") }),
        element("h1", { text: t("missionComplete", { codename: module.codename }) }),
        data.isLastModule
          ? element("p", { className: "lead victory", text: t("victory") })
          : null,
        element("div", { className: "stats" }, [
          this.stat(t("statRating"), "★".repeat(score.stars) + "☆".repeat(3 - score.stars)),
          this.stat(t("statScore"), `${score.score} / ${score.maxScore}`),
          this.stat(t("statFirstTry"), t("percentValue", { percent: Math.round(score.firstTryAccuracy * 100) })),
          this.stat(t("statIntel"), `${data.intelCollected}/${data.intelTotal}`),
          this.stat(t("statDetections"), score.ghost ? t("statGhost") : String(data.detections)),
          this.stat(t("statTakedowns"), String(data.neutralizations)),
          this.stat(t("statBoss"), data.bossName),
          this.stat(t("statDuration"), formatDuration(data.elapsedSeconds)),
        ]),
        ...this.recapSections(module, data.wrongAttemptsPerTerminal, false),
        element("div", { className: "row" }, [nextButton, button(t("replay"), onReplay, "btn"), button(t("mapShort"), onMap, "btn ghost")]),
      ]),
    );
    nextButton.focus({ preventScroll: true });
  }

  showDossier(module: DevOpsModule, onBack: () => void): void {
    const backButton = button(t("backToMapArrow"), onBack, "btn primary");
    this.show(
      element("div", { className: "panel debrief" }, [
        element("p", { className: "eyebrow", text: t("dossierEyebrow", { section: module.roadmapSection }) }),
        element("h1", { text: module.title }),
        ...this.recapSections(module, null, true),
        element("div", { className: "row" }, [backButton]),
      ]),
    );
    backButton.focus({ preventScroll: true });
  }

  showPause(options: PauseScreenOptions): void {
    const { persistent } = options;
    const resumeButton = button(t("resume"), options.onResume, "btn primary");
    this.show(
      element("div", { className: "panel small" }, [
        element("h1", { text: t("pause") }),
        element("p", {
          className: persistent ? "save-status" : "save-status warn",
          text: persistent
            ? t("pauseSaved")
            : t("pauseStorageBlocked"),
        }),
        ...controlsList(),
        element("div", { className: "row" }, [
          resumeButton,
          ...(options.fullscreen ? [fullscreenButton(options.fullscreen)] : []),
          button(t("quitMission"), options.onQuit, "btn ghost"),
          createSettingsMenu([
            qualityButton(options.qualityLabel, options.onCycleQuality),
            brightnessButton(options.brightnessLabel, options.onCycleBrightness),
            toggleButton(options.soundLabel, options.onToggleSound, t("soundTitle")),
          ]),
        ]),
      ]),
    );
    resumeButton.focus({ preventScroll: true });
  }

  showPlayerDown(livesLeft: number, onContinue: () => void): void {
    const continueButton = button(t("resumeInfiltration"), onContinue, "btn primary");
    this.show(
      element("div", { className: "panel small alert" }, [
        element("h1", { text: t("playerDownTitle") }),
        element("p", { text: t("playerDownText", { lives: livesLeft }) }),
        element("p", {
          className: "tip",
          text: t("playerDownTip"),
        }),
        element("div", { className: "row" }, [continueButton]),
      ]),
    );
    continueButton.focus({ preventScroll: true });
  }

  showFailed(onRetry: () => void, onMap: () => void): void {
    const retryButton = button(t("retry"), onRetry, "btn primary");
    this.show(
      element("div", { className: "panel small alert" }, [
        element("h1", { text: t("failedTitle") }),
        element("p", { text: t("failedText") }),
        element("p", { className: "tip", text: t("failedTip") }),
        element("div", { className: "row" }, [retryButton, button(t("mapShort"), onMap, "btn ghost")]),
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
    const examButton = button(t("generalExam"), onGeneralExam, available ? "btn primary" : "btn ghost");
    examButton.disabled = !available;
    const detail = !available
      ? t("generalExamLocked", { count: GENERAL_EXAM_MIN_MODULES })
      : record
        ? t(isSingular(record.attempts) ? "bestGradeOne" : "bestGradeOther", { grade: formatGrade(record.bestGrade), attempts: record.attempts })
        : t("generalExamAvailable");
    const status = record ? "completed" : available ? "available" : "locked";
    return element("li", { className: `timeline-item timeline-final ${status}` }, [
      element("div", { className: "timeline-node" }, [element("span", { className: "node-section", text: t("finalValidation") }), element("strong", { text: t("generalExam") })]),
      element("div", { className: "campaign-card final-card" }, [element("p", { className: "card-detail", text: detail }), element("div", { className: "card-actions" }, [examButton])]),
    ]);
  }

  /** Un secteur de la timeline : nœud sur la colonne, notions d'un côté, état et actions de l'autre. */
  private timelineItem(entry: CampaignEntry, index: number, handlers: CampaignMapActions): HTMLLIElement {
    const { module, unlocked, record, inProgress, examRecord } = entry;
    const status = inProgress ? "in-progress" : record ? "completed" : unlocked ? "available" : "locked";
    const actions = element("div", { className: "card-actions" });
    if (inProgress) actions.append(button(t("resume"), () => handlers.onResume(module), "btn primary"));
    if (unlocked) actions.append(button(record ? t("replay") : inProgress ? t("restart") : t("play"), () => handlers.onPlay(module), inProgress ? "btn ghost" : "btn primary"));
    if (record) actions.append(button(t("dossier"), () => handlers.onDossier(module), "btn ghost"));
    // L'examen d'un module n'est proposé qu'une fois le module joué : on ne note pas ce qu'on n'a pas appris.
    if (record) actions.append(button(t("exam"), () => handlers.onExam(module), "btn ghost"));
    const statusLabel = inProgress ? t("legendInProgress") : record ? t("legendCompleted") : unlocked ? t("legendAvailable") : t("legendLocked");
    const tags = element("div", { className: "card-tags" }, [
      element("span", { className: "card-status", text: statusLabel }),
      record ? starPips(record.stars) : null,
      record?.ghost ? element("span", { className: "tag", text: t("ghostTag") }) : null,
      examRecord ? element("span", { className: "card-exam", text: t("examGradeText", { grade: formatGrade(examRecord.bestGrade) }) }) : null,
    ]);
    const side = index % 2 === 0 ? "left" : "right";
    return element("li", { className: `timeline-item ${status} topics-${side}` }, [
      element("ul", { className: "timeline-topics", attributes: { "aria-label": t("roadmapTopics") } }, module.roadmapTopics.map((topic) => element("li", { text: topic }))),
      element("div", { className: "timeline-node" }, [
        element("span", { className: "node-index", text: t("sectorIndex", { index: String(index).padStart(2, "0") }) }),
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
          element("p", { className: "review-answer" }, [element("strong", { text: t("answerLabel") }), richText("span", describeSolution(challenge))]),
          richText("p", challenge.explanation, "review-explanation"),
          hadErrors ? element("span", { className: "tag warn", text: t("toReviewTag") }) : null,
        ]),
      );
    });
    // Chaque dossier est dépliable : on relit le cours sans noyer le récapitulatif.
    const lessons = module.lessons.map((lesson, index) => {
      const details = element("details", { className: "lesson-details" }, [
        element("summary", { text: t("lessonSummary", { number: index + 1, title: lesson.title }) }),
        lessonCard(lesson),
      ]);
      details.open = lessonsOpen && index === 0;
      return details;
    });
    return [
      element("h2", { text: t("recapTitle") }),
      element("ul", { className: "recap" }, recapOf(module).map((point) => richText("li", point))),
      element("h2", { text: t("moduleLessons") }),
      element("div", { className: "lesson-list" }, lessons),
      element("h2", { text: t("terminalReview") }),
      review,
    ];
  }

  private stat(label: string, value: string): HTMLElement {
    return element("div", { className: "stat" }, [element("span", { className: "stat-value", text: value }), element("span", { className: "stat-label", text: label })]);
  }

  private roadmapCredit(): HTMLElement {
    return element("p", { className: "credit" }, [
      document.createTextNode(t("roadmapCredit")),
      element("a", { text: "roadmap.sh/devops", attributes: { href: ROADMAP_URL, target: "_blank", rel: "noopener noreferrer" } }),
    ]);
  }
}

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return t("durationValue", { minutes, seconds: String(seconds).padStart(2, "0") });
}

function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return t("unknownDate");
  return date.toLocaleString(LOCALE, { dateStyle: "short", timeStyle: "short" });
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
  return element("span", { className: "pips", attributes: { role: "img", "aria-label": t(isSingular(stars) ? "starsOne" : "starsOther", { count: stars }) } }, pips);
}

function qualityButton(label: string, onCycle: () => string): HTMLButtonElement {
  return toggleButton(label, onCycle, t("qualityTitle"));
}

function brightnessButton(label: string, onCycle: () => string): HTMLButtonElement {
  return toggleButton(label, onCycle, t("brightnessTitle"));
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
