import * as THREE from "three";
import "./style.css";
import { unlockedWeapons } from "./combat/weapons";
import { InputController } from "./core/input";
import { SeededRandom } from "./core/rng";
import { FrameRateMonitor, lowerQuality, nextQuality, QUALITY_PROFILES, SettingsStore, type GraphicsQuality } from "./core/settings";
import { Ambience } from "./core/ambience";
import { AudioEngine, SoundFx } from "./core/sound";
import { CURRICULUM } from "./content/curriculum";
import type { DevOpsModule } from "./content/types";
import { difficultyForModule } from "./game/difficulty";
import { buildGeneralExam, buildModuleExam, examTimeLimitSeconds, GENERAL_EXAM_ID, GENERAL_EXAM_MIN_MODULES, mentionFor, type ExamQuestion } from "./game/exam";
import { cameraZoomForAspect, Mission, type AimInput, type CombatEvent, type ShotResult, type TargetRef } from "./game/mission";
import { isModuleUnlocked, LEVEL_LAYOUT_VERSION, ProgressStore, type MissionCheckpoint } from "./game/progress";
import { decodeSaveCode, encodeSaveCode, SaveCodeError } from "./game/saveCode";
import { computeMissionScore } from "./game/scoring";
import { SCENARIOS } from "./content/scenarios";
import { bossFor } from "./content/bosses";
import { DEFAULT_AVATAR } from "./avatar/avatarConfig";
import { loadHumanCharacterAsset } from "./avatar/humanCharacter";
import { loadSentinelAsset } from "./entities/sentinelAndroid";
import { AvatarStudio } from "./render/avatarStudio";
import { BossPanel } from "./ui/bossPanel";
import { CharacterCreator } from "./ui/characterCreator";
import { ChallengePanel } from "./ui/challengePanel";
import { ExamPanel, type ExamOutcome } from "./ui/examPanel";
import { ScenarioPanel } from "./ui/scenarioPanel";
import { CommandPanel } from "./ui/commandPanel";
import { requireElement } from "./ui/dom";
import { Hud } from "./ui/hud";
import { LessonPanel } from "./ui/lessonPanel";
import { RenderPipeline } from "./render/renderPipeline";
import { ScreenManager, type CampaignSummary } from "./ui/screens";
import { placeMarker, TutorialSession } from "./game/tutorial";
import { MARKER_EDGE_MARGIN, TutorialGuide } from "./ui/tutorialGuide";
import { isPortrait, shouldSuggestLandscape } from "./core/orientation";
import { OrientationHint } from "./ui/orientationHint";
import { prefersTouchControls, TouchControls } from "./ui/touchControls";

const MAX_FRAME_DELTA_SECONDS = 0.05;
const MINIMAP_REFRESH_SECONDS = 0.1;

/** Orchestre écrans, missions et progression. Une seule mission active à la fois. */
class ShadowOpsApp {
  private readonly pipeline: RenderPipeline;
  private readonly settings = new SettingsStore(safeLocalStorage(), prefersTouchControls());
  private readonly frameRateMonitor = new FrameRateMonitor();
  private readonly aimRaycaster = new THREE.Raycaster();
  private readonly groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly aimPointScratch = new THREE.Vector3();
  private readonly aimPointerScratch = new THREE.Vector2();
  private readonly camera = new THREE.PerspectiveCamera(50, 1, 0.1, 120);
  private readonly input = new InputController(window);
  private readonly audio = new AudioEngine(this.settings.soundEnabled);
  private readonly sound = new SoundFx(this.audio);
  private readonly ambience = new Ambience(this.audio);
  private readonly progress = new ProgressStore(safeLocalStorage());
  private readonly screens = new ScreenManager(requireElement("#screen"));
  private readonly hud = new Hud(requireElement("#ui"));
  /** Tutoriel du premier secteur : null hors de ce cas (déjà fait, reprise de partie, autre secteur). */
  private tutorial: TutorialSession | null = null;
  private readonly tutorialGuide = new TutorialGuide(this.hud.root, { onSkip: () => this.finishTutorial("skipped") });
  private readonly tutorialTargetScratch = new THREE.Vector3();
  private readonly orientationHint = new OrientationHint(this.hud.root, document, screen, { onDismiss: () => this.dismissOrientationHint() });
  /** Le conseil a déjà été montré pendant ce passage en portrait : il ne revient pas à chaque redimensionnement. */
  private orientationHintOffered = false;
  private readonly touchControls = new TouchControls(requireElement("#ui"), this.input);
  private readonly challengeContainer = requireElement<HTMLElement>("#challenge");
  private readonly lessonPanel = new LessonPanel(this.challengeContainer);
  private readonly clock = new THREE.Clock();
  private readonly moduleIds = CURRICULUM.map((module) => module.id);
  private readonly idleScene = createIdleScene();
  /** Calque du créateur d'agent : au-dessus du canvas (le studio 3D reste visible), sous le HUD. */
  private readonly creatorContainer = createCreatorContainer();
  private studio: AvatarStudio | null = null;
  private creator: CharacterCreator | null = null;

