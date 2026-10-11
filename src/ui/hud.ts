import { Tile } from "../core/grid";
import type { HudState, MinimapSnapshot } from "../game/mission";
import { element } from "./dom";

const POSTURE_LABELS = { standing: "Debout", crouching: "Accroupi (discret)", running: "Course (bruyant)" } as const;
const MINIMAP_SCALE = 4;
/** Les gardes n'apparaissent sur la carte que dans ce rayon : un « sonar » à courte portée. */
const SONAR_RADIUS = 7;
const NOTICE_DURATION_MS = 4200;
const HIT_MARKER_MS = 220;
const GUARD_COLORS = { calm: "#ff6a3d", hostile: "#ff2d2d", suspended: "#4fc3ff", down: "#5a6670" } as const;

export class Hud {
  readonly root = element("div", { className: "hud" });
  private readonly missionLabel = element("div", { className: "hud-mission" });
  private readonly objective = element("div", { className: "hud-objective" });
  private readonly lives = element("div", { className: "hud-lives", attributes: { "aria-label": "Vies" } });
  private readonly healthFill = element("div", { className: "health-fill" });
  private readonly healthLabel = element("span", { className: "health-label" });
  private readonly magazine = element("span", { className: "ammo-magazine" });
  private readonly reserve = element("span", { className: "ammo-reserve" });
  private readonly reloadFill = element("div", { className: "reload-fill" });
  private readonly alarmBanner = element("div", { className: "hud-alarm", text: "⚠ ALERTE — tu es repéré", attributes: { role: "alert" } });
  private readonly hitMarker = element("div", { className: "hit-marker", attributes: { "aria-hidden": "true" } });
  private hitMarkerTimer: number | undefined;
  private readonly exposureFill = element("div", { className: "exposure-fill" });
  private readonly exposureLabel = element("div", { className: "exposure-label" });
  private readonly posture = element("div", { className: "hud-posture" });
  private readonly prompt = element("div", { className: "hud-prompt" });
  private readonly gadget = element("div", { className: "hud-gadget" });
  private readonly intel = element("div", { className: "hud-intel" });
  private readonly notice = element("div", { className: "hud-notice", attributes: { role: "status", "aria-live": "polite" } });
  private readonly saved = element("div", { className: "hud-saved", text: "💾 Sauvegardé", attributes: { "aria-hidden": "true" } });
  private savedTimer: number | undefined;
  private readonly minimap = element("canvas", { className: "minimap", attributes: { "aria-hidden": "true" } });
  private readonly minimapContext: CanvasRenderingContext2D | null;
  private noticeTimer: number | undefined;
  private lastRendered = "";
  private touchMode = false;
  /** Murs et sols pré-rendus une fois par niveau : seule la couche dynamique est redessinée. */
  private staticLayer: HTMLCanvasElement | null = null;
  private staticLayerLayout: MinimapSnapshot["layout"] | null = null;

  constructor(parent: HTMLElement) {
    this.minimapContext = this.minimap.getContext("2d");
    this.root.append(
      element("div", { className: "hud-top-left" }, [this.missionLabel, this.objective, this.intel, this.gadget]),
      element("div", { className: "hud-top-right" }, [
        this.lives,
        element("div", { className: "health" }, [element("div", { className: "health-track" }, [this.healthFill]), this.healthLabel]),
        this.minimap,
      ]),
      this.alarmBanner,
      element("div", { className: "hud-ammo" }, [
        element("span", { className: "ammo-icon", text: "🔫" }),
        this.magazine,
        this.reserve,
        element("div", { className: "reload-track" }, [this.reloadFill]),
      ]),
      this.hitMarker,
      element("div", { className: "hud-bottom" }, [
        this.prompt,
        element("div", { className: "exposure" }, [element("div", { className: "exposure-track" }, [this.exposureFill]), this.exposureLabel]),
        this.posture,
        element("div", {
          className: "hud-help",
          text: "ZQSD bouger · Clic droit viser · Clic/Espace tirer · R recharger · F commande sur cible touchée · E action · C accroupi · Maj courir · Échap pause",
        }),
      ]),
      this.notice,
      this.saved,
    );
    this.root.hidden = true;
    parent.append(this.root);
  }

  /** En tactile, les raccourcis clavier n'ont pas de sens : on les masque. */
  setTouchMode(enabled: boolean): void {
    this.touchMode = enabled;
    this.root.classList.toggle("touch-mode", enabled);
    this.lastRendered = "";
  }

