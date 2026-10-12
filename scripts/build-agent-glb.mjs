/**
 * Construit public/models/characters/agent.glb, le personnage humain de référence (agent du joueur),
 * à partir des packs CC0 de Quaternius : Universal Base Characters (tête), Modular Character Outfits –
 * Fantasy (vêtements) et Universal Animation Library (animations). Provenance et licences :
 * public/models/characters/README.md.
 *
 * Outil de développement uniquement : le jeu charge le .glb produit avec le GLTFLoader de three.js,
 * sans aucune dépendance supplémentaire à l'exécution.
 *
 * Usage (les paquets sont installés à part pour ne pas alourdir package.json) :
 *   npm i --no-save @gltf-transform/core@4 @gltf-transform/functions@4 @gltf-transform/extensions@4 sharp
 *   node scripts/build-agent-glb.mjs <dossier des sources Quaternius> [sortie.glb]
 * Le dossier source contient base/, outfits/, parts/, hair/, textures/ et gaits.glb (voir le README).
 */
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { compactPrimitive, dedup, mergeDocuments, prune, resample, textureCompress, unpartition } from "@gltf-transform/functions";
import sharp from "sharp";
import path from "node:path";

const [sourceDir, outputPath = "public/models/characters/agent.glb"] = process.argv.slice(2);
if (!sourceDir) {
  console.error("Usage : node scripts/build-agent-glb.mjs <dossier des sources Quaternius> [sortie.glb]");
  process.exit(1);
}

/** Tenue de l'agent : chemise et pantalon « Peasant », gilet sanglé et bottes « Ranger », cheveux ras. */
const BASE_OUTFIT = "outfits/Male_Peasant.gltf";
const REMOVED_BASE_MESHES = new Set(["Male_Peasant_Body", "Male_Peasant_Feet"]);
const EXTRA_PARTS = ["parts/Male_Ranger_Body.gltf", "parts/Male_Ranger_Feet_Boots.gltf", "hair/Hair_Buzzed.gltf"];
const HEAD_SOURCE = "base/Superhero_Male_FullBody.gltf";
/** Le pack gratuit n'a pas de tête seule : on garde du corps complet les triangles portés par la tête et le cou. */
const HEAD_JOINTS = new Set(["Head", "neck_01"]);
const HEAD_WEIGHT_THRESHOLD = 0.5;
/** Seules ces animations servent au jeu : les autres alourdiraient le fichier pour rien. */
const KEPT_CLIPS = new Set([
  "Idle_Loop",
  "Walk_Loop",
  "Jog_Fwd_Loop",
  "Sprint_Loop",
  "Crouch_Idle_Loop",
  "Crouch_Fwd_Loop",
  "Pistol_Idle_Loop",
  "Pistol_Aim_Neutral",
  "Pistol_Shoot",
  "Hit_Chest",
  "Death01",
  "Interact",
]);
/** Seuls le bassin et la racine se déplacent : les autres translations figeraient les longueurs d'os du mannequin. */
const TRANSLATED_JOINTS = new Set(["root", "pelvis"]);
const MAX_TEXTURE_SIZE = 1024;
/** Textures teintées en jeu (vêtements, cheveux) et leur luminosité moyenne une fois neutralisées. */
const TINTABLE_TEXTURES = new Set(["T_Peasant_BaseColor", "T_Ranger_BaseColor", "T_Hair_1_BaseColor"]);
const TINTABLE_MEAN_LUMINANCE = 0.72;

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

async function main() {
  const document = await io.read(path.join(sourceDir, BASE_OUTFIT));
  const root = document.getRoot();
  const baseSkin = root.listSkins()[0];
  if (!baseSkin) throw new Error(`${BASE_OUTFIT} : aucun squelette`);
  const jointsByName = new Map(baseSkin.listJoints().map((joint) => [joint.getName(), joint]));

  for (const node of root.listNodes()) {
    if (node.getMesh() && REMOVED_BASE_MESHES.has(node.getMesh().getName())) node.dispose();
  }

  for (const part of EXTRA_PARTS) await mergeSkinnedPart(document, path.join(sourceDir, part), jointsByName, () => true);
  await mergeSkinnedPart(document, path.join(sourceDir, HEAD_SOURCE), jointsByName, keepHeadOnly);
  await mergeAnimations(document, path.join(sourceDir, "gaits.glb"), jointsByName);

  // Une seule scène : celle de la tenue de base, qui contient désormais toutes les pièces.
  const [mainScene, ...otherScenes] = root.listScenes();
  for (const scene of otherScenes) scene.dispose();
  root.setDefaultScene(mainScene);

  simplifyMaterials(document);
  await neutralizeTintableTextures(document);
  await document.transform(
    resample(),
    dedup(),
    // Chaque document fusionné apporte son tampon : un .glb n'en accepte qu'un.
    unpartition(),
    prune({ keepLeaves: false }),
    textureCompress({ encoder: sharp, targetFormat: "webp", resize: [MAX_TEXTURE_SIZE, MAX_TEXTURE_SIZE], quality: 82 }),
  );
  disposeOrphanAccessors(document);
  await io.write(outputPath, document);
  report(document);
}

