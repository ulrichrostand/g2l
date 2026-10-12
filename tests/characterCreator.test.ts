import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_AVATAR, HEIGHT_RANGE, VISOR_COLORS, type AvatarConfig, type BodyType } from "../src/avatar/avatarConfig";
import type { HumanCharacterAsset } from "../src/avatar/humanCharacter";
import { AvatarStudio, type StudioLayout } from "../src/render/avatarStudio";
import {
  applyAvatarField,
  avatarHints,
  CharacterCreator,
  CREATOR_TABS,
  detectCreatorLayout,
  dragToRadians,
  formatAgentHeight,
  heightFromSlider,
  isReservedVisorColor,
  trapFocusTarget,
  withPlayerVisor,
} from "../src/ui/characterCreator";
import { createFakeHumanAsset } from "./support/fakeHumanAsset";

function draft(overrides: Partial<AvatarConfig> = {}): AvatarConfig {
  return { ...DEFAULT_AVATAR, ...overrides };
}

describe("detectCreatorLayout", () => {
  it("ordinateur et téléphone couché : panneau à gauche", () => {
    expect(detectCreatorLayout(1920, 1080)).toBe("side");
    expect(detectCreatorLayout(844, 390)).toBe("side");
  });

  it("paysage étroit : panneau à gauche, une feuille du bas n'y laisserait aucune hauteur aux options", () => {
    expect(detectCreatorLayout(640, 400)).toBe("side");
    expect(detectCreatorLayout(640, 360)).toBe("side");
    expect(detectCreatorLayout(568, 320)).toBe("side");
  });

  it("portrait : feuille en bas", () => {
    expect(detectCreatorLayout(390, 844)).toBe("bottom");
    expect(detectCreatorLayout(320, 568)).toBe("bottom");
    expect(detectCreatorLayout(820, 1180)).toBe("bottom");
    // Carré : la media query CSS (orientation: portrait) le considère comme portrait.
    expect(detectCreatorLayout(800, 800)).toBe("bottom");
  });

  it("résiste aux dimensions invalides", () => {
    expect(detectCreatorLayout(Number.NaN, 800)).toBe("side");
  });
});

describe("applyAvatarField", () => {
  it("renvoie une nouvelle config sans modifier l'originale", () => {
    const original = draft();
    const next = applyAvatarField(original, "hairStyle", "long");
    expect(next).not.toBeNull();
    expect(next?.hairStyle).toBe("long");
    expect(next).not.toBe(original);
    expect(original.hairStyle).toBe(DEFAULT_AVATAR.hairStyle);
  });

  it("normalise les couleurs en minuscules", () => {
    expect(applyAvatarField(draft(), "topColor", "#AABBCC")?.topColor).toBe("#aabbcc");
  });

  it("refuse les valeurs hors liste, les couleurs mal formées et les tailles hors plage", () => {
    const base = draft();
    expect(applyAvatarField(base, "hairStyle", "afro")).toBeNull();
    expect(applyAvatarField(base, "body", "robot")).toBeNull();
    expect(applyAvatarField(base, "beard", "oui")).toBeNull();
    expect(applyAvatarField(base, "skinTone", "red")).toBeNull();
    expect(applyAvatarField(base, "skinTone", "#12345")).toBeNull();
    expect(applyAvatarField(base, "height", HEIGHT_RANGE.max + 0.01)).toBeNull();
    expect(applyAvatarField(base, "height", "1")).toBeNull();
    expect(applyAvatarField(base, "height", Number.NaN)).toBeNull();
  });

  it("refuse des optiques rouges, couleur réservée aux sentinelles", () => {
    expect(applyAvatarField(draft(), "visorColor", "#ff2d2d")).toBeNull();
    expect(applyAvatarField(draft(), "visorColor", "#FF0044")).toBeNull();
    expect(applyAvatarField(draft(), "visorColor", "#3fe0ff")?.visorColor).toBe("#3fe0ff");
    // Le rouge reste permis ailleurs : un haut rouge n'a rien d'ennemi.
    expect(applyAvatarField(draft(), "topColor", "#ff2d2d")?.topColor).toBe("#ff2d2d");
  });

  it("refuse les noms de champ inattendus (pollution de prototype)", () => {
    const base = draft();
    expect(applyAvatarField(base, "__proto__" as keyof AvatarConfig, { hairStyle: "long" })).toBeNull();
    expect(applyAvatarField(base, "constructor" as keyof AvatarConfig, "x")).toBeNull();
    expect(({} as Record<string, unknown>).hairStyle).toBeUndefined();
  });

  it("passer en silhouette féminine retire la barbe (le modèle n'en a pas)", () => {
    const bearded = draft({ beard: true });
    expect(applyAvatarField(bearded, "body", "female")).toMatchObject({ body: "female", beard: false });
    expect(applyAvatarField(draft({ body: "female" }), "beard", true)?.beard).toBe(false);
  });

  it("ne laisse passer aucun champ parasite de la config de départ", () => {
    const polluted = { ...draft(), admin: true } as AvatarConfig;
    const next = applyAvatarField(polluted, "build", "strong");
    expect(next).not.toBeNull();
    expect(Object.keys(next ?? {})).not.toContain("admin");
  });
});