  private mission: Mission | null = null;
  private wrongAttemptsPerTerminal: number[] = [];
  /** Étape atteinte dans l'intervention de la console principale (reprise si on se déconnecte). */
  private scenarioStep = 0;
  /** Leçons déjà lues dans la mission en cours (ramassées ou transmises au terminal). */
  private readLessons = new Set<number>();
  /** Conseils de combat déjà donnés dans la mission : on explique une fois, sans harceler. */
  private readonly combatHintsShown = new Set<ShotResult | "alarm">();
  /** Historique des commandes du gadget, conservé entre missions comme un vrai shell. */
  private readonly commandHistory: string[] = [];
  private minimapTimer = 0;
  private touchMode = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.pipeline = new RenderPipeline(canvas, QUALITY_PROFILES[this.settings.quality]);
    window.addEventListener("resize", () => this.resize());
    this.input.attachPointerAim(canvas);
    if (prefersTouchControls()) this.enableTouchMode();
    // Un écran tactile sur un ordinateur portable n'est détecté qu'au premier contact.
    window.addEventListener("touchstart", () => this.enableTouchMode(), { once: true, passive: true });
    // L'indicateur n'apparaît qu'en mission : dans les menus, la sauvegarde est affichée autrement.
    this.progress.onSaved = () => {
      if (this.mission && !this.hud.root.hidden) this.hud.showSaved();
    };
    this.resize();
    this.pipeline.renderer.setAnimationLoop(() => this.frame());
    this.showTitle();
    // Téléchargé pendant que le joueur lit l'écran titre : l'agent humain est prêt au lancement de la mission.
    loadHumanCharacterAsset((this.progress.avatar ?? DEFAULT_AVATAR).body).catch((error: unknown) =>
      console.warn("Préchargement du personnage humain impossible (nouvel essai au lancement).", error),
    );
    loadSentinelAsset().catch((error: unknown) => console.warn("Préchargement des sentinelles impossible (nouvel essai au lancement).", error));
    // Raccourcis de test : bloc éliminé du build de production (import.meta.env.DEV vaut false).
    if (import.meta.env.DEV) {
      Object.assign(window, {
        shadowOpsDebug: {
          openTerminal: (terminalIndex: number) => {
            this.requireMission().pause();
            this.openTerminal(terminalIndex);
          },
          hackAll: () => this.requireMission().terminals.forEach((_, index) => this.requireMission().markTerminalHacked(index)),
          extract: () => this.handleExtraction(this.requireMission().module),
          mission: () => this.mission,
          camera: () => this.camera,
          scenario: (moduleId: string) => SCENARIOS[moduleId],
          ambience: () => this.ambience,
          boss: (moduleId: string) => bossFor(moduleId),
        },
      });
    }
  }

  private enableTouchMode(): void {
    if (this.touchMode) return;
    this.touchMode = true;
    document.body.classList.add("touch");
    this.hud.setTouchMode(true);
    if (this.mission && !this.hud.root.hidden) this.touchControls.show();
    this.updateOrientationHint();
  }

  private showMissionUi(title: string): void {
    this.hud.show(title);
    this.canvas.classList.add("aiming");
    if (this.touchMode) this.touchControls.show();
  }

  private hideMissionUi(): void {
    this.hud.hide();
    this.canvas.classList.remove("aiming");
    this.touchControls.hide();
  }

  private showTitle(): void {
    this.endMission();
    const checkpoint = this.resumableCheckpoint();
    const resumeModule = checkpoint ? this.moduleById(checkpoint.moduleId) : undefined;
    this.screens.showTitle({
      hasProgress: Object.keys(this.progress.snapshot.records).length > 0 || checkpoint !== null,
      campaign: this.campaignSummary(),
      resume:
        checkpoint && resumeModule
          ? {
              label: `Reprendre : ${resumeModule.codename}`,
              detail: `${checkpoint.hackedTerminals.length}/${resumeModule.challenges.length} terminaux · ${checkpoint.collectedIntel.length}/${resumeModule.lessons.length} dossiers`,
              onResume: () => this.startMission(resumeModule, checkpoint),
            }
          : null,
      // Premier lancement : on crée d'abord son agent, comme dans les Sims, puis on part en mission.
      onCampaign: () => (this.progress.avatar === null ? this.openCharacterCreator(true, () => this.showCampaignMap()) : this.showCampaignMap()),
      onCustomize: () => this.openCharacterCreator(false, () => this.showTitle()),
      onSaveManager: () => this.showSaveManager(),
      qualityLabel: this.qualityLabel(),
      onCycleQuality: () => this.cycleQuality(),
      soundLabel: this.soundLabel(),
      onToggleSound: () => this.toggleSound(),
      onReset: () => {
        this.progress.reset();
        this.showTitle();
      },
    });
  }

  /** Avancement affiché à l'accueil : secteurs libérés et prochain secteur à jouer. */
  private campaignSummary(): CampaignSummary {
    const completed = this.completedModules().length;
    const next = CURRICULUM.find((module) => this.progress.recordFor(module.id) === undefined && isModuleUnlocked(this.moduleIds, module.id, this.progress.snapshot));
    return {
      completed,
      total: CURRICULUM.length,
      next: next ? { codename: next.codename, title: next.title, section: next.roadmapSection } : null,
    };
  }

  private showCampaignMap(): void {
    this.endMission();
    const checkpoint = this.resumableCheckpoint();
    const entries = CURRICULUM.map((module) => ({
      module,
      unlocked: isModuleUnlocked(this.moduleIds, module.id, this.progress.snapshot),
      record: this.progress.recordFor(module.id),
      inProgress: checkpoint?.moduleId === module.id,
      examRecord: this.progress.examRecordFor(module.id),
    }));
    this.screens.showCampaignMap(entries, this.progress.examRecordFor(GENERAL_EXAM_ID), {
      onPlay: (module) => this.showBriefing(module),
      onResume: (module) => {
        if (checkpoint?.moduleId === module.id) this.startMission(module, checkpoint);
      },
      onDossier: (module) => this.screens.showDossier(module, () => this.showCampaignMap()),
      onExam: (module) => this.openModuleExam(module),
      onGeneralExam: () => this.openGeneralExam(),
      onBack: () => this.showTitle(),
    });
  }

  private completedModules(): DevOpsModule[] {
    return CURRICULUM.filter((module) => this.progress.recordFor(module.id) !== undefined);
  }

  private openModuleExam(module: DevOpsModule): void {
    const questions = buildModuleExam({ module, scenario: SCENARIOS[module.id] }, examRandom());
    this.openExam(module.id, `Examen — ${module.codename}`, module.title, questions, false, () => this.openModuleExam(module));
  }

  private openGeneralExam(): void {
    const modules = this.completedModules();
    // Garde-fou : le bouton est désactivé sous ce seuil, mais l'état peut changer (import de sauvegarde).
    if (modules.length < GENERAL_EXAM_MIN_MODULES) {
      this.showCampaignMap();
      return;
    }
    const questions = buildGeneralExam(modules.map((module) => ({ module, scenario: SCENARIOS[module.id] })), examRandom());
    this.openExam(GENERAL_EXAM_ID, "Examen général", `${modules.length} secteurs libérés`, questions, true, () => this.openGeneralExam());
  }

  private openExam(examId: string, title: string, subtitle: string, questions: ExamQuestion[], showModuleTags: boolean, retry: () => void): void {
    this.endMission();
    const exam = new ExamPanel(
      (content) => this.screens.present(content),
      {
        title,
        subtitle,
        questions,
        timeLimitSeconds: examTimeLimitSeconds(questions.length),
        previousBestGrade: this.progress.examRecordFor(examId)?.bestGrade ?? null,
        showModuleTags,
        moduleLabel: (moduleId) => this.moduleById(moduleId)?.codename ?? moduleId,
      },
      {
        onFinished: (outcome: ExamOutcome) => {
          this.sound.play(mentionFor(outcome.grade).passed ? "extract" : "failure");
          const { record, improved } = this.progress.saveExamResult(examId, outcome.grade);
          return { bestGrade: record.bestGrade, improved };
        },
        onRetry: retry,
        onExit: () => this.showCampaignMap(),
      },
    );
    exam.open();
  }

  private showBriefing(module: DevOpsModule): void {
    const moduleIndex = CURRICULUM.indexOf(module);
    const checkpoint = this.resumableCheckpoint();
    const replacedModule = checkpoint && checkpoint.moduleId !== module.id ? this.moduleById(checkpoint.moduleId) : undefined;
    const warning = replacedModule
      ? `Attention : ta mission en cours (${replacedModule.codename}) sera remplacée par celle-ci dès la première sauvegarde.`
      : checkpoint?.moduleId === module.id
        ? "Tu avais une partie en cours sur ce secteur : lancer l'infiltration la recommence depuis le début."
        : null;
    this.screens.showBriefing(module, moduleIndex, warning, () => this.startMission(module), () => this.showCampaignMap(), (container) => {
      // Avant la mission : le joueur lit à son rythme, et le conseil ne gêne ni le tutoriel ni le HUD.
      const wanted = shouldSuggestLandscape({ touch: this.touchMode, portrait: isPortrait(window.innerWidth, window.innerHeight), dismissed: readOrientationDismissed(), inMission: true });
      if (!wanted) return;
      new OrientationHint(container, document, screen, { onDismiss: () => this.dismissOrientationHint() }, { autoHideMs: null, inline: true }).show();
    });
  }

  private showSaveManager(): void {
    const snapshot = this.progress.snapshot;
    const completed = CURRICULUM.filter((module) => module.id in snapshot.records).length;
    const stars = Object.values(snapshot.records).reduce((total, record) => total + record.stars, 0);
    const checkpoint = this.resumableCheckpoint();
    this.screens.showSaveManager({
      persistent: this.progress.isPersistent,
      savedAt: snapshot.savedAt,
      summary: `${completed}/${CURRICULUM.length} secteurs libérés · ${stars} étoiles${checkpoint ? ` · mission en cours : ${this.moduleById(checkpoint.moduleId)?.codename ?? checkpoint.moduleId}` : ""}`,
      code: encodeSaveCode(snapshot),
      onImport: (code) => {
        try {
          this.progress.replaceWith(decodeSaveCode(code));
          return null;
        } catch (error) {
          if (error instanceof SaveCodeError) return error.message;
          console.error("Import de sauvegarde impossible", error);
          return "Import impossible : code invalide.";
        }
      },
      onImported: () => this.showSaveManager(),
      onBack: () => this.showTitle(),
    });
  }

  private startMission(module: DevOpsModule, checkpoint: MissionCheckpoint | null = null): void {
    this.endMission();
    const moduleIndex = CURRICULUM.indexOf(module);
    try {
      const gadgetTargets = {
        sentinel: unlockedWeapons(this.moduleIds, module.id, "sentinel").length > 0,
        camera: unlockedWeapons(this.moduleIds, module.id, "camera").length > 0,
      };
      this.mission = new Mission(
        module,
        difficultyForModule(moduleIndex),
        this.camera,
        this.input,
        {
          onTerminalRequested: (terminalIndex) => this.openTerminal(terminalIndex),
          onIntelFound: () => this.showCollectedIntel(),
          onCommandRequested: (target) => this.openCommandPanel(target),
          onBossCommandRequested: (phaseIndex, secondsLeft) => this.openBossPanel(phaseIndex, secondsLeft),
          onTakedown: () => this.handleTakedown(),
          onCombatEvent: (event) => this.handleCombatEvent(event, module),
          onPlayerDown: (livesLeft) => this.handlePlayerDown(livesLeft),
          onMissionFailed: () => this.handleMissionFailed(module),
          onExtraction: () => this.handleExtraction(module),
          onPauseRequested: () => this.showPause(),
          onNotice: (message) => this.hud.showNotice(message),
        },
        {
          gadgetTargets,
          moduleIndex,
          quality: QUALITY_PROFILES[this.settings.quality],
          avatar: this.progress.avatar ?? DEFAULT_AVATAR,
          playerModel: loadHumanCharacterAsset((this.progress.avatar ?? DEFAULT_AVATAR).body),
          sentinelModel: loadSentinelAsset(),
          boss: { name: bossFor(module.id).name, color: bossFor(module.id).color },
        },
      );
    } catch (error) {
      console.error("Échec de la création de la mission", error);
      window.alert("Impossible de générer ce secteur. Recharge la page ou choisis un autre module.");
      this.showCampaignMap();
      return;
    }
    // + 1 : la console principale compte aussi dans le score.
    this.wrongAttemptsPerTerminal = [...module.challenges.map(() => 0), 0];
    this.readLessons = new Set();
    this.combatHintsShown.clear();
    this.scenarioStep = 0;
    const resumed = checkpoint !== null && this.applyCheckpoint(this.mission, module, checkpoint);
    this.screens.hide();
    this.mission.setCameraZoom(cameraZoomForAspect(this.camera.aspect));
    this.showMissionUi(`${module.codename} · ${module.title}`);
    this.startTutorialIfNeeded(module, checkpoint !== null);
    this.updateOrientationHint();
    // Le tutoriel donne déjà la première consigne : pas de bandeau qui la double ou la recouvre.
    if (!this.tutorial) {
      this.hud.showNotice(
        resumed
          ? "Mission reprise depuis ta dernière sauvegarde."
          : checkpoint
            ? "Ta sauvegarde de mission date d'une ancienne version du jeu : le secteur repart de zéro (ta campagne est intacte)."
            : "Ramasse les dossiers jaunes, pirate les terminaux rouges et résous l'incident sur la console principale bleue.",
      );
    }
    this.mission.resume();
    this.ambience.start();
  }

  /**
   * Premier secteur d'une campagne neuve : on guide les premiers gestes. Jamais sur une reprise de partie,
   * ni sur un secteur déjà joué, ni une fois le tutoriel terminé ou passé.
   */
  private startTutorialIfNeeded(module: DevOpsModule, hadCheckpoint: boolean): void {
    this.tutorial = null;
    this.tutorialGuide.hide();
    const firstSector = CURRICULUM[0];
    if (!firstSector || module.id !== firstSector.id || hadCheckpoint) return;
    if (this.progress.tutorialDone || this.progress.recordFor(module.id) !== undefined) return;
    this.tutorial = new TutorialSession();
  }

  private finishTutorial(outcome: "finished" | "skipped"): void {
    this.tutorial = null;
    this.progress.markTutorialDone();
    if (outcome === "finished") {
      this.sound.play("success");
      this.tutorialGuide.showCompletion();
    } else {
      this.tutorialGuide.hide();
    }
  }

  /** Une image du tutoriel : valide l'étape en cours, affiche la consigne et le repère de la cible. */
  private updateTutorial(mission: Mission): void {
    const tutorial = this.tutorial;
    if (!tutorial) return;
    if (tutorial.update(mission.tutorialSnapshot()) > 0) {
      this.sound.play("success");
      this.tutorialGuide.flashSuccess();
    }
    const step = tutorial.step;
    if (!step) {
      this.finishTutorial("finished");
      return;
    }
    this.tutorialGuide.showStep(step, tutorial.stepNumber, tutorial.stepCount, this.touchMode);
    const target = this.tutorialTargetScratch;
    if (!mission.tutorialTarget(step.target, target)) {
      this.tutorialGuide.hideMarker();
      return;
    }
    // Un peu au-dessus du sol : l'anneau entoure le terminal, le dossier ou la sentinelle, pas leurs pieds.
    target.y = 0.8;
    target.project(this.camera);
    this.tutorialGuide.showMarker(placeMarker(target.x, target.y, target.z > 1, MARKER_EDGE_MARGIN));
  }

  /** Renvoie false si la sauvegarde ne correspond plus à ce secteur (version du jeu différente). */
  private applyCheckpoint(mission: Mission, module: DevOpsModule, checkpoint: MissionCheckpoint): boolean {
    if (checkpoint.moduleId !== module.id || checkpoint.layoutVersion !== LEVEL_LAYOUT_VERSION || !mission.restoreState(checkpoint)) {
      console.warn("Point de reprise incompatible : la mission repart de zéro.");
      this.progress.clearCheckpoint();
      return false;
    }
    this.wrongAttemptsPerTerminal = [...module.challenges, null].map((_, index) => checkpoint.wrongAttemptsPerTerminal[index] ?? 0);
    this.readLessons = new Set(checkpoint.readLessons.filter((index) => index < module.lessons.length));
    return true;
  }

  /**
   * Sauvegarde automatique : appelée après chaque étape qui compte (terminal, dossier,
   * neutralisation, détection, pause). Écrire quelques centaines d'octets est négligeable.
   */
  private saveCheckpoint(): void {
    const mission = this.mission;
    if (!mission) return;
    this.progress.saveCheckpoint({
      moduleId: mission.module.id,
      ...mission.captureState(),
      wrongAttemptsPerTerminal: [...this.wrongAttemptsPerTerminal],
      readLessons: [...this.readLessons],
    });
  }

  private resumableCheckpoint(): MissionCheckpoint | null {
    const checkpoint = this.progress.checkpoint;
    return checkpoint && this.moduleById(checkpoint.moduleId) ? checkpoint : null;
  }

  private moduleById(moduleId: string): DevOpsModule | undefined {
    return CURRICULUM.find((module) => module.id === moduleId);
  }

  /**
   * Un débutant ne doit jamais tomber sur une question sans avoir eu la leçon :
   * si le dossier correspondant n'a pas été lu, la cellule Écho le transmet d'abord.
   */
  private openTerminal(terminalIndex: number): void {
    const mission = this.requireMission();
    if (terminalIndex >= mission.module.challenges.length) {
      this.openScenario(terminalIndex);
      return;
    }
    const lesson = mission.module.lessons[terminalIndex];
    if (!lesson) throw new RangeError(`Aucune leçon pour le terminal ${terminalIndex}`);
    if (this.readLessons.has(terminalIndex)) {
      this.openChallenge(terminalIndex);
      return;
    }
    this.readLessons.add(terminalIndex);
    this.lessonPanel.open(lesson, {
      eyebrow: "Transmission de la cellule Écho",
      intro: "Tu n'as pas encore trouvé le dossier lié à ce terminal. Voici l'essentiel avant de pirater :",
      continueLabel: "Compris, pirater le terminal",
      onContinue: () => this.openChallenge(terminalIndex),
    });
  }

  private openChallenge(terminalIndex: number): void {
    const mission = this.requireMission();
    const challenge = mission.module.challenges[terminalIndex];
    const lesson = mission.module.lessons[terminalIndex];
    const terminal = mission.terminals[terminalIndex];
    if (!challenge || !lesson || !terminal) throw new RangeError(`Aucun défi pour le terminal ${terminalIndex}`);
    this.sound.play("hack");

    const panel = new ChallengePanel(this.challengeContainer, challenge, lesson, terminal.label, this.wrongAttemptsPerTerminal[terminalIndex] ?? 0, {
      onWrongAnswer: () => {
        this.sound.play("failure");
        mission.raiseNoiseAt(terminalIndex);
      },
      onSolved: ({ wrongAttempts }) => {
        this.wrongAttemptsPerTerminal[terminalIndex] = wrongAttempts;
        panel.close();
        this.sound.play("success");
        mission.markTerminalHacked(terminalIndex);
        this.saveCheckpoint();
        mission.resume();
      },
      onDisconnect: (wrongAttempts) => {
        this.wrongAttemptsPerTerminal[terminalIndex] = wrongAttempts;
        panel.close();
        mission.resume();
      },
    });
    panel.open();
  }

  /** Console principale : intervention pratique en plusieurs commandes. */
  private openScenario(terminalIndex: number): void {
    const mission = this.requireMission();
    const scenario = SCENARIOS[mission.module.id];
    const terminal = mission.terminals[terminalIndex];
    if (!scenario || !terminal) throw new RangeError(`Aucun scénario pour ${mission.module.id}`);
    this.sound.play("hack");
    const panel = new ScenarioPanel(this.challengeContainer, scenario, terminal.label, this.scenarioStep, this.wrongAttemptsPerTerminal[terminalIndex] ?? 0, {
      onWrongCommand: () => {
        this.sound.play("failure");
        mission.raiseNoiseAt(terminalIndex);
      },
      onStepCompleted: (nextStep) => {
        this.scenarioStep = nextStep;
        this.sound.play("hack");
      },
      onCompleted: (wrongAttempts) => {
        this.wrongAttemptsPerTerminal[terminalIndex] = wrongAttempts;
        panel.close();
        this.sound.play("success");
        mission.markTerminalHacked(terminalIndex);
        this.saveCheckpoint();
        mission.resume();
      },
      onDisconnect: (wrongAttempts) => {
        this.wrongAttemptsPerTerminal[terminalIndex] = wrongAttempts;
        panel.close();
        mission.resume();
      },
    });
    panel.open();
  }

  /** Les dossiers se lisent dans l'ordre du cours, quel que soit l'endroit où on les ramasse. */
  private showCollectedIntel(): void {
    const mission = this.requireMission();
    const lessons = mission.module.lessons;
    const nextUnread = lessons.findIndex((_, index) => !this.readLessons.has(index));
    const lessonIndex = nextUnread === -1 ? (mission.intelCollected - 1) % lessons.length : nextUnread;
    const lesson = lessons[lessonIndex];
    if (!lesson) throw new RangeError(`Leçon ${lessonIndex} introuvable`);
    this.readLessons.add(lessonIndex);
    this.saveCheckpoint();
    this.sound.play("success");
    this.lessonPanel.open(lesson, {
      eyebrow: `Dossier ${lessonIndex + 1}/${lessons.length}${nextUnread === -1 ? " · révision" : ""}`,
      continueLabel: "Compris, continuer la mission",
      onContinue: () => mission.resume(),
    });
  }

  private openCommandPanel(targetRef: TargetRef): void {
    const mission = this.requireMission();
    // Seuls les gadgets adaptés à la cible sont proposés : pare-feu pour une caméra, kill/docker/kubectl pour une sentinelle.
    const weapons = unlockedWeapons(this.moduleIds, mission.module.id, targetRef.kind);
    const target = mission.targetIdentity(targetRef);
    this.sound.play("hack");
    const panel = new CommandPanel(this.challengeContainer, weapons, target, this.commandHistory, {
      onSuccess: (weapon) => {
        panel.close();
        this.sound.play("takedown");
        mission.neutralizeByCommand(targetRef);
        this.saveCheckpoint();
        this.hud.showNotice(
          targetRef.kind === "camera"
            ? `${target.containerName} coupée définitivement par le pare-feu.`
            : `${target.containerName} arrêtée avec ${weapon.label}.`,
        );
        mission.resume();
      },
      onFailure: () => {
        this.sound.play("failure");
        mission.commandFailedOn(targetRef);
      },
      onCancel: () => {
        panel.close();
        mission.resume();
      },
    });
    panel.open();
  }

  /** Chaque évènement de combat devient un son, un flash ou un conseil (une seule fois par mission). */
  private handleCombatEvent(event: CombatEvent, module: DevOpsModule): void {
    switch (event.type) {
      case "shot":
        this.handleShot(event.result, event.impact, module);
        break;
      case "dryFire":
        this.sound.play("dryFire");
        break;
      case "reloadStarted":
        this.sound.play("reload");
        break;
      case "enemyShot":
        this.sound.play("enemyShot");
        break;
      case "playerHit":
        this.sound.play("playerHit");
        this.flashBody("hurt-flash");
        break;
      case "alarm":
        this.sound.play("alarm");
        this.flashAlert();
        this.showCombatHintOnce(
          "alarm",
          this.touchMode
            ? "ALERTE : tu es repéré ! Les sentinelles tirent. Mets-toi derrière un rack, puis glisse le pad de tir pour viser."
            : "ALERTE : tu es repéré ! Les sentinelles tirent. Mets-toi derrière un rack, maintiens le clic droit pour viser et riposte.",
        );
        break;
      case "sentinelWoke":
        this.sound.play("wake");
        break;
      case "bossAwakened": {
        const boss = bossFor(module.id);
        this.sound.play("alarm");
        this.flashAlert();
        this.hud.showNotice(`${boss.name} — ${boss.title}. Casse son armure au pistolet, puis achève-le avec une commande (${this.touchMode ? "bouton Gadget" : "touche F"}).`);
        break;
      }
      case "bossRecovered":
        this.sound.play("wake");
        this.hud.showNotice("Trop tard : il se relève avec une partie de son armure. Recommence !");
        break;
      case "bossPhaseCleared":
        this.sound.play("success");
        // Pas de point de reprise ici : il ne retient que la victoire, la phase reprendrait à 1 malgré le « Sauvegardé ».
        this.hud.showNotice(`Commande réussie ! Phase ${event.phase + 1}/3 : il se relève, plus dangereux.`);
        break;
      case "bossDefeated":
        this.sound.play("extract");
        this.hud.showNotice(`${bossFor(module.id).defeat} L'extraction est ouverte !`);
        this.saveCheckpoint();
        break;
    }
  }

  /** Boss à genoux : la commande du module qui l'achève, dans un terminal dédié (le temps est figé). */
  private openBossPanel(phaseIndex: number, secondsLeft: number): void {
    const mission = this.requireMission();
    const boss = bossFor(mission.module.id);
    this.sound.play("hack");
    const panel = new BossPanel(this.challengeContainer, boss, phaseIndex, secondsLeft, {
      onWrongCommand: () => {
        this.sound.play("failure");
        mission.bossCommandFailed();
        // Chaque erreur raccourcit l'exposition : le panneau affiche le temps réellement restant.
        panel.updateSecondsLeft(mission.bossExposedSecondsLeft);
      },
      onSuccess: () => {
        panel.close();
        mission.completeBossPhase();
        mission.resume();
      },
      onCancel: () => {
        panel.close();
        mission.resume();
      },
    });
    panel.open();
  }

  private handleShot(result: ShotResult, impact: THREE.Vector3, module: DevOpsModule): void {
    this.sound.play("shot");
    if (result === "miss") return;
    const armorHit = result === "shield" || result === "bossArmor";
    this.sound.play(armorHit ? "shieldHit" : "shotHit");
    const screen = impact.clone().project(this.camera);
    this.hud.showHitMarker(((screen.x + 1) / 2) * window.innerWidth, ((1 - screen.y) / 2) * window.innerHeight, armorHit ? "shield" : "hit");
    if (result === "bossArmor") return;
    if (result === "bossExposed") {
      this.hud.showNotice(`Armure brisée ! Il est à genoux : ${this.touchMode ? "bouton Gadget" : "touche F"} pour l'achever avec une commande, vite !`);
      return;
    }
    const canKill = unlockedWeapons(this.moduleIds, module.id, "sentinel").length > 0;
    const canFirewall = unlockedWeapons(this.moduleIds, module.id, "camera").length > 0;
    if (result === "suspended") {
      this.showCombatHintOnce(
        "suspended",
        canKill
          ? "Touché ! La sentinelle est suspendue (signal SIGSTOP) pendant 10 s. Termine-la avec F et une vraie commande avant qu'elle ne se relève."
          : "Touché ! La sentinelle est suspendue 10 s. Tu n'as pas encore de commande pour la terminer : profites-en pour passer.",
      );
    } else if (result === "shield") {
      this.showCombatHintOnce("shield", "Bouclier ! Dans ce secteur, il faut plusieurs balles rapprochées pour suspendre une sentinelle.");
    } else {
      this.showCombatHintOnce(
        "camera",
        canFirewall ? "Caméra brouillée 12 s. Coupe-la pour de bon avec F (pare-feu) avant qu'elle ne se rallume." : "Caméra brouillée 12 s : passe vite !",
      );
    }
  }

  private showCombatHintOnce(key: ShotResult | "alarm", message: string): void {
    if (this.combatHintsShown.has(key)) return;
    this.combatHintsShown.add(key);
    this.hud.showNotice(message);
  }

  private handleTakedown(): void {
    this.saveCheckpoint();
    this.sound.play("takedown");
    this.hud.showNotice("Sentinelle neutralisée en silence.");
  }

  private handlePlayerDown(livesLeft: number): void {
    this.saveCheckpoint();
    this.sound.play("alarm");
    this.flashAlert();
    this.screens.showPlayerDown(livesLeft, () => {
      this.screens.hide();
      this.mission?.resume();
    });
  }

  private handleMissionFailed(module: DevOpsModule): void {
    // Mission perdue : la reprendre n'aurait pas de sens, on repart du début.
    this.progress.clearCheckpoint();
    this.sound.play("alarm");
    this.flashAlert();
    this.hideMissionUi();
    this.screens.showFailed(() => this.startMission(module), () => this.showCampaignMap());
  }

  private handleExtraction(module: DevOpsModule): void {
    const mission = this.requireMission();
    this.sound.play("extract");
    const score = computeMissionScore({
      terminalCount: mission.terminals.length,
      wrongAttemptsPerTerminal: this.wrongAttemptsPerTerminal,
      detections: mission.detections,
      elapsedSeconds: mission.elapsedSeconds,
      intelCollected: mission.intelCollected,
      intelTotal: mission.intelTotal,
    });
    this.progress.saveResult(module.id, { bestScore: score.score, stars: score.stars, ghost: score.ghost });
    this.hideMissionUi();

    const moduleIndex = CURRICULUM.indexOf(module);
    const nextModule = CURRICULUM[moduleIndex + 1];
    this.screens.showDebrief(
      {
        module,
        score,
        wrongAttemptsPerTerminal: [...this.wrongAttemptsPerTerminal],
        detections: mission.detections,
        neutralizations: mission.neutralizations,
        intelCollected: mission.intelCollected,
        intelTotal: mission.intelTotal,
        elapsedSeconds: mission.elapsedSeconds,
        isLastModule: !nextModule,
        bossName: bossFor(module.id).name,
      },
      () => (nextModule ? this.showBriefing(nextModule) : this.showCampaignMap()),
      () => this.startMission(module),
      () => this.showCampaignMap(),
    );
  }

  private showPause(): void {
    this.saveCheckpoint();
    this.screens.showPause({
      persistent: this.progress.isPersistent,
      qualityLabel: this.qualityLabel(),
      onCycleQuality: () => this.cycleQuality(),
      soundLabel: this.soundLabel(),
      onToggleSound: () => this.toggleSound(),
      onResume: () => {
        this.screens.hide();
        this.mission?.resume();
      },
      onQuit: () => {
        this.saveCheckpoint();
        this.showTitle();
      },
    });
  }

  /**
   * Visée du joueur : en tactile, la direction du pad de tir ; à la souris, le point du sol sous le curseur
   * (clic droit maintenu = visée épaulée). Aucun verrouillage automatique : on vise soi-même.
   */
  private currentAim(): AimInput | null {
    if (this.touchMode) {
      const angle = this.input.virtualAimAngle;
      return angle === null ? null : { kind: "direction", angle, aiming: true };
    }
    const pointer = this.input.aimPosition;
    if (!pointer) return null;
    this.aimPointerScratch.set(pointer.x, pointer.y);
    this.aimRaycaster.setFromCamera(this.aimPointerScratch, this.camera);
    const point = this.aimRaycaster.ray.intersectPlane(this.groundPlane, this.aimPointScratch);
    return point ? { kind: "point", x: point.x, z: point.z, aiming: this.input.isAimButtonHeld } : null;
  }

  private soundLabel(): string {
    return this.settings.soundEnabled ? "Son : activé" : "Son : coupé";
  }

  private toggleSound(): string {
    const enabled = !this.settings.soundEnabled;
    this.settings.setSoundEnabled(enabled);
    this.audio.setEnabled(enabled);
    // Son coupé : l'ambiance s'arrête (inutile de synthétiser du silence) et repart si on le réactive en mission.
    if (!enabled) this.ambience.stop();
    else if (this.mission) this.ambience.start();
    return this.soundLabel();
  }

  private qualityLabel(): string {
    return `Graphismes : ${QUALITY_PROFILES[this.settings.quality].label}`;
  }

  /** Bouton de réglage : bloom, vignette et résolution changent tout de suite ; ombres et poussière au prochain secteur. */
  private cycleQuality(): string {
    this.applyQuality(nextQuality(this.settings.quality));
    return this.qualityLabel();
  }

  private applyQuality(quality: GraphicsQuality): void {
    this.settings.setQuality(quality);
    this.pipeline.applyProfile(QUALITY_PROFILES[quality]);
    this.frameRateMonitor.reset();
  }

  private endMission(): void {
    if (!this.mission) return;
    this.mission.dispose();
    this.mission = null;
    this.tutorial = null;
    this.tutorialGuide.hide();
    this.orientationHint.hide();
    this.orientationHintOffered = false;
    this.ambience.stop();
    this.hideMissionUi();
    this.challengeContainer.hidden = true;
    this.challengeContainer.replaceChildren();
    this.canvas.classList.remove("night-vision");
  }

  private frame(): void {
    const deltaSeconds = Math.min(this.clock.getDelta(), MAX_FRAME_DELTA_SECONDS);
    const elapsedSeconds = this.clock.elapsedTime;
    const mission = this.mission;
    if (!mission) {
      if (this.studio && this.creator) this.renderStudio(this.studio, this.creator, deltaSeconds, elapsedSeconds);
      else this.animateIdleScene(elapsedSeconds);
      return;
    }
    mission.setAim(this.currentAim());
    mission.tick(deltaSeconds, elapsedSeconds);
    // La mission a pu être terminée par un callback pendant tick() (échec, extraction...).
    if (this.mission !== mission) return;
    if (!mission.isPaused) this.watchFrameRate(deltaSeconds);

    this.canvas.classList.toggle("night-vision", mission.isNightVisionOn);
    this.pipeline.exposure = mission.isNightVisionOn ? 2.4 : 1;
    const hudState = mission.hudState();
    this.hud.render(hudState);
    this.updateTutorial(mission);
    this.ambience.update(deltaSeconds, hudState.exposure, mission.isPaused);
    if (this.touchMode) {
      this.touchControls.sync({
        contextLabel: hudState.contextAction ? (hudState.contextAction.kind === "takedown" ? "Neutraliser" : "Pirater") : null,
        crouched: hudState.posture === "crouching",
        // Le boss s'achève à la commande même avant d'avoir débloqué un gadget (module d'introduction).
        gadgetVisible: hudState.gadgetAvailable || hudState.commandTarget !== null,
        gadgetReady: hudState.commandTarget !== null,
        shootReady: hudState.magazine + hudState.reserve > 0,
      });
    }
    this.minimapTimer -= deltaSeconds;
    if (this.minimapTimer <= 0) {
      this.hud.drawMinimap(mission.minimapSnapshot());
      this.minimapTimer = MINIMAP_REFRESH_SECONDS;
    }
    this.pipeline.render(mission.scene, this.camera);
  }

  /** Si l'appareil ne suit pas, on baisse la qualité d'un cran plutôt que de laisser le jeu saccader. */
  private watchFrameRate(deltaSeconds: number): void {
    if (!this.frameRateMonitor.sample(deltaSeconds)) return;
    const lower = lowerQuality(this.settings.quality);
    if (!lower) return;
    this.applyQuality(lower);
    this.hud.showNotice(`Qualité graphique réduite à « ${QUALITY_PROFILES[lower].label} » pour garder le jeu fluide (modifiable en pause).`);
  }

  /**
   * Créateur d'agent « façon Sims » : studio 3D en direct derrière le panneau.
   * `firstRun` : au tout premier lancement, annuler garde l'agent par défaut (on ne redemande pas à chaque fois).
   */
  private openCharacterCreator(firstRun: boolean, onDone: () => void): void {
    this.endMission();
    this.closeCharacterCreator();
    const initial = this.progress.avatar ?? DEFAULT_AVATAR;
    let studio: AvatarStudio | null = null;
    // Le studio peut signaler un aperçu indisponible avant que le créateur existe : on passe par cette référence.
    let creatorRef: CharacterCreator | null = null;
    try {
      studio = new AvatarStudio(initial, loadHumanCharacterAsset, (message) => creatorRef?.notify(message));
      const builtStudio = studio;
      const creator = new CharacterCreator(this.creatorContainer, initial, {
        onChange: (config) => builtStudio.setAvatar(config),
        onSave: (config) => {
          this.progress.saveAvatar(config);
          this.closeCharacterCreator();
          onDone();
        },
        onCancel: () => {
          if (firstRun && this.progress.avatar === null) this.progress.saveAvatar(DEFAULT_AVATAR);
          this.closeCharacterCreator();
          onDone();
        },
        onRotate: (deltaRadians) => builtStudio.setDragRotation(deltaRadians),
      });
      // L'écran titre n'est masqué qu'une fois tout construit : en cas d'échec, le joueur garde ses boutons.
      this.screens.hide();
      this.studio = studio;
      this.creator = creator;
      creatorRef = creator;
      creator.open();
    } catch (error) {
      // Construction du décor du studio ou du DOM impossible (WebGL perdu, mémoire) : on continue sans créateur.
      console.error("Créateur d'agent indisponible.", error);
      if (this.studio === studio) this.closeCharacterCreator();
      else studio?.dispose();
      if (firstRun && this.progress.avatar === null) this.progress.saveAvatar(DEFAULT_AVATAR);
      window.alert("Le créateur d'agent n'a pas pu s'ouvrir sur cet appareil : l'agent par défaut est utilisé.");
      onDone();
    }
  }

  private closeCharacterCreator(): void {
    this.creator?.close();
    this.creator = null;
    this.studio?.dispose();
    this.studio = null;
  }

  private renderStudio(studio: AvatarStudio, creator: CharacterCreator, deltaSeconds: number, elapsedSeconds: number): void {
    studio.update(deltaSeconds, elapsedSeconds);
    // Recadré à chaque image : la mise en page (panneau à gauche ou en bas) suit la rotation de l'écran.
    studio.frameCamera(this.camera, creator.layout, creator.panelCoverage);
    this.pipeline.exposure = 1;
    this.pipeline.render(studio.scene, this.camera);
  }

  private animateIdleScene(elapsedSeconds: number): void {
    this.camera.position.set(Math.cos(elapsedSeconds * 0.1) * 14, 9, Math.sin(elapsedSeconds * 0.1) * 14);
    this.camera.lookAt(0, 0, 0);
    this.pipeline.exposure = 1;
    this.pipeline.render(this.idleScene, this.camera);
  }

  private flashAlert(): void {
    this.flashBody("alert-flash");
  }

  private flashBody(className: "alert-flash" | "hurt-flash"): void {
    document.body.classList.remove(className);
    // Force un reflow pour relancer l'animation CSS si deux flashs se suivent.
    void document.body.offsetWidth;
    document.body.classList.add(className);
  }

  /** Conseil « paysage » : une fois par passage en portrait, jamais après un « Plus tard ». */
  private updateOrientationHint(): void {
    const portrait = isPortrait(window.innerWidth, window.innerHeight);
    if (!portrait) this.orientationHintOffered = false;
    const wanted = shouldSuggestLandscape({ touch: this.touchMode, portrait, dismissed: readOrientationDismissed(), inMission: this.mission !== null && this.tutorial === null });
    if (!wanted) {
      this.orientationHint.hide();
      return;
    }
    if (this.orientationHintOffered) return;
    this.orientationHintOffered = true;
    this.orientationHint.show();
  }

  private dismissOrientationHint(): void {
    try {
      window.sessionStorage.setItem(ORIENTATION_DISMISSED_KEY, "1");
    } catch (error) {
      // Stockage de session bloqué : le conseil pourra revenir, sans gravité.
      console.warn("Impossible de mémoriser que le conseil d'orientation est écarté.", error);
    }
  }

  private resize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.pipeline.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.mission?.setCameraZoom(cameraZoomForAspect(this.camera.aspect));
    this.updateOrientationHint();
  }

  private requireMission(): Mission {
    if (!this.mission) throw new Error("Aucune mission active");
    return this.mission;
  }
}

