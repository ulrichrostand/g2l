import * as THREE from "three";
import { parseHexColor, type AvatarConfig } from "./avatarConfig";

/**
 * Texture du visage de l'agent de repli, dessinée au canvas.
 * Le dessin est déterministe (même couleurs → même image) : plusieurs modèles partagent une texture via
 * un cache au lieu de la redessiner à chaque reconstruction (changement de mission, retour du créateur).
 */

/** Couleurs dont dépend le visage : changer de tenue ne régénère pas le visage. */
type FaceColors = Pick<AvatarConfig, "skinTone" | "hairColor">;

/**
 * Le visage est plaqué sur une calotte de sphère : 1 radian d'arc = PIXELS_PER_RADIAN pixels dans les
 * deux directions, sinon les yeux seraient étirés. avatarModel construit la calotte avec ces mêmes angles.
 */
const PIXELS_PER_RADIAN = 128;
const FACE_WIDTH_PX = 256;
const FACE_HEIGHT_PX = 168;

export const FACE_TEXTURE_LAYOUT = {
  /** Ouverture horizontale de la calotte, centrée sur +Z. */
  phiLength: FACE_WIDTH_PX / PIXELS_PER_RADIAN,
  /** Angle polaire (depuis le sommet du crâne) du bord haut de la texture. */
  thetaStart: 0.95,
  thetaLength: FACE_HEIGHT_PX / PIXELS_PER_RADIAN,
} as const;

/** Visages inutilisés gardés pour qu'une reconstruction proche (mission suivante) ne redessine rien ; au-delà, on libère. */
const MAX_IDLE_TEXTURES = 12;

interface Rgb {
  r: number;
  g: number;
  b: number;
}

const FALLBACK_COLOR: Rgb = { r: 128, g: 128, b: 128 };
const BLACK: Rgb = { r: 0, g: 0, b: 0 };
const WHITE: Rgb = { r: 255, g: 255, b: 255 };
/** Le modèle humain ne propose pas de couleur d'yeux : le repli garde un brun foncé neutre. */
const EYE_COLOR: Rgb = { r: 0x3b, g: 0x24, b: 0x16 };

/** Défense en profondeur : une couleur invalide donne du gris plutôt qu'une exception en plein rendu. */
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

function faceTextureKey(face: FaceColors): string {
  return `face:${face.skinTone}:${face.hairColor}`;
}

/**
 * Visage stylisé, fond transparent : seuls les traits sont dessinés, la peau vient de la sphère de la tête.
 * Coordonnées pensées pour FACE_TEXTURE_LAYOUT (centre horizontal = devant du visage).
 */
function drawFace(context: CanvasRenderingContext2D, face: FaceColors): void {
  const skin = toRgb(face.skinTone);
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
    drawEye(context, centerX + side * eyeOffsetX, eyeY, EYE_COLOR, lashLine, side);
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

/** Rend une texture obtenue par acquire* : elle n'est réellement libérée que si plus personne ne l'utilise. */
export function releaseAvatarTexture(texture: THREE.Texture | null): void {
  if (texture) textureCache.release(texture);
}
