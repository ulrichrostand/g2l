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
  /** Durée indicative pour un débutant, ou null si le parcours n'existe pas encore. */
  durationHint: string | null;
  /** Capture réelle du jeu (chemin sous la racine du site), ou null : la carte affiche alors une affiche typographique. */
  cover: { src: string; alt: string; focus?: string } | null;
  /** Deux à quatre lettres pour l'affiche typographique des parcours sans capture. */
  monogram: string;
}

/** Capture de la galerie « Dans les jeux » : toujours une vraie image d'un jeu existant. */
export interface Screenshot {
  courseId: string;
  src: string;
  alt: string;
  caption: string;
  /** Point de l'image à garder visible quand la vignette la recadre (« x% y% », comme object-position). */
  focus?: string;
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
    durationHint: "10 à 15 h",
    cover: { src: "portal/devops-infiltration.webp", alt: "L'agent progresse dans un couloir éclairé au néon, à portée d'une sentinelle.", focus: "38% 40%" },
    monogram: "OPS",
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
    durationHint: null,
    cover: null,
    monogram: "DATA",
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
    durationHint: null,
    cover: null,
    monogram: "SQL",
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
    durationHint: null,
    cover: null,
    monogram: "SEC",
  },
];

export const SCREENSHOTS: readonly Screenshot[] = [
  { courseId: "devops", src: "portal/devops-mission.webp", alt: "Vue d'une salle du premier secteur avec la carte, la santé et les munitions.", caption: "Shadow Ops : un secteur à infiltrer" },
  { courseId: "devops", src: "portal/devops-boss.webp", alt: "Le boss du secteur, protégé par un bouclier, face à l'agent.", caption: "Shadow Ops : le boss de fin de secteur" },
  { courseId: "devops", src: "portal/devops-lecon.webp", alt: "Fiche de leçon « C'est quoi, un serveur ? » avant de pirater un terminal.", caption: "Shadow Ops : une leçon avant chaque terminal", focus: "0% 30%" },
  { courseId: "devops", src: "portal/devops-agent.webp", alt: "L'agent personnalisé dans le créateur de personnage.", caption: "Shadow Ops : crée ton agent", focus: "50% 30%" },
];

const COURSE_ID = /^[a-z0-9-]{1,40}$/;
const ASSET_PATH = /^portal\/[a-z0-9-]+\.webp$/;
const MONOGRAM = /^[A-Z]{2,4}$/;
const FOCUS = /^\d{1,3}% \d{1,3}%$/;
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
    if (course.title.trim() === "" || course.scenario.trim() === "") problems.push(`${label} : titre ou scénario vide`);
    if (course.topics.length === 0) problems.push(`${label} : aucune notion listée`);
    if (course.roadmapUrl !== null && !course.roadmapUrl.startsWith("https://roadmap.sh/")) problems.push(`${label} : la roadmap doit pointer vers https://roadmap.sh/`);
    if (course.status === "available" && (course.playPath === null || !PLAY_PATH.test(course.playPath))) problems.push(`${label} : un parcours disponible a besoin d'un chemin de jeu « jeux/<id>/ »`);
    if (course.status === "soon" && course.playPath !== null) problems.push(`${label} : un parcours à venir ne doit pas avoir de chemin de jeu`);
    if (course.cover && (!ASSET_PATH.test(course.cover.src) || course.cover.alt.trim() === "")) problems.push(`${label} : visuel invalide (chemin « portal/<nom>.webp » et texte alternatif requis)`);
    if (course.cover?.focus !== undefined && !FOCUS.test(course.cover.focus)) problems.push(`${label} : point de cadrage invalide`);
    if (!MONOGRAM.test(course.monogram)) problems.push(`${label} : monogramme invalide (2 à 4 majuscules)`);
  }
  return problems;
}

/** Anomalies de la galerie : chaque capture doit appartenir à un parcours connu, avec un texte alternatif. */
export function screenshotProblems(screenshots: readonly Screenshot[], courses: readonly Course[]): string[] {
  const ids = new Set(courses.map((course) => course.id));
  return screenshots.flatMap((shot) => {
    const problems: string[] = [];
    if (!ids.has(shot.courseId)) problems.push(`${shot.src} : parcours inconnu ${shot.courseId}`);
    if (!ASSET_PATH.test(shot.src)) problems.push(`${shot.src} : chemin invalide`);
    if (shot.focus !== undefined && !FOCUS.test(shot.focus)) problems.push(`${shot.src} : point de cadrage invalide`);
    if (shot.alt.trim() === "" || shot.caption.trim() === "") problems.push(`${shot.src} : texte alternatif ou légende manquant`);
    return problems;
  });
}

/** Adresse du jeu d'un parcours, sous le préfixe du site (« / » ou « /rostand/ »). */
export function playHref(course: Course, base: string): string | null {
  if (course.status !== "available" || course.playPath === null) return null;
  return `${base}${course.playPath}`;
}

export function availableCount(courses: readonly Course[]): number {
  return courses.filter((course) => course.status === "available").length;
}
