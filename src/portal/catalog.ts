import { gamePath, portalPath } from "../i18n/routes";
import type { Lang } from "../i18n/lang";

/**
 * Catalogue des jeux du portail, dans les deux langues. Un jeu = un métier de la tech, une roadmap roadmap.sh, un scénario.
 * Pour en ajouter un : une entrée ici (le portail l'affiche tout seul), puis ses pages sous jeux/<slug>/ et en/games/<slug>/.
 */

export type CourseStatus = "available" | "soon";

/** Ce qui change d'une langue à l'autre. */
export interface CourseText {
  /** Titre complet affiché sur la carte. */
  title: string;
  /** Domaine seul (« DevOps »), pour les listes. */
  field: string;
  /** Nom du jeu seul (« Shadow Ops »), pour les boutons. */
  name: string;
  /** Le métier visé. */
  role: string;
  /** Le genre de jeu, pour donner envie avant d'expliquer. */
  genre: string;
  /** Le scénario en une ou deux phrases : l'enjeu. */
  scenario: string;
  topics: readonly string[];
  /** Durée indicative pour un débutant, ou null si le jeu n'existe pas encore. */
  durationHint: string | null;
  /** Texte alternatif de la capture de la carte (null sans capture). */
  coverAlt: string | null;
}

export interface Course {
  /** Identifiant stable (inscriptions, statistiques) : minuscules, chiffres, tirets. */
  id: string;
  status: CourseStatus;
  /** Dossier du jeu (jeux/<slug>/ et en/games/<slug>/). Obligatoire pour un jeu disponible, absent sinon. */
  gameSlug: string | null;
  /** Roadmap roadmap.sh suivie (absente si le jeu n'a pas de roadmap dédiée). */
  roadmapUrl: string | null;
  /** Capture réelle du jeu (chemin sous la racine du site), ou null : la carte affiche alors une affiche typographique. */
  cover: { src: string; focus?: string } | null;
  /** Deux à quatre lettres pour l'affiche typographique des jeux sans capture. */
  monogram: string;
  text: Record<Lang, CourseText>;
}

/** Capture de la galerie « Dans les jeux » : toujours une vraie image d'un jeu existant. */
export interface Screenshot {
  courseId: string;
  src: string;
  /** Point de l'image à garder visible quand la vignette la recadre (« x% y% », comme object-position). */
  focus?: string;
  text: Record<Lang, { alt: string; caption: string }>;
}

