import {
  AVATAR_FIELDS,
  AVATAR_OPTIONS,
  CLOTH_COLORS,
  DEFAULT_AVATAR,
  EYE_COLORS,
  HAIR_COLORS,
  HEIGHT_RANGE,
  isSameAvatar,
  parseAvatarConfig,
  parseHexColor,
  randomAvatar,
  SKIN_TONES,
  VISOR_COLORS,
  type AvatarConfig,
  type AvatarOption,
  type ColorPreset,
  type FabricPattern,
  type HairStyle,
} from "../avatar/avatarConfig";
import { drawFabricPattern, FABRIC_TILE_PX } from "../avatar/avatarTextures";
import { DEFAULT_PANEL_COVERAGE, type StudioLayout } from "../render/avatarStudio";
import { button, element } from "./dom";
import "./characterCreator.css";

export interface CharacterCreatorCallbacks {
  /** Appelé à chaque changement (aperçu en direct), avec une config toujours valide. */
  onChange(config: AvatarConfig): void;
  onSave(config: AvatarConfig): void;
  onCancel(): void;
  /** Glisser sur la zone libre, ou boutons de rotation : à transmettre au studio 3D. */
  onRotate?(deltaRadians: number): void;
}

export type CreatorTabId = "body" | "face" | "top" | "bottom" | "accessories";

export interface CreatorHint {
  tab: CreatorTabId;
  text: string;
}

export const CREATOR_TABS: readonly { id: CreatorTabId; label: string; icon: string }[] = [
  { id: "body", label: "Corps", icon: "🧍" },
  { id: "face", label: "Visage & cheveux", icon: "🙂" },
  { id: "top", label: "Haut", icon: "👕" },
  { id: "bottom", label: "Bas & chaussures", icon: "👖" },
  { id: "accessories", label: "Accessoires", icon: "🎒" },
];

/** Même seuil que la media query de characterCreator.css : la feuille du bas et le cadrage 3D restent d'accord. */
const BOTTOM_SHEET_MAX_WIDTH_PX = 640;
/** Taille réelle affichée pour l'échelle 1 : « 1,75 m » parle plus à un joueur qu'un facteur 1,00. */
const REFERENCE_HEIGHT_CM = 175;
/** Une largeur d'écran de glisser ≈ un tour : assez précis pour viser un angle, assez rapide pour faire le tour. */
const DRAG_RADIANS_PER_PIXEL = 0.012;
const ROTATE_STEP_RADIANS = Math.PI / 4;
const TITLE_ID = "creator-title";

/** Coiffures que avatarModel tasse sous une casquette, et celles qui repoussent le casque radio sur la nuque. */
const HAIR_FLATTENED_BY_CAP: readonly HairStyle[] = ["afro", "bun", "mohawk"];
const HAIR_PUSHING_HEADSET_BACK: readonly HairStyle[] = ["afro", "gele", "bun"];

type ChoiceField = "build" | "hairStyle" | "top" | "topPattern" | "bottom" | "shoes" | "accessory";
type ColorField = "skinTone" | "hairColor" | "eyeColor" | "topColor" | "topAccent" | "bottomColor" | "shoesColor" | "accessoryColor" | "visorColor";
type ChangeTiming = "now" | "next-frame";

/** Portrait ou écran étroit : l'interface passe en feuille en bas et le personnage s'affiche au-dessus. */
export function detectCreatorLayout(width: number, height: number): StudioLayout {
  if (!Number.isFinite(width) || !Number.isFinite(height)) return "side";
  return width <= BOTTOM_SHEET_MAX_WIDTH_PX || height >= width ? "bottom" : "side";
}

/**
 * Applique un changement de champ et renvoie une NOUVELLE config validée, ou null si le changement est refusé
 * (champ inconnu, valeur hors liste, couleur mal formée, taille hors plage). La config d'origine n'est jamais modifiée.
 */
