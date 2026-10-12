import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { DEFAULT_AVATAR, HEIGHT_RANGE, VISOR_COLORS, type AvatarConfig } from "../src/avatar/avatarConfig";
import { AvatarStudio, type StudioLayout } from "../src/render/avatarStudio";
import {
  applyAvatarField,
  avatarHints,
  CREATOR_TABS,
  detectCreatorLayout,
  dragToRadians,
  formatAgentHeight,
  heightFromSlider,
  isReservedVisorColor,
} from "../src/ui/characterCreator";

function draft(overrides: Partial<AvatarConfig> = {}): AvatarConfig {
  return { ...DEFAULT_AVATAR, ...overrides };
}

describe("detectCreatorLayout", () => {
  it("ordinateur et téléphone couché : panneau à gauche", () => {
    expect(detectCreatorLayout(1920, 1080)).toBe("side");
    expect(detectCreatorLayout(844, 390)).toBe("side");
  });

  it("portrait ou écran étroit : feuille en bas", () => {
    expect(detectCreatorLayout(390, 844)).toBe("bottom");
    expect(detectCreatorLayout(820, 1180)).toBe("bottom");
    expect(detectCreatorLayout(640, 400)).toBe("bottom");
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

  it("laisse passer orange, rose, gris et valeurs invalides (validées ailleurs)", () => {
    expect(isReservedVisorColor("#ff8c1a")).toBe(false);
    expect(isReservedVisorColor("#ff6bc8")).toBe(false);
    expect(isReservedVisorColor("#808080")).toBe(false);
    expect(isReservedVisorColor("#2a0505")).toBe(false);
    expect(isReservedVisorColor("rouge")).toBe(false);
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

  it("dispose est idempotent et neutralise les appels suivants", () => {
    const studio = new AvatarStudio(draft());
    studio.dispose();
    expect(() => studio.dispose()).not.toThrow();
    expect(() => studio.update(0.016, 1)).not.toThrow();
    expect(() => studio.setAvatar(draft({ hairStyle: "afro" }))).not.toThrow();
    expect(studio.scene.children).toHaveLength(0);
  });
});