/** Décor du menu : une salle serveur stylisée qui tourne lentement en arrière-plan. */
function createIdleScene(): THREE.Scene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05080c);
  scene.fog = new THREE.Fog(0x05080c, 10, 30);
  scene.add(new THREE.HemisphereLight(0x6f8fb0, 0x0b0f14, 0.6));
  const rackMaterial = new THREE.MeshStandardMaterial({ color: 0x1a2129, metalness: 0.5, roughness: 0.5 });
  const ledMaterial = new THREE.MeshStandardMaterial({ color: 0x39ff88, emissive: 0x39ff88, emissiveIntensity: 2 });
  const rackGeometry = new THREE.BoxGeometry(0.9, 2.2, 0.9);
  const ledGeometry = new THREE.BoxGeometry(0.06, 0.06, 0.02);
  for (let row = -2; row <= 2; row++) {
    for (let column = -4; column <= 4; column++) {
      if (row === 0) continue;
      const rack = new THREE.Mesh(rackGeometry, rackMaterial);
      rack.position.set(column * 1.1, 1.1, row * 2.6);
      scene.add(rack);
      for (let led = 0; led < 4; led++) {
        const light = new THREE.Mesh(ledGeometry, ledMaterial);
        light.position.set(column * 1.1 + 0.3, 0.5 + led * 0.45, row * 2.6 + 0.46 * Math.sign(-row));
        scene.add(light);
      }
    }
  }
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: 0x0e141a }));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const glow = new THREE.PointLight(0x4fc3ff, 30, 25, 1.5);
  glow.position.set(0, 4, 0);
  scene.add(glow);
  return scene;
}

