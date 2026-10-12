import { describe, expect, it } from "vitest";
import { CURRICULUM } from "../src/content/curriculum";
import { emptyProgress, parseProgress, ProgressStore, type PlayerProgress } from "../src/game/progress";
import { buildSkillReport } from "../src/game/skills";

const [first, second, third] = CURRICULUM;
if (!first || !second || !third) throw new Error("Le curriculum doit compter au moins trois modules");

function progressWith(parts: Partial<Pick<PlayerProgress, "records" | "exams">>): PlayerProgress {
  return { ...emptyProgress(), ...parts };
}
const record = (stars: 1 | 2 | 3, missed?: number[]) => ({ bestScore: 100, stars, ghost: false, completedAt: "2026-01-01", ...(missed ? { missed } : {}) });
const exam = (bestGrade: number) => ({ bestGrade, attempts: 1, lastTakenAt: "2026-01-01" });

describe("bilan de compétences", () => {
  it("rien de fait : tout est à faire, rien à revoir", () => {
    const report = buildSkillReport(CURRICULUM, emptyProgress(), "general");
    expect(report.entries).toHaveLength(CURRICULUM.length);
    expect(report.entries.every((entry) => entry.level === "todo")).toBe(true);
    expect(report.completedCount).toBe(0);
    expect(report.averageExamGrade).toBeNull();
    expect(report.reviewList).toEqual([]);
  });

  it("classe selon les fautes, le score et l'examen", () => {
    const progress = progressWith({
      records: { [first.id]: record(3, []), [second.id]: record(3, [1]), [third.id]: record(1) },
      exams: { [first.id]: exam(14) },
    });
    const report = buildSkillReport(CURRICULUM, progress, "general");
    const levels = report.entries.slice(0, 3).map((entry) => entry.level);
    expect(levels).toEqual(["mastered", "learning", "learning"]);
    expect(report.masteredCount).toBe(1);
    expect(report.completedCount).toBe(3);
  });

  it("sans faute mais examen raté ou absent : acquis seulement", () => {
    const progress = progressWith({ records: { [first.id]: record(2, []) }, exams: { [first.id]: exam(6) } });
    expect(buildSkillReport(CURRICULUM, progress, "general").entries[0]?.level).toBe("solid");
  });

  it("liste les notions ratées avec leur point clé, en ignorant les index invalides et les doublons", () => {
    const progress = progressWith({ records: { [second.id]: record(2, [0, 0, 99]) } });
    const report = buildSkillReport(CURRICULUM, progress, "general");
    expect(report.reviewList).toHaveLength(1);
    expect(report.reviewList[0]).toMatchObject({ moduleId: second.id, title: second.lessons[0]?.title, keyPoint: second.lessons[0]?.keyPoint });
  });

  it("moyenne des examens de secteur, et note de l'examen général à part", () => {
    const progress = progressWith({ exams: { [first.id]: exam(12), [second.id]: exam(15), general: exam(9) } });
    const report = buildSkillReport(CURRICULUM, progress, "general");
    expect(report.averageExamGrade).toBe(13.5);
    expect(report.generalExamGrade).toBe(9);
  });
});

describe("notions à revoir dans la sauvegarde", () => {
  class MemoryStorage {
    values = new Map<string, string>();
    getItem(key: string) { return this.values.get(key) ?? null; }
    setItem(key: string, value: string) { this.values.set(key, value); }
  }

  it("enregistre les défis ratés de la dernière mission, même si le score ne bat pas le record", () => {
    const storage = new MemoryStorage();
    const store = new ProgressStore(storage);
    store.saveResult(first.id, { bestScore: 500, stars: 3, ghost: true, missed: [] });
    store.saveResult(first.id, { bestScore: 100, stars: 1, ghost: false, missed: [2] });
    expect(store.recordFor(first.id)).toMatchObject({ bestScore: 500, stars: 3, ghost: true, missed: [2] });
    expect(new ProgressStore(storage).recordFor(first.id)?.missed).toEqual([2]);
  });

  it("une ancienne sauvegarde sans le champ reste valide ; un champ corrompu invalide seulement l'entrée", () => {
    const old = JSON.stringify({ version: 2, records: { [first.id]: { bestScore: 10, stars: 2, ghost: false, completedAt: "x" } } });
    expect(parseProgress(old).records[first.id]?.missed).toBeUndefined();
    const broken = JSON.stringify({ version: 2, records: { [first.id]: { bestScore: 10, stars: 2, ghost: false, completedAt: "x", missed: "oups" } } });
    expect(parseProgress(broken).records[first.id]).toBeUndefined();
  });

  it("ne garde aucune propriété inattendue venue d'un code collé", () => {
    const hostile = JSON.stringify({ version: 2, records: { [first.id]: { bestScore: 10, stars: 2, ghost: false, completedAt: "x", extra: "<img onerror=x>" } } });
    expect(parseProgress(hostile).records[first.id]).not.toHaveProperty("extra");
  });
});