export function applyAvatarField(config: AvatarConfig, field: keyof AvatarConfig, value: unknown): AvatarConfig | null {
  // Le nom du champ est vérifié contre la liste blanche : "__proto__" ou "constructor" ne passent pas.
  if (!AVATAR_FIELDS.includes(field)) return null;
  const candidate: Record<string, unknown> = { ...config };
  candidate[field] = value;
  return parseAvatarConfig(candidate);
}

/** Taille arrondie au centième : le curseur renvoie des chaînes ("0.95"), on garde des valeurs lisibles et stables. */
export function heightFromSlider(rawValue: string): number | null {
  const value = Number(rawValue);
  if (rawValue.trim() === "" || !Number.isFinite(value)) return null;
  return Math.round(value * 100) / 100;
}

export function formatAgentHeight(height: number): string {
  const centimeters = Math.round(height * REFERENCE_HEIGHT_CM);
  return `${Math.floor(centimeters / 100)},${String(centimeters % 100).padStart(2, "0")} m`;
}

export function dragToRadians(deltaPixels: number): number {
  return Number.isFinite(deltaPixels) ? deltaPixels * DRAG_RADIANS_PER_PIXEL : 0;
}

/**
 * Le rouge vif signale les sentinelles d'ENTROPIA : des optiques rouges rendraient l'agent du joueur
 * impossible à distinguer d'un ennemi. Le sélecteur libre refuse donc ces teintes.
 */
export function isReservedVisorColor(color: string): boolean {
  const normalized = parseHexColor(color);
  if (normalized === null) return false;
  const red = Number.parseInt(normalized.slice(1, 3), 16) / 255;
  const green = Number.parseInt(normalized.slice(3, 5), 16) / 255;
  const blue = Number.parseInt(normalized.slice(5, 7), 16) / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;
  const chroma = max - min;
  if (chroma === 0) return false;
  const saturation = chroma / (1 - Math.abs(2 * lightness - 1));
  if (max !== red) return false;
  const hue = (((green - blue) / chroma) * 60 + 360) % 360;
  const nearRed = hue <= 15 || hue >= 345;
  return nearRed && saturation >= 0.45 && lightness >= 0.2 && lightness <= 0.8;
}

/**
 * Explique les règles de cohérence du modèle 3D au moment où elles s'appliquent : sans ça, un débutant
 * croirait à un bug en voyant sa casquette disparaître sur un gele.
 */
export function avatarHints(config: AvatarConfig): CreatorHint[] {
  const hints: CreatorHint[] = [];
  const wearsCap = config.accessory === "cap";
  if (config.hairStyle === "gele") {
    hints.push({ tab: "face", text: "Le gele prend la couleur d'accent du haut : change-la dans l'onglet « Haut »." });
    hints.push({ tab: "top", text: "La couleur d'accent colore aussi ton gele." });
    if (wearsCap) {
      const text = "Le gele est déjà une coiffe : la casquette ne s'affiche pas par-dessus.";
      hints.push({ tab: "face", text }, { tab: "accessories", text });
    }
  }
  if (wearsCap && HAIR_FLATTENED_BY_CAP.includes(config.hairStyle)) {
    const text = "Sous la casquette, l'afro et le chignon deviennent une coupe courte et la crête est rasée.";
    hints.push({ tab: "face", text }, { tab: "accessories", text });
  }
  if (config.accessory === "headset" && HAIR_PUSHING_HEADSET_BACK.includes(config.hairStyle)) {
    hints.push({ tab: "accessories", text: "Avec cette coiffure, l'arceau du casque radio passe derrière la nuque." });
  }
  if (config.accessory === "none") {
    hints.push({ tab: "accessories", text: "Sans accessoire, la couleur d'accessoire n'est pas utilisée." });
  }
  return hints;
}

/**
 * Créateur d'agent « façon Sims » : panneau d'options à gauche (ou en bas sur téléphone),
 * le studio 3D reste visible derrière et se met à jour à chaque choix.
 */