describe("curseur de taille", () => {
  it("arrondit au centième et rejette les saisies vides", () => {
    expect(heightFromSlider("0.95")).toBe(0.95);
    expect(heightFromSlider("1.0300000001")).toBe(1.03);
    expect(heightFromSlider("")).toBeNull();
    expect(heightFromSlider("abc")).toBeNull();
  });

  it("affiche une taille parlante en mètres", () => {
    expect(formatAgentHeight(1)).toBe("1,75 m");
    expect(formatAgentHeight(HEIGHT_RANGE.min)).toBe("1,58 m");
    expect(formatAgentHeight(HEIGHT_RANGE.max)).toBe("1,93 m");
  });
});

describe("isReservedVisorColor", () => {
  it("accepte toutes les optiques proposées", () => {
    for (const preset of VISOR_COLORS) expect(isReservedVisorColor(preset.value)).toBe(false);
  });

  it("refuse le rouge des sentinelles et ses voisins proches", () => {
    expect(isReservedVisorColor("#ff2d2d")).toBe(true);
    expect(isReservedVisorColor("#FF0000")).toBe(true);
    expect(isReservedVisorColor("#c62f2f")).toBe(true);
    expect(isReservedVisorColor("#ff3020")).toBe(true);
  });

  it("refuse aussi cramoisi et rouge-orangé, indiscernables du rouge après le bloom", () => {
    expect(isReservedVisorColor("#ff0044")).toBe(true);
    expect(isReservedVisorColor("#ff4800")).toBe(true);
    expect(isReservedVisorColor("#e0204a")).toBe(true);
  });

  it("laisse passer orange, rose, gris et valeurs invalides (validées ailleurs)", () => {
    expect(isReservedVisorColor("#ff8c1a")).toBe(false);
    expect(isReservedVisorColor("#ff6bc8")).toBe(false);
    expect(isReservedVisorColor("#808080")).toBe(false);
    expect(isReservedVisorColor("#2a0505")).toBe(false);
    expect(isReservedVisorColor("rouge")).toBe(false);
    expect(isReservedVisorColor(undefined)).toBe(false);
  });
});

describe("withPlayerVisor", () => {
  it("remplace des optiques rouges (sauvegarde modifiée, code importé) par celles de l'agent par défaut", () => {
    const tampered = draft({ visorColor: "#ff2d2d", hairStyle: "bun" });
    const fixed = withPlayerVisor(tampered);
    expect(fixed.visorColor).toBe(DEFAULT_AVATAR.visorColor);
    expect(fixed.hairStyle).toBe("bun");
    expect(tampered.visorColor).toBe("#ff2d2d");
  });

  it("laisse intacte une config déjà correcte", () => {
    const config = draft({ visorColor: "#3fe0ff" });
    expect(withPlayerVisor(config)).toBe(config);
  });
});

describe("trapFocusTarget", () => {
  const controls = ["rotation", "onglet", "puce", "valider"] as const;

  it("Tab sur le dernier contrôle revient au premier, Maj+Tab sur le premier va au dernier", () => {
    expect(trapFocusTarget(controls, "valider", false)).toBe("rotation");
    expect(trapFocusTarget(controls, "rotation", true)).toBe("valider");
  });

  it("au milieu du dialogue, le navigateur avance normalement", () => {
    expect(trapFocusTarget(controls, "onglet", false)).toBeNull();
    expect(trapFocusTarget(controls, "puce", true)).toBeNull();
  });

  it("focus sorti du dialogue (clic sur une zone neutre) : il y revient", () => {
    expect(trapFocusTarget(controls, null, false)).toBe("rotation");
    expect(trapFocusTarget(controls, null, true)).toBe("valider");
    expect(trapFocusTarget<string>(controls, "body", false)).toBe("rotation");
  });

  it("aucun contrôle : rien à focaliser", () => {
    expect(trapFocusTarget([], null, false)).toBeNull();
  });
});

