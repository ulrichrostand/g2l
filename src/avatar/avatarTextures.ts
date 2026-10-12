import * as THREE from "three";
import { seedFromString, SeededRandom } from "../core/rng";
import { parseHexColor, type AvatarConfig, type FabricPattern } from "./avatarConfig";

/**
 * Textures dessinées au canvas pour l'avatar : visage et motifs de tissu.
 * Le dessin est déterministe (même config → même image) : on peut donc partager une texture
 * entre plusieurs modèles via un cache, au lieu de la régénérer à chaque reconstruction dans le créateur.
 */

/** Couleurs dont dépend le visage : changer de tenue ne régénère pas le visage. */
export type FaceColors = Pick<AvatarConfig, "skinTone" | "eyeColor" | "hairColor">;

/**
 * Le visage est plaqué sur une calotte de sphère : 1 radian d'arc = PIXELS_PER_RADIAN pixels dans les
 * deux directions, sinon les yeux seraient étirés. avatarModel construit la calotte avec ces mêmes angles.
 */
const PIXELS_PER_RADIAN = 128;
const FACE_WIDTH_PX = 256;
const FACE_HEIGHT_PX = 168;

export const FACE_TEXTURE_LAYOUT = {
  widthPx: FACE_WIDTH_PX,
  heightPx: FACE_HEIGHT_PX,
  /** Ouverture horizontale de la calotte, centrée sur +Z. */
  phiLength: FACE_WIDTH_PX / PIXELS_PER_RADIAN,
  /** Angle polaire (depuis le sommet du crâne) du bord haut de la texture. */
  thetaStart: 0.95,
  thetaLength: FACE_HEIGHT_PX / PIXELS_PER_RADIAN,
} as const;

/** Tuile de tissu : petite, car elle est répétée (RepeatWrapping) sur tout le vêtement. */
export const FABRIC_TILE_PX = 128;

/** Textures inutilisées gardées pour un retour rapide en arrière dans le créateur ; au-delà, on libère. */
const MAX_IDLE_TEXTURES = 12;

interface Rgb {
  r: number;
  g: number;
  b: number;
}

const FALLBACK_COLOR: Rgb = { r: 128, g: 128, b: 128 };
const BLACK: Rgb = { r: 0, g: 0, b: 0 };
const WHITE: Rgb = { r: 255, g: 255, b: 255 };

/** Les fonctions de dessin sont exportées : une couleur invalide donne du gris plutôt qu'une exception. */
function toRgb(hex: string): Rgb {
  const color = parseHexColor(hex);
  if (color === null) return FALLBACK_COLOR;
  return {
    r: Number.parseInt(color.slice(1, 3), 16),
    g: Number.parseInt(color.slice(3, 5), 16),
    b: Number.parseInt(color.slice(5, 7), 16),
  };
}

function mix(from: Rgb, to: Rgb, amount: number): Rgb {
  return {
    r: from.r + (to.r - from.r) * amount,
    g: from.g + (to.g - from.g) * amount,
    b: from.b + (to.b - from.b) * amount,
  };
}

function css(color: Rgb, alpha = 1): string {
  return `rgba(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)}, ${alpha})`;
}

/** Luminance perçue (0..1) : sert à choisir un fil doré ou argenté lisible sur le fond. */
function luminance(color: Rgb): number {
  return (0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b) / 255;
}

export function faceTextureKey(face: FaceColors): string {
  return `face:${face.skinTone}:${face.eyeColor}:${face.hairColor}`;
}

/** null pour « uni » : pas besoin de texture, la couleur du matériau suffit. */
export function fabricTextureKey(pattern: FabricPattern, base: string, accent: string): string | null {
  return pattern === "plain" ? null : `fabric:${pattern}:${base}:${accent}`;
}

/**
 * Visage stylisé, fond transparent : seuls les traits sont dessinés, la peau vient de la sphère de la tête.
 * Coordonnées pensées pour FACE_TEXTURE_LAYOUT (centre horizontal = devant du visage).
 */
