import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  randomAvatar,
  SKIN_TONES,
  VISOR_COLORS,
  type AvatarConfig,
} from "../src/avatar/avatarConfig";
import { createAvatarRig } from "../src/avatar/avatarModel";
import {
  acquireFabricTexture,
  acquireFaceTexture,
  drawFabricPattern,
  drawFace,
  fabricTextureKey,
  faceTextureKey,
  releaseAvatarTexture,
} from "../src/avatar/avatarTextures";
import { SeededRandom } from "../src/core/rng";
import { AGENT_SHOULDER_WIDTH, createRigSkeleton, createSentinelRig, poseRig, SENTINEL_SHOULDER_WIDTH, type HumanoidRig } from "../src/entities/rig";

const PIVOTS = ["root", "hips", "torso", "head", "leftArm", "rightArm", "leftLeg", "rightLeg"] as const;
const EXPECTED_PARENT: Record<(typeof PIVOTS)[number], (typeof PIVOTS)[number] | null> = {
  root: null,
  hips: "root",
  torso: "hips",
  head: "torso",
  leftArm: "torso",
  rightArm: "torso",
  leftLeg: "hips",
  rightLeg: "hips",
};

function seeded(seed: number): () => number {
  const random = new SeededRandom(seed);
  return () => random.next();
}

function withDefault(overrides: Partial<AvatarConfig>): AvatarConfig {
  return { ...DEFAULT_AVATAR, ...overrides };
}

/** Même hiérarchie et mêmes positions de pivots que le squelette de référence : poseRig anime pareil. */
function expectSameSkeleton(rig: HumanoidRig, reference: HumanoidRig): void {
  for (const name of PIVOTS) {
    const parentName = EXPECTED_PARENT[name];
    if (parentName) expect(rig[name].parent).toBe(rig[parentName]);
    expect(rig[name].position.toArray()).toEqual(reference[name].position.toArray());
    expect(rig[name].name).toBe(reference[name].name);
  }
}

function meshesOf(root: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) meshes.push(object);
  });
  return meshes;
}

interface LatheFacing {
  outward: number;
  inward: number;
  /** Triangles dont les normales stockées contredisent le sens des faces (éclairage inversé). */
  normalsAgainstFaces: number;
}

/**
 * Sens des triangles d'une surface au tour, dans son repère local (l'axe du tour est l'axe Y).
 * Une face est « extérieure » si son produit vectoriel (b-a)×(c-a) s'éloigne de l'axe : c'est la seule
 * face visible avec un matériau FrontSide. Les triangles dégénérés (aux pôles) sont ignorés.
 */
function latheFacing(geometry: THREE.BufferGeometry): LatheFacing {
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const index = geometry.getIndex();
  const corners = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] as const;
  const [first, second, third] = corners;
  const edge = new THREE.Vector3();
  const faceDirection = new THREE.Vector3();
  const radial = new THREE.Vector3();
  const summedNormals = new THREE.Vector3();
  const vertexNormal = new THREE.Vector3();
  const facing: LatheFacing = { outward: 0, inward: 0, normalsAgainstFaces: 0 };
  const triangleCount = (index ? index.count : position.count) / 3;
  for (let triangle = 0; triangle < triangleCount; triangle++) {
    summedNormals.set(0, 0, 0);
    corners.forEach((corner, cornerIndex) => {
      const vertex = index ? index.getX(triangle * 3 + cornerIndex) : triangle * 3 + cornerIndex;
      corner.fromBufferAttribute(position, vertex);
      summedNormals.add(vertexNormal.fromBufferAttribute(normal, vertex));
    });
    faceDirection.subVectors(second, first).cross(edge.subVectors(third, first));
    if (faceDirection.lengthSq() < 1e-14) continue;
    radial.addVectors(first, second).add(third).setY(0);
    if (faceDirection.dot(radial) > 0) facing.outward++;
    else facing.inward++;
    if (faceDirection.dot(summedNormals) <= 0) facing.normalsAgainstFaces++;
  }
  return facing;
}

/** Bas du modèle au repos : les semelles doivent toucher le sol (y = 0), ni flotter ni s'enfoncer. */
function lowestPoint(root: THREE.Object3D): number {
  root.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(root).min.y;
}