describe("avatarHints", () => {
  it("aucune remarque pour l'agent par défaut", () => {
    expect(avatarHints(draft())).toEqual([]);
  });

  it("explique pourquoi la barbe est grisée sur la silhouette féminine", () => {
    expect(avatarHints(draft({ body: "female" }))).toEqual([{ tab: "hair", text: expect.stringContaining("barbe") }]);
  });

  it("chaque remarque vise un onglet existant", () => {
    const tabIds = new Set(CREATOR_TABS.map((tab) => tab.id));
    const configs = [draft({ body: "female" }), draft({ hairStyle: "bald", beard: true })];
    for (const config of configs) {
      const hints = avatarHints(config);
      expect(hints.length).toBeGreaterThan(0);
      for (const hint of hints) expect(tabIds.has(hint.tab)).toBe(true);
    }
  });
});

describe("dragToRadians", () => {
  it("glisser vers la droite tourne l'avant de l'agent vers la droite", () => {
    expect(dragToRadians(100)).toBeGreaterThan(0);
    expect(dragToRadians(-100)).toBeLessThan(0);
    expect(dragToRadians(0)).toBe(0);
  });

  it("une largeur d'écran de téléphone fait à peu près un tour", () => {
    expect(dragToRadians(520)).toBeGreaterThan(Math.PI * 1.5);
    expect(dragToRadians(520)).toBeLessThan(Math.PI * 2.5);
  });

  it("ignore les déplacements invalides", () => {
    expect(dragToRadians(Number.NaN)).toBe(0);
  });
});

/** Laisse s'exécuter les promesses déjà résolues (chargement factice du modèle). */
async function flushPromises(): Promise<void> {
  for (let round = 0; round < 5; round++) await Promise.resolve();
}

/** Chargeur factice : les modèles arrivent quand le test le décide, ou échouent. */
function fakeLoader() {
  const pending = new Map<BodyType, { resolve: (asset: HumanCharacterAsset) => void; reject: (error: Error) => void }>();
  const loadAsset = vi.fn(
    (body: BodyType) =>
      new Promise<HumanCharacterAsset>((resolve, reject) => {
        pending.set(body, { resolve, reject });
      }),
  );
  const deliver = async (body: BodyType): Promise<void> => {
    pending.get(body)?.resolve(createFakeHumanAsset(body));
    await flushPromises();
  };
  const fail = async (body: BodyType): Promise<void> => {
    pending.get(body)?.reject(new Error("réseau coupé (simulé)"));
    await flushPromises();
  };
  return { loadAsset, deliver, fail };
}

async function readyStudio(initial: AvatarConfig = draft()) {
  const loader = fakeLoader();
  const onPreviewError = vi.fn<(message: string) => void>();
  const studio = new AvatarStudio(initial, loader.loadAsset, onPreviewError);
  await loader.deliver(initial.body);
  return { studio, loader, onPreviewError };
}

/** Racine du personnage affiché (le groupe ajouté au plateau tournant). */
function characterModel(studio: AvatarStudio): THREE.Object3D {
  const head = studio.scene.getObjectByName("Head");
  let node: THREE.Object3D | null = head ?? null;
  while (node?.parent && node.parent.parent !== null && node.parent.type !== "Scene") {
    if (node.parent.children.some((child) => child.name.startsWith("Hair_") || child.name === "root")) return node.parent;
    node = node.parent;
  }
  throw new Error("personnage absent du studio");
}

function visibleMesh(studio: AvatarStudio, name: string): boolean | undefined {
  return studio.scene.getObjectByName(name)?.visible;
}

function meshColor(studio: AvatarStudio, name: string): string {
  const mesh = studio.scene.getObjectByName(name);
  if (!(mesh instanceof THREE.Mesh) || !(mesh.material instanceof THREE.MeshStandardMaterial)) throw new Error(`pièce absente : ${name}`);
  return `#${mesh.material.color.getHexString()}`;
}