/**
 * Vu de dessus à une dizaine de mètres, un personnage occupe une centaine de pixels : les cartes normales et
 * PBR (rugosité, métal, occlusion) n'y changent rien de visible mais triplent le poids du fichier.
 * On garde la couleur de base (et sa transparence pour les cheveux), avec une rugosité de tissu.
 */
function simplifyMaterials(document) {
  for (const material of document.getRoot().listMaterials()) {
    material.setNormalTexture(null);
    material.setOcclusionTexture(null);
    material.setMetallicRoughnessTexture(null);
    material.setEmissiveTexture(null);
    material.setMetallicFactor(0);
    material.setRoughnessFactor(0.85);
  }
}

/**
 * Vêtements et cheveux passent en niveaux de gris, à luminosité moyenne fixe : le jeu les teinte ensuite avec
 * les couleurs choisies dans le créateur d'agent (material.color multiplie la texture), en gardant plis et coutures.
 */
async function neutralizeTintableTextures(document) {
  for (const texture of document.getRoot().listTextures()) {
    if (!TINTABLE_TEXTURES.has(texture.getName())) continue;
    const source = sharp(Buffer.from(texture.getImage()));
    const stats = await source.clone().grayscale().stats();
    const mean = stats.channels[0]?.mean ?? 128;
    const gain = (TINTABLE_MEAN_LUMINANCE * 255) / Math.max(mean, 1);
    const image = await source.grayscale().linear(gain, 0).toColourspace("srgb").png().toBuffer();
    texture.setImage(new Uint8Array(image)).setMimeType("image/png");
  }
}

/**
 * Fusionne une pièce riggée sur le même squelette (mêmes noms d'os, vérifié) : ses maillages sont rattachés
 * aux os de la tenue de base, avec leurs propres matrices de liaison. `filterPrimitive` peut réduire la géométrie.
 */
async function mergeSkinnedPart(document, file, jointsByName, filterPrimitive) {
  const partDocument = await io.read(file);
  const partRoot = partDocument.getRoot();
  const partSkin = partRoot.listSkins()[0];
  if (!partSkin) throw new Error(`${file} : aucun squelette`);
  const partNames = partSkin.listJoints().map((joint) => joint.getName());
  const missing = partNames.filter((name) => !jointsByName.has(name));
  if (missing.length > 0) throw new Error(`${file} : os inconnus ${missing.join(", ")}`);

  const before = new Set(document.getRoot().listNodes());
  mergeDocuments(document, partDocument);
  const added = document.getRoot().listNodes().filter((node) => !before.has(node));
  const armatureParent = jointsByName.get("root").getParentNode() ?? null;

  for (const node of added) {
    const skin = node.getSkin();
    const mesh = node.getMesh();
    if (!skin || !mesh) continue;
    for (const joint of skin.listJoints()) {
      skin.removeJoint(joint);
      skin.addJoint(jointsByName.get(joint.getName()));
    }
    skin.setSkeleton(jointsByName.get("root"));
    for (const primitive of mesh.listPrimitives()) {
      if (!filterPrimitive(primitive, skin)) mesh.removePrimitive(primitive);
    }
    // Le maillage reste à la racine de l'armature de base, comme ceux de la tenue.
    if (armatureParent) armatureParent.addChild(node);
  }
  // Les os dupliqués de la pièce ne servent plus : prune() les retirera avec leurs scènes.
}

/** Ne garde que les triangles de la tête et du cou (les trois sommets majoritairement portés par ces os). */
function keepHeadOnly(primitive, skin) {
  const material = primitive.getMaterial()?.getName() ?? "";
  // Yeux et sourcils ont leurs propres matériaux : on les garde entiers.
  if (material !== "MI_Superhero_Male") return true;
  const joints = primitive.getAttribute("JOINTS_0");
  const weights = primitive.getAttribute("WEIGHTS_0");
  const indices = primitive.getIndices();
  if (!joints || !weights || !indices) throw new Error("Corps complet sans pondérations ni indices");
  const jointNames = skin.listJoints().map((joint) => joint.getName());
  const vertexCount = joints.getCount();
  const isHeadVertex = new Uint8Array(vertexCount);
  const jointElement = [];
  const weightElement = [];
  for (let vertex = 0; vertex < vertexCount; vertex++) {
    joints.getElement(vertex, jointElement);
    weights.getElement(vertex, weightElement);
    let headWeight = 0;
    for (let slot = 0; slot < 4; slot++) if (HEAD_JOINTS.has(jointNames[jointElement[slot]])) headWeight += weightElement[slot];
    isHeadVertex[vertex] = headWeight >= HEAD_WEIGHT_THRESHOLD ? 1 : 0;
  }
  const source = indices.getArray();
  const kept = [];
  for (let corner = 0; corner < source.length; corner += 3) {
    const a = source[corner];
    const b = source[corner + 1];
    const c = source[corner + 2];
    if (isHeadVertex[a] && isHeadVertex[b] && isHeadVertex[c]) kept.push(a, b, c);
  }
  indices.setArray(new Uint32Array(kept));
  if (kept.length === 0) return false;
  // Les sommets du reste du corps ne sont plus référencés : on les retire du fichier.
  compactPrimitive(primitive);
  return true;
}

