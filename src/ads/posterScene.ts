import * as THREE from "three";
import { LANG, type Lang } from "../i18n/lang";
import { t } from "../i18n/messages/ads";
import type { PlacedPoster } from "./placement";
import type { Sponsor } from "./sponsors";

const POSTER_WIDTH = 1.5;
const POSTER_HEIGHT = 0.94;
/** Centre sous la bande lumineuse des murs (≈ 1,05 m) pour ne pas la chevaucher. */
const POSTER_CENTER_HEIGHT = 0.52;
/** Décalage devant le mur : évite le z-fighting sans que l'affiche paraisse décollée. */
const WALL_OFFSET = 0.012;
const CANVAS_WIDTH = 512;
const CANVAS_HEIGHT = 320;
const FONT_FAMILY = '"Barlow", "Segoe UI", system-ui, sans-serif';

/**
 * Découpe un texte en lignes qui tiennent dans `maxWidth`. Au-delà de `maxLines`, la dernière ligne est tronquée
 * avec une ellipse : une accroche trop longue ne doit jamais déborder de l'affiche.
 */
export function wrapText(text: string, measure: (candidate: string) => number, maxWidth: number, maxLines: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && measure(candidate) > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1] as string;
  while (last.length > 1 && measure(`${last}…`) > maxWidth) last = last.slice(0, -1);
  kept[maxLines - 1] = `${last}…`;
  return kept;
}

function localized(text: { fr: string; en: string }, lang: Lang): string {
  return text[lang];
}

function drawPoster(sponsor: Sponsor, lang: Lang): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D indisponible : impossible de dessiner l'affiche");
  const margin = 28;
  const innerWidth = CANVAS_WIDTH - margin * 2;
  const measure = (candidate: string) => context.measureText(candidate).width;

  context.fillStyle = "#0b1014";
  context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  context.fillStyle = sponsor.accent;
  context.fillRect(0, 0, 14, CANVAS_HEIGHT);
  context.strokeStyle = sponsor.accent;
  context.lineWidth = 3;
  context.strokeRect(1.5, 1.5, CANVAS_WIDTH - 3, CANVAS_HEIGHT - 3);

  context.textBaseline = "top";
  context.fillStyle = sponsor.accent;
  context.font = `600 22px ${FONT_FAMILY}`;
  context.fillText(t("adLabel"), margin + 10, 22);

  context.fillStyle = "#f2f6f0";
  context.font = `700 46px ${FONT_FAMILY}`;
  const headline = wrapText(localized(sponsor.headline, lang), measure, innerWidth - 10, 3);
  headline.forEach((line, index) => context.fillText(line, margin + 10, 62 + index * 52));

  context.fillStyle = "#b9c4bd";
  context.font = `500 24px ${FONT_FAMILY}`;
  if (sponsor.detail) {
    const detail = wrapText(localized(sponsor.detail, lang), measure, innerWidth - 10, 2);
    detail.forEach((line, index) => context.fillText(line, margin + 10, 62 + headline.length * 52 + 8 + index * 30));
  }

  context.fillStyle = sponsor.accent;
  context.font = `600 22px ${FONT_FAMILY}`;
  context.fillText(sponsor.url.replace(/^https:\/\//, "").replace(/\/$/, ""), margin + 10, CANVAS_HEIGHT - 76);
  context.fillStyle = "#7d8a83";
  context.font = `500 20px ${FONT_FAMILY}`;
  context.fillText(t("partnerLabel", { advertiser: sponsor.advertiser }), margin + 10, CANVAS_HEIGHT - 44);
  return canvas;
}

/**
 * Accroche les affiches sur les murs. Texte uniquement, dessiné en canvas : aucune requête réseau, aucun clic,
 * aucun suivi. L'éclairage de la scène les modèle, avec un léger auto-éclairage pour qu'elles restent lisibles
 * dans une salle sombre (sans dépasser le seuil du bloom).
 */
export function addPosters(scene: THREE.Scene, posters: readonly PlacedPoster[], lang: Lang = LANG): void {
  const geometry = new THREE.PlaneGeometry(POSTER_WIDTH, POSTER_HEIGHT);
  for (const poster of posters) {
    const texture = new THREE.CanvasTexture(drawPoster(poster.sponsor, lang));
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    const material = new THREE.MeshStandardMaterial({ map: texture, emissiveMap: texture, emissive: new THREE.Color(0xffffff), emissiveIntensity: 0.3, roughness: 0.8, metalness: 0 });
    const mesh = new THREE.Mesh(geometry, material);
    // Face sud du mur nord : le mur occupe [z, z + 1], la face visible est à z + 1.
    mesh.position.set(poster.wallCell.x + 0.5, POSTER_CENTER_HEIGHT, poster.wallCell.z + 1 + WALL_OFFSET);
    mesh.name = `poster:${poster.sponsor.id}`;
    scene.add(mesh);
  }
}