describe("AvatarStudio", () => {
  /** Boîte englobante du personnage dans le monde, en coordonnées normalisées de l'écran. */
  function projectedBounds(studio: AvatarStudio, camera: THREE.PerspectiveCamera): { minX: number; maxX: number; minY: number; maxY: number } {
    studio.scene.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(characterModel(studio));
    const corner = new THREE.Vector3();
    const bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
    for (const x of [box.min.x, box.max.x]) {
      for (const y of [box.min.y, box.max.y]) {
        for (const z of [box.min.z, box.max.z]) {
          corner.set(x, y, z).project(camera);
          bounds.minX = Math.min(bounds.minX, corner.x);
          bounds.maxX = Math.max(bounds.maxX, corner.x);
          bounds.minY = Math.min(bounds.minY, corner.y);
          bounds.maxY = Math.max(bounds.maxY, corner.y);
        }
      }
    }
    return bounds;
  }

  const tallest = draft({ height: HEIGHT_RANGE.max, hairStyle: "bun", build: "strong" });
  const screens: { name: string; aspect: number; layout: StudioLayout }[] = [
    { name: "ordinateur", aspect: 16 / 9, layout: "side" },
    { name: "téléphone couché", aspect: 844 / 390, layout: "side" },
    { name: "téléphone en portrait", aspect: 390 / 844, layout: "bottom" },
    { name: "tablette en portrait", aspect: 820 / 1180, layout: "bottom" },
  ];

  for (const screen of screens) {
    it(`cadre l'agent le plus grand en entier dans la zone libre (${screen.name})`, async () => {
      const { studio } = await readyStudio(tallest);
      const camera = new THREE.PerspectiveCamera(50, screen.aspect, 0.1, 120);
      const coverage = screen.layout === "side" ? 0.35 : 0.55;
      studio.frameCamera(camera, screen.layout, coverage);
      const bounds = projectedBounds(studio, camera);
      expect(bounds.maxY).toBeLessThan(1);
      expect(bounds.minY).toBeGreaterThan(screen.layout === "bottom" ? -1 + 2 * coverage - 0.05 : -1);
      if (screen.layout === "side") expect(bounds.minX).toBeGreaterThan(-1 + 2 * coverage);
      expect(bounds.maxX).toBeLessThan(1);
      studio.dispose();
    });
  }

  it("le cadrage ne dépend pas de la taille choisie : un agent plus grand paraît plus grand", async () => {
    const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 120);
    const heights: number[] = [];
    for (const height of [HEIGHT_RANGE.min, HEIGHT_RANGE.max]) {
      const { studio } = await readyStudio(draft({ height }));
      studio.frameCamera(camera, "side");
      const bounds = projectedBounds(studio, camera);
      heights.push(bounds.maxY - bounds.minY);
      studio.dispose();
    }
    expect(heights[1]).toBeGreaterThan((heights[0] ?? 0) * 1.1);
  });

  it("socle vide le temps du téléchargement, puis l'agent apparaît", async () => {
    const loader = fakeLoader();
    const studio = new AvatarStudio(draft(), loader.loadAsset, vi.fn());
    expect(studio.isLoading).toBe(true);
    expect(studio.scene.getObjectByName("Head")).toBeUndefined();
    await loader.deliver("male");
    expect(studio.isLoading).toBe(false);
    expect(studio.scene.getObjectByName("Head")).toBeDefined();
    studio.dispose();
  });

  it("couleurs, coupe, barbe, carrure et taille s'appliquent sur place, sans nouveau personnage", async () => {
    const { studio, loader } = await readyStudio();
    const shown = characterModel(studio);
    studio.setAvatar(draft({ topColor: "#123456", hairStyle: "long", beard: true, build: "strong", height: 1.05 }));
    expect(characterModel(studio)).toBe(shown);
    expect(meshColor(studio, "Male_Ranger_Body")).toBe("#123456");
    expect(visibleMesh(studio, "Hair_Long")).toBe(true);
    expect(visibleMesh(studio, "Hair_Buzzed")).toBe(false);
    expect(visibleMesh(studio, "Hair_Beard")).toBe(true);
    // Carrure : plus large que haut, la tête garde ses proportions.
    expect(shown.scale.x).toBeGreaterThan(shown.scale.y);
    expect(loader.loadAsset).toHaveBeenCalledTimes(1);
    studio.dispose();
  });

  it("changer de silhouette charge l'autre modèle ; l'ancien reste affiché pendant le téléchargement", async () => {
    const { studio, loader } = await readyStudio();
    studio.setAvatar(draft({ body: "female", hairStyle: "bun" }));
    expect(studio.isLoading).toBe(true);
    expect(studio.scene.getObjectByName("SuperHero_Male")).toBeDefined();
    await loader.deliver("female");
    expect(studio.isLoading).toBe(false);
    expect(studio.scene.getObjectByName("SuperHero_Male")).toBeUndefined();
    expect(studio.scene.getObjectByName("Superhero_Female")).toBeDefined();
    expect(visibleMesh(studio, "Hair_Buns")).toBe(true);
    studio.dispose();
  });

  it("revenir à la silhouette affichée avant la fin du téléchargement : le modèle arrivé trop tard est ignoré", async () => {
    const { studio, loader } = await readyStudio();
    studio.setAvatar(draft({ body: "female" }));
    studio.setAvatar(draft({ body: "male", topColor: "#654321" }));
    await loader.deliver("female");
    expect(studio.scene.getObjectByName("Superhero_Female")).toBeUndefined();
    expect(meshColor(studio, "Male_Ranger_Body")).toBe("#654321");
    studio.dispose();
  });

  it("un téléchargement qui échoue prévient l'interface sans casser le studio", async () => {
    const loader = fakeLoader();
    const onPreviewError = vi.fn<(message: string) => void>();
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const studio = new AvatarStudio(draft(), loader.loadAsset, onPreviewError);
    await loader.fail("male");
    expect(onPreviewError).toHaveBeenCalledWith(expect.stringContaining("indisponible"));
    expect(() => studio.update(0.016, 0.016)).not.toThrow();
    errors.mockRestore();
    studio.dispose();
  });

  it("ignore une config invalide et garde l'agent affiché", async () => {
    const { studio } = await readyStudio();
    studio.setAvatar({ ...draft(), hairStyle: "afro" } as unknown as AvatarConfig);
    expect(visibleMesh(studio, "Hair_Buzzed")).toBe(true);
    studio.dispose();
  });

  it("le plateau tourne tout seul, et le glisser tourne l'agent", async () => {
    const { studio } = await readyStudio();
    const turntable = characterModel(studio).parent?.parent;
    if (!turntable) throw new Error("plateau introuvable");
    for (let frame = 0; frame < 120; frame++) studio.update(1 / 30, frame / 30);
    const spun = turntable.rotation.y;
    expect(spun).toBeGreaterThan(0.1);
    studio.setDragRotation(1);
    for (let frame = 0; frame < 30; frame++) studio.update(1 / 30, 4 + frame / 30);
    expect(turntable.rotation.y - spun).toBeGreaterThan(0.8);
    studio.dispose();
  });

  it("dispose est idempotent, et un modèle arrivé après la fermeture n'est pas affiché", async () => {
    const loader = fakeLoader();
    const studio = new AvatarStudio(draft(), loader.loadAsset, vi.fn());
    studio.dispose();
    expect(() => studio.dispose()).not.toThrow();
    await loader.deliver("male");
    expect(studio.scene.getObjectByName("Head")).toBeUndefined();
    expect(() => studio.setAvatar(draft({ topColor: "#111111" }))).not.toThrow();
  });
});