/** Tirage différent à chaque examen : repasser un examen ne redonne pas les mêmes questions dans le même ordre. */
function examRandom(): SeededRandom {
  const entropy = new Uint32Array(1);
  crypto.getRandomValues(entropy);
  return new SeededRandom(entropy[0] ?? Date.now());
}

function createCreatorContainer(): HTMLElement {
  const container = document.createElement("div");
  container.id = "creator";
  container.hidden = true;
  document.body.append(container);
  return container;
}

function safeLocalStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch (error) {
    console.warn("localStorage inaccessible : la progression ne sera pas sauvegardée.", error);
    return null;
  }
}

const ORIENTATION_DISMISSED_KEY = "shadow-ops-devops/orientation-hint-dismissed";

function readOrientationDismissed(): boolean {
  try {
    return window.sessionStorage.getItem(ORIENTATION_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

function boot(): void {
  const canvas = requireElement<HTMLCanvasElement>("#game");
  try {
    new ShadowOpsApp(canvas);
  } catch (error) {
    console.error("Initialisation impossible", error);
    const fallback = requireElement<HTMLElement>("#screen");
    fallback.hidden = false;
    fallback.textContent = "Impossible de démarrer le jeu : WebGL est requis. Essaie un navigateur récent (Chrome, Firefox, Edge, Safari).";
  }
}

boot();
