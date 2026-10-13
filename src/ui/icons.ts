/** Icônes vectorielles 24×24 (aucun emoji, aucune image) : construites en nœuds SVG, jamais en innerHTML. */
export type IconName = "agent" | "skills" | "games" | "save";

const PATHS: Readonly<Record<IconName, string>> = {
  agent: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0 2c-3.3 0-8 1.7-8 5v1h16v-1c0-3.3-4.7-5-8-5z",
  skills: "M5 20V10h3.5v10H5zm5.25 0V4h3.5v16h-3.5zM15.5 20v-7H19v7h-3.5z",
  games: "M4 4h7v7H4V4zm9 0h7v7h-7V4zM4 13h7v7H4v-7zm9 0h7v7h-7v-7z",
  save: "M5 3h11l3 3v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm2 2v5h8V5H7zm5 8a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
};

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

export function icon(name: IconName): SVGSVGElement {
  const svg = document.createElementNS(SVG_NAMESPACE, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.classList.add("icon");
  const path = document.createElementNS(SVG_NAMESPACE, "path");
  path.setAttribute("d", PATHS[name]);
  path.setAttribute("fill", "currentColor");
  svg.append(path);
  return svg;
}