/**
 * DOM minimal pour tester le cycle de vie du créateur sous Node (pas de jsdom dans le projet) : arbre
 * d'éléments, attributs, focus, et propagation des événements élément → document → window, comme dans un navigateur.
 */
type FakeListener = (event: FakeEvent) => void;

class FakeEvent {
  target: FakeEventTarget | null = null;
  defaultPrevented = false;
  propagationStopped = false;
  key = "";
  code = "";
  shiftKey = false;
  repeat = false;
  constructor(
    readonly type: string,
    init: Partial<Pick<FakeEvent, "key" | "code" | "shiftKey">> = {},
  ) {
    Object.assign(this, init);
  }
  preventDefault(): void {
    this.defaultPrevented = true;
  }
  stopPropagation(): void {
    this.propagationStopped = true;
  }
}

class FakeEventTarget {
  private readonly listeners = new Map<string, Set<FakeListener>>();
  addEventListener(type: string, listener: FakeListener): void {
    const set = this.listeners.get(type) ?? new Set<FakeListener>();
    set.add(listener);
    this.listeners.set(type, set);
  }
  removeEventListener(type: string, listener: FakeListener): void {
    this.listeners.get(type)?.delete(listener);
  }
  listenerCount(type: string): number {
    return this.listeners.get(type)?.size ?? 0;
  }
  protected bubbleParent(): FakeEventTarget | null {
    return null;
  }
  dispatchEvent(event: FakeEvent): boolean {
    event.target ??= this;
    let node: FakeEventTarget | null = this;
    while (node && !event.propagationStopped) {
      for (const listener of [...(node.listeners.get(event.type) ?? [])]) listener(event);
      node = node.bubbleParent();
    }
    return !event.defaultPrevented;
  }
}