export class CharacterCreator {
  /** Toujours valide : chaque changement repasse par parseAvatarConfig avant d'être accepté. */
  private config: AvatarConfig;
  private readonly root: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly stage: HTMLElement;
  private readonly status: HTMLElement;
  private readonly tabs = new Map<CreatorTabId, { tab: HTMLButtonElement; panel: HTMLElement; hints: HTMLElement }>();
  /** Chaque contrôle se resynchronise depuis la config : une seule source de vérité, le focus n'est jamais perdu. */
  private readonly syncers: ((config: AvatarConfig) => void)[] = [];
  private activeTab: CreatorTabId = "body";
  private pendingFrame: number | null = null;
  private dragPointerId: number | null = null;
  private dragLastX = 0;
  private coverage: number | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private isOpen = false;

  constructor(
    private readonly container: HTMLElement,
    initial: AvatarConfig,
    private readonly callbacks: CharacterCreatorCallbacks,
  ) {
    this.config = parseAvatarConfig(initial) ?? { ...DEFAULT_AVATAR };
    this.status = element("p", { className: "creator-status", attributes: { role: "status", "aria-live": "polite" } });
    this.stage = this.buildStage();
    this.panel = this.buildPanel();
    this.root = element("div", { className: "creator-root", attributes: { role: "dialog", "aria-modal": "true", "aria-labelledby": TITLE_ID } }, [this.stage, this.panel]);
    this.root.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      this.cancel();
    });
    this.sync();
  }

  get layout(): StudioLayout {
    if (typeof window === "undefined") return "side";
    return detectCreatorLayout(window.innerWidth, window.innerHeight);
  }

  /**
   * Part de l'écran couverte par le panneau (largeur en "side", hauteur en "bottom"), mesurée dans le DOM.
   * À passer à AvatarStudio.frameCamera pour centrer exactement l'agent dans la zone libre.
   */
  get panelCoverage(): number {
    this.coverage ??= this.measureCoverage();
    return this.coverage;
  }

  open(): void {
    if (this.isOpen) return;
    this.isOpen = true;
    this.container.replaceChildren(this.root);
    this.container.hidden = false;
    this.coverage = null;
    window.addEventListener("resize", this.invalidateCoverage);
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(this.invalidateCoverage);
      this.resizeObserver.observe(this.panel);
    }
    this.tabs.get(this.activeTab)?.tab.focus({ preventScroll: true });
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    // Un aperçu en attente arriverait sur un studio déjà libéré : on l'abandonne.
    this.cancelPendingChange();
    this.endDrag();
    window.removeEventListener("resize", this.invalidateCoverage);
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.container.hidden = true;
    this.container.replaceChildren();
  }

  private readonly invalidateCoverage = (): void => {
    this.coverage = null;
  };

  private measureCoverage(): number {
    const layout = this.layout;
    const width = window.innerWidth;
    const height = window.innerHeight;
    if (!this.isOpen || width <= 0 || height <= 0) return DEFAULT_PANEL_COVERAGE[layout];
    const bounds = this.panel.getBoundingClientRect();
    const covered = layout === "side" ? bounds.right / width : (height - bounds.top) / height;
    return Number.isFinite(covered) ? Math.min(1, Math.max(0, covered)) : DEFAULT_PANEL_COVERAGE[layout];
  }

  // --- Changements de config ---

  private applyField(field: keyof AvatarConfig, value: unknown, timing: ChangeTiming): void {
    const next = applyAvatarField(this.config, field, value);
    if (next === null) {
      // Valeur refusée : les contrôles reviennent sur la config courante (ex. sélecteur libre).
      this.sync();
      return;
    }
    this.replaceConfig(next, timing);
  }

  private replaceConfig(next: AvatarConfig, timing: ChangeTiming): void {
    if (isSameAvatar(next, this.config)) return;
    this.config = next;
    // Un ancien message (tirage, couleur refusée) ne décrit plus l'agent affiché.
    this.announce("");
    this.sync();
    if (timing === "now") {
      this.cancelPendingChange();
      this.callbacks.onChange({ ...next });
      return;
    }
    // Sélecteur de couleur ou curseur : un événement par mouvement de souris. On regroupe par image
    // pour ne reconstruire le modèle 3D qu'une fois par affichage.
    this.pendingFrame ??= requestAnimationFrame(() => {
      this.pendingFrame = null;
      this.callbacks.onChange({ ...this.config });
    });
  }

  private cancelPendingChange(): void {
    if (this.pendingFrame === null) return;
    cancelAnimationFrame(this.pendingFrame);
    this.pendingFrame = null;
  }

  /** Envoie tout de suite un changement encore en attente (avant de valider, l'aperçu doit être à jour). */
  private flushPendingChange(): void {
    if (this.pendingFrame === null) return;
    this.cancelPendingChange();
    this.callbacks.onChange({ ...this.config });
  }

  private randomize(): void {
    const drawn = parseAvatarConfig(randomAvatar(Math.random));
    if (drawn === null) {
      this.announce("Le tirage au hasard a échoué : ton agent n'a pas changé.");
      return;
    }
    this.replaceConfig(drawn, "now");
    this.announce("🎲 Nouvel agent tiré au hasard. Clique encore pour un autre look !");
  }

  private reset(): void {
    this.replaceConfig({ ...DEFAULT_AVATAR }, "now");
    this.announce("Agent par défaut restauré : tenue tactique et optiques vertes.");
  }

  private save(): void {
    if (!this.isOpen) return;
    this.flushPendingChange();
    // Ultime contrôle avant d'écrire la sauvegarde. En cas d'échec (impossible si tout passe par applyField),
    // on ne sauvegarde rien et le créateur reste ouvert sur l'agent affiché.
    const validated = parseAvatarConfig(this.config);
    if (validated === null) {
      this.announce("Un réglage est invalide : modifie-le puis valide à nouveau.");
      return;
    }
    this.callbacks.onSave(validated);
  }

  private cancel(): void {
    if (!this.isOpen) return;
    this.cancelPendingChange();
    this.callbacks.onCancel();
  }

  private announce(message: string): void {
    this.status.textContent = message;
  }

  private sync(): void {
    for (const syncControl of this.syncers) syncControl(this.config);
  }

  // --- Construction du DOM ---

  private buildStage(): HTMLElement {
    const rotateLeft = button("⟲", () => this.callbacks.onRotate?.(-ROTATE_STEP_RADIANS), "creator-rotate");
    rotateLeft.setAttribute("aria-label", "Tourner l'agent vers la gauche");
    const rotateRight = button("⟳", () => this.callbacks.onRotate?.(ROTATE_STEP_RADIANS), "creator-rotate");
    rotateRight.setAttribute("aria-label", "Tourner l'agent vers la droite");
    const stage = element("div", { className: "creator-stage" }, [
      element("div", { className: "creator-stage-controls" }, [
        rotateLeft,
        element("span", { className: "creator-stage-hint", text: "↔ Glisse pour tourner l'agent", attributes: { "aria-hidden": "true" } }),
        rotateRight,
      ]),
    ]);
    this.bindStageDrag(stage);
    return stage;
  }

  private bindStageDrag(stage: HTMLElement): void {
    stage.addEventListener("pointerdown", (event) => {
      if (this.dragPointerId !== null || event.button !== 0) return;
      // Les boutons de rotation gèrent leur propre clic.
      if (event.target instanceof Element && event.target.closest("button")) return;
      event.preventDefault();
      this.dragPointerId = event.pointerId;
      this.dragLastX = event.clientX;
      stage.setPointerCapture(event.pointerId);
      stage.classList.add("creator-dragging");
    });
    stage.addEventListener("pointermove", (event) => {
      if (event.pointerId !== this.dragPointerId) return;
      const deltaX = event.clientX - this.dragLastX;
      this.dragLastX = event.clientX;
      if (deltaX !== 0) this.callbacks.onRotate?.(dragToRadians(deltaX));
    });
    const release = (event: PointerEvent): void => {
      if (event.pointerId === this.dragPointerId) this.endDrag();
    };
    stage.addEventListener("pointerup", release);
    stage.addEventListener("pointercancel", release);
    stage.addEventListener("lostpointercapture", release);
  }

  private endDrag(): void {
    if (this.dragPointerId === null) return;
    const pointerId = this.dragPointerId;
    this.dragPointerId = null;
    this.stage.classList.remove("creator-dragging");
    if (this.stage.hasPointerCapture(pointerId)) this.stage.releasePointerCapture(pointerId);
  }

  private buildPanel(): HTMLElement {
    const tabList = element("div", { className: "creator-tabs", attributes: { role: "tablist", "aria-label": "Catégories de personnalisation" } });
    const body = element("div", { className: "creator-body" });
    for (const { id, label, icon } of CREATOR_TABS) {
      const selected = id === this.activeTab;
      // Icône + libellé sur deux lignes : les cinq onglets tiennent sur la largeur, même sur téléphone.
      const tab = element(
        "button",
        {
          className: "creator-tab",
          attributes: { type: "button", role: "tab", id: `creator-tab-${id}`, "aria-controls": `creator-tabpanel-${id}`, "aria-selected": String(selected) },
        },
        [element("span", { className: "creator-tab-icon", text: icon, attributes: { "aria-hidden": "true" } }), element("span", { text: label })],
      );
      tab.addEventListener("click", () => this.selectTab(id));
      // Un seul onglet dans l'ordre de tabulation : les flèches passent d'un onglet à l'autre (motif ARIA).
      tab.tabIndex = selected ? 0 : -1;
      const hints = element("div", { className: "creator-hints" });
      const panel = element("div", { className: "creator-tabpanel", attributes: { role: "tabpanel", id: `creator-tabpanel-${id}`, "aria-labelledby": tab.id } }, [
        hints,
        ...this.tabContent(id),
      ]);
      panel.hidden = !selected;
      tabList.append(tab);
      body.append(panel);
      this.tabs.set(id, { tab, panel, hints });
    }
    tabList.addEventListener("keydown", (event) => this.onTabKey(event));
    this.syncers.push((config) => this.renderHints(config));

    return element("section", { className: "creator-panel" }, [
      element("header", { className: "creator-header" }, [
        element("p", { className: "creator-eyebrow", text: "Cellule Écho — fiche agent" }),
        element("h1", { className: "creator-title", text: "Crée ton agent", attributes: { id: TITLE_ID } }),
        element("p", { className: "creator-lead", text: "Choisis le look de Spectre. C'est juste ton style : ça ne change rien à la difficulté." }),
      ]),
      tabList,
      body,
      element("footer", { className: "creator-actions" }, [
        this.status,
        button("🎲 Aléatoire", () => this.randomize(), "btn"),
        button("Réinitialiser", () => this.reset(), "btn ghost"),
        button("Annuler", () => this.cancel(), "btn ghost"),
        button("Valider l'agent", () => this.save(), "btn primary"),
      ]),
    ]);
  }

  private tabContent(tab: CreatorTabId): HTMLElement[] {
    switch (tab) {
      case "body":
        return [this.choiceField("build", "Carrure", AVATAR_OPTIONS.build), this.heightField(), this.colorField("skinTone", "Teinte de peau", SKIN_TONES)];
      case "face":
        return [
          this.choiceField("hairStyle", "Coiffure", AVATAR_OPTIONS.hairStyle),
          this.colorField("hairColor", "Couleur des cheveux", HAIR_COLORS),
          this.colorField("eyeColor", "Couleur des yeux", EYE_COLORS),
        ];
      case "top":
        return [
          this.choiceField("top", "Style du haut", AVATAR_OPTIONS.top),
          this.patternField(),
          this.colorField("topColor", "Couleur principale", CLOTH_COLORS),
          this.colorField("topAccent", "Couleur d'accent (détails et motif)", CLOTH_COLORS),
        ];
      case "bottom":
        return [
          this.choiceField("bottom", "Bas", AVATAR_OPTIONS.bottom),
          this.colorField("bottomColor", "Couleur du bas", CLOTH_COLORS),
          this.choiceField("shoes", "Chaussures", AVATAR_OPTIONS.shoes),
          this.colorField("shoesColor", "Couleur des chaussures", CLOTH_COLORS),
        ];
      case "accessories":
        return [
          this.choiceField("accessory", "Accessoire", AVATAR_OPTIONS.accessory),
          this.colorField("accessoryColor", "Couleur de l'accessoire", CLOTH_COLORS),
          this.colorField("visorColor", "Optiques de vision nocturne", VISOR_COLORS),
        ];
    }
  }

  private selectTab(id: CreatorTabId, focus = false): void {
    this.activeTab = id;
    for (const [tabId, entry] of this.tabs) {
      const selected = tabId === id;
      entry.tab.setAttribute("aria-selected", String(selected));
      entry.tab.tabIndex = selected ? 0 : -1;
      entry.panel.hidden = !selected;
    }
    const active = this.tabs.get(id);
    if (!active) return;
    // Nouvelle catégorie : on repart du haut de la liste d'options.
    active.panel.parentElement?.scrollTo({ top: 0 });
    if (focus) active.tab.focus();
  }

  private onTabKey(event: KeyboardEvent): void {
    const order = CREATOR_TABS.map((tab) => tab.id);
    const current = order.indexOf(this.activeTab);
    let target: number;
    switch (event.key) {
      case "ArrowRight":
        target = (current + 1) % order.length;
        break;
      case "ArrowLeft":
        target = (current - 1 + order.length) % order.length;
        break;
      case "Home":
        target = 0;
        break;
      case "End":
        target = order.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    const id = order[target];
    if (id) this.selectTab(id, true);
  }

  private renderHints(config: AvatarConfig): void {
    const hints = avatarHints(config);
    for (const [tabId, entry] of this.tabs) {
      const texts = hints.filter((hint) => hint.tab === tabId).map((hint) => hint.text);
      const key = texts.join("\n");
      // Ne touche au DOM que si le contenu change : pas de relecture inutile par les lecteurs d'écran.
      if (entry.hints.dataset.key === key) continue;
      entry.hints.dataset.key = key;
      entry.hints.replaceChildren(...texts.map((text) => element("p", { className: "creator-hint", text: `💡 ${text}` })));
    }
  }

  private fieldset(legend: string, controls: HTMLElement[]): HTMLFieldSetElement {
    return element("fieldset", { className: "creator-field" }, [element("legend", { className: "creator-legend", text: legend }), ...controls]);
  }

  private choiceField<K extends ChoiceField>(field: K, legend: string, options: readonly AvatarOption<AvatarConfig[K]>[], decorate?: (value: AvatarConfig[K]) => Node): HTMLFieldSetElement {
    const chips = options.map((option) => {
      const chip = element("button", { className: "creator-chip", attributes: { type: "button", "aria-pressed": "false" } }, [
        decorate ? decorate(option.value) : null,
        element("span", { text: option.label }),
      ]);
      chip.addEventListener("click", () => this.applyField(field, option.value, "now"));
      return { value: option.value, chip };
    });
    this.syncers.push((config) => {
      for (const { value, chip } of chips) setPressed(chip, config[field] === value);
    });
    return this.fieldset(legend, [element("div", { className: "creator-chips" }, chips.map(({ chip }) => chip))]);
  }

  /** Motifs avec vignette peinte dans les couleurs du haut : on voit le wax ou l'aso-oke avant de le choisir. */
  private patternField(): HTMLFieldSetElement {
    const thumbnails: { pattern: FabricPattern; canvas: HTMLCanvasElement }[] = [];
    const field = this.choiceField("topPattern", "Motif du tissu", AVATAR_OPTIONS.topPattern, (pattern) => {
      const canvas = element("canvas", { className: "creator-chip-thumb", attributes: { width: String(FABRIC_TILE_PX), height: String(FABRIC_TILE_PX), "aria-hidden": "true" } });
      thumbnails.push({ pattern, canvas });
      return canvas;
    });
    let paintedColors = "";
    this.syncers.push((config) => {
      const colors = `${config.topColor}:${config.topAccent}`;
      if (colors === paintedColors) return;
      paintedColors = colors;
      for (const { pattern, canvas } of thumbnails) {
        const context = canvas.getContext("2d");
        if (context) drawFabricPattern(context, pattern, config.topColor, config.topAccent);
      }
    });
    return field;
  }

  private heightField(): HTMLFieldSetElement {
    const slider = element("input", {
      className: "creator-range",
      attributes: { type: "range", min: String(HEIGHT_RANGE.min), max: String(HEIGHT_RANGE.max), step: "0.01", "aria-label": "Taille de l'agent" },
    });
    const readout = element("output", { className: "creator-range-value", attributes: { "aria-hidden": "true" } });
    const onSlide = (timing: ChangeTiming): void => {
      const height = heightFromSlider(slider.value);
      if (height === null) {
        this.sync();
        return;
      }
      this.applyField("height", height, timing);
    };
    slider.addEventListener("input", () => onSlide("next-frame"));
    slider.addEventListener("change", () => {
      onSlide("now");
      this.flushPendingChange();
    });
    this.syncers.push((config) => {
      const text = formatAgentHeight(config.height);
      if (slider.value !== String(config.height)) slider.value = String(config.height);
      slider.setAttribute("aria-valuetext", text);
      readout.textContent = text;
    });
    return this.fieldset("Taille", [element("div", { className: "creator-range-row" }, [slider, readout])]);
  }

  private colorField(field: ColorField, legend: string, presets: readonly ColorPreset[]): HTMLFieldSetElement {
    const swatches = presets.map((preset) => {
      const swatch = element("button", {
        className: "creator-swatch",
        attributes: { type: "button", "aria-pressed": "false", "aria-label": preset.label, title: preset.label },
      });
      swatch.style.backgroundColor = preset.value;
      swatch.addEventListener("click", () => this.applyField(field, preset.value, "now"));
      return { value: preset.value, swatch };
    });

    const picker = element("input", { className: "creator-picker", attributes: { type: "color", "aria-label": `${legend} : autre couleur (sélecteur libre)`, title: "Autre couleur" } });
    const mark = element("span", { className: "creator-custom-mark", text: "+", attributes: { "aria-hidden": "true" } });
    const custom = element("label", { className: "creator-custom" }, [picker, mark]);
    const onPick = (timing: ChangeTiming): void => {
      const color = parseHexColor(picker.value);
      if (color === null) {
        this.sync();
        return;
      }
      if (field === "visorColor" && isReservedVisorColor(color)) {
        this.announce("Le rouge est réservé aux sentinelles d'ENTROPIA : choisis une autre teinte pour tes optiques.");
        // Pendant le glisser dans le sélecteur natif, on ne le contrarie pas ; au choix final, il revient à la couleur actuelle.
        if (timing === "now") this.sync();
        return;
      }
      this.applyField(field, color, timing);
    };
    picker.addEventListener("input", () => onPick("next-frame"));
    picker.addEventListener("change", () => {
      onPick("now");
      this.flushPendingChange();
    });

    this.syncers.push((config) => {
      const current = config[field];
      let matched = false;
      for (const { value, swatch } of swatches) {
        const selected = value === current;
        matched ||= selected;
        setPressed(swatch, selected);
      }
      // Couleur libre active : la pastille « + » prend cette couleur et porte la sélection.
      custom.classList.toggle("creator-custom-active", !matched);
      custom.style.background = matched ? "" : current;
      mark.textContent = matched ? "+" : "✓";
      picker.setAttribute("aria-label", matched ? `${legend} : autre couleur (sélecteur libre)` : `${legend} : couleur personnalisée ${current}, sélectionnée`);
      if (picker.value !== current) picker.value = current;
    });
    return this.fieldset(legend, [element("div", { className: "creator-swatches" }, [...swatches.map(({ swatch }) => swatch), custom])]);
  }
}

function setPressed(control: HTMLElement, pressed: boolean): void {
  const value = String(pressed);
  if (control.getAttribute("aria-pressed") !== value) control.setAttribute("aria-pressed", value);
}