export const COURSES: readonly Course[] = [
  {
    id: "devops",
    status: "available",
    gameSlug: "devops",
    roadmapUrl: "https://roadmap.sh/devops",
    cover: { src: "portal/devops-infiltration.webp", focus: "38% 40%" },
    monogram: "OPS",
    text: {
      fr: {
        title: "DevOps : Shadow Ops",
        field: "DevOps",
        name: "Shadow Ops",
        role: "DevOps Engineer",
        genre: "Infiltration 3D",
        scenario: "ENTROPIA a pris le contrôle de l'infrastructure d'Helix Corp. Infiltre ses 16 secteurs, prouve tes compétences sur les terminaux et neutralise les sentinelles avec de vraies commandes.",
        topics: ["Linux", "Git", "Réseau", "Conteneurs", "Cloud", "CI/CD", "Infrastructure as Code", "Supervision"],
        durationHint: "10 à 15 h",
        coverAlt: "L'agent progresse dans un couloir éclairé au néon, à portée d'une sentinelle.",
      },
      en: {
        title: "DevOps: Shadow Ops",
        field: "DevOps",
        name: "Shadow Ops",
        role: "DevOps Engineer",
        genre: "3D stealth",
        scenario: "ENTROPIA has taken over Helix Corp's infrastructure. Infiltrate its 16 sectors, prove your skills on the terminals and take down the sentinels with real commands.",
        topics: ["Linux", "Git", "Networking", "Containers", "Cloud", "CI/CD", "Infrastructure as Code", "Monitoring"],
        durationHint: "10 to 15 h",
        coverAlt: "The agent moves through a neon-lit corridor, within reach of a sentinel.",
      },
    },
  },
  {
    id: "data-analyst",
    status: "soon",
    gameSlug: null,
    roadmapUrl: "https://roadmap.sh/data-analyst",
    cover: null,
    monogram: "DATA",
    text: {
      fr: {
        title: "Data Analyst : Piste financière",
        field: "Data Analyst",
        name: "Piste financière",
        role: "Data Analyst",
        genre: "Enquête",
        scenario: "Des millions ont disparu d'une banque. Remonte la piste dans les données : repère les anomalies, croise les sources et démasque la fraude avant la clôture des comptes.",
        topics: ["Tableurs", "SQL", "Statistiques", "Visualisation", "Nettoyage de données"],
        durationHint: null,
        coverAlt: null,
      },
      en: {
        title: "Data Analyst: Money Trail",
        field: "Data Analyst",
        name: "Money Trail",
        role: "Data Analyst",
        genre: "Investigation",
        scenario: "Millions have vanished from a bank. Follow the trail through the data: spot anomalies, cross-check sources and expose the fraud before the books close.",
        topics: ["Spreadsheets", "SQL", "Statistics", "Visualization", "Data cleaning"],
        durationHint: null,
        coverAlt: null,
      },
    },
  },
  {
    id: "sql",
    status: "soon",
    gameSlug: null,
    roadmapUrl: null,
    cover: null,
    monogram: "SQL",
    text: {
      fr: {
        title: "SQL : L'enquête",
        field: "SQL",
        name: "L'enquête",
        role: "Bases de données",
        genre: "Enquête policière",
        scenario: "Un crime, des témoins, des dizaines de tables. Interroge la base pas à pas pour trouver le coupable : chaque requête bien écrite te rapproche de la vérité.",
        topics: ["SELECT", "Filtres", "Jointures", "Agrégations", "Sous-requêtes"],
        durationHint: null,
        coverAlt: null,
      },
      en: {
        title: "SQL: The Investigation",
        field: "SQL",
        name: "The Investigation",
        role: "Databases",
        genre: "Detective story",
        scenario: "A crime, witnesses, dozens of tables. Query the database step by step to find the culprit: every well-written query brings you closer to the truth.",
        topics: ["SELECT", "Filters", "Joins", "Aggregations", "Subqueries"],
        durationHint: null,
        coverAlt: null,
      },
    },
  },
  {
    id: "cyber-security",
    status: "soon",
    gameSlug: null,
    roadmapUrl: "https://roadmap.sh/cyber-security",
    cover: null,
    monogram: "SEC",
    text: {
      fr: {
        title: "Cybersécurité : Brèche",
        field: "Cybersécurité",
        name: "Brèche",
        role: "Analyste sécurité",
        genre: "Défense en temps réel",
        scenario: "Une intrusion est en cours dans le réseau d'une entreprise. Lis les journaux, identifie l'attaquant, colmate la brèche avant qu'il n'exfiltre les données.",
        topics: ["Réseau", "Authentification", "Chiffrement", "Journaux", "Réponse à incident"],
        durationHint: null,
        coverAlt: null,
      },
      en: {
        title: "Cybersecurity: Breach",
        field: "Cybersecurity",
        name: "Breach",
        role: "Security analyst",
        genre: "Real-time defense",
        scenario: "An intrusion is underway on a company's network. Read the logs, identify the attacker and plug the breach before data is exfiltrated.",
        topics: ["Networking", "Authentication", "Encryption", "Logs", "Incident response"],
        durationHint: null,
        coverAlt: null,
      },
    },
  },
];

export const SCREENSHOTS: readonly Screenshot[] = [
  {
    courseId: "devops",
    src: "portal/devops-mission.webp",
    text: {
      fr: { alt: "Vue d'une salle du premier secteur avec la carte, la santé et les munitions.", caption: "Shadow Ops : un secteur à infiltrer" },
      en: { alt: "View of a room in the first sector with the map, health and ammo.", caption: "Shadow Ops: a sector to infiltrate" },
    },
  },
  {
    courseId: "devops",
    src: "portal/devops-boss.webp",
    text: {
      fr: { alt: "Le boss du secteur, protégé par un bouclier, face à l'agent.", caption: "Shadow Ops : le boss de fin de secteur" },
      en: { alt: "The sector boss, protected by a shield, facing the agent.", caption: "Shadow Ops: the end-of-sector boss" },
    },
  },
  {
    courseId: "devops",
    src: "portal/devops-lecon.webp",
    focus: "0% 30%",
    text: {
      fr: { alt: "Fiche de leçon « C'est quoi, un serveur ? » avant de pirater un terminal.", caption: "Shadow Ops : une leçon avant chaque terminal" },
      en: { alt: "Lesson card \"What is a server?\" shown before hacking a terminal.", caption: "Shadow Ops: a lesson before every terminal" },
    },
  },
  {
    courseId: "devops",
    src: "portal/devops-agent.webp",
    focus: "50% 30%",
    text: {
      fr: { alt: "L'agent personnalisé dans le créateur de personnage.", caption: "Shadow Ops : crée ton agent" },
      en: { alt: "The customized agent in the character creator.", caption: "Shadow Ops: create your agent" },
    },
  },
];