class FakeElement extends FakeEventTarget {
  readonly tagName: string;
  children: FakeElement[] = [];
  parentElement: FakeElement | null = null;
  className = "";
  hidden = false;
  value = "";
  tabIndex: number;
  offsetLeft = 0;
  offsetTop = 0;
  offsetWidth = 0;
  readonly style: Record<string, string> = {};
  readonly dataset: Record<string, string> = {};
  readonly classList = new Set<string>() as Set<string> & { toggle(name: string, force?: boolean): boolean; remove(name: string): void };
  private readonly attributes = new Map<string, string>();
  private ownText = "";

  /** Comme dans le DOM : la propriété reflète l'attribut (et :disabled le lit). */
  get disabled(): boolean {
    return this.attributes.has("disabled");
  }
  set disabled(value: boolean) {
    if (value) this.attributes.set("disabled", "");
    else this.attributes.delete("disabled");
  }

  constructor(tag: string) {
    super();
    this.tagName = tag.toUpperCase();
    this.tabIndex = this.tagName === "BUTTON" || this.tagName === "INPUT" ? 0 : -1;
    this.classList.toggle = (name, force) => {
      const on = force ?? !this.classList.has(name);
      if (on) this.classList.add(name);
      else this.classList.delete(name);
      return on;
    };
    this.classList.remove = (name) => void this.classList.delete(name);
  }
  get textContent(): string {
    return this.ownText + this.children.map((child) => child.textContent).join("");
  }
  set textContent(text: string | null) {
    this.replaceChildren();
    this.ownText = text ?? "";
  }
  setAttribute(name: string, value: string): void {
    this.attributes.set(name, String(value));
  }
  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }
  append(...nodes: FakeElement[]): void {
    for (const node of nodes) {
      node.parentElement?.children.splice(node.parentElement.children.indexOf(node), 1);
      node.parentElement = this;
      this.children.push(node);
    }
  }
  replaceChildren(...nodes: FakeElement[]): void {
    for (const child of this.children) child.parentElement = null;
    this.children = [];
    this.ownText = "";
    this.append(...nodes);
  }
  contains(node: unknown): boolean {
    for (let current = node instanceof FakeElement ? node : null; current; current = current.parentElement) if (current === this) return true;
    return false;
  }
  /** Sélecteurs utilisés par le créateur : noms de balise, `[attribut]` et `[hidden]`. */
  private matchesOne(selector: string): boolean {
    const trimmed = selector.trim();
    if (trimmed === "[hidden]") return this.hidden;
    if (trimmed.startsWith("[")) return this.attributes.has(trimmed.slice(1, -1));
    if (trimmed === ":disabled") return this.attributes.has("disabled");
    return this.tagName === trimmed.toUpperCase();
  }
  matches(selector: string): boolean {
    return selector.split(",").some((part) => this.matchesOne(part));
  }
  closest(selector: string): FakeElement | null {
    for (let current: FakeElement | null = this; current; current = current.parentElement) if (current.matches(selector)) return current;
    return null;
  }
  querySelectorAll(selector: string): FakeElement[] {
    const found: FakeElement[] = [];
    const visit = (node: FakeElement): void => {
      for (const child of node.children) {
        if (child.matches(selector)) found.push(child);
        visit(child);
      }
    };
    visit(this);
    return found;
  }
  focus(): void {
    fakeDocument.activeElement = this;
  }
  click(): void {
    this.dispatchEvent(new FakeEvent("click"));
  }
  scrollTo(): void {}
  getContext(): null {
    return null;
  }
  protected override bubbleParent(): FakeEventTarget | null {
    return this.parentElement ?? (this === fakeDocument.body ? fakeDocument : null);
  }
}

class FakeDocument extends FakeEventTarget {
  readonly body = new FakeElement("body");
  activeElement: FakeElement | null = this.body;
  createElement(tag: string): FakeElement {
    return new FakeElement(tag);
  }
  protected override bubbleParent(): FakeEventTarget | null {
    return fakeWindow;
  }
}

class FakeWindow extends FakeEventTarget {
  innerWidth = 1280;
  innerHeight = 720;
}

let fakeDocument = new FakeDocument();
let fakeWindow = new FakeWindow();