/**
 * Copie les animations retenues du mannequin de la bibliothèque (même squelette) vers les os de l'agent.
 * Rotations seules, plus la translation du bassin recalée sur la pose de repos de l'agent.
 */
async function mergeAnimations(document, file, jointsByName) {
  const animationDocument = await io.read(file);
  const animationRoot = animationDocument.getRoot();
  for (const animation of animationRoot.listAnimations()) {
    if (KEPT_CLIPS.has(animation.getName())) continue;
    // Animation.dispose() ne libère pas ses échantillonneurs : leurs données finiraient quand même dans le .glb.
    for (const channel of animation.listChannels()) channel.dispose();
    for (const sampler of animation.listSamplers()) sampler.dispose();
    animation.dispose();
  }
  const sourceRest = new Map(animationRoot.listNodes().map((node) => [node.getName(), node.getTranslation()]));
  const keptNames = animationRoot.listAnimations().map((animation) => animation.getName());
  const missing = [...KEPT_CLIPS].filter((name) => !keptNames.includes(name));
  if (missing.length > 0) throw new Error(`Animations absentes de ${file} : ${missing.join(", ")}`);

  const before = new Set(document.getRoot().listAnimations());
  const nodesBefore = new Set(document.getRoot().listNodes());
  mergeDocuments(document, animationDocument);
  // Le mannequin gris de la bibliothèque n'est pas un vêtement : seul son squelette animé nous intéresse.
  for (const node of document.getRoot().listNodes()) {
    if (!nodesBefore.has(node) && node.getMesh()) node.getMesh().dispose();
  }
  for (const animation of document.getRoot().listAnimations()) {
    if (before.has(animation)) continue;
    for (const channel of animation.listChannels()) {
      const sourceNode = channel.getTargetNode();
      const name = sourceNode?.getName() ?? "";
      const target = jointsByName.get(name);
      const pathName = channel.getTargetPath();
      const keep = target && (pathName === "rotation" || (pathName === "translation" && TRANSLATED_JOINTS.has(name)));
      if (!keep) {
        channel.getSampler()?.dispose();
        channel.dispose();
        continue;
      }
      if (pathName === "translation") rebaseTranslation(channel.getSampler(), sourceRest.get(name) ?? [0, 0, 0], target.getTranslation());
      channel.setTargetNode(target);
    }
  }
}

/** Translation animée = repos de l'agent + (clé - repos du mannequin) : l'agent garde sa hauteur de bassin. */
function rebaseTranslation(sampler, sourceRest, targetRest) {
  const output = sampler.getOutput();
  const values = output.getArray().slice();
  for (let index = 0; index < values.length; index += 3) {
    for (let axis = 0; axis < 3; axis++) values[index + axis] = targetRest[axis] + (values[index + axis] - sourceRest[axis]);
  }
  output.setArray(values);
}

/** Les canaux d'animation retirés laissent leurs échantillonneurs et leurs données : on les jette avant l'écriture. */
function disposeOrphanAccessors(document) {
  const root = document.getRoot();
  for (const animation of root.listAnimations()) {
    const used = new Set(animation.listChannels().map((channel) => channel.getSampler()));
    for (const sampler of animation.listSamplers()) if (!used.has(sampler)) sampler.dispose();
  }
  for (const accessor of root.listAccessors()) {
    if (accessor.listParents().every((parent) => parent === root)) accessor.dispose();
  }
}

function report(document) {
  const root = document.getRoot();
  const triangles = root
    .listMeshes()
    .flatMap((mesh) => mesh.listPrimitives())
    .reduce((total, primitive) => total + (primitive.getIndices()?.getCount() ?? 0) / 3, 0);
  console.log(`Écrit ${outputPath}`);
  console.log(`  maillages : ${root.listMeshes().map((mesh) => mesh.getName()).join(", ")}`);
  console.log(`  triangles : ${Math.round(triangles)}, textures : ${root.listTextures().length}, os : ${root.listSkins()[0]?.listJoints().length}`);
  console.log(`  animations : ${root.listAnimations().map((animation) => animation.getName()).join(", ")}`);
}

main().catch((error) => {
  console.error("Échec de la construction de agent.glb :", error);
  process.exit(1);
});
