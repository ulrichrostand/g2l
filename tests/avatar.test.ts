import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AVATAR_FIELDS,
  AVATAR_OPTIONS,
  CLOTH_COLORS,
  DEFAULT_AVATAR,
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
import { acquireFaceTexture, releaseAvatarTexture } from "../src/avatar/avatarTextures";
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

/** Sauvegarde complète de l'ancien agent stylisé (17 champs, sans `body` ni `beard`). */
const LEGACY_SAVE = {
  skinTone: "#5C3A28",
  eyeColor: "#3b2416",
  hairStyle: "afro",
  hairColor: "#141110",
  build: "strong",
  height: 1.05,
  top: "boubou",
  topColor: "#13865a",
  topPattern: "ankara",
  topAccent: "#f2b318",
  bottom: "skirt",
  bottomColor: "#1f3157",
  shoes: "sandals",
  shoesColor: "#6b4226",
  accessory: "cap",
  accessoryColor: "#c62f2f",
  visorColor: "#3fe0ff",
} as const;

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

function materialsOf(root: THREE.Object3D): Set<THREE.Material> {
  const materials = new Set<THREE.Material>();
  for (const mesh of meshesOf(root)) for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) materials.add(material);
  return materials;
}

/** Le matériau lumineux (optiques, bobine) : seul à être fortement émissif. */
function glowOf(root: THREE.Object3D): THREE.MeshStandardMaterial | undefined {
  return [...materialsOf(root)].find((material): material is THREE.MeshStandardMaterial => material instanceof THREE.MeshStandardMaterial && material.emissiveIntensity > 1);
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

function boundsOf(root: THREE.Object3D): THREE.Box3 {
  root.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(root);
}

/** Faux contexte 2D : absorbe les appels de dessin, pour faire tourner le cache de textures sous Node. */
function recordingContext(): CanvasRenderingContext2D {
  const gradient = { addColorStop: () => undefined };
  const context = new Proxy({} as Record<string | symbol, unknown>, {
    get(_target, property) {
      if (property === "createRadialGradient" || property === "createLinearGradient") return () => gradient;
      return () => undefined;
    },
    set: () => true,
  });
  return context as unknown as CanvasRenderingContext2D;
}

describe("parseAvatarConfig", () => {
  it("accepte l'avatar par défaut et en renvoie une copie", () => {
    const parsed = parseAvatarConfig(DEFAULT_AVATAR);
    expect(parsed).toEqual(DEFAULT_AVATAR);
    expect(parsed).not.toBe(DEFAULT_AVATAR);
  });

  it("accepte les deux silhouettes, toutes les carrures et toutes les coupes", () => {
    for (const { value: body } of AVATAR_OPTIONS.body) {
      for (const { value: build } of AVATAR_OPTIONS.build) {
        for (const { value: hairStyle } of AVATAR_OPTIONS.hairStyle) {
          const config = withDefault({ body, build, hairStyle });
          expect(parseAvatarConfig(config)).toEqual(config);
        }
      }
    }
  });

  it("normalise les couleurs en minuscules et accepte les bornes de taille", () => {
    const parsed = parseAvatarConfig(withDefault({ skinTone: "#AB12CD", visorColor: "#3FE0FF", height: HEIGHT_RANGE.min }));
    expect(parsed?.skinTone).toBe("#ab12cd");
    expect(parsed?.visorColor).toBe("#3fe0ff");
    expect(parsed?.height).toBe(HEIGHT_RANGE.min);
    expect(parseAvatarConfig(withDefault({ height: HEIGHT_RANGE.max }))?.height).toBe(HEIGHT_RANGE.max);
  });

  it.each<[string, Record<string, unknown>]>([
    ["body inconnu", { body: "robot" }],
    ["build inconnu", { build: "giant" }],
    ["taille trop petite", { height: HEIGHT_RANGE.min - 0.01 }],
    ["taille trop grande", { height: HEIGHT_RANGE.max + 0.01 }],
    ["taille non finie", { height: Number.NaN }],
    ["taille en texte", { height: "1" }],
    ["peau courte", { skinTone: "#fff" }],
    ["peau non hexadécimale", { skinTone: "#zzzzzz" }],
    ["coupe supprimée sur une config récente", { hairStyle: "afro" }],
    ["coupe inconnue", { hairStyle: "crête" }],
    ["barbe non booléenne", { beard: "yes" }],
    ["barbe absente", { beard: undefined }],
    ["cheveux invalides", { hairColor: 42 }],
    ["haut invalide", { topColor: "red" }],
    ["accent invalide", { topAccent: null }],
    ["bas invalide", { bottomColor: "#1234567" }],
    ["chaussures invalides", { shoesColor: "" }],
    ["optiques invalides", { visorColor: "#12345g" }],
  ])("rejette un seul champ invalide : %s", (_label, override) => {
    expect(parseAvatarConfig({ ...DEFAULT_AVATAR, ...override })).toBeNull();
  });

  it("rejette ce qui n'est pas un objet simple, ou un champ manquant", () => {
    for (const candidate of [null, undefined, 42, "avatar", [], [DEFAULT_AVATAR]]) expect(parseAvatarConfig(candidate)).toBeNull();
    const { visorColor: _visor, ...withoutVisor } = DEFAULT_AVATAR;
    expect(parseAvatarConfig(withoutVisor)).toBeNull();
  });

  it("ignore les clés en trop : seule la liste officielle des champs survit", () => {
    const parsed = parseAvatarConfig({ ...DEFAULT_AVATAR, isAdmin: true, eyeColor: "#ffffff" });
    expect(Object.keys(parsed ?? {}).sort()).toEqual([...AVATAR_FIELDS].sort());
  });

  it("une clé __proto__ injectée reste sans effet", () => {
    const injected = JSON.parse(`{"__proto__": {"polluted": true}, ${JSON.stringify(DEFAULT_AVATAR).slice(1)}`) as unknown;
    const parsed = parseAvatarConfig(injected);
    expect(parsed).toEqual(DEFAULT_AVATAR);
    expect(Object.hasOwn(parsed ?? {}, "polluted")).toBe(false);
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
  });

  it("refuse des champs seulement hérités du prototype", () => {
    expect(parseAvatarConfig(Object.create(DEFAULT_AVATAR))).toBeNull();
    // Même un `body` hérité ne fait pas passer l'objet pour une ancienne sauvegarde valide.
    const { body: _body, ...rest } = DEFAULT_AVATAR;
    expect(parseAvatarConfig(Object.assign(Object.create({ body: "female" }), rest))).toEqual(withDefault({}));
  });

  it("force la barbe à false pour la silhouette féminine, la garde pour la masculine", () => {
    expect(parseAvatarConfig(withDefault({ body: "female", beard: true }))?.beard).toBe(false);
    expect(parseAvatarConfig(withDefault({ body: "male", beard: true }))?.beard).toBe(true);
  });
});

describe("migration des sauvegardes de l'ancien agent", () => {
  it("convertit une sauvegarde complète : couleurs reprises, vêtements spécifiques ignorés", () => {
    const parsed = parseAvatarConfig(LEGACY_SAVE);
    expect(parsed).toEqual({
      body: "male",
      build: "strong",
      height: 1.05,
      skinTone: "#5c3a28",
      hairStyle: "short",
      beard: false,
      hairColor: "#141110",
      topColor: "#13865a",
      topAccent: "#f2b318",
      bottomColor: "#1f3157",
      shoesColor: "#6b4226",
      visorColor: "#3fe0ff",
    });
  });

  it.each([
    ["afro", "short"],
    ["braids", "long"],
    ["locs", "long"],
    ["gele", "bun"],
    ["mohawk", "buzz"],
    ["buzz", "buzz"],
    ["short", "short"],
    ["long", "long"],
    ["bun", "bun"],
    ["bald", "bald"],
  ])("ramène la coupe %s vers %s", (legacyStyle, expected) => {
    expect(parseAvatarConfig({ ...LEGACY_SAVE, hairStyle: legacyStyle })?.hairStyle).toBe(expected);
  });

  it("rejette une ancienne sauvegarde à la coupe inconnue ou héritée du prototype", () => {
    expect(parseAvatarConfig({ ...LEGACY_SAVE, hairStyle: "crête" })).toBeNull();
    expect(parseAvatarConfig({ ...LEGACY_SAVE, hairStyle: "toString" })).toBeNull();
    expect(parseAvatarConfig({ ...LEGACY_SAVE, hairStyle: "__proto__" })).toBeNull();
  });

  it("rejette une ancienne sauvegarde dont une couleur reprise est invalide", () => {
    expect(parseAvatarConfig({ ...LEGACY_SAVE, topColor: "vert" })).toBeNull();
  });
});

describe("randomAvatar", () => {
  it("est toujours valide, cohérent et canonique sur de nombreuses graines", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const avatar = randomAvatar(seeded(seed));
      expect(parseAvatarConfig(avatar), `graine ${seed}`).toEqual(avatar);
      expect(avatar.topAccent).not.toBe(avatar.topColor);
      if (avatar.body === "female") expect(avatar.beard).toBe(false);
    }
  });

  it("est reproductible avec la même graine", () => {
    expect(randomAvatar(seeded(42))).toEqual(randomAvatar(seeded(42)));
  });

  it("varie et couvre toutes les silhouettes, carrures et coupes", () => {
    const random = seeded(7);
    const avatars = Array.from({ length: 400 }, () => randomAvatar(random));
    for (const field of ["body", "build", "hairStyle"] as const) {
      const seen = new Set(avatars.map((avatar) => avatar[field]));
      expect(seen.size, field).toBe(AVATAR_OPTIONS[field].length);
    }
    expect(avatars.some((avatar) => avatar.beard)).toBe(true);
  });

  it("reste valide même avec un générateur défaillant (1 ou NaN)", () => {
    for (const broken of [() => 1, () => Number.NaN]) {
      const avatar = randomAvatar(broken);
      expect(parseAvatarConfig(avatar)).toEqual(avatar);
      expect(avatar.topAccent).not.toBe(avatar.topColor);
    }
  });
});

