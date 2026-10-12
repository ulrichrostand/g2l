import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_AVATAR, HEIGHT_RANGE, VISOR_COLORS, type AvatarConfig } from "../src/avatar/avatarConfig";
import { createAvatarRig } from "../src/avatar/avatarModel";
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

/** Pannes simulées de createAvatarRig (canvas indisponible, bug d'une combinaison) : délègue au vrai sinon. */
const rigFailures = vi.hoisted(() => ({ when: null as ((config: { hairStyle: string; skinTone: string }) => boolean) | null }));
vi.mock("../src/avatar/avatarModel", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/avatar/avatarModel")>();
  return {
    ...original,
    createAvatarRig: (config: Parameters<typeof original.createAvatarRig>[0]) => {
      if (rigFailures.when?.(config)) throw new Error("échec simulé de construction");
      return original.createAvatarRig(config);
    },
  };
});

afterEach(() => {
  rigFailures.when = null;
});

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
    const next = applyAvatarField(original, "hairStyle", "afro");
    expect(next).not.toBeNull();
    expect(next?.hairStyle).toBe("afro");
    expect(next).not.toBe(original);
    expect(original.hairStyle).toBe(DEFAULT_AVATAR.hairStyle);
  });

  it("normalise les couleurs en minuscules", () => {
    expect(applyAvatarField(draft(), "topColor", "#AABBCC")?.topColor).toBe("#aabbcc");
  });

  it("refuse les valeurs hors liste, les couleurs mal formées et les tailles hors plage", () => {
    const base = draft();
    expect(applyAvatarField(base, "top", "armure")).toBeNull();
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
    expect(applyAvatarField(base, "__proto__" as keyof AvatarConfig, { hairStyle: "afro" })).toBeNull();
    expect(applyAvatarField(base, "constructor" as keyof AvatarConfig, "x")).toBeNull();
    expect(({} as Record<string, unknown>).hairStyle).toBeUndefined();
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
    const tampered = draft({ visorColor: "#ff2d2d", hairStyle: "afro" });
    const fixed = withPlayerVisor(tampered);
    expect(fixed.visorColor).toBe(DEFAULT_AVATAR.visorColor);
    expect(fixed.hairStyle).toBe("afro");
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

  it("explique le gele assorti à la couleur d'accent", () => {
    const tabs = avatarHints(draft({ hairStyle: "gele" })).map((hint) => hint.tab);
    expect(tabs).toContain("face");
    expect(tabs).toContain("top");
  });

  it("explique la casquette sur une coiffure volumineuse ou sur un gele", () => {
    expect(avatarHints(draft({ hairStyle: "afro", accessory: "cap" })).some((hint) => hint.tab === "accessories" && hint.text.includes("casquette"))).toBe(true);
    expect(avatarHints(draft({ hairStyle: "gele", accessory: "cap" })).some((hint) => hint.text.includes("ne s'affiche pas"))).toBe(true);
    expect(avatarHints(draft({ hairStyle: "buzz", accessory: "cap" }))).toEqual([]);
  });

  it("signale que la couleur d'accessoire est inutile sans accessoire", () => {
    expect(avatarHints(draft({ accessory: "none" }))).toEqual([{ tab: "accessories", text: expect.stringContaining("Sans accessoire") }]);
  });

  it("chaque remarque vise un onglet existant", () => {
    const tabIds = new Set(CREATOR_TABS.map((tab) => tab.id));
    const configs = [draft({ hairStyle: "gele", accessory: "cap" }), draft({ hairStyle: "bun", accessory: "headset" }), draft({ accessory: "none" })];
    for (const config of configs) for (const hint of avatarHints(config)) expect(tabIds.has(hint.tab)).toBe(true);
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

describe("AvatarStudio", () => {
  function avatarRoot(studio: AvatarStudio): THREE.Object3D {
    const root = studio.scene.getObjectByName("root");
    if (!root) throw new Error("avatar absent du studio");
    return root;
  }

  /** Boîte englobante de l'avatar dans le monde, en coordonnées normalisées de l'écran. */
  function projectedBounds(studio: AvatarStudio, camera: THREE.PerspectiveCamera): { minX: number; maxX: number; minY: number; maxY: number } {
    studio.scene.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(avatarRoot(studio));
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

  const tallest = draft({ height: HEIGHT_RANGE.max, hairStyle: "mohawk", build: "strong" });
  const screens: { name: string; aspect: number; layout: StudioLayout }[] = [
    { name: "ordinateur", aspect: 16 / 9, layout: "side" },
    { name: "téléphone couché", aspect: 844 / 390, layout: "side" },
    { name: "téléphone en portrait", aspect: 390 / 844, layout: "bottom" },
    { name: "tablette en portrait", aspect: 820 / 1180, layout: "bottom" },
  ];

  for (const screen of screens) {
    it(`cadre l'agent le plus grand en entier dans la zone libre (${screen.name})`, () => {
      const studio = new AvatarStudio(tallest);
      const camera = new THREE.PerspectiveCamera(50, screen.aspect, 0.1, 120);
      const coverage = screen.layout === "side" ? 0.35 : 0.55;
      studio.frameCamera(camera, screen.layout, coverage);
      const bounds = projectedBounds(studio, camera);
      const freeMinX = screen.layout === "side" ? -1 + 2 * coverage : -1;
      const freeMinY = screen.layout === "bottom" ? -1 + 2 * coverage : -1;
      expect(bounds.minX).toBeGreaterThan(freeMinX);
      expect(bounds.maxX).toBeLessThan(1);
      expect(bounds.minY).toBeGreaterThan(freeMinY);
      expect(bounds.maxY).toBeLessThan(1);
      // Et il n'est pas minuscule : au moins la moitié de la hauteur libre.
      expect(bounds.maxY - bounds.minY).toBeGreaterThan((1 - freeMinY) * 0.5);
      studio.dispose();
    });
  }

  // Largeur réelle du panneau (characterCreator.css) : min(380px, 46vw), ou min(380px, 55vw) sur un téléphone couché.
  const measuredScreens: { name: string; width: number; height: number; panelPx: number }[] = [
    { name: "téléphone couché 844 × 390", width: 844, height: 390, panelPx: 380 },
    { name: "iPhone 8 couché 667 × 375", width: 667, height: 375, panelPx: 0.55 * 667 },
    { name: "Android couché 640 × 360", width: 640, height: 360, panelPx: 0.55 * 640 },
    { name: "iPhone SE couché 568 × 320", width: 568, height: 320, panelPx: 0.55 * 568 },
    { name: "ordinateur 1366 × 768", width: 1366, height: 768, panelPx: 380 },
  ];

  for (const screen of measuredScreens) {
    it(`avec la couverture mesurée du panneau, l'agent est centré dans la zone libre (${screen.name})`, () => {
      const studio = new AvatarStudio(draft({ height: HEIGHT_RANGE.max, top: "boubou", accessory: "bag", build: "strong" }));
      const camera = new THREE.PerspectiveCamera(50, screen.width / screen.height, 0.1, 120);
      const coverage = screen.panelPx / screen.width;
      studio.frameCamera(camera, "side", coverage);
      const bounds = projectedBounds(studio, camera);
      const freeMinX = -1 + 2 * coverage;
      expect(bounds.minX).toBeGreaterThan(freeMinX);
      expect(bounds.maxX).toBeLessThan(1);
      const freeCenter = (freeMinX + 1) / 2;
      const agentCenter = (bounds.minX + bounds.maxX) / 2;
      // Le sac et le pistolet décentrent un peu la silhouette : tolérance de 8 % de la zone libre.
      expect(Math.abs(agentCenter - freeCenter)).toBeLessThan(0.08 * (1 - freeMinX));
      studio.dispose();
    });
  }

  it("le cadrage ne dépend pas de la taille choisie : un agent plus grand paraît plus grand", () => {
    const studio = new AvatarStudio(draft({ height: HEIGHT_RANGE.min }));
    const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 120);
    studio.frameCamera(camera, "side");
    const small = projectedBounds(studio, camera);
    const cameraPosition = camera.position.clone();
    studio.setAvatar(draft({ height: HEIGHT_RANGE.max }));
    studio.frameCamera(camera, "side");
    const large = projectedBounds(studio, camera);
    expect(camera.position.distanceTo(cameraPosition)).toBeLessThan(1e-9);
    expect(large.maxY - large.minY).toBeGreaterThan(small.maxY - small.minY);
    studio.dispose();
  });

  it("taille et optiques changent sans reconstruire le modèle, le reste reconstruit", () => {
    const studio = new AvatarStudio(draft());
    const firstRoot = avatarRoot(studio);
    studio.setAvatar(draft({ height: 1.05, visorColor: "#3fe0ff" }));
    expect(avatarRoot(studio)).toBe(firstRoot);
    expect(firstRoot.scale.x).toBeCloseTo(1.05);

    studio.setAvatar(draft({ height: 1.05, visorColor: "#3fe0ff", hairStyle: "afro" }));
    const rebuiltRoot = avatarRoot(studio);
    expect(rebuiltRoot).not.toBe(firstRoot);
    expect(firstRoot.parent).toBeNull();
    expect(rebuiltRoot.scale.x).toBeCloseTo(1.05);
    // Un seul avatar dans la scène après reconstruction.
    let roots = 0;
    studio.scene.traverse((object) => {
      if (object.name === "root") roots++;
    });
    expect(roots).toBe(1);
    studio.dispose();
  });

  it("ignore une config invalide et garde l'agent affiché", () => {
    const studio = new AvatarStudio(draft());
    const root = avatarRoot(studio);
    studio.setAvatar({ ...draft(), hairStyle: "crête-iroquoise" } as unknown as AvatarConfig);
    expect(avatarRoot(studio)).toBe(root);
    studio.dispose();
  });

  it("pose d'attente vivante : l'agent respire sans marcher, les pieds restent posés", () => {
    const studio = new AvatarStudio(draft());
    const root = avatarRoot(studio);
    const torso = root.getObjectByName("torso");
    const leftLeg = root.getObjectByName("leftLeg");
    const hips = root.getObjectByName("hips");
    if (!torso || !leftLeg || !hips) throw new Error("squelette incomplet");
    const torsoAngles: number[] = [];
    for (let frame = 0; frame < 120; frame++) {
      studio.update(1 / 60, frame / 60);
      torsoAngles.push(torso.rotation.x);
      // Jambe gardée verticale dans le monde : la rotation du bassin est compensée.
      expect(Math.abs(hips.rotation.z + leftLeg.rotation.z)).toBeLessThan(1e-9);
      // Pas de pas de marche.
      expect(Math.abs(leftLeg.rotation.x)).toBeLessThan(1e-9);
    }
    expect(Math.max(...torsoAngles) - Math.min(...torsoAngles)).toBeGreaterThan(0.005);
    studio.dispose();
  });

  it("le plateau tourne tout seul, et le glisser tourne l'agent", () => {
    const studio = new AvatarStudio(draft());
    const turntable = avatarRoot(studio).parent;
    if (!turntable) throw new Error("plateau absent");
    for (let frame = 0; frame < 120; frame++) studio.update(1 / 60, frame / 60);
    const spun = turntable.rotation.y;
    expect(spun).toBeGreaterThan(0);

    studio.setDragRotation(-1);
    for (let frame = 120; frame < 240; frame++) studio.update(1 / 60, frame / 60);
    // Rotation ramenée dans [0, 2π) : on compare l'écart angulaire.
    const delta = Math.atan2(Math.sin(turntable.rotation.y - spun), Math.cos(turntable.rotation.y - spun));
    expect(delta).toBeLessThan(-0.8);
    studio.dispose();
  });

  it("une config qui ne se construit pas : le studio affiche l'agent par défaut au lieu d'échouer", () => {
    rigFailures.when = (config) => config.hairStyle === "afro";
    const studio = new AvatarStudio(draft({ hairStyle: "afro" }));
    expect(avatarRoot(studio)).toBeDefined();
    // Le créateur peut ensuite proposer un autre agent : le studio le construit normalement.
    const root = avatarRoot(studio);
    studio.setAvatar(draft({ hairStyle: "bun" }));
    expect(avatarRoot(studio)).not.toBe(root);
    studio.dispose();
  });

  it("si même l'agent par défaut échoue (canvas indisponible), le constructeur lève une exception", () => {
    rigFailures.when = () => true;
    expect(() => new AvatarStudio(draft({ hairStyle: "afro" }))).toThrow("échec simulé");
  });

  it("dispose est idempotent et neutralise les appels suivants", () => {
    const studio = new AvatarStudio(draft());
    studio.dispose();
    expect(() => studio.dispose()).not.toThrow();
    expect(() => studio.update(0.016, 1)).not.toThrow();
    expect(() => studio.setAvatar(draft({ hairStyle: "afro" }))).not.toThrow();
    expect(studio.scene.children).toHaveLength(0);
  });
});

describe("AvatarStudio : glisser dans le sélecteur de couleur", () => {
  const PAINT_FIELDS = ["skinTone", "hairColor", "eyeColor", "topColor", "topAccent", "bottomColor", "shoesColor", "accessoryColor"] as const;
  // Tenues variées : chaque matériau dérivé (ombres des poches, revers du jean, gele, gilet, sangles) est couvert.
  // L'agent par défaut partage une même couleur entre accent, accessoire et pièces métalliques : piège classique.
  const outfits: AvatarConfig[] = [
    draft(),
    draft({ top: "boubou", topPattern: "ankara", bottom: "jeans", hairStyle: "gele", accessory: "bag", shoes: "sneakers" }),
    draft({ top: "hoodie", bottom: "skirt", hairStyle: "afro", accessory: "cap", shoes: "sandals", build: "slim" }),
    draft({ top: "jacket", hairStyle: "long", accessory: "glasses", bottomColor: "#1a1f25" }),
    draft({ top: "tshirt", hairStyle: "locs", accessory: "headset", bottom: "jeans", build: "strong" }),
  ];

  function avatarRoot(studio: AvatarStudio): THREE.Object3D {
    const root = studio.scene.getObjectByName("root");
    if (!root) throw new Error("avatar absent du studio");
    return root;
  }

  /** Couleur (r, g, b linéaires) du matériau de chaque mesh, dans l'ordre de parcours. */
  function meshColors(root: THREE.Object3D): number[] {
    const colors: number[] = [];
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh) || Array.isArray(object.material)) return;
      const material: unknown = object.material;
      if (material instanceof THREE.MeshStandardMaterial) colors.push(material.color.r, material.color.g, material.color.b);
    });
    return colors;
  }

  function clock(studio: AvatarStudio): (seconds?: number) => void {
    let elapsed = 0;
    return (seconds = 1 / 60) => {
      for (let step = 0; step < Math.round(seconds * 60); step++) {
        elapsed += 1 / 60;
        studio.update(1 / 60, elapsed);
      }
    };
  }

  it("pendant le glisser, repeint en place à l'identique d'une reconstruction ; au repos, reconstruit une fois", () => {
    for (const outfit of outfits) {
      for (const field of PAINT_FIELDS) {
        const studio = new AvatarStudio(outfit);
        const advance = clock(studio);
        // Premier événement : rien ne le distingue d'un clic, reconstruction exacte.
        studio.setAvatar({ ...outfit, [field]: "#5a3d8f" });
        const dragged = avatarRoot(studio);
        for (const color of ["#c0ffee", "#10a050", "#f0e0d0"]) {
          advance();
          studio.setAvatar({ ...outfit, [field]: color });
        }
        expect(avatarRoot(studio), `${field} : pas de reconstruction pendant le glisser`).toBe(dragged);
        const reference = createAvatarRig({ ...outfit, [field]: "#f0e0d0" });
        const expected = meshColors(reference.rig.root);
        const actual = meshColors(dragged);
        expect(actual).toHaveLength(expected.length);
        actual.forEach((value, index) => expect(Math.abs(value - (expected[index] ?? Number.NaN)), `${outfit.top}/${field} #${index}`).toBeLessThan(1e-9));
        reference.dispose();

        // Le joueur lâche le sélecteur : une reconstruction exacte (textures du visage et du tissu).
        advance(0.5);
        const settled = avatarRoot(studio);
        expect(settled).not.toBe(dragged);
        advance(1);
        expect(avatarRoot(studio)).toBe(settled);
        studio.dispose();
      }
    }
  });

  it("un clic sur une pastille, après une pause, reconstruit tout de suite", () => {
    const studio = new AvatarStudio(draft());
    const advance = clock(studio);
    studio.setAvatar(draft({ hairColor: "#aa7733" }));
    const first = avatarRoot(studio);
    advance(1);
    studio.setAvatar(draft({ hairColor: "#335577" }));
    expect(avatarRoot(studio)).not.toBe(first);
    studio.dispose();
  });

  it("changer un autre réglage pendant le glisser reconstruit l'agent exact, sans reconstruction différée", () => {
    const studio = new AvatarStudio(draft());
    const advance = clock(studio);
    studio.setAvatar(draft({ topColor: "#aa3344" }));
    advance();
    studio.setAvatar(draft({ topColor: "#bb4455" }));
    advance();
    studio.setAvatar(draft({ topColor: "#bb4455", hairStyle: "afro" }));
    const rebuilt = avatarRoot(studio);
    advance(1);
    expect(avatarRoot(studio)).toBe(rebuilt);
    studio.dispose();
  });

  it("si la reconstruction au repos échoue, l'agent repeint reste affiché et rien n'est retenté à chaque image", () => {
    const studio = new AvatarStudio(draft());
    const advance = clock(studio);
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    studio.setAvatar(draft({ skinTone: "#8d5524" }));
    advance();
    studio.setAvatar(draft({ skinTone: "#9d6534" }));
    const painted = avatarRoot(studio);
    rigFailures.when = () => true;
    advance(1);
    expect(avatarRoot(studio)).toBe(painted);
    expect(errors).toHaveBeenCalledTimes(1);
    errors.mockRestore();
    studio.dispose();
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
    const { creator, byText, onChange, onSave, status } = setup(draft({ visorColor: "#ff2d2d", hairStyle: "afro" }));
    creator.open();
    expect(onChange.mock.calls[0]?.[0].visorColor).toBe(DEFAULT_AVATAR.visorColor);
    expect(status()).toContain("optiques");
    byText("Valider l'agent").click();
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({ visorColor: DEFAULT_AVATAR.visorColor, hairStyle: "afro" });
  });

  it("Valider envoie d'abord l'aperçu encore en attente, puis la config", () => {
    const { creator, picker, byText, onChange, onSave } = setup();
    creator.open();
    onChange.mockClear();
    const top = picker("Couleur principale");
    top.value = "#123456";
    top.dispatchEvent(new FakeEvent("input"));
    byText("Valider l'agent").click();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0]?.[0].topColor).toBe("#123456");
    // L'aperçu déjà envoyé n'est pas renvoyé à l'image suivante (seules les vignettes de motif s'y repeignent).
    runFrames();
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