const COURSE_ID = /^[a-z0-9-]{1,40}$/;
const SLUG = /^[a-z0-9-]{1,40}$/;
const ASSET_PATH = /^portal\/[a-z0-9-]+\.webp$/;
const MONOGRAM = /^[A-Z]{2,4}$/;
const FOCUS = /^\d{1,3}% \d{1,3}%$/;
const FRENCH_LETTERS = /[àâçéèêëîïôûùœÀÉÈÊ]/;

export function textOf(course: Course, lang: Lang): CourseText {
  return course.text[lang];
}

/** Anomalies d'un catalogue (liste vide = valide) : appelée par les tests, pour qu'une faute de frappe ne parte jamais en ligne. */
export function catalogProblems(courses: readonly Course[]): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const course of courses) {
    const label = course.id || "(sans id)";
    if (!COURSE_ID.test(course.id)) problems.push(`${label} : identifiant invalide`);
    if (seen.has(course.id)) problems.push(`${label} : identifiant en double`);
    seen.add(course.id);
    if (course.roadmapUrl !== null && !course.roadmapUrl.startsWith("https://roadmap.sh/")) problems.push(`${label} : la roadmap doit pointer vers https://roadmap.sh/`);
    if (course.status === "available" && (course.gameSlug === null || !SLUG.test(course.gameSlug))) problems.push(`${label} : un jeu disponible a besoin d'un dossier de jeu valide`);
    if (course.status === "soon" && course.gameSlug !== null) problems.push(`${label} : un jeu à venir ne doit pas avoir de dossier de jeu`);
    if (course.cover && !ASSET_PATH.test(course.cover.src)) problems.push(`${label} : visuel invalide (chemin « portal/<nom>.webp » requis)`);
    if (course.cover?.focus !== undefined && !FOCUS.test(course.cover.focus)) problems.push(`${label} : point de cadrage invalide`);
    if (!MONOGRAM.test(course.monogram)) problems.push(`${label} : monogramme invalide (2 à 4 majuscules)`);
    for (const lang of ["fr", "en"] as const) {
      const text = course.text[lang];
      if (text.title.trim() === "" || text.scenario.trim() === "" || text.field.trim() === "" || text.name.trim() === "") problems.push(`${label} (${lang}) : texte vide`);
      if (text.topics.length === 0) problems.push(`${label} (${lang}) : aucune notion listée`);
      if ((course.cover === null) !== (text.coverAlt === null)) problems.push(`${label} (${lang}) : le texte alternatif doit exister si et seulement si le jeu a une capture`);
      if (lang === "en" && Object.values({ ...text, topics: text.topics.join(" ") }).some((value) => typeof value === "string" && FRENCH_LETTERS.test(value))) problems.push(`${label} (en) : le texte anglais contient du français`);
    }
    if (course.text.fr.topics.length !== course.text.en.topics.length) problems.push(`${label} : les notions doivent être aussi nombreuses en français et en anglais`);
    if ((course.text.fr.durationHint === null) !== (course.text.en.durationHint === null)) problems.push(`${label} : la durée doit être présente dans les deux langues ou aucune`);
  }
  return problems;
}

/** Anomalies de la galerie : chaque capture appartient à un jeu connu, avec texte alternatif et légende dans les deux langues. */
export function screenshotProblems(screenshots: readonly Screenshot[], courses: readonly Course[]): string[] {
  const ids = new Set(courses.map((course) => course.id));
  return screenshots.flatMap((shot) => {
    const problems: string[] = [];
    if (!ids.has(shot.courseId)) problems.push(`${shot.src} : jeu inconnu ${shot.courseId}`);
    if (!ASSET_PATH.test(shot.src)) problems.push(`${shot.src} : chemin invalide`);
    if (shot.focus !== undefined && !FOCUS.test(shot.focus)) problems.push(`${shot.src} : point de cadrage invalide`);
    for (const lang of ["fr", "en"] as const) {
      const { alt, caption } = shot.text[lang];
      if (alt.trim() === "" || caption.trim() === "") problems.push(`${shot.src} (${lang}) : texte alternatif ou légende manquant`);
      if (lang === "en" && (FRENCH_LETTERS.test(alt) || FRENCH_LETTERS.test(caption))) problems.push(`${shot.src} (en) : le texte anglais contient du français`);
    }
    return problems;
  });
}

/** Adresse du jeu dans la langue demandée, sous le préfixe du site (« / » ou « /rostand/ »), ou null s'il n'est pas disponible. */
export function playHref(course: Course, lang: Lang, base: string): string | null {
  if (course.status !== "available" || course.gameSlug === null) return null;
  return gamePath(course.gameSlug, lang, base);
}

export function availableCount(courses: readonly Course[]): number {
  return courses.filter((course) => course.status === "available").length;
}

export { portalPath };