/** Faux contexte 2D : enregistre les appels de dessin pour vérifier qu'ils ne plantent pas et sont déterministes. */
function recordingContext(): { context: CanvasRenderingContext2D; calls: string[] } {
  const calls: string[] = [];
  const gradient = { addColorStop: (offset: number, color: string) => calls.push(`stop:${offset}:${color}`) };
  const target: Record<string | symbol, unknown> = {};
  const context = new Proxy(target, {
    get(_target, property) {
      if (property === "createRadialGradient" || property === "createLinearGradient") return () => gradient;
      return (...args: unknown[]) => calls.push(`${String(property)}(${args.join(",")})`);
    },
    set(_target, property, value) {
      calls.push(`${String(property)}=${String(value)}`);
      return true;
    },
  });
  return { context: context as unknown as CanvasRenderingContext2D, calls };
}

describe("parseAvatarConfig", () => {
  it("accepte l'avatar par défaut et en renvoie une copie", () => {
    const parsed = parseAvatarConfig(JSON.parse(JSON.stringify(DEFAULT_AVATAR)));
    expect(parsed).not.toBeNull();
    expect(parsed).not.toBe(DEFAULT_AVATAR);
    expect(isSameAvatar(parsed as AvatarConfig, DEFAULT_AVATAR)).toBe(true);
  });

  it("accepte tout avatar tiré au hasard", () => {
    const random = seeded(2024);
    for (let draw = 0; draw < 300; draw++) {
      const avatar = randomAvatar(random);
      const parsed = parseAvatarConfig(JSON.parse(JSON.stringify(avatar)));
      expect(parsed).not.toBeNull();
      expect(isSameAvatar(parsed as AvatarConfig, avatar)).toBe(true);
    }
  });

  it("normalise les couleurs en minuscules et accepte les bornes de taille", () => {
    const parsed = parseAvatarConfig({ ...DEFAULT_AVATAR, skinTone: "#7D5036", height: HEIGHT_RANGE.max });
    expect(parsed?.skinTone).toBe("#7d5036");
    expect(parseAvatarConfig({ ...DEFAULT_AVATAR, height: HEIGHT_RANGE.min })).not.toBeNull();
  });

  it.each([
    ["couleur sans dièse", { skinTone: "7d5036" }],
    ["couleur trop courte", { hairColor: "#12345" }],
    ["couleur nommée", { topColor: "red" }],
    ["couleur non hexadécimale", { eyeColor: "#gg0000" }],
    ["couleur en nombre", { visorColor: 0x39ff88 }],
    ["coiffure inconnue", { hairStyle: "perruque" }],
    ["haut inconnu", { top: "armure" }],
    ["motif inconnu", { topPattern: "toString" }],
    ["accessoire inconnu", { accessory: "__proto__" }],
    ["taille trop petite", { height: 0.5 }],
    ["taille trop grande", { height: 1.2 }],
    ["taille NaN", { height: Number.NaN }],
    ["taille infinie", { height: Number.POSITIVE_INFINITY }],
    ["taille en texte", { height: "1" }],
  ])("rejette : %s", (_label, override) => {
    expect(parseAvatarConfig({ ...DEFAULT_AVATAR, ...override })).toBeNull();
  });

  it("rejette ce qui n'est pas un objet simple, ou un champ manquant", () => {
    for (const candidate of [null, undefined, 42, "avatar", [], [DEFAULT_AVATAR], true]) {
      expect(parseAvatarConfig(candidate)).toBeNull();
    }
    const { visorColor: _ignored, ...incomplete } = DEFAULT_AVATAR;
    expect(parseAvatarConfig(incomplete)).toBeNull();
  });

  it("ignore les clés en trop : seule la liste officielle des champs survit", () => {
    const parsed = parseAvatarConfig({ ...DEFAULT_AVATAR, isAdmin: true, script: "alert(1)" });
    expect(parsed).not.toBeNull();
    expect(Object.keys(parsed as AvatarConfig).sort()).toEqual([...AVATAR_FIELDS].sort());
  });

  it("une clé __proto__ injectée reste sans effet", () => {
    const tampered: unknown = JSON.parse(`{"__proto__": {"polluted": true, "build": "slim"}, ${JSON.stringify(DEFAULT_AVATAR).slice(1)}`);
    const parsed = parseAvatarConfig(tampered);
    expect(parsed).not.toBeNull();
    expect(Object.getPrototypeOf(parsed)).toBe(Object.prototype);
    expect((parsed as unknown as Record<string, unknown>).polluted).toBeUndefined();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(parsed?.build).toBe(DEFAULT_AVATAR.build);
  });

  it("refuse des champs seulement hérités du prototype", () => {
    expect(parseAvatarConfig(Object.create(DEFAULT_AVATAR))).toBeNull();
  });
});