export function drawFace(context: CanvasRenderingContext2D, face: FaceColors): void {
  const skin = toRgb(face.skinTone);
  const iris = toRgb(face.eyeColor);
  const hair = toRgb(face.hairColor);
  // Sourcils toujours visibles, même avec des cheveux platine sur peau claire : on les ancre dans la peau sombre.
  const brow = mix(mix(hair, BLACK, 0.35), mix(skin, BLACK, 0.6), 0.35);
  const lashLine = mix(skin, BLACK, 0.72);
  const centerX = FACE_WIDTH_PX / 2;
  const rowFor = (polarAngle: number): number => (polarAngle - FACE_TEXTURE_LAYOUT.thetaStart) * PIXELS_PER_RADIAN;
  const browY = rowFor(1.33);
  const eyeY = rowFor(1.6);
  const noseY = rowFor(1.82);
  const mouthY = rowFor(2.03);
  const eyeOffsetX = 0.36 * PIXELS_PER_RADIAN;

  context.clearRect(0, 0, FACE_WIDTH_PX, FACE_HEIGHT_PX);
  drawCheeks(context, skin, centerX, noseY, eyeOffsetX);
  for (const side of [-1, 1] as const) {
    drawEye(context, centerX + side * eyeOffsetX, eyeY, iris, lashLine, side);
    drawBrow(context, centerX + side * eyeOffsetX, browY, brow, side);
  }
  drawNoseShadow(context, skin, centerX, noseY);
  drawLips(context, skin, centerX, mouthY);
}

function drawCheeks(context: CanvasRenderingContext2D, skin: Rgb, centerX: number, cheekY: number, offsetX: number): void {
  const blush = mix(skin, { r: 214, g: 92, b: 104 }, 0.45);
  for (const side of [-1, 1]) {
    const x = centerX + side * (offsetX + 6);
    const gradient = context.createRadialGradient(x, cheekY, 0, x, cheekY, 22);
    gradient.addColorStop(0, css(blush, 0.28));
    gradient.addColorStop(1, css(blush, 0));
    context.fillStyle = gradient;
    context.fillRect(x - 22, cheekY - 22, 44, 44);
  }
}