describe("options et palettes", () => {
  it("a des palettes valides, sans doublon, avec au moins 10 teintes de peau", () => {
    expect(SKIN_TONES.length).toBeGreaterThanOrEqual(10);
    for (const palette of [SKIN_TONES, HAIR_COLORS, CLOTH_COLORS, VISOR_COLORS]) {
      const values = palette.map((preset) => preset.value);
      expect(new Set(values).size).toBe(values.length);
      for (const value of values) expect(value).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("compare deux avatars champ par champ", () => {
    expect(isSameAvatar(DEFAULT_AVATAR, withDefault({}))).toBe(true);
    for (const field of AVATAR_FIELDS) {
      const changed = { ...DEFAULT_AVATAR, [field]: field === "height" ? 1.05 : field === "beard" ? true : field === "body" ? "female" : field === "build" ? "slim" : field === "hairStyle" ? "long" : "#010203" } as AvatarConfig;
      expect(isSameAvatar(DEFAULT_AVATAR, changed), field).toBe(false);
    }
  });
});

describe("texture du visage", () => {
  it("n'est pas créée hors navigateur", () => {
    expect(acquireFaceTexture(DEFAULT_AVATAR)).toBeNull();
    expect(() => releaseAvatarTexture(null)).not.toThrow();
  });
});

describe("texture du visage partagée : retour au cache", () => {
  // Faux document : le cache ne travaille qu'avec un canvas, le dessin part dans un contexte inerte.
  beforeEach(() => {
    vi.stubGlobal("document", { createElement: () => ({ width: 0, height: 0, getContext: () => recordingContext() }) });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function faceTexturesOf(root: THREE.Object3D): Set<THREE.Texture> {
    const textures = new Set<THREE.Texture>();
    for (const material of materialsOf(root)) if (material instanceof THREE.MeshStandardMaterial && material.map) textures.add(material.map);
    return textures;
  }

  /** Ce que fait disposeScene en fin de mission : libérer les matériaux de la scène sans passer par AvatarModel.dispose. */
  function disposeMaterialsLikeScene(root: THREE.Object3D): void {
    for (const material of materialsOf(root)) material.dispose();
  }

  /** Fait défiler assez de visages inutilisés pour pousser les plus anciens hors de la réserve du cache. */
  function churnIdleTextures(batch: number): void {
    for (let index = 0; index < 20; index++) {
      const skinTone = `#${batch.toString(16).padStart(2, "0")}${index.toString(16).padStart(2, "0")}80`;
      releaseAvatarTexture(acquireFaceTexture({ skinTone, hairColor: "#ffffff" }));
    }
  }

  it("partage le visage entre deux agents de mêmes couleurs, pas entre deux peaux différentes", () => {
    const first = acquireFaceTexture(DEFAULT_AVATAR);
    const same = acquireFaceTexture(withDefault({ topColor: "#c62f2f", hairStyle: "long" }));
    const other = acquireFaceTexture(withDefault({ skinTone: "#f3d5b8" }));
    expect(first).not.toBeNull();
    expect(same).toBe(first);
    expect(other).not.toBe(first);
    for (const texture of [first, same, other]) releaseAvatarTexture(texture);
  });

  it("rend le visage au cache quand la scène libère les matériaux, sans dispose() explicite (fin de mission)", () => {
    const config = withDefault({ skinTone: "#5a3a2a", hairColor: "#7a3420" });
    const model = createAvatarRig(config);
    const textures = faceTexturesOf(model.rig.root);
    expect(textures.size).toBe(1);
    const evicted = new Set<THREE.Texture>();
    for (const texture of textures) texture.addEventListener("dispose", () => evicted.add(texture));

    disposeMaterialsLikeScene(model.rig.root);
    churnIdleTextures(1);
    // Plus aucun avatar ne s'en sert : elle sort du cache comme n'importe quelle texture inutilisée.
    expect(evicted.size).toBe(1);
    const face = acquireFaceTexture(config);
    expect(face).not.toBeNull();
    expect(textures.has(face as THREE.Texture)).toBe(false);
    releaseAvatarTexture(face);
  });

  it("ne rend le visage qu'une fois, même libéré par la scène puis par dispose()", () => {
    const config = withDefault({ skinTone: "#8a5a3a", hairColor: "#c9a25a" });
    const leaving = createAvatarRig(config);
    const staying = createAvatarRig(config);
    const textures = faceTexturesOf(staying.rig.root);
    expect(textures.size).toBe(1);
    for (const texture of faceTexturesOf(leaving.rig.root)) expect(textures.has(texture)).toBe(true);
    const evicted = new Set<THREE.Texture>();
    for (const texture of textures) texture.addEventListener("dispose", () => evicted.add(texture));

    disposeMaterialsLikeScene(leaving.rig.root);
    leaving.dispose();
    leaving.dispose();
    churnIdleTextures(2);
    // L'autre avatar s'en sert encore : un double retour au cache l'aurait libérée sous ses pieds.
    expect(evicted.size).toBe(0);

    staying.dispose();
    churnIdleTextures(3);
    expect(evicted.size).toBe(1);
  });
});

describe("createAvatarRig (agent de repli)", () => {
  const variants: AvatarConfig[] = [
    DEFAULT_AVATAR,
    ...AVATAR_OPTIONS.build.map(({ value }) => withDefault({ build: value })),
    ...AVATAR_OPTIONS.hairStyle.map(({ value }) => withDefault({ hairStyle: value })),
    withDefault({ body: "female", hairStyle: "long", build: "slim" }),
    withDefault({ body: "female", hairStyle: "bun", build: "strong" }),
    withDefault({ beard: true, hairStyle: "bald", build: "strong" }),
    withDefault({ height: HEIGHT_RANGE.min, build: "slim" }),
    withDefault({ height: HEIGHT_RANGE.max, build: "strong" }),
  ];

  it.each(variants.map((config) => [`${config.body}/${config.build}/${config.hairStyle}/${config.height}`, config] as const))("construit, s'anime et se libère : %s", (_label, config) => {
    const model = createAvatarRig(config);
    expectSameSkeleton(model.rig, createRigSkeleton(model.rig.rightArm.position.x));
    expect(model.rig.leftArm.position.x).toBe(-model.rig.rightArm.position.x);
    expect(model.rig.root.scale.toArray()).toEqual([config.height, config.height, config.height]);

    const meshes = meshesOf(model.rig.root);
    expect(meshes.length).toBeGreaterThanOrEqual(20);
    expect(meshes.length).toBeLessThanOrEqual(40);
    // Les semelles touchent le sol : ni flottement ni pieds enfoncés.
    expect(boundsOf(model.rig.root).min.y).toBeCloseTo(0, 2);

    poseRig(model.rig, 1.3, 1, 0.5, 1);
    expect(model.rig.rightArm.rotation.x).toBeCloseTo(-Math.PI / 2);
    expect(model.rig.leftLeg.rotation.x).not.toBe(0);

    model.dispose();
    expect(() => model.dispose()).not.toThrow();
  });

  it("a une hauteur proportionnelle au facteur de taille", () => {
    const heightOf = (height: number): number => {
      const model = createAvatarRig(withDefault({ height }));
      const bounds = boundsOf(model.rig.root);
      model.dispose();
      return bounds.max.y - bounds.min.y;
    };
    const reference = heightOf(1);
    expect(reference).toBeGreaterThan(1);
    expect(heightOf(HEIGHT_RANGE.min) / reference).toBeCloseTo(HEIGHT_RANGE.min, 5);
    expect(heightOf(HEIGHT_RANGE.max) / reference).toBeCloseTo(HEIGHT_RANGE.max, 5);
  });

  it("élargit les épaules avec la carrure", () => {
    const shoulders = AVATAR_OPTIONS.build.map(({ value }) => {
      const model = createAvatarRig(withDefault({ build: value }));
      model.dispose();
      return model.rig.rightArm.position.x;
    });
    expect([...shoulders].sort((first, second) => first - second)).toEqual(shoulders);
    expect(new Set(shoulders).size).toBe(shoulders.length);
  });

  it("tourne vers l'extérieur les faces et les normales des surfaces au tour (jambes, manches, torse)", () => {
    for (const config of variants) {
      const model = createAvatarRig(config);
      const lathes = meshesOf(model.rig.root).filter((mesh) => mesh.geometry instanceof THREE.LatheGeometry);
      // Torse, bassin, deux jambes, deux manches : sinon le test ne vérifierait plus rien.
      expect(lathes.length).toBe(6);
      for (const mesh of lathes) {
        const facing = latheFacing(mesh.geometry);
        const label = `${config.build} : ${mesh.parent?.name ?? "?"}`;
        expect(facing.outward, label).toBeGreaterThan(0);
        expect(facing.inward, label).toBe(0);
        expect(facing.normalsAgainstFaces, label).toBe(0);
      }
      model.dispose();
    }
  });

  it("habille l'agent aux couleurs de la config : gilet, chemise, pantalon, rangers, peau, cheveux", () => {
    const config = withDefault({ topColor: "#c62f2f", topAccent: "#1fa5a0", bottomColor: "#4b5a32", shoesColor: "#6b4226", skinTone: "#3b2219", hairColor: "#c9a25a", hairStyle: "short" });
    const model = createAvatarRig(config);
    const colors = new Set([...materialsOf(model.rig.root)].filter((material) => material instanceof THREE.MeshStandardMaterial).map((material) => `#${material.color.getHexString()}`));
    for (const field of ["topColor", "topAccent", "bottomColor", "shoesColor", "skinTone", "hairColor"] as const) expect(colors.has(config[field]), field).toBe(true);
    model.dispose();
  });

  it("n'a pas de cheveux quand l'agent est chauve", () => {
    const hairColor = "#d9659b";
    const colorsOf = (config: AvatarConfig): string[] => {
      const model = createAvatarRig(config);
      const colors = [...materialsOf(model.rig.root)].filter((material) => material instanceof THREE.MeshStandardMaterial).map((material) => `#${material.color.getHexString()}`);
      model.dispose();
      return colors;
    };
    expect(colorsOf(withDefault({ hairStyle: "bald", hairColor }))).not.toContain(hairColor);
    expect(colorsOf(withDefault({ hairStyle: "buzz", hairColor }))).toContain(hairColor);
  });

  it("garde l'identité de Spectre : optiques couleur visière et pistolet lumineux dans la main droite", () => {
    const model = createAvatarRig(withDefault({ visorColor: "#3fe0ff" }));
    const glow = glowOf(model.rig.root);
    expect(glow?.emissive.getHexString()).toBe(new THREE.Color("#3fe0ff").getHexString());
    expect(meshesOf(model.rig.root).filter((mesh) => mesh.material === glow).length).toBe(2);
    const pistol = model.rig.rightArm.children.find((child) => child instanceof THREE.Group);
    expect(pistol?.position.toArray()).toEqual([0, -0.52, 0.04]);
    expect(meshesOf(pistol as THREE.Object3D).some((mesh) => mesh.material === glow)).toBe(true);
    model.dispose();
  });

  it("garde les proportions de l'agent d'origine en carrure moyenne", () => {
    const model = createAvatarRig(DEFAULT_AVATAR);
    expectSameSkeleton(model.rig, createRigSkeleton());
    expect(model.rig.rightArm.position.x).toBe(AGENT_SHOULDER_WIDTH);
    model.dispose();
  });

  it("libère toutes les géométries et tous les matériaux créés", () => {
    const model = createAvatarRig(withDefault({ hairStyle: "bun", body: "female", build: "strong" }));
    const resources = new Set<THREE.BufferGeometry | THREE.Material>(materialsOf(model.rig.root));
    for (const mesh of meshesOf(model.rig.root)) resources.add(mesh.geometry);
    const released = new Set<unknown>();
    for (const resource of resources) resource.addEventListener("dispose", () => released.add(resource));
    model.dispose();
    expect(released.size).toBe(resources.size);
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
    expect(boundsOf(first.rig.root).min.y).toBeCloseTo(0, 2);
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
