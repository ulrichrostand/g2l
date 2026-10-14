import { describe, expect, it } from "vitest";
import { DEFAULT_AVATAR } from "../src/avatar/avatarConfig";
import { emptyProgress, type MissionCheckpoint, type PlayerProgress } from "../src/game/progress";
import { hasProgressContent, mergeProgress, sameProgress } from "../src/game/progressMerge";

function progressWith(parts: Partial<PlayerProgress>): PlayerProgress {
  return { ...emptyProgress(), ...parts };
}

const record = (stars: 1 | 2 | 3, bestScore: number, completedAt = "2026-10-01T10:00:00.000Z") => ({ bestScore, stars, ghost: false, completedAt });
const checkpoint = (savedAt: string, moduleId = "kernel"): MissionCheckpoint => ({
  moduleId,
  hackedTerminals: [],
  wrongAttemptsPerTerminal: [],
  collectedIntel: [],
  readLessons: [],
  neutralizedGuards: [],
  firewalledCameras: [],
  ammo: 10,
  livesLeft: 3,
  detections: 0,
  neutralizations: 0,
  elapsedSeconds: 30,
  playerCell: { x: 1, z: 1 },
  bossDefeated: false,
  layoutVersion: 2,
  savedAt,
});

describe("fusion de progressions", () => {
  it("garde le meilleur de chaque côté, secteur par secteur", () => {
    const device = progressWith({ records: { kernel: record(3, 900), nimbus: record(1, 100) } });
    const account = progressWith({ records: { kernel: record(2, 1500), vault: record(2, 400) } });
    const merged = mergeProgress(device, account);
    expect(Object.keys(merged.records).sort()).toEqual(["kernel", "nimbus", "vault"]);
    expect(merged.records.kernel).toMatchObject({ stars: 3, bestScore: 900 });
    expect(merged.records.nimbus?.stars).toBe(1);
    expect(merged.records.vault?.stars).toBe(2);
  });

  it("à étoiles égales, prend le meilleur score, puis le plus récent", () => {
    const merged = mergeProgress(progressWith({ records: { kernel: record(2, 500), nimbus: record(2, 500, "2026-10-01T00:00:00.000Z") } }), progressWith({ records: { kernel: record(2, 700), nimbus: record(2, 500, "2026-11-01T00:00:00.000Z") } }));
    expect(merged.records.kernel?.bestScore).toBe(700);
    expect(merged.records.nimbus?.completedAt).toBe("2026-11-01T00:00:00.000Z");
  });

  it("garde les meilleures notes d'examen et le plus grand nombre d'essais", () => {
    const merged = mergeProgress(
      progressWith({ exams: { general: { bestGrade: 12, attempts: 3, lastTakenAt: "2026-10-02T00:00:00.000Z" } } }),
      progressWith({ exams: { general: { bestGrade: 15, attempts: 1, lastTakenAt: "2026-10-05T00:00:00.000Z" } } }),
    );
    expect(merged.exams.general).toEqual({ bestGrade: 15, attempts: 3, lastTakenAt: "2026-10-05T00:00:00.000Z" });
  });

  it("garde l'agent le plus récent, le tutoriel vu et la mission en cours la plus récente", () => {
    const old = { ...DEFAULT_AVATAR, hairColor: "#111111" };
    const recent = { ...DEFAULT_AVATAR, hairColor: "#222222" };
    const merged = mergeProgress(
      progressWith({ avatar: old, savedAt: "2026-10-01T00:00:00.000Z", tutorialDone: true, checkpoint: checkpoint("2026-10-01T00:00:00.000Z", "kernel") }),
      progressWith({ avatar: recent, savedAt: "2026-10-09T00:00:00.000Z", tutorialDone: false, checkpoint: checkpoint("2026-10-09T00:00:00.000Z", "nimbus") }),
    );
    expect(merged.avatar?.hairColor).toBe("#222222");
    expect(merged.tutorialDone).toBe(true);
    expect(merged.checkpoint?.moduleId).toBe("nimbus");
    expect(merged.savedAt).toBe("2026-10-09T00:00:00.000Z");
  });

  it("prend l'agent d'un seul côté quand l'autre n'en a pas", () => {
    expect(mergeProgress(progressWith({ avatar: DEFAULT_AVATAR }), emptyProgress()).avatar).not.toBeNull();
    expect(mergeProgress(emptyProgress(), progressWith({ avatar: DEFAULT_AVATAR })).avatar).not.toBeNull();
    expect(mergeProgress(emptyProgress(), emptyProgress()).avatar).toBeNull();
  });

  it("est symétrique et idempotente", () => {
    const first = progressWith({ records: { kernel: record(3, 900), nimbus: record(1, 100) }, tutorialDone: true, savedAt: "2026-10-03T00:00:00.000Z" });
    const second = progressWith({ records: { kernel: record(2, 1500), vault: record(2, 400) }, savedAt: "2026-10-02T00:00:00.000Z" });
    const ab = mergeProgress(first, second);
    const ba = mergeProgress(second, first);
    expect(sameProgress(ab, ba)).toBe(true);
    expect(mergeProgress(ab, first)).toEqual(ab);
    expect(mergeProgress(ab, second)).toEqual(ab);
    expect(mergeProgress(ab, ab)).toEqual(ab);
  });

  it("ne fait jamais reculer : le résultat est au moins aussi bon que chaque entrée", () => {
    const first = progressWith({ records: { kernel: record(3, 900) } });
    const second = progressWith({ records: { kernel: record(1, 9999) } });
    expect(mergeProgress(first, second).records.kernel?.stars).toBe(3);
    expect(mergeProgress(second, first).records.kernel?.stars).toBe(3);
  });

  it("revalide ses entrées : une donnée hostile venue du réseau ne passe pas", () => {
    const hostile = { version: 2, records: { "__proto__": record(3, 1), kernel: { bestScore: "beaucoup", stars: 9 }, "Mauvais Id": record(1, 1), nimbus: record(2, 50) }, polluted: true } as unknown as PlayerProgress;
    const merged = mergeProgress(emptyProgress(), hostile);
    expect(Object.keys(merged.records)).toEqual(["nimbus"]);
    expect((merged as unknown as Record<string, unknown>).polluted).toBeUndefined();
    expect(({} as Record<string, unknown>).stars).toBeUndefined();
  });
});

describe("contenu et égalité", () => {
  it("détecte une progression vide ou non", () => {
    expect(hasProgressContent(emptyProgress())).toBe(false);
    expect(hasProgressContent(progressWith({ avatar: DEFAULT_AVATAR }))).toBe(true);
    expect(hasProgressContent(progressWith({ records: { kernel: record(1, 1) } }))).toBe(true);
    expect(hasProgressContent(progressWith({ tutorialDone: true }))).toBe(true);
  });

  it("compare le contenu sans tenir compte de la date d'écriture ni de l'ordre des clés", () => {
    const first = progressWith({ records: { kernel: record(2, 5), nimbus: record(1, 3) }, savedAt: "2026-10-01T00:00:00.000Z" });
    const second = progressWith({ records: { nimbus: record(1, 3), kernel: record(2, 5) }, savedAt: "2026-12-25T00:00:00.000Z" });
    expect(sameProgress(first, second)).toBe(true);
    expect(sameProgress(first, progressWith({ records: { kernel: record(3, 5) } }))).toBe(false);
  });
});