  show(missionTitle: string): void {
    this.missionLabel.textContent = missionTitle;
    this.lastRendered = "";
    this.root.hidden = false;
  }

  hide(): void {
    this.root.hidden = true;
  }

  render(state: HudState): void {
    // Écrire dans le DOM uniquement si l'état a changé : évite des recalculs de layout à chaque frame.
    const exposurePercent = Math.round(state.exposure * 100);
    const reloadPercent = Math.round(state.reloadProgress * 100);
    const commandSeconds = state.commandTarget ? Math.ceil(state.commandTarget.secondsLeft) : 0;
    const signature = [
      state.livesLeft,
      state.health,
      state.hackedCount,
      state.intelCollected,
      exposurePercent,
      state.alarm,
      state.posture,
      state.aiming,
      state.contextAction?.label,
      state.commandTarget?.name,
      commandSeconds,
      state.magazine,
      state.reserve,
      reloadPercent,
      state.nightVision,
    ].join("|");
    if (signature === this.lastRendered) return;
    this.lastRendered = signature;

    this.objective.textContent =
      state.hackedCount < state.terminalCount
        ? `Terminaux piratés : ${state.hackedCount}/${state.terminalCount}`
        : "Objectif : rejoindre l'extraction";
    this.intel.textContent = `📁 Dossiers : ${state.intelCollected}/${state.intelTotal}`;
    this.gadget.hidden = !state.gadgetAvailable;
    this.gadget.textContent = "⚡ Commande : touche d'abord ta cible, puis F";
    this.lives.textContent = `Vies ${"■".repeat(state.livesLeft)}${"□".repeat(Math.max(0, 3 - state.livesLeft))}`;
    const healthPercent = Math.round((state.health / state.maxHealth) * 100);
    this.healthFill.style.width = `${healthPercent}%`;
    this.healthFill.dataset.level = healthPercent <= 30 ? "low" : healthPercent <= 60 ? "medium" : "high";
    this.healthLabel.textContent = `Santé ${healthPercent}%`;
    this.renderAmmo(state, reloadPercent);
    this.alarmBanner.hidden = !state.alarm;
    this.exposureFill.style.width = `${exposurePercent}%`;
    this.exposureFill.dataset.level = exposurePercent > 66 ? "high" : exposurePercent > 25 ? "medium" : "low";
    this.exposureLabel.textContent = state.alarm ? "ALERTE — combat" : exposurePercent === 0 ? "Invisible" : `Exposition ${exposurePercent}%`;
    this.posture.textContent = `${POSTURE_LABELS[state.posture]}${state.aiming ? " · En visée" : ""}${state.nightVision ? " · Vision nocturne" : ""}`;
    this.prompt.replaceChildren(...this.promptLines(state, commandSeconds));
    this.prompt.hidden = this.prompt.childElementCount === 0;
    this.prompt.dataset.kind = state.contextAction?.kind ?? "command";
  }

  /** Marqueur de touche à l'écran (en pixels), comme dans les jeux de tir : on sait tout de suite si la balle a porté. */
  showHitMarker(screenX: number, screenY: number, kind: "hit" | "shield"): void {
    this.hitMarker.style.left = `${screenX}px`;
    this.hitMarker.style.top = `${screenY}px`;
    this.hitMarker.dataset.kind = kind;
    this.hitMarker.classList.remove("visible");
    // Reflow forcé : relance l'animation même si deux touches se suivent de près.
    void this.hitMarker.offsetWidth;
    this.hitMarker.classList.add("visible");
    window.clearTimeout(this.hitMarkerTimer);
    this.hitMarkerTimer = window.setTimeout(() => this.hitMarker.classList.remove("visible"), HIT_MARKER_MS);
  }

  private renderAmmo(state: HudState, reloadPercent: number): void {
    const reloading = reloadPercent > 0;
    this.magazine.textContent = reloading ? "RECHARGEMENT" : `${state.magazine}/${state.magazineSize}`;
    this.reserve.textContent = reloading ? "" : `+${state.reserve}`;
    this.magazine.dataset.level = state.magazine === 0 ? "empty" : state.magazine <= 2 ? "low" : "ok";
    this.reloadFill.style.width = `${reloadPercent}%`;
  }