describe("CharacterCreator (cycle de vie, clavier, aperçu)", () => {
  let frames: Map<number, (time: number) => void>;
  let nextFrame: number;
  let frameTime: number;

  function runFrames(): void {
    const pending = [...frames.entries()];
    frames.clear();
    frameTime += 16;
    for (const [, callback] of pending) callback(frameTime);
  }

  function setup(initial: AvatarConfig = draft()) {
    fakeDocument = new FakeDocument();
    fakeWindow = new FakeWindow();
    frames = new Map();
    nextFrame = 1;
    frameTime = 0;
    vi.stubGlobal("document", fakeDocument);
    vi.stubGlobal("window", fakeWindow);
    vi.stubGlobal("HTMLElement", FakeElement);
    vi.stubGlobal("requestAnimationFrame", (callback: (time: number) => void) => {
      const id = nextFrame++;
      frames.set(id, callback);
      return id;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => void frames.delete(id));
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const container = new FakeElement("div");
    container.hidden = true;
    fakeDocument.body.append(container);
    const onChange = vi.fn<(config: AvatarConfig) => void>();
    const onSave = vi.fn<(config: AvatarConfig) => void>();
    const onCancel = vi.fn<() => void>();
    const creator = new CharacterCreator(container as unknown as HTMLElement, initial, { onChange, onSave, onCancel });
    const all = (): FakeElement[] => container.querySelectorAll("button, input, p, div, span, output, canvas, section, header, footer, h1, fieldset, legend, label");
    const byText = (text: string): FakeElement => {
      const found = all().find((node) => node.tagName === "BUTTON" && node.textContent.includes(text));
      if (!found) throw new Error(`bouton introuvable : ${text}`);
      return found;
    };
    const picker = (labelStart: string): FakeElement => {
      const found = all().find((node) => node.tagName === "INPUT" && node.getAttribute("type") === "color" && (node.getAttribute("aria-label") ?? "").startsWith(labelStart));
      if (!found) throw new Error(`sélecteur introuvable : ${labelStart}`);
      return found;
    };
    const status = (): string => all().find((node) => node.className === "creator-status")?.textContent ?? "";
    const key = (target: FakeEventTarget, init: { key: string; code?: string; shiftKey?: boolean }): FakeEvent => {
      const event = new FakeEvent("keydown", { code: init.key === " " ? "Space" : init.key, ...init });
      target.dispatchEvent(event);
      return event;
    };
    return { creator, container, onChange, onSave, onCancel, byText, picker, status, key };
  }

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("open monte le dialogue et synchronise l'aperçu ; close retire tous les écouteurs et vide le calque", () => {
    const { creator, container, onChange } = setup();
    creator.open();
    expect(container.hidden).toBe(false);
    expect(container.children).toHaveLength(1);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(fakeWindow.listenerCount("resize")).toBe(1);
    expect(fakeDocument.listenerCount("keydown")).toBe(1);
    // Le focus part sur l'onglet actif.
    expect(fakeDocument.activeElement?.getAttribute("role")).toBe("tab");

    creator.close();
    expect(container.hidden).toBe(true);
    expect(container.children).toHaveLength(0);
    expect(fakeWindow.listenerCount("resize")).toBe(0);
    expect(fakeDocument.listenerCount("keydown")).toBe(0);
    // Ouvrir et fermer plusieurs fois ne cumule rien.
    for (let round = 0; round < 3; round++) {
      creator.open();
      creator.close();
    }
    expect(fakeWindow.listenerCount("resize")).toBe(0);
    expect(fakeDocument.listenerCount("keydown")).toBe(0);
  });

  it("Échap annule même quand le focus est retombé sur <body>, et plus rien après la fermeture", () => {
    const { creator, onCancel, key } = setup();
    creator.open();
    fakeDocument.activeElement = fakeDocument.body;
    const event = key(fakeDocument.body, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
    creator.close();
    key(fakeDocument.body, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("Espace et flèches n'atteignent pas le contrôleur de jeu (sinon Espace n'active aucun bouton)", () => {
    const { creator, byText, key } = setup();
    const gameKeys: string[] = [];
    fakeWindow.addEventListener("keydown", (event) => gameKeys.push(event.code));
    creator.open();
    const chip = byText("Mince");
    for (const pressed of [" ", "ArrowLeft", "KeyW"]) {
      const event = key(chip, { key: pressed, code: pressed === " " ? "Space" : pressed });
      expect(event.defaultPrevented).toBe(false);
    }
    expect(gameKeys).toEqual([]);
    creator.close();
    // Créateur fermé : le jeu retrouve son clavier.
    key(fakeDocument.body, { key: " ", code: "Space" });
    expect(gameKeys).toEqual(["Space"]);
  });

  it("Tab boucle dans le dialogue : du dernier contrôle au premier, et Maj+Tab dans l'autre sens", () => {
    const { creator, byText, key } = setup();
    creator.open();
    const last = byText("Valider l'agent");
    last.focus();
    const forward = key(last, { key: "Tab" });
    expect(forward.defaultPrevented).toBe(true);
    const first = fakeDocument.activeElement;
    expect(first?.getAttribute("aria-label")).toBe("Tourner l'agent vers la gauche");
    const backward = key(first ?? fakeDocument.body, { key: "Tab", shiftKey: true });
    expect(backward.defaultPrevented).toBe(true);
    expect(fakeDocument.activeElement).toBe(last);
    // Focus perdu sur <body> : Tab revient dans le dialogue.
    fakeDocument.activeElement = fakeDocument.body;
    key(fakeDocument.body, { key: "Tab" });
    expect(fakeDocument.activeElement).toBe(first);
  });

  it("sélecteur de couleur : un aperçu par image, et rien n'est envoyé après la fermeture", () => {
    const { creator, picker, onChange } = setup();
    creator.open();
    onChange.mockClear();
    const hair = picker("Couleur des cheveux");
    hair.value = "#aa5500";
    hair.dispatchEvent(new FakeEvent("input"));
    hair.value = "#aa5501";
    hair.dispatchEvent(new FakeEvent("input"));
    expect(onChange).not.toHaveBeenCalled();
    runFrames();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]?.[0].hairColor).toBe("#aa5501");

    hair.value = "#aa5502";
    hair.dispatchEvent(new FakeEvent("input"));
    creator.close();
    runFrames();
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("refuse des optiques rouges au sélecteur libre : message, aucun aperçu, sélecteur ramené à la couleur actuelle", () => {
    const { creator, picker, onChange, status } = setup();
    creator.open();
    onChange.mockClear();
    const visor = picker("Optiques de vision nocturne");
    visor.value = "#ff0044";
    visor.dispatchEvent(new FakeEvent("input"));
    visor.dispatchEvent(new FakeEvent("change"));
    runFrames();
    expect(onChange).not.toHaveBeenCalled();
    expect(status()).toContain("réservé aux sentinelles");
    expect(visor.value).toBe(DEFAULT_AVATAR.visorColor);
    // Le message s'efface tout seul et rend la place aux options.
    vi.advanceTimersByTime(10_000);
    expect(status()).toBe("");
  });

  it("une sauvegarde aux optiques rouges s'ouvre avec des optiques vertes, et c'est ce qui est enregistré", () => {
    const { creator, byText, onChange, onSave, status } = setup(draft({ visorColor: "#ff2d2d", hairStyle: "bun" }));
    creator.open();
    expect(onChange.mock.calls[0]?.[0].visorColor).toBe(DEFAULT_AVATAR.visorColor);
    expect(status()).toContain("optiques");
    byText("Valider l'agent").click();
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({ visorColor: DEFAULT_AVATAR.visorColor, hairStyle: "bun" });
  });

  it("Valider envoie d'abord l'aperçu encore en attente, puis la config", () => {
    const { creator, picker, byText, onChange, onSave } = setup();
    creator.open();
    onChange.mockClear();
    const top = picker("Gilet");
    top.value = "#123456";
    top.dispatchEvent(new FakeEvent("input"));
    byText("Valider l'agent").click();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0]?.[0].topColor).toBe("#123456");
    // L'aperçu déjà envoyé n'est pas renvoyé à l'image suivante.
    runFrames();
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("la barbe se choisit sur la silhouette masculine et se grise sur la silhouette féminine", () => {
    const { creator, byText, onChange } = setup();
    creator.open();
    onChange.mockClear();
    byText("Barbe").click();
    expect(onChange.mock.calls.at(-1)?.[0].beard).toBe(true);
    byText("Femme").click();
    expect(onChange.mock.calls.at(-1)?.[0]).toMatchObject({ body: "female", beard: false });
    expect(byText("Barbe").disabled).toBe(true);
    byText("Homme").click();
    expect(byText("Barbe").disabled).toBe(false);
  });
});
