import type { DevOpsModule } from "../content/types";
import { PASSING_GRADE } from "./exam";
import type { PlayerProgress } from "./progress";

/**
 * Bilan de compétences : ce que le joueur maîtrise, ce qu'il doit consolider, et quelles notions revoir.
 * Logique pure (aucun DOM) : l'écran « Mes compétences » ne fait que l'afficher.
 */

export type SkillLevel =
  /** Secteur pas encore terminé. */
  | "todo"
  /** Terminé mais fragile : des défis ratés, ou un score minimal. */
  | "learning"
  /** Terminé sans faute marquante. */
  | "solid"
  /** Terminé sans faute et examen réussi. */
  | "mastered";

export interface NotionToReview {
  title: string;
  keyPoint: string;
}

export interface SkillEntry {
  moduleId: string;
  codename: string;
  title: string;
  roadmapSection: string;
  topics: readonly string[];
  level: SkillLevel;
  stars: number;
  /** Meilleure note à l'examen du secteur (sur 20), si passé. */
  examGrade: number | null;
  examPassed: boolean;
  toReview: NotionToReview[];
}

export interface SkillReport {
  entries: SkillEntry[];
  completedCount: number;
  masteredCount: number;
  /** Moyenne des meilleures notes d'examen de secteur, null sans examen passé. */
  averageExamGrade: number | null;
  /** Toutes les notions à revoir, tous secteurs confondus, dans l'ordre de la campagne. */
  reviewList: (NotionToReview & { codename: string; moduleId: string })[];
  generalExamGrade: number | null;
}

export function skillLevelLabel(level: SkillLevel): string {
  switch (level) {
    case "todo":
      return "À faire";
    case "learning":
      return "À consolider";
    case "solid":
      return "Acquis";
    case "mastered":
      return "Maîtrisé";
  }
}

function notionsToReview(module: DevOpsModule, missed: readonly number[] | undefined): NotionToReview[] {
  const seen = new Set<number>();
  const notions: NotionToReview[] = [];
  for (const index of missed ?? []) {
    const lesson = module.lessons[index];
    // Index hors du module (sauvegarde d'une autre version du contenu) ou doublon : ignoré, jamais une erreur.
    if (!lesson || seen.has(index)) continue;
    seen.add(index);
    notions.push({ title: lesson.title, keyPoint: lesson.keyPoint });
  }
  return notions;
}

export function buildSkillReport(modules: readonly DevOpsModule[], progress: PlayerProgress, generalExamId: string): SkillReport {
  const entries: SkillEntry[] = modules.map((module) => {
    const record = progress.records[module.id];
    const exam = progress.exams[module.id];
    const toReview = notionsToReview(module, record?.missed);
    const examPassed = exam !== undefined && exam.bestGrade >= PASSING_GRADE;
    let level: SkillLevel = "todo";
    if (record) {
      if (toReview.length > 0 || record.stars === 1) level = "learning";
      else level = examPassed ? "mastered" : "solid";
    }
    return {
      moduleId: module.id,
      codename: module.codename,
      title: module.title,
      roadmapSection: module.roadmapSection,
      topics: module.roadmapTopics,
      level,
      stars: record?.stars ?? 0,
      examGrade: exam?.bestGrade ?? null,
      examPassed,
      toReview,
    };
  });
  const grades = entries.flatMap((entry) => (entry.examGrade === null ? [] : [entry.examGrade]));
  return {
    entries,
    completedCount: entries.filter((entry) => entry.level !== "todo").length,
    masteredCount: entries.filter((entry) => entry.level === "mastered").length,
    averageExamGrade: grades.length === 0 ? null : Math.round((grades.reduce((total, grade) => total + grade, 0) / grades.length) * 2) / 2,
    reviewList: entries.flatMap((entry) => entry.toReview.map((notion) => ({ ...notion, codename: entry.codename, moduleId: entry.moduleId }))),
    generalExamGrade: progress.exams[generalExamId]?.bestGrade ?? null,
  };
}