describe("randomAvatar", () => {
  it("est déterministe avec une graine", () => {
    const first = Array.from({ length: 20 }, ((random) => () => randomAvatar(random))(seeded(99)));
    const second = Array.from({ length: 20 }, ((random) => () => randomAvatar(random))(seeded(99)));
    first.forEach((avatar, index) => expect(isSameAvatar(avatar, second[index] as AvatarConfig)).toBe(true));
  });

  it("varie et couvre toutes les options", () => {
    const random = seeded(7);
    const avatars = Array.from({ length: 400 }, () => randomAvatar(random));
    const distinct = new Set(avatars.map((avatar) => JSON.stringify(avatar)));
    expect(distinct.size).toBeGreaterThan(390);
    for (const field of ["build", "hairStyle", "top", "topPattern", "bottom", "shoes", "accessory"] as const) {
      const seen = new Set(avatars.map((avatar) => avatar[field]));
      expect([...seen].sort()).toEqual(AVATAR_OPTIONS[field].map((option) => option.value).sort());
    }
    expect(new Set(avatars.map((avatar) => avatar.skinTone)).size).toBe(SKIN_TONES.length);
  });

  it("reste cohérent : accent distinct, pas de casquette sur une coiffure volumineuse", () => {
    const random = seeded(3);
    for (let draw = 0; draw < 400; draw++) {
      const avatar = randomAvatar(random);
      expect(avatar.topAccent).not.toBe(avatar.topColor);
      if (["afro", "bun", "mohawk", "gele"].includes(avatar.hairStyle)) expect(avatar.accessory).not.toBe("cap");
      expect(avatar.height).toBeGreaterThanOrEqual(HEIGHT_RANGE.min);
      expect(avatar.height).toBeLessThanOrEqual(HEIGHT_RANGE.max);
    }
  });

  it("reste valide même avec un générateur défaillant", () => {
    for (const broken of [() => 1, () => 0, () => Number.NaN, () => -3]) {
      expect(parseAvatarConfig(randomAvatar(broken))).not.toBeNull();
    }
  });
});

