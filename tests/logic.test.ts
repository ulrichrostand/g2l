import { describe, expect, it } from "vitest";
import { isAnswerCorrect, normalizeCommand } from "../src/challenges/evaluate";
import { CURRICULUM } from "../src/content/curriculum";
import { computeMissionScore } from "../src/game/scoring";
import { isModuleUnlocked, parseProgress, ProgressStore, type KeyValueStorage } from "../src/game/progress";

describe("normalizeCommand", () => {
  it("ignore espaces, guillemets, prompt et sudo", () => {
    expect(normalizeCommand("  $ sudo   grep  'ERROR'   app.log ")).toBe('grep "ERROR" app.log');
  });
});

describe("isAnswerCorrect", () => {
  const command = { kind: "command" as const, prompt: "", acceptedAnswers: ["nginx -t"], hint: "", explanation: "" };
  it("accepte une commande équivalente", () => {
    expect(isAnswerCorrect(command, { kind: "command", typedCommand: " sudo nginx  -t" })).toBe(true);
    expect(isAnswerCorrect(command, { kind: "command", typedCommand: "" })).toBe(false);
  });
  it("vérifie l'ordre exact", () => {
    const order = { kind: "order" as const, prompt: "", steps: ["a", "b", "c"], explanation: "" };
    expect(isAnswerCorrect(order, { kind: "order", orderedSteps: ["a", "b", "c"] })).toBe(true);
    expect(isAnswerCorrect(order, { kind: "order", orderedSteps: ["b", "a", "c"] })).toBe(false);
  });
  it("rejette un type de réponse incohérent", () => {
    expect(() => isAnswerCorrect(command, { kind: "choice", selectedIndex: 0 })).toThrow(TypeError);
  });
});

describe("curriculum", () => {
  it("contient 16 modules aux id uniques, en commençant par l'introduction", () => {
    expect(CURRICULUM).toHaveLength(16);
    expect(CURRICULUM[0]!.id).toBe("genesis");
    expect(new Set(CURRICULUM.map((module) => module.id)).size).toBe(CURRICULUM.length);
  });

  it.each(CURRICULUM.map((module) => [module.id, module] as const))("module %s est cohérent", (_id, module) => {
    expect(module.challenges.length).toBeGreaterThanOrEqual(5);
    // Chaque défi est préparé par une leçon de même index.
    expect(module.lessons).toHaveLength(module.challenges.length);
    for (const lesson of module.lessons) {
      expect(lesson.summary.length).toBeGreaterThan(40);
      expect(lesson.analogy.length).toBeGreaterThan(20);
      expect(lesson.keyPoint.length).toBeGreaterThan(10);
    }
    for (const challenge of module.challenges) {
      expect(challenge.explanation.length).toBeGreaterThan(20);
      if (challenge.kind === "choice") {
        expect(challenge.correctIndex).toBeGreaterThanOrEqual(0);
        expect(challenge.correctIndex).toBeLessThan(challenge.options.length);
        expect(new Set(challenge.options).size).toBe(challenge.options.length);
      }
      if (challenge.kind === "command") {
        expect(challenge.acceptedAnswers.length).toBeGreaterThan(0);
        // La 1re réponse acceptée doit valider le défi après normalisation.
        expect(isAnswerCorrect(challenge, { kind: "command", typedCommand: challenge.acceptedAnswers[0]! })).toBe(true);
      }
      if (challenge.kind === "order") {
        expect(challenge.steps.length).toBeGreaterThanOrEqual(3);
        expect(new Set(challenge.steps).size).toBe(challenge.steps.length);
      }
    }
  });
});

