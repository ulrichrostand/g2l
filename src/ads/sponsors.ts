/**
 * Annonceurs des affiches du jeu. C'est le SEUL fichier à modifier pour ajouter, retirer ou planifier une annonce.
 * Chaque affiche est dessinée dans la scène 3D (texte uniquement) : pas de script ni de contenu distant,
 * donc rien à autoriser dans la CSP et aucun suivi du joueur.
 */
export type SponsorKind = "recruitment" | "course" | "tool";

export interface LocalizedText {
  fr: string;
  en: string;
}

export interface Sponsor {
  /** Identifiant stable (minuscules, chiffres, tirets) : sert aux statistiques futures. */
  id: string;
  /** Nom affiché de l'annonceur. */
  advertiser: string;
  kind: SponsorKind;
  /** Accroche principale : courte, elle doit rester lisible sur une affiche vue de loin. */
  headline: LocalizedText;
  /** Détail optionnel (poste, lieu, offre). */
  detail?: LocalizedText;
  /** Adresse affichée en toutes lettres sur l'affiche (https obligatoire, jamais cliquable dans le jeu). */
  url: string;
  /** Couleur de l'affiche, au format #rrggbb. */
  accent: string;
  /** Début de diffusion inclus, au format AAAA-MM-JJ (UTC). Absent = déjà actif. */
  startsOn?: string;
  /** Vrai pour l'affiche de repli « À venir » : elle ne nomme aucun partenaire (il n'y en a pas). */
  placeholder?: boolean;
  /** Fin de diffusion incluse, au format AAAA-MM-JJ (UTC). Absent = sans fin. */
  endsOn?: string;
}

/**
 * Annonces vendues. Vide tant qu'aucun annonceur n'a signé : le jeu affiche alors l'affiche « À venir »
 * (voir `HOUSE_POSTER`). Exemple de ligne à ajouter :
 *
 *   { id: "acme-devops", advertiser: "ACME", kind: "recruitment",
 *     headline: { fr: "ACME recrute un DevOps", en: "ACME is hiring a DevOps engineer" },
 *     detail: { fr: "CDI, Paris ou télétravail", en: "Full-time, Paris or remote" },
 *     url: "https://acme.example/jobs", accent: "#c6f135", startsOn: "2026-11-01", endsOn: "2026-12-31" },
 */
export const SPONSORS: readonly Sponsor[] = [];

/** Affiche de repli tant qu'aucun annonceur n'a signé : indique simplement que l'emplacement arrive. */
export const HOUSE_POSTER: Sponsor = {
  id: "house",
  advertiser: "Cellule Écho",
  kind: "recruitment",
  headline: { fr: "À venir", en: "Coming soon" },
  detail: { fr: "Un partenaire apparaîtra bientôt sur cet emplacement", en: "A partner will soon appear on this spot" },
  url: "https://ulrichrostand.github.io/rostand/",
  accent: "#c6f135",
  placeholder: true,
};

const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_HEADLINE_LENGTH = 48;
const MAX_DETAIL_LENGTH = 72;

function isValidDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

function isSafeUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && parsed.username === "" && parsed.password === "";
  } catch {
    return false;
  }
}

/** Contrôle d'un catalogue d'annonces : renvoie la liste des problèmes (vide = valide). */
export function sponsorProblems(sponsors: readonly Sponsor[]): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const sponsor of sponsors) {
    const label = sponsor.id || "(sans identifiant)";
    if (!ID_PATTERN.test(sponsor.id)) problems.push(`${label} : identifiant invalide`);
    if (seen.has(sponsor.id)) problems.push(`${label} : identifiant en double`);
    seen.add(sponsor.id);
    if (sponsor.advertiser.trim() === "") problems.push(`${label} : annonceur vide`);
    if (!COLOR_PATTERN.test(sponsor.accent)) problems.push(`${label} : couleur invalide (#rrggbb requis)`);
    if (!isSafeUrl(sponsor.url)) problems.push(`${label} : l'adresse doit être en https, sans identifiants`);
    for (const lang of ["fr", "en"] as const) {
      const headline = sponsor.headline[lang].trim();
      if (headline === "") problems.push(`${label} (${lang}) : accroche vide`);
      if (headline.length > MAX_HEADLINE_LENGTH) problems.push(`${label} (${lang}) : accroche trop longue (${MAX_HEADLINE_LENGTH} max)`);
      if ((sponsor.detail?.[lang].length ?? 0) > MAX_DETAIL_LENGTH) problems.push(`${label} (${lang}) : détail trop long (${MAX_DETAIL_LENGTH} max)`);
    }
    for (const [name, value] of [["startsOn", sponsor.startsOn], ["endsOn", sponsor.endsOn]] as const) {
      if (value !== undefined && !isValidDate(value)) problems.push(`${label} : ${name} invalide (AAAA-MM-JJ requis)`);
    }
    if (sponsor.startsOn && sponsor.endsOn && sponsor.startsOn > sponsor.endsOn) problems.push(`${label} : la fin précède le début`);
  }
  return problems;
}

/** Annonces diffusables à une date donnée (bornes incluses, comparées en UTC). */
export function activeSponsors(sponsors: readonly Sponsor[], now: Date): Sponsor[] {
  const today = now.toISOString().slice(0, 10);
  return sponsors.filter((sponsor) => (!sponsor.startsOn || sponsor.startsOn <= today) && (!sponsor.endsOn || today <= sponsor.endsOn));
}

/** Annonces à afficher maintenant : les annonces actives, ou l'affiche de repli s'il n'y en a aucune. */
export function sponsorsToShow(now: Date, sponsors: readonly Sponsor[] = SPONSORS): Sponsor[] {
  const active = activeSponsors(sponsors, now);
  return active.length > 0 ? active : [HOUSE_POSTER];
}
