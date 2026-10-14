import * as THREE from "three";
import { LANG, type Lang } from "../i18n/lang";
import { t } from "../i18n/messages/ads";
import type { PlacedPoster } from "./placement";
import type { Sponsor } from "./sponsors";

import { POSTER_FOOTPRINT } from "./placement";

/** Affiche peinte au sol, un peu plus petite que son emprise : une marge de sol nu l'entoure. */
const POSTER_WIDTH = 3.84;
const POSTER_DEPTH = 2.4;
/** Juste au-dessus du sol et de la flaque de lumière (0,01) : évite le scintillement entre surfaces coplanaires. */
const FLOOR_OFFSET = 0.015;
const CANVAS_WIDTH = 1024;
const CANVAS_HEIGHT = 640;
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
  const left = 72;
  const textWidth = CANVAS_WIDTH - left - 48;
  const measure = (candidate: string) => context.measureText(candidate).width;

  context.fillStyle = "#0b1014";
  context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  context.fillStyle = sponsor.accent;
  context.fillRect(0, 0, 28, CANVAS_HEIGHT);
  context.strokeStyle = sponsor.accent;
  context.lineWidth = 6;
  context.strokeRect(3, 3, CANVAS_WIDTH - 6, CANVAS_HEIGHT - 6);

  context.textBaseline = "top";
  context.fillStyle = sponsor.accent;
  context.font = `600 36px ${FONT_FAMILY}`;
  context.fillText(t("adLabel"), left, 34);

  context.fillStyle = "#f2f6f0";
  context.font = `700 76px ${FONT_FAMILY}`;
  const headline = wrapText(localized(sponsor.headline, lang), measure, textWidth, 3);
  headline.forEach((line, index) => context.fillText(line, left, 96 + index * 84));

  context.fillStyle = "#b9c4bd";
  context.font = `500 40px ${FONT_FAMILY}`;
  const detailTop = 96 + headline.length * 84 + 14;
  if (sponsor.detail) {
    const detail = wrapText(localized(sponsor.detail, lang), measure, textWidth, 2);
    detail.forEach((line, index) => context.fillText(line, left, detailTop + index * 48));
  }

  context.fillStyle = sponsor.accent;
  context.font = `600 40px ${FONT_FAMILY}`;
  context.fillText(sponsor.url.replace(/^https:\/\//, "").replace(/\/$/, ""), left, CANVAS_HEIGHT - 128);
  if (!sponsor.placeholder) {
    context.fillStyle = "#7d8a83";
    context.font = `500 32px ${FONT_FAMILY}`;
    context.fillText(t("partnerLabel", { advertiser: sponsor.advertiser }), left, CANVAS_HEIGHT - 76);
  }
  return canvas;
}

/**
 * Peint les affiches sur le sol des salles : la caméra de jeu domine la scène, un mur est vu de très biaisé
 * alors que le sol l'est de face. Le haut du texte pointe vers le nord, donc vers le haut de l'écran.
 * Texte uniquement, dessiné en canvas : aucune requête réseau, aucun clic, aucun suivi.
 */
export function addPosters(scene: THREE.Scene, posters: readonly PlacedPoster[], lang: Lang = LANG): void {
  const geometry = new THREE.PlaneGeometry(POSTER_WIDTH, POSTER_DEPTH);
  for (const poster of posters) {
    const texture = new THREE.CanvasTexture(drawPoster(poster.sponsor, lang));
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    // Léger auto-éclairage : lisible même dans une salle sans néon, sans dépasser le seuil du bloom.
    const material = new THREE.MeshStandardMaterial({
      map: texture,
      emissiveMap: texture,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0.4,
      roughness: 0.9,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(poster.cell.x + POSTER_FOOTPRINT.cellsX / 2, FLOOR_OFFSET, poster.cell.z + POSTER_FOOTPRINT.cellsZ / 2);
    mesh.receiveShadow = true;
    mesh.name = `poster:${poster.sponsor.id}`;
    scene.add(mesh);
  }
}