/** Œil en amande : blanc, iris, pupille, reflet. Les gros yeux restent lisibles vus de loin et de haut. */
function drawEye(context: CanvasRenderingContext2D, x: number, y: number, iris: Rgb, lashLine: Rgb, side: -1 | 1): void {
  const halfWidth = 17;
  const upperHeight = 14;
  const lowerHeight = 10;
  const almond = (): void => {
    context.beginPath();
    context.moveTo(x - halfWidth, y);
    context.quadraticCurveTo(x, y - upperHeight * 1.5, x + halfWidth, y);
    context.quadraticCurveTo(x, y + lowerHeight * 1.5, x - halfWidth, y);
    context.closePath();
  };
  almond();
  context.fillStyle = "#f4efe8";
  context.fill();

  // L'iris est rogné par l'amande : regard naturel, paupières qui couvrent un peu le haut de l'iris.
  context.save();
  almond();
  context.clip();
  context.fillStyle = css(iris);
  context.beginPath();
  context.arc(x, y + 1, 10, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = css(mix(iris, BLACK, 0.5));
  context.lineWidth = 2;
  context.stroke();
  context.fillStyle = "#0b0908";
  context.beginPath();
  context.arc(x, y + 1, 4.8, 0, Math.PI * 2);
  context.fill();
  context.restore();

  context.fillStyle = "rgba(255, 255, 255, 0.95)";
  context.beginPath();
  context.arc(x - 3.5, y - 3, 2.6, 0, Math.PI * 2);
  context.fill();

  // Ligne de cils supérieure épaisse, prolongée vers l'extérieur : c'est elle qui donne l'expression.
  context.strokeStyle = css(lashLine);
  context.lineCap = "round";
  context.lineWidth = 3.5;
  context.beginPath();
  context.moveTo(x - halfWidth, y);
  context.quadraticCurveTo(x, y - upperHeight * 1.5, x + halfWidth, y);
  context.lineTo(x + side * (halfWidth + 3), y - 3);
  context.stroke();
  context.lineWidth = 1.2;
  context.strokeStyle = css(lashLine, 0.45);
  context.beginPath();
  context.moveTo(x - halfWidth + 3, y + 1);
  context.quadraticCurveTo(x, y + lowerHeight * 1.5, x + halfWidth - 3, y + 1);
  context.stroke();
}

function drawBrow(context: CanvasRenderingContext2D, x: number, y: number, color: Rgb, side: -1 | 1): void {
  context.strokeStyle = css(color);
  context.lineCap = "round";
  context.lineWidth = 5;
  context.beginPath();
  context.moveTo(x - side * 15, y + 3);
  context.quadraticCurveTo(x + side * 2, y - 5, x + side * 18, y + 1);
  context.stroke();
}

function drawNoseShadow(context: CanvasRenderingContext2D, skin: Rgb, centerX: number, noseY: number): void {
  const shadow = mix(skin, BLACK, 0.45);
  const gradient = context.createRadialGradient(centerX, noseY + 4, 2, centerX, noseY + 4, 16);
  gradient.addColorStop(0, css(shadow, 0.35));
  gradient.addColorStop(1, css(shadow, 0));
  context.fillStyle = gradient;
  context.fillRect(centerX - 16, noseY - 12, 32, 32);
  context.fillStyle = css(mix(skin, BLACK, 0.6), 0.55);
  for (const side of [-1, 1]) {
    context.beginPath();
    context.ellipse(centerX + side * 6, noseY + 6, 3, 2, 0, 0, Math.PI * 2);
    context.fill();
  }
}

/** Lèvres teintées d'après la peau : plus brunes sur peau foncée, plus rosées sur peau claire. */
function drawLips(context: CanvasRenderingContext2D, skin: Rgb, centerX: number, mouthY: number): void {
  const lip = mix(mix(skin, BLACK, 0.28), { r: 168, g: 72, b: 84 }, 0.3);
  const halfWidth = 17;
  context.fillStyle = css(lip);
  context.beginPath();
  context.moveTo(centerX - halfWidth, mouthY);
  context.quadraticCurveTo(centerX - 8, mouthY - 8, centerX - 2, mouthY - 5);
  context.quadraticCurveTo(centerX, mouthY - 3, centerX + 2, mouthY - 5);
  context.quadraticCurveTo(centerX + 8, mouthY - 8, centerX + halfWidth, mouthY);
  context.closePath();
  context.fill();
  context.fillStyle = css(mix(lip, WHITE, 0.08));
  context.beginPath();
  context.moveTo(centerX - halfWidth, mouthY);
  context.quadraticCurveTo(centerX, mouthY + 13, centerX + halfWidth, mouthY);
  context.closePath();
  context.fill();
  context.strokeStyle = css(mix(lip, BLACK, 0.5));
  context.lineWidth = 1.8;
  context.lineCap = "round";
  context.beginPath();
  context.moveTo(centerX - halfWidth + 1, mouthY);
  context.quadraticCurveTo(centerX, mouthY + 2, centerX + halfWidth - 1, mouthY);
  context.stroke();
}

/**
 * Peint une tuile répétable du motif. Tout ce qui déborde d'un bord est redessiné du côté opposé :
 * aucune couture visible quand la tuile se répète sur le vêtement.
 */
export function drawFabricPattern(context: CanvasRenderingContext2D, pattern: FabricPattern, base: string, accent: string): void {
  const baseColor = toRgb(base);
  const accentColor = toRgb(accent);
  const random = new SeededRandom(seedFromString(`${pattern}:${base}:${accent}`));
  context.clearRect(0, 0, FABRIC_TILE_PX, FABRIC_TILE_PX);
  context.fillStyle = css(baseColor);
  context.fillRect(0, 0, FABRIC_TILE_PX, FABRIC_TILE_PX);
  switch (pattern) {
    case "ankara":
      drawAnkara(context, baseColor, accentColor, random);
      break;
    case "asooke":
      drawAsoOke(context, baseColor, accentColor, random);
      break;
    case "camo":
      drawCamo(context, baseColor, accentColor, random);
      break;
    case "stripes":
      drawStripes(context, baseColor, accentColor);
      break;
    case "circuit":
      drawCircuit(context, baseColor, accentColor, random);
      break;
    case "plain":
      break;
  }
}

/** Dessine `paint` aux 9 positions décalées d'une tuile : la forme raccorde parfaitement aux bords. */
function paintWrapped(context: CanvasRenderingContext2D, paint: () => void): void {
  for (const offsetY of [-FABRIC_TILE_PX, 0, FABRIC_TILE_PX]) {
    for (const offsetX of [-FABRIC_TILE_PX, 0, FABRIC_TILE_PX]) {
      context.save();
      context.translate(offsetX, offsetY);
      paint();
      context.restore();
    }
  }
}

/** Wax : grands médaillons concentriques et losanges, couleurs franches cernées de sombre. */
function drawAnkara(context: CanvasRenderingContext2D, base: Rgb, accent: Rgb, random: SeededRandom): void {
  const dark = mix(base, BLACK, 0.6);
  const light = mix(accent, WHITE, 0.5);
  const middle = mix(base, accent, 0.5);
  const cell = FABRIC_TILE_PX / 2;
  for (const [cellX, cellY] of [[0, 0], [1, 1]] as const) {
    const x = cellX * cell + cell / 2;
    const y = cellY * cell + cell / 2;
    const rings: readonly [number, Rgb][] = [[28, dark], [25, accent], [19, light], [14, dark], [10, middle], [5, light]];
    for (const [radius, color] of rings) {
      context.fillStyle = css(color);
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
    }
    const dotCount = random.int(7, 10);
    context.fillStyle = css(light);
    for (let dot = 0; dot < dotCount; dot++) {
      const angle = (dot / dotCount) * Math.PI * 2;
      context.beginPath();
      context.arc(x + Math.cos(angle) * 22, y + Math.sin(angle) * 22, 1.8, 0, Math.PI * 2);
      context.fill();
    }
  }
  for (const [cellX, cellY] of [[1, 0], [0, 1]] as const) {
    const x = cellX * cell + cell / 2;
    const y = cellY * cell + cell / 2;
    diamond(context, x, y, 26, dark);
    diamond(context, x, y, 22, middle);
    diamond(context, x, y, 13, accent);
    diamond(context, x, y, 6, light);
  }
  // Petites spirales aux coins des cellules : elles chevauchent les bords, d'où le dessin enveloppé.
  context.strokeStyle = css(light);
  context.lineWidth = 2;
  for (const [x, y] of [[0, 0], [cell, 0], [0, cell], [cell, cell]] as const) {
    paintWrapped(context, () => spiral(context, x, y, 9));
  }
}

function diamond(context: CanvasRenderingContext2D, x: number, y: number, halfSize: number, color: Rgb): void {
  context.fillStyle = css(color);
  context.beginPath();
  context.moveTo(x, y - halfSize);
  context.lineTo(x + halfSize, y);
  context.lineTo(x, y + halfSize);
  context.lineTo(x - halfSize, y);
  context.closePath();
  context.fill();
}

function spiral(context: CanvasRenderingContext2D, x: number, y: number, radius: number): void {
  context.beginPath();
  const turns = 2.2;
  const steps = 28;
  for (let step = 0; step <= steps; step++) {
    const progress = step / steps;
    const angle = progress * turns * Math.PI * 2;
    const distance = progress * radius;
    const pointX = x + Math.cos(angle) * distance;
    const pointY = y + Math.sin(angle) * distance;
    if (step === 0) context.moveTo(pointX, pointY);
    else context.lineTo(pointX, pointY);
  }
  context.stroke();
}

/** Aso-oke : bandes tissées étroites, fils métalliques et grain de tissage. */
function drawAsoOke(context: CanvasRenderingContext2D, base: Rgb, accent: Rgb, random: SeededRandom): void {
  const metal: Rgb = luminance(accent) > 0.6 ? { r: 214, g: 220, b: 230 } : { r: 232, g: 196, b: 104 };
  const period = 32;
  for (let stripeX = 0; stripeX < FABRIC_TILE_PX; stripeX += period) {
    context.fillStyle = css(accent);
    context.fillRect(stripeX + 12, 0, 6, FABRIC_TILE_PX);
    context.fillRect(stripeX + 24, 0, 6, FABRIC_TILE_PX);
    context.fillStyle = css(mix(base, BLACK, 0.3));
    context.fillRect(stripeX + 4, 0, 2, FABRIC_TILE_PX);
    context.fillStyle = css(metal);
    context.fillRect(stripeX + 19, 0, 2, FABRIC_TILE_PX);
    context.fillRect(stripeX + 31, 0, 1, FABRIC_TILE_PX);
  }
  // Trame : une rangée sur deux légèrement assombrie, décalée d'une colonne, comme un vrai tissage.
  for (let row = 0; row < FABRIC_TILE_PX; row += 2) {
    context.fillStyle = "rgba(0, 0, 0, 0.13)";
    for (let column = (row / 2) % 2; column < FABRIC_TILE_PX; column += 2) context.fillRect(column, row, 1, 1);
  }
  context.fillStyle = css(mix(metal, WHITE, 0.5), 0.9);
  for (let sparkle = 0; sparkle < 40; sparkle++) {
    const stripe = random.int(0, FABRIC_TILE_PX / period - 1) * period;
    context.fillRect(stripe + 19 + random.int(0, 1), random.int(0, FABRIC_TILE_PX - 1), 1, 2);
  }
}

function drawCamo(context: CanvasRenderingContext2D, base: Rgb, accent: Rgb, random: SeededRandom): void {
  const palette = [mix(base, BLACK, 0.45), mix(base, accent, 0.55), accent, mix(accent, BLACK, 0.35)];
  for (const color of palette) {
    const blobCount = random.int(4, 6);
    for (let blob = 0; blob < blobCount; blob++) {
      const x = random.int(0, FABRIC_TILE_PX - 1);
      const y = random.int(0, FABRIC_TILE_PX - 1);
      const lobes = Array.from({ length: 3 }, () => ({
        dx: random.int(-10, 10),
        dy: random.int(-8, 8),
        radiusX: random.int(7, 15),
        radiusY: random.int(5, 10),
        rotation: random.next() * Math.PI,
      }));
      context.fillStyle = css(color);
      paintWrapped(context, () => {
        for (const lobe of lobes) {
          context.beginPath();
          context.ellipse(x + lobe.dx, y + lobe.dy, lobe.radiusX, lobe.radiusY, lobe.rotation, 0, Math.PI * 2);
          context.fill();
        }
      });
    }
  }
}

/** Rayures horizontales (tour du corps) : bande large + filet fin, façon marinière. */
function drawStripes(context: CanvasRenderingContext2D, base: Rgb, accent: Rgb): void {
  const period = 32;
  for (let stripeY = 0; stripeY < FABRIC_TILE_PX; stripeY += period) {
    context.fillStyle = css(accent);
    context.fillRect(0, stripeY + 6, FABRIC_TILE_PX, 10);
    context.fillStyle = css(mix(base, accent, 0.5));
    context.fillRect(0, stripeY + 22, FABRIC_TILE_PX, 3);
  }
}

/** Circuit imprimé : fond assombri, pistes à angles de 45° avec halo, pastilles de soudure. */
function drawCircuit(context: CanvasRenderingContext2D, base: Rgb, accent: Rgb, random: SeededRandom): void {
  context.fillStyle = css(mix(base, BLACK, 0.35));
  context.fillRect(0, 0, FABRIC_TILE_PX, FABRIC_TILE_PX);
  const grid = 16;
  const traceCount = 9;
  for (let trace = 0; trace < traceCount; trace++) {
    const startX = random.int(0, FABRIC_TILE_PX / grid - 1) * grid;
    const startY = random.int(0, FABRIC_TILE_PX / grid - 1) * grid;
    const firstRun = random.int(1, 3) * grid;
    const diagonal = random.int(1, 2) * grid * (random.int(0, 1) === 0 ? -1 : 1);
    const lastRun = random.int(1, 3) * grid;
    const horizontal = random.int(0, 1) === 0;
    const bendX = horizontal ? startX + firstRun : startX;
    const bendY = horizontal ? startY : startY + firstRun;
    const diagonalEndX = horizontal ? bendX + Math.abs(diagonal) : bendX + diagonal;
    const diagonalEndY = horizontal ? bendY + diagonal : bendY + Math.abs(diagonal);
    const start: readonly [number, number] = [startX, startY];
    const end: readonly [number, number] = horizontal ? [diagonalEndX + lastRun, diagonalEndY] : [diagonalEndX, diagonalEndY + lastRun];
    const points: readonly (readonly [number, number])[] = [start, [bendX, bendY], [diagonalEndX, diagonalEndY], end];
    paintWrapped(context, () => {
      for (const [width, alpha] of [[5, 0.25], [2, 1]] as const) {
        context.strokeStyle = css(accent, alpha);
        context.lineWidth = width;
        context.lineJoin = "round";
        context.beginPath();
        points.forEach(([x, y], index) => (index === 0 ? context.moveTo(x, y) : context.lineTo(x, y)));
        context.stroke();
      }
      context.fillStyle = css(mix(accent, WHITE, 0.4));
      for (const [x, y] of [start, end]) {
        context.beginPath();
        context.arc(x, y, 3, 0, Math.PI * 2);
        context.fill();
      }
    });
  }
}

interface CachedTexture {
  texture: THREE.CanvasTexture;
  users: number;
}

/**
 * Cache à compteur d'utilisateurs : une texture n'est libérée que lorsqu'aucun avatar ne s'en sert
 * ET qu'elle sort de la petite réserve des textures inutilisées récentes.
 */
class SharedTextureCache {
  private readonly entries = new Map<string, CachedTexture>();
  private readonly keyByTexture = new WeakMap<THREE.Texture, string>();

  acquire(key: string, create: () => THREE.CanvasTexture): THREE.CanvasTexture {
    const cached = this.entries.get(key);
    if (cached) {
      cached.users++;
      // Réinsertion : l'ordre du Map sert d'ordre « du plus ancien au plus récent ».
      this.entries.delete(key);
      this.entries.set(key, cached);
      return cached.texture;
    }
    const texture = create();
    this.entries.set(key, { texture, users: 1 });
    this.keyByTexture.set(texture, key);
    this.trimIdle();
    return texture;
  }

  release(texture: THREE.Texture): void {
    const key = this.keyByTexture.get(texture);
    if (key === undefined) {
      // Texture hors cache (créée ailleurs) : elle appartient à son créateur, on n'y touche pas.
      return;
    }
    const cached = this.entries.get(key);
    if (!cached) return;
    cached.users = Math.max(0, cached.users - 1);
    if (cached.users === 0) {
      this.entries.delete(key);
      this.entries.set(key, cached);
    }
    this.trimIdle();
  }

  private trimIdle(): void {
    let idleCount = 0;
    for (const cached of this.entries.values()) if (cached.users === 0) idleCount++;
    for (const [key, cached] of this.entries) {
      if (idleCount <= MAX_IDLE_TEXTURES) return;
      if (cached.users > 0) continue;
      cached.texture.dispose();
      this.entries.delete(key);
      this.keyByTexture.delete(cached.texture);
      idleCount--;
    }
  }
}

const textureCache = new SharedTextureCache();

function canDrawTextures(): boolean {
  return typeof document !== "undefined";
}

function createCanvasTexture(width: number, height: number, paint: (context: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D indisponible : impossible de dessiner les textures de l'avatar");
  paint(context);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** Texture partagée du visage, ou null hors navigateur (tests sous Node). À rendre via releaseAvatarTexture. */
export function acquireFaceTexture(face: FaceColors): THREE.CanvasTexture | null {
  if (!canDrawTextures()) return null;
  return textureCache.acquire(faceTextureKey(face), () => {
    const texture = createCanvasTexture(FACE_WIDTH_PX, FACE_HEIGHT_PX, (context) => drawFace(context, face));
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    return texture;
  });
}

/**
 * Tuile de tissu partagée (RepeatWrapping : la densité du motif est réglée par les UV du modèle),
 * null pour « uni » ou hors navigateur. À rendre via releaseAvatarTexture.
 */
export function acquireFabricTexture(pattern: FabricPattern, base: string, accent: string): THREE.CanvasTexture | null {
  const key = fabricTextureKey(pattern, base, accent);
  if (key === null || !canDrawTextures()) return null;
  return textureCache.acquire(key, () => {
    const texture = createCanvasTexture(FABRIC_TILE_PX, FABRIC_TILE_PX, (context) => drawFabricPattern(context, pattern, base, accent));
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    return texture;
  });
}

/** Rend une texture obtenue par acquire* : elle n'est réellement libérée que si plus personne ne l'utilise. */
export function releaseAvatarTexture(texture: THREE.Texture | null): void {
  if (texture) textureCache.release(texture);
}
