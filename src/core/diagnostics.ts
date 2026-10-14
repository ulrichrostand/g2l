/** Famille de processeur graphique, déduite du nom que le navigateur déclare. */
export type GpuKind = "software" | "integrated" | "dedicated" | "unknown";

/**
 * Nettoie le nom brut renvoyé par WebGL. Chrome le donne sous la forme
 * « ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Direct3D11 vs_5_0 ps_5_0, D3D11) » : on garde le nom du produit.
 */
export function describeRenderer(raw: string): string {
  const trimmed = raw.trim();
  const inner = /^ANGLE \((.*)\)$/i.exec(trimmed)?.[1] ?? trimmed;
  // Format ANGLE : « fabricant, produit, API » ; sinon le nom est pris tel quel.
  const parts = inner.split(", ");
  const product = /^ANGLE \(/i.test(trimmed) && parts.length > 1 ? (parts[1] as string) : inner;
  const name = product.replace(/\s+Direct3D\d*\b.*$/i, "").replace(/\s+vs_\d_\d.*$/i, "").trim();
  return name === "" ? "inconnu" : name;
}

/**
 * Classe le processeur graphique. Le rendu logiciel (processeur central qui imite une carte graphique) ou la puce
 * intégrée d'un portable sont les deux causes classiques d'un jeu 3D saccadé sur un PC pourtant puissant :
 * le navigateur n'utilise pas la carte graphique dédiée.
 */
export function classifyRenderer(raw: string): GpuKind {
  const name = raw.toLowerCase();
  if (/swiftshader|llvmpipe|softpipe|software|basic render|microsoft basic/.test(name)) return "software";
  if (/geforce|\brtx\b|\bgtx\b|quadro|nvidia|radeon (rx|pro)|radeon\(tm\) (rx|pro)|arc (a|b)\d/.test(name) && !/intel\(r\) (uhd|hd|iris)/.test(name)) return "dedicated";
  // Les puces de téléphone ou de Mac (Apple, Mali, Adreno...) sont intégrées par conception : ce n'est pas un défaut à signaler.
  if (/intel|uhd|iris|radeon\(tm\) graphics|radeon graphics|vega/.test(name)) return "integrated";
  return "unknown";
}