describe("options et palettes", () => {
  it("propose des libellés français, dont les tenues nigérianes", () => {
    const label = (options: readonly { value: string; label: string }[], value: string): string | undefined =>
      options.find((option) => option.value === value)?.label;
    expect(label(AVATAR_OPTIONS.hairStyle, "gele")).toBe("Gele (foulard)");
    expect(label(AVATAR_OPTIONS.top, "boubou")).toBe("Boubou");
    expect(label(AVATAR_OPTIONS.topPattern, "asooke")).toBe("Aso-oke");
    expect(label(AVATAR_OPTIONS.topPattern, "ankara")).toBe("Ankara (wax)");
  });

  it("a des palettes valides, sans doublon, avec au moins 10 teintes de peau", () => {
    expect(SKIN_TONES.length).toBeGreaterThanOrEqual(10);
    for (const palette of [SKIN_TONES, HAIR_COLORS, EYE_COLORS, CLOTH_COLORS, VISOR_COLORS]) {
      expect(new Set(palette.map((preset) => preset.value)).size).toBe(palette.length);
      for (const preset of palette) {
        expect(preset.value).toMatch(/^#[0-9a-f]{6}$/);
        expect(preset.label.length).toBeGreaterThan(0);
      }
    }
  });

  it("compare deux avatars champ par champ", () => {
    expect(isSameAvatar(DEFAULT_AVATAR, { ...DEFAULT_AVATAR })).toBe(true);
    expect(isSameAvatar(DEFAULT_AVATAR, withDefault({ height: 1.05 }))).toBe(false);
    expect(isSameAvatar(DEFAULT_AVATAR, withDefault({ visorColor: "#3fe0ff" }))).toBe(false);
  });
});

describe("textures de l'avatar", () => {
  it("ne crée aucune texture hors navigateur", () => {
    expect(acquireFaceTexture(DEFAULT_AVATAR)).toBeNull();
    expect(acquireFabricTexture("ankara", "#f2b318", "#13865a")).toBeNull();
    expect(() => releaseAvatarTexture(null)).not.toThrow();
  });

  it("a des clés de cache distinctes par couleur, et pas de texture pour l'uni", () => {
    expect(fabricTextureKey("plain", "#000000", "#ffffff")).toBeNull();
    expect(fabricTextureKey("ankara", "#000000", "#ffffff")).not.toBe(fabricTextureKey("ankara", "#000000", "#fffffe"));
    expect(faceTextureKey(DEFAULT_AVATAR)).not.toBe(faceTextureKey(withDefault({ eyeColor: "#3f78b5" })));
    // Changer de tenue ne doit pas régénérer le visage.
    expect(faceTextureKey(DEFAULT_AVATAR)).toBe(faceTextureKey(withDefault({ top: "boubou", topColor: "#c62f2f" })));
  });

  it("dessine chaque motif et le visage de façon déterministe", () => {
    for (const { value: pattern } of AVATAR_OPTIONS.topPattern) {
      const first = recordingContext();
      const second = recordingContext();
      drawFabricPattern(first.context, pattern, "#1f3157", "#f2b318");
      drawFabricPattern(second.context, pattern, "#1f3157", "#f2b318");
      expect(first.calls.length).toBeGreaterThan(2);
      expect(first.calls).toEqual(second.calls);
    }
    const face = recordingContext();
    drawFace(face.context, DEFAULT_AVATAR);
    expect(face.calls.some((call) => call.startsWith("arc("))).toBe(true);
    // Couleur invalide (fonction exportée) : du gris plutôt qu'une exception.
    expect(() => drawFace(recordingContext().context, { skinTone: "oups", eyeColor: "#000", hairColor: "" })).not.toThrow();
  });
});

describe("textures partagées : retour au cache", () => {
  // Faux document : le cache ne travaille qu'avec un canvas, le dessin part dans un contexte enregistreur.
  beforeEach(() => {
    vi.stubGlobal("document", { createElement: () => ({ width: 0, height: 0, getContext: () => recordingContext().context }) });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function sharedTexturesOf(root: THREE.Object3D): Set<THREE.Texture> {
    const textures = new Set<THREE.Texture>();
    for (const mesh of meshesOf(root)) {
      if (mesh.material instanceof THREE.MeshStandardMaterial && mesh.material.map) textures.add(mesh.material.map);
    }
    return textures;
  }

  /**
   * Ce que fait disposeScene en fin de mission : libérer les matériaux de la scène sans passer par
   * AvatarModel.dispose. Les textures ne sont volontairement pas libérées ici : seul le cache peut alors le faire.
   */
  function disposeMaterialsLikeScene(root: THREE.Object3D): void {
    const materials = new Set<THREE.Material>();
    for (const mesh of meshesOf(root)) for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) materials.add(material);
    for (const material of materials) material.dispose();
  }

  /** Fait défiler assez de textures inutilisées pour pousser les plus anciennes hors de la réserve du cache. */
  function churnIdleTextures(batch: number): void {
    for (let index = 0; index < 20; index++) {
      const base = `#${batch.toString(16).padStart(2, "0")}${index.toString(16).padStart(2, "0")}80`;
      releaseAvatarTexture(acquireFabricTexture("stripes", base, "#ffffff"));
    }
  }

  it("rend visage et tissu au cache quand la scène libère les matériaux, sans dispose() explicite (fin de mission)", () => {
    const config = withDefault({ topPattern: "ankara", topColor: "#204060", topAccent: "#e0a020", skinTone: "#5a3a2a" });
    const model = createAvatarRig(config);
    const textures = sharedTexturesOf(model.rig.root);
    expect(textures.size).toBe(2);
    const evicted = new Set<THREE.Texture>();
    for (const texture of textures) texture.addEventListener("dispose", () => evicted.add(texture));

    disposeMaterialsLikeScene(model.rig.root);
    churnIdleTextures(1);
    // Plus aucun avatar ne s'en sert : elles sortent du cache comme n'importe quelle texture inutilisée.
    expect(evicted.size).toBe(2);
    const face = acquireFaceTexture(config);
    expect(face).not.toBeNull();
    expect(textures.has(face as THREE.Texture)).toBe(false);
    releaseAvatarTexture(face);
  });

  it("ne rend chaque texture qu'une fois, même libéré par la scène puis par dispose()", () => {
    const config = withDefault({ topPattern: "camo", topColor: "#305020", topAccent: "#a0b070", skinTone: "#8a5a3a" });
    const leaving = createAvatarRig(config);
    const staying = createAvatarRig(config);
    const textures = sharedTexturesOf(staying.rig.root);
    expect(textures.size).toBe(2);
    for (const texture of sharedTexturesOf(leaving.rig.root)) expect(textures.has(texture)).toBe(true);
    const evicted = new Set<THREE.Texture>();
    for (const texture of textures) texture.addEventListener("dispose", () => evicted.add(texture));

    disposeMaterialsLikeScene(leaving.rig.root);
    leaving.dispose();
    leaving.dispose();
    churnIdleTextures(2);
    // L'autre avatar s'en sert encore : un double retour au cache les aurait libérées sous ses pieds.
    expect(evicted.size).toBe(0);

    staying.dispose();
    churnIdleTextures(3);
    expect(evicted.size).toBe(textures.size);
  });
});

describe("createAvatarRig", () => {
  const variants: AvatarConfig[] = [
    ...AVATAR_OPTIONS.build.map(({ value }) => withDefault({ build: value })),
    ...AVATAR_OPTIONS.hairStyle.map(({ value }) => withDefault({ hairStyle: value })),
    ...AVATAR_OPTIONS.hairStyle.map(({ value }) => withDefault({ hairStyle: value, accessory: "cap" })),
    ...AVATAR_OPTIONS.hairStyle.map(({ value }) => withDefault({ hairStyle: value, accessory: "headset" })),
    ...AVATAR_OPTIONS.top.map(({ value }) => withDefault({ top: value })),
    ...AVATAR_OPTIONS.topPattern.map(({ value }) => withDefault({ topPattern: value, top: "boubou" })),
    ...AVATAR_OPTIONS.bottom.map(({ value }) => withDefault({ bottom: value })),
    ...AVATAR_OPTIONS.bottom.map(({ value }) => withDefault({ bottom: value, top: "hoodie" })),
    ...AVATAR_OPTIONS.shoes.map(({ value }) => withDefault({ shoes: value })),
    ...AVATAR_OPTIONS.accessory.map(({ value }) => withDefault({ accessory: value })),
    ...AVATAR_OPTIONS.accessory.map(({ value }) => withDefault({ accessory: value, top: "tactical", build: "strong" })),
    withDefault({ height: HEIGHT_RANGE.min, build: "slim" }),
    withDefault({ height: HEIGHT_RANGE.max, build: "strong" }),
  ];

  it.each(variants.map((config) => [`${config.build}/${config.hairStyle}/${config.top}/${config.topPattern}/${config.bottom}/${config.shoes}/${config.accessory}`, config]))(
    "construit, s'anime et se libère : %s",
    (_label, config) => {
      const model = createAvatarRig(config);
      expectSameSkeleton(model.rig, createRigSkeleton(model.rig.rightArm.position.x));
      expect(model.rig.leftArm.position.x).toBe(-model.rig.rightArm.position.x);
      expect(model.rig.root.scale.toArray()).toEqual([config.height, config.height, config.height]);

      const meshes = meshesOf(model.rig.root);
      expect(meshes.length).toBeGreaterThanOrEqual(20);
      expect(meshes.length).toBeLessThanOrEqual(70);
      expect(meshes.filter((mesh) => mesh.material === model.glow).length).toBeGreaterThanOrEqual(2);
      expect(lowestPoint(model.rig.root)).toBeCloseTo(0, 2);

      poseRig(model.rig, 1.3, 1, 0.5, 1);
      expect(model.rig.rightArm.rotation.x).toBeCloseTo(-Math.PI / 2);
      expect(model.rig.leftLeg.rotation.x).not.toBe(0);

      model.dispose();
      expect(() => model.dispose()).not.toThrow();
    },
  );

  it("tourne vers l'extérieur les faces et les normales des surfaces au tour (jambes, manches, bras, torse)", () => {
    for (const config of variants) {
      const model = createAvatarRig(config);
      const lathes = meshesOf(model.rig.root).filter((mesh) => mesh.geometry instanceof THREE.LatheGeometry);
      // Torse, bassin, deux jambes, deux manches au minimum : sinon le test ne vérifierait plus rien.
      expect(lathes.length).toBeGreaterThanOrEqual(6);
      for (const mesh of lathes) {
        const facing = latheFacing(mesh.geometry);
        const label = `${config.top}/${config.bottom} : ${mesh.parent?.name ?? "?"}`;
        expect(facing.outward, label).toBeGreaterThan(0);
        expect(facing.inward, label).toBe(0);
        expect(facing.normalsAgainstFaces, label).toBe(0);
      }
      model.dispose();
    }
  });

  it("garde l'identité de Spectre : optiques couleur visière et pistolet dans la main droite", () => {
    const model = createAvatarRig(withDefault({ visorColor: "#3fe0ff" }));
    expect(model.glow.emissive.getHexString()).toBe(new THREE.Color("#3fe0ff").getHexString());
    expect(model.glow.emissiveIntensity).toBeCloseTo(2.2);
    const pistol = model.rig.rightArm.children.find((child) => child instanceof THREE.Group);
    expect(pistol?.position.toArray()).toEqual([0, -0.52, 0.04]);
    expect(meshesOf(pistol as THREE.Object3D).some((mesh) => mesh.material === model.glow)).toBe(true);
    model.dispose();
  });

  it("garde les proportions de l'agent d'origine en carrure moyenne", () => {
    const model = createAvatarRig(DEFAULT_AVATAR);
    expectSameSkeleton(model.rig, createRigSkeleton());
    expect(model.rig.rightArm.position.x).toBe(AGENT_SHOULDER_WIDTH);
    model.dispose();
  });

  it("libère toutes les géométries et tous les matériaux créés", () => {
    const model = createAvatarRig(withDefault({ hairStyle: "braids", top: "boubou", accessory: "bag" }));
    const resources = new Set<THREE.BufferGeometry | THREE.Material>();
    for (const mesh of meshesOf(model.rig.root)) {
      resources.add(mesh.geometry);
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) resources.add(material);
    }
    const released = new Set<unknown>();
    for (const resource of resources) resource.addEventListener("dispose", () => released.add(resource));
    model.dispose();
    expect(released.size).toBe(resources.size);
  });

  it("se reconstruit assez vite pour le créateur de personnage", () => {
    const random = seeded(5);
    const configs = Array.from({ length: 30 }, () => randomAvatar(random));
    createAvatarRig(DEFAULT_AVATAR).dispose();
    const started = performance.now();
    for (const config of configs) createAvatarRig(config).dispose();
    const averageMs = (performance.now() - started) / configs.length;
    // Budget visé ~15 ms dans le navigateur ; marge large ici pour ne pas échouer sur une machine chargée.
    expect(averageMs).toBeLessThan(40);
  });
});

describe("createSentinelRig", () => {
  it("habille le squelette commun avec un matériau lumineux propre à chaque sentinelle", () => {
    const first = createSentinelRig();
    const second = createSentinelRig();
    expectSameSkeleton(first.rig, createRigSkeleton(SENTINEL_SHOULDER_WIDTH));
    expect(first.glow).not.toBe(second.glow);
    const firstMeshes = meshesOf(first.rig.root);
    const secondMeshes = meshesOf(second.rig.root);
    expect(firstMeshes.length).toBeLessThanOrEqual(30);
    // Géométries partagées entre sentinelles : une seule copie en mémoire.
    expect(firstMeshes[0]?.geometry).toBe(secondMeshes[0]?.geometry);
    expect(firstMeshes.filter((mesh) => mesh.material === first.glow).length).toBeGreaterThanOrEqual(3);
    expect(secondMeshes.some((mesh) => mesh.material === first.glow)).toBe(false);
    expect(lowestPoint(first.rig.root)).toBeCloseTo(0, 2);
  });

  it("tient son arme dans la main droite et s'anime", () => {
    const { rig, glow } = createSentinelRig();
    const blaster = rig.rightArm.children.find((child) => child instanceof THREE.Group);
    expect(blaster?.position.toArray()).toEqual([0, -0.6, 0.05]);
    expect(meshesOf(blaster as THREE.Object3D).some((mesh) => mesh.material === glow)).toBe(true);
    poseRig(rig, 0.5, 1, 1, 0.5);
    expect(rig.hips.position.y).toBeLessThan(0.655);
  });
});
