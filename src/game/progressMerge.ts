import { emptyProgress, progressFromUnknown, type ExamRecord, type MissionCheckpoint, type ModuleRecord, type PlayerProgress } from "./progress";

/** Date ISO en millisecondes ; une date absente ou illisible compte comme « très ancienne ». */
function time(iso: string | null | undefined): number {
  if (!iso) return Number.NEGATIVE_INFINITY;
  const value = Date.parse(iso);
  return Number.isNaN(value) ? Number.NEGATIVE_INFINITY : value;
}

/** Le meilleur résultat d'un secteur : plus d'étoiles, puis meilleur score, puis le plus récent. */
function betterRecord(first: ModuleRecord, second: ModuleRecord): ModuleRecord {
  if (first.stars !== second.stars) return first.stars > second.stars ? first : second;
  if (first.bestScore !== second.bestScore) return first.bestScore > second.bestScore ? first : second;
  return time(first.completedAt) >= time(second.completedAt) ? first : second;
}

function betterExam(first: ExamRecord, second: ExamRecord): ExamRecord {
  return {
    bestGrade: Math.max(first.bestGrade, second.bestGrade),
    attempts: Math.max(first.attempts, second.attempts),
    lastTakenAt: time(first.lastTakenAt) >= time(second.lastTakenAt) ? first.lastTakenAt : second.lastTakenAt,
  };
}

function newerCheckpoint(first: MissionCheckpoint | null, second: MissionCheckpoint | null): MissionCheckpoint | null {
  if (!first) return second;
  if (!second) return first;
  return time(first.savedAt) >= time(second.savedAt) ? first : second;
}

/**
 * Fusionne deux progressions (cet appareil et le compte) sans jamais rien faire reculer :
 * les records sont des « meilleurs » résultats, donc on garde le meilleur de chaque côté, secteur par secteur.
 * Ni ordre ni choix à demander au joueur ; fusionner A avec B donne le même résultat que B avec A, et fusionner
 * deux fois ne change rien (propriétés testées). Les deux entrées sont revalidées : une donnée venue du réseau
 * n'est jamais prise telle quelle.
 */
export function mergeProgress(first: PlayerProgress, second: PlayerProgress): PlayerProgress {
  const a = progressFromUnknown(first);
  const b = progressFromUnknown(second);
  const merged = emptyProgress();

  for (const moduleId of new Set([...Object.keys(a.records), ...Object.keys(b.records)])) {
    const left = a.records[moduleId];
    const right = b.records[moduleId];
    merged.records[moduleId] = left && right ? betterRecord(left, right) : (left ?? right)!;
  }
  for (const examId of new Set([...Object.keys(a.exams), ...Object.keys(b.exams)])) {
    const left = a.exams[examId];
    const right = b.exams[examId];
    merged.exams[examId] = left && right ? betterExam(left, right) : (left ?? right)!;
  }
  // L'apparence : celle de la sauvegarde la plus récente ; si l'une n'en a pas, on garde l'autre.
  merged.avatar = a.avatar && b.avatar ? (time(a.savedAt) >= time(b.savedAt) ? a.avatar : b.avatar) : (a.avatar ?? b.avatar);
  merged.tutorialDone = a.tutorialDone || b.tutorialDone;
  merged.checkpoint = newerCheckpoint(a.checkpoint, b.checkpoint);
  merged.savedAt = time(a.savedAt) >= time(b.savedAt) ? a.savedAt : b.savedAt;
  return progressFromUnknown(merged);
}

/** Vrai s'il y a quelque chose à sauvegarder : une campagne commencée, un agent créé ou une mission en cours. */
export function hasProgressContent(progress: PlayerProgress): boolean {
  return Object.keys(progress.records).length > 0 || Object.keys(progress.exams).length > 0 || progress.avatar !== null || progress.checkpoint !== null || progress.tutorialDone;
}

/** Sérialisation à clés triées : deux objets de même contenu donnent le même texte, quel que soit l'ordre des clés. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    return `{${entries.map(([key, inner]) => `${JSON.stringify(key)}:${canonical(inner)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** Égalité de contenu (ignore la date d'écriture) : évite de renvoyer au serveur une progression déjà identique. */
export function sameProgress(first: PlayerProgress, second: PlayerProgress): boolean {
  const normalize = (progress: PlayerProgress): string => canonical({ ...progressFromUnknown(progress), savedAt: null });
  return normalize(first) === normalize(second);
}
