/**
 * Catalogue des parcours du portail. Un parcours = un métier de la tech, une roadmap roadmap.sh, un scénario de jeu.
 * Pour en ajouter un : une entrée ici (le portail l'affiche tout seul), puis son jeu sous /jeux/<id>/.
 */

export type CourseStatus = "available" | "soon";

export interface Course {
  /** Identifiant stable (URL, inscriptions, statistiques) : minuscules, chiffres, tirets. */
  id: string;
  title: string;
  /** Le métier visé, en une ligne. */
  role: string;
  /** Le genre de jeu, pour donner envie avant d'expliquer. */
  genre: string;
  /** Le scénario en une ou deux phrases : l'enjeu, ce qui fait comprendre pourquoi la notion compte. */
  scenario: string;
  topics: readonly string[];
  /** Roadmap roadmap.sh suivie (absente si le parcours n'a pas de roadmap dédiée). */
  roadmapUrl: string | null;
  status: CourseStatus;
  /** Chemin du jeu, relatif à la racine du site, avec « / » final. Obligatoire pour un parcours disponible. */
  playPath: string | null;
  /** Couleur d'accent de la carte (#rrggbb). */
  accent: string;
  /** Durée indicative pour un débutant, ou null si le parcours n'existe pas encore. */
  durationHint: string | null;
}

export const COURSES: readonly Course[] = [
  {
    id: "devops",
    title: "DevOps : Shadow Ops",
    role: "DevOps Engineer",
    genre: "Infiltration 3D",
    scenario: "ENTROPIA a pris le contrôle de l'infrastructure d'Helix Corp. Infiltre ses 16 secteurs, prouve tes compétences sur les terminaux et neutralise les sentinelles avec de vraies commandes.",
    topics: ["Linux", "Git", "Réseau", "Conteneurs", "Cloud", "CI/CD", "Infrastructure as Code", "Supervision"],
    roadmapUrl: "https://roadmap.sh/devops",
    status: "available",
    playPath: "jeux/devops/",
    accent: "#39ff88",
    durationHint: "10 à 15 h",
  },
  {
    id: "data-analyst",
    title: "Data Analyst : Piste financière",
    role: "Data Analyst",
    genre: "Enquête",
    scenario: "Des millions ont disparu d'une banque. Remonte la piste dans les données : repère les anomalies, croise les sources et démasque la fraude avant la clôture des comptes.",
    topics: ["Tableurs", "SQL", "Statistiques", "Visualisation", "Nettoyage de données"],
    roadmapUrl: "https://roadmap.sh/data-analyst",
    status: "soon",
    playPath: null,
    accent: "#4fc3ff",
    durationHint: null,
  },
  {
    id: "sql",
    title: "SQL : L'enquête",
    role: "Bases de données",
    genre: "Enquête policière",
    scenario: "Un crime, des témoins, des dizaines de tables. Interroge la base pas à pas pour trouver le coupable : chaque requête bien écrite te rapproche de la vérité.",
    topics: ["SELECT", "Filtres", "Jointures", "Agrégations", "Sous-requêtes"],
    roadmapUrl: null,
    status: "soon",
    playPath: null,
    accent: "#ffb020",
    durationHint: null,
  },
  {
    id: "cyber-security",
    title: "Cybersécurité : Brèche",
    role: "Analyste sécurité",
    genre: "Défense en temps réel",
    scenario: "Une intrusion est en cours dans le réseau d'une entreprise. Lis les journaux, identifie l'attaquant, colmate la brèche avant qu'il n'exfiltre les données.",
    topics: ["Réseau", "Authentification", "Chiffrement", "Journaux", "Réponse à incident"],
    roadmapUrl: "https://roadmap.sh/cyber-security",
    status: "soon",
    playPath: null,
    accent: "#ff3b4e",
    durationHint: null,
  },
];

const COURSE_ID = /^[a-z0-9-]{1,40}$/;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const PLAY_PATH = /^jeux\/[a-z0-9-]+\/$/;

/** Anomalies d'un catalogue (liste vide = valide) : appelée par les tests, pour qu'une faute de frappe ne parte jamais en ligne. */
export function catalogProblems(courses: readonly Course[]): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const course of courses) {
    const label = course.id || "(sans id)";
    if (!COURSE_ID.test(course.id)) problems.push(`${label} : identifiant invalide`);
    if (seen.has(course.id)) problems.push(`${label} : identifiant en double`);
    seen.add(course.id);
    if (!HEX_COLOR.test(course.accent)) problems.push(`${label} : couleur d'accent invalide`);
    if (course.title.trim() === "" || course.scenario.trim() === "") problems.push(`${label} : titre ou scénario vide`);
    if (course.topics.length === 0) problems.push(`${label} : aucune notion listée`);
    if (course.roadmapUrl !== null && !course.roadmapUrl.startsWith("https://roadmap.sh/")) problems.push(`${label} : la roadmap doit pointer vers https://roadmap.sh/`);
    if (course.status === "available" && (course.playPath === null || !PLAY_PATH.test(course.playPath))) problems.push(`${label} : un parcours disponible a besoin d'un chemin de jeu « jeux/<id>/ »`);
    if (course.status === "soon" && course.playPath !== null) problems.push(`${label} : un parcours à venir ne doit pas avoir de chemin de jeu`);
  }
  return problems;
}

/** Adresse du jeu d'un parcours, sous le préfixe du site (« / » ou « /rostand/ »). */
export function playHref(course: Course, base: string): string | null {
  if (course.status !== "available" || course.playPath === null) return null;
  return `${base}${course.playPath}`;
}

export function availableCount(courses: readonly Course[]): number {
  return courses.filter((course) => course.status === "available").length;
}