  private promptLines(state: HudState, commandSeconds: number): HTMLElement[] {
    const lines: HTMLElement[] = [];
    if (state.contextAction) {
      lines.push(element("span", { text: `${this.touchMode ? "" : "[E] "}${state.contextAction.label}` }));
    }
    if (state.commandTarget) {
      const verb = state.commandTarget.kind === "camera" ? "Couper" : "Terminer";
      lines.push(
        element("span", {
          className: "prompt-gadget",
          text: `${this.touchMode ? "" : "[F] "}${verb} → ${state.commandTarget.name} · ${commandSeconds} s`,
        }),
      );
    }
    if (state.magazine === 0 && state.reserve > 0 && state.reloadProgress === 0) {
      lines.push(element("span", { className: "prompt-shoot", text: this.touchMode ? "Chargeur vide : tire pour recharger" : "[R] Recharger" }));
    }
    return lines;
  }

  /** Petit témoin discret : le joueur voit que sa progression est en sécurité, sans être interrompu. */
  showSaved(): void {
    this.saved.classList.add("visible");
    window.clearTimeout(this.savedTimer);
    this.savedTimer = window.setTimeout(() => this.saved.classList.remove("visible"), 1800);
  }

  showNotice(message: string): void {
    this.notice.textContent = message;
    this.notice.classList.add("visible");
    window.clearTimeout(this.noticeTimer);
    this.noticeTimer = window.setTimeout(() => this.notice.classList.remove("visible"), NOTICE_DURATION_MS);
  }

  drawMinimap(snapshot: MinimapSnapshot): void {
    const context = this.minimapContext;
    if (!context) return;
    if (this.staticLayerLayout !== snapshot.layout) this.renderStaticLayer(snapshot);
    context.clearRect(0, 0, this.minimap.width, this.minimap.height);
    if (this.staticLayer) context.drawImage(this.staticLayer, 0, 0);
    const dot = (x: number, z: number, color: string, radius: number): void => {
      context.fillStyle = color;
      context.beginPath();
      context.arc(x * MINIMAP_SCALE, z * MINIMAP_SCALE, radius, 0, Math.PI * 2);
      context.fill();
    };
    for (const camera of snapshot.cameras) {
      dot(camera.cell.x + 0.5, camera.cell.z + 0.5, camera.active ? "#b388ff" : "#4a4060", 2.5);
    }
    for (const pickup of snapshot.intel) {
      if (!pickup.collected) dot(pickup.cell.x + 0.5, pickup.cell.z + 0.5, "#ffc83d", 2.5);
    }
    for (const terminal of snapshot.terminals) dot(terminal.cell.x + 0.5, terminal.cell.z + 0.5, terminal.hacked ? "#39ff88" : "#ff3b4e", 3);
    const exit = snapshot.layout.exit;
    dot(exit.x + 0.5, exit.z + 0.5, snapshot.exitUnlocked ? "#39ff88" : "#7a5a20", 4);
    for (const guard of snapshot.guards) {
      if (guard.position.distanceTo(snapshot.player) > SONAR_RADIUS) continue;
      dot(guard.position.x, guard.position.z, GUARD_COLORS[guard.status], guard.status === "hostile" ? 3 : 2.5);
    }
    dot(snapshot.player.x, snapshot.player.z, "#e8fff0", 3);
  }

  private renderStaticLayer(snapshot: MinimapSnapshot): void {
    const { grid } = snapshot.layout;
    const layer = document.createElement("canvas");
    layer.width = grid.width * MINIMAP_SCALE;
    layer.height = grid.height * MINIMAP_SCALE;
    this.minimap.width = layer.width;
    this.minimap.height = layer.height;
    const context = layer.getContext("2d");
    if (!context) return;
    context.fillStyle = "rgba(5, 10, 14, 0.85)";
    context.fillRect(0, 0, layer.width, layer.height);
    for (let z = 0; z < grid.height; z++) {
      for (let x = 0; x < grid.width; x++) {
        const tile = grid.get(x, z);
        if (tile === Tile.Wall) continue;
        context.fillStyle = tile === Tile.Cover ? "#24404a" : "#16262e";
        context.fillRect(x * MINIMAP_SCALE, z * MINIMAP_SCALE, MINIMAP_SCALE, MINIMAP_SCALE);
      }
    }
    this.staticLayer = layer;
    this.staticLayerLayout = snapshot.layout;
  }
}