describe("computeMissionScore", () => {
  /** Secteur type : 5 défis + la console, 5 dossiers (réserve de 100 points), aucune vie perdue, aucune aide. */
  const perfect = {
    terminalCount: 5,
    wrongAttemptsPerTerminal: [0, 0, 0, 0, 0],
    detections: 0,
    elapsedSeconds: 120,
    intelTotal: 5,
    livesLost: 0,
    livesTotal: 3,
    unassistedChallenges: 5,
    challengeCount: 5,
  };

  it("donne 3 étoiles et le bonus fantôme pour un sans-faute", () => {
    const result = computeMissionScore(perfect);
    expect(result).toMatchObject({ score: 750, maxScore: 750, stars: 3, ghost: true, firstTryAccuracy: 1 });
    expect(result.composure).toEqual({ points: 50, max: 50 });
    expect(result.autonomy).toEqual({ points: 50, max: 50 });
  });

  it("garde le même score maximum qu'avant les dossiers obligatoires : 100 points de réserve pour 5 dossiers", () => {
    expect(computeMissionScore(perfect).maxScore).toBe(5 * 100 + 5 * 20 + 150);
  });

  it("sang-froid : chaque vie perdue retire une part égale, sans jamais descendre sous zéro", () => {
    expect(computeMissionScore({ ...perfect, livesLost: 1 }).composure.points).toBe(33);
    expect(computeMissionScore({ ...perfect, livesLost: 2 }).composure.points).toBe(17);
    expect(computeMissionScore({ ...perfect, livesLost: 9 }).composure.points).toBe(0);
  });

  it("autonomie : chaque terminal à question résolu sans aide rapporte une part égale", () => {
    expect(computeMissionScore({ ...perfect, unassistedChallenges: 4 }).autonomy.points).toBe(40);
    expect(computeMissionScore({ ...perfect, unassistedChallenges: 0 }).autonomy.points).toBe(0);
  });

  it("l'aide ne retire jamais de points : elle ne fait que priver du bonus", () => {
    const withHelp = computeMissionScore({ ...perfect, unassistedChallenges: 0 });
    const challengesOnly = perfect.terminalCount * 100 + 150 + withHelp.composure.points;
    expect(withHelp.score).toBe(challengesOnly);
  });

  it("une mission parfaite à sang-froid et autonomie moyens garde ses étoiles de façon cohérente", () => {
    const careful = computeMissionScore({ ...perfect, livesLost: 1, unassistedChallenges: 3 });
    expect(careful.score).toBe(500 + 150 + 33 + 30);
    expect(careful.stars).toBe(3);
  });

  it("ne descend jamais sous zéro", () => {
    const result = computeMissionScore({
      terminalCount: 5,
      wrongAttemptsPerTerminal: [9, 9, 9, 9, 9],
      detections: 10,
      elapsedSeconds: 1,
      intelTotal: 5,
      livesLost: 2,
      livesTotal: 3,
      unassistedChallenges: 0,
      challengeCount: 5,
    });
    expect(result.score).toBe(0);
    expect(result.stars).toBe(1);
  });

  it("tolère des valeurs incohérentes sans produire de NaN", () => {
    const result = computeMissionScore({ ...perfect, livesTotal: 0, challengeCount: 0, unassistedChallenges: 0 });
    expect(Number.isFinite(result.score)).toBe(true);
    expect(result.composure.points).toBe(50);
    expect(result.autonomy.points).toBe(50);
  });
});

describe("progress", () => {
  class MemoryStorage implements KeyValueStorage {
    values = new Map<string, string>();
    getItem(key: string) { return this.values.get(key) ?? null; }
    setItem(key: string, value: string) { this.values.set(key, value); }
  }

  it("résiste à une sauvegarde corrompue", () => {
    expect(parseProgress("{not json").records).toEqual({});
    expect(Object.keys(parseProgress('{"records":{"a":{"bestScore":"x"}}}').records)).toEqual([]);
  });

  it("garde le meilleur score et persiste", () => {
    const storage = new MemoryStorage();
    const store = new ProgressStore(storage);
    store.saveResult("kernel", { bestScore: 500, stars: 2, ghost: true });
    store.saveResult("kernel", { bestScore: 300, stars: 1, ghost: false });
    const reloaded = new ProgressStore(storage).recordFor("kernel");
    expect(reloaded).toMatchObject({ bestScore: 500, stars: 2, ghost: true });
  });

  it("débloque les modules dans l'ordre", () => {
    const ids = ["a", "b", "c"];
    const progress = parseProgress(JSON.stringify({ records: { a: { bestScore: 1, stars: 1, ghost: false, completedAt: "" } } }));
    expect(isModuleUnlocked(ids, "a", progress)).toBe(true);
    expect(isModuleUnlocked(ids, "b", progress)).toBe(true);
    expect(isModuleUnlocked(ids, "c", progress)).toBe(false);
  });

  it("garde accessible un module déjà terminé même si un module a été inséré avant", () => {
    const ids = ["intro", "a", "b"];
    const progress = parseProgress(JSON.stringify({ records: { a: { bestScore: 1, stars: 1, ghost: false, completedAt: "" } } }));
    expect(isModuleUnlocked(ids, "a", progress)).toBe(true);
    expect(isModuleUnlocked(ids, "b", progress)).toBe(true);
  });
});
