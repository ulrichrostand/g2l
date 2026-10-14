import { describe, expect, it } from "vitest";
import { ApiError, type CloudProgress } from "../src/account/api";
import { CloudSync, type CloudApi, type SyncTimers } from "../src/account/cloudSync";
import { DEFAULT_AVATAR } from "../src/avatar/avatarConfig";
import { ProgressStore, progressFromUnknown, type KeyValueStorage, type PlayerProgress } from "../src/game/progress";

class MemoryStorage implements KeyValueStorage {
  values = new Map<string, string>();
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

/** Faux serveur : même contrat que l'API (versions, conflit 409), avec des pannes à la demande. */
class FakeCloud implements CloudApi {
  stored: { version: number; data: unknown } | null = null;
  offline = false;
  expired = false;
  gets = 0;
  puts = 0;
  /** Appelé juste avant une écriture : permet de simuler un autre appareil qui écrit entre-temps. */
  beforePut: (() => void) | null = null;

  async getProgress(): Promise<CloudProgress | null> {
    this.gets++;
    this.check();
    return this.stored ? { version: this.stored.version, updatedAt: "2026-10-14T00:00:00.000Z", data: structuredClone(this.stored.data) } : null;
  }

  async putProgress(_courseId: string, baseVersion: number, data: unknown): Promise<{ version: number; updatedAt: string }> {
    this.puts++;
    this.check();
    this.beforePut?.();
    this.beforePut = null;
    const currentVersion = this.stored?.version ?? 0;
    if (baseVersion !== currentVersion) {
      throw new ApiError(409, "conflict", "conflit", { current: this.stored ? { version: this.stored.version, updatedAt: "2026-10-14T00:00:00.000Z", data: structuredClone(this.stored.data) } : null });
    }
    this.stored = { version: currentVersion + 1, data: structuredClone(data) };
    return { version: this.stored.version, updatedAt: "2026-10-14T00:00:00.000Z" };
  }

  parseCloudProgress(json: unknown): CloudProgress {
    return json as CloudProgress;
  }

  private check(): void {
    if (this.offline) throw new ApiError(0, "network", "hors ligne");
    if (this.expired) throw new ApiError(401, "unauthorized", "connexion requise");
  }
}

class ManualTimers implements SyncTimers {
  pending = new Map<number, { handler: () => void; ms: number }>();
  private nextId = 1;
  setTimeout(handler: () => void, ms: number): number {
    const id = this.nextId++;
    this.pending.set(id, { handler, ms });
    return id;
  }
  clearTimeout(id: number): void {
    this.pending.delete(id);
  }
  async runAll(): Promise<void> {
    const batch = [...this.pending.values()];
    this.pending.clear();
    for (const { handler } of batch) handler();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

const record = (stars: 1 | 2 | 3, bestScore: number) => ({ bestScore, stars, ghost: false, completedAt: "2026-10-01T10:00:00.000Z" });

function setup(localParts: Partial<PlayerProgress> = {}) {
  const storage = new MemoryStorage();
  const store = new ProgressStore(storage);
  if (Object.keys(localParts.records ?? {}).length > 0) for (const [id, value] of Object.entries(localParts.records!)) store.saveResult(id, value);
  const cloud = new FakeCloud();
  const timers = new ManualTimers();
  const sync = new CloudSync(cloud, store, "devops", timers);
  return { store, cloud, timers, sync, storage };
}

describe("synchronisation de la progression", () => {
  it("envoie la progression locale quand le compte n'en a pas encore", async () => {
    const { cloud, sync, store } = setup({ records: { kernel: record(2, 300) } });
    await sync.start();
    expect(cloud.stored?.version).toBe(1);
    expect(progressFromUnknown(cloud.stored?.data).records.kernel?.stars).toBe(2);
    expect(sync.currentStatus).toBe("synced");
    expect(store.snapshot.records.kernel?.bestScore).toBe(300);
  });

  it("n'envoie rien quand il n'y a rien à sauvegarder", async () => {
    const { cloud, sync } = setup();
    await sync.start();
    expect(cloud.puts).toBe(0);
    expect(sync.currentStatus).toBe("synced");
  });

  it("récupère la progression du compte sur un appareil vide", async () => {
    const { cloud, sync, store } = setup();
    cloud.stored = { version: 4, data: { version: 2, records: { kernel: record(3, 900) }, exams: {}, avatar: DEFAULT_AVATAR, tutorialDone: true, checkpoint: null, savedAt: null } };
    await sync.start();
    expect(store.snapshot.records.kernel?.stars).toBe(3);
    expect(store.snapshot.avatar).not.toBeNull();
    expect(cloud.puts).toBe(0);
  });

  it("fusionne l'appareil et le compte, puis met le compte à jour", async () => {
    const { cloud, sync, store } = setup({ records: { nimbus: record(1, 100) } });
    cloud.stored = { version: 2, data: { version: 2, records: { kernel: record(3, 900) }, exams: {}, avatar: null, tutorialDone: false, checkpoint: null, savedAt: null } };
    await sync.start();
    expect(Object.keys(store.snapshot.records).sort()).toEqual(["kernel", "nimbus"]);
    expect(Object.keys(progressFromUnknown(cloud.stored.data).records).sort()).toEqual(["kernel", "nimbus"]);
    expect(cloud.stored.version).toBe(3);
  });

  it("n'écrit pas sur le serveur quand tout est déjà identique", async () => {
    const { cloud, sync, store } = setup({ records: { kernel: record(2, 300) } });
    cloud.stored = { version: 7, data: JSON.parse(JSON.stringify(store.snapshot)) };
    await sync.start();
    expect(cloud.puts).toBe(0);
  });

  it("envoie en différé chaque nouvelle sauvegarde locale, sans redemander la version au serveur", async () => {
    const { cloud, sync, store, timers } = setup({ records: { kernel: record(2, 300) } });
    await sync.start();
    const getsAfterStart = cloud.gets;
    store.saveResult("nimbus", record(1, 50));
    store.saveResult("vault", record(3, 70));
    expect(timers.pending.size).toBe(1);
    await timers.runAll();
    expect(cloud.gets).toBe(getsAfterStart);
    expect(Object.keys(progressFromUnknown(cloud.stored?.data).records).sort()).toEqual(["kernel", "nimbus", "vault"]);
  });

  it("résout un conflit avec un autre appareil en fusionnant, sans rien perdre", async () => {
    const { cloud, sync, store, timers } = setup({ records: { kernel: record(2, 300) } });
    await sync.start();
    // Pendant ce temps, un autre appareil sauvegarde un secteur différent.
    cloud.stored = { version: 5, data: { version: 2, records: { kernel: record(2, 300), vault: record(3, 800) }, exams: {}, avatar: null, tutorialDone: false, checkpoint: null, savedAt: null } };
    store.saveResult("nimbus", record(1, 50));
    await timers.runAll();
    const merged = progressFromUnknown(cloud.stored?.data);
    expect(Object.keys(merged.records).sort()).toEqual(["kernel", "nimbus", "vault"]);
    expect(Object.keys(store.snapshot.records).sort()).toEqual(["kernel", "nimbus", "vault"]);
    expect(cloud.stored?.version).toBe(6);
  });

  it("une panne réseau ne perd rien : statut hors ligne, nouvel essai plus tard, puis rattrapage", async () => {
    const { cloud, sync, store, timers } = setup({ records: { kernel: record(2, 300) } });
    cloud.offline = true;
    await sync.start();
    expect(sync.currentStatus).toBe("offline");
    expect(store.snapshot.records.kernel?.stars).toBe(2);
    expect([...timers.pending.values()][0]?.ms).toBe(30_000);
    cloud.offline = false;
    await timers.runAll();
    expect(sync.currentStatus).toBe("synced");
    expect(cloud.stored?.version).toBe(1);
  });

  it("s'arrête et prévient quand la session a expiré", async () => {
    const { cloud, sync, timers } = setup({ records: { kernel: record(2, 300) } });
    let expired = false;
    sync.onSessionExpired = () => {
      expired = true;
    };
    cloud.expired = true;
    await sync.start();
    expect(expired).toBe(true);
    expect(timers.pending.size).toBe(0);
    sync.scheduleSync();
    expect(timers.pending.size).toBe(0);
  });

  it("ne reboucle pas : la fusion écrite en local ne déclenche pas un nouvel envoi", async () => {
    const { cloud, sync, timers } = setup();
    cloud.stored = { version: 1, data: { version: 2, records: { kernel: record(3, 900) }, exams: {}, avatar: null, tutorialDone: false, checkpoint: null, savedAt: null } };
    await sync.start();
    expect(timers.pending.size).toBe(0);
    expect(cloud.puts).toBe(0);
  });

  it("ignore une donnée hostile du serveur : seule la partie valide entre dans la sauvegarde", async () => {
    const { cloud, sync, store } = setup();
    cloud.stored = { version: 1, data: { version: 2, records: { "__proto__": record(3, 1), kernel: { stars: 99 }, nimbus: record(2, 10) }, polluted: true } };
    await sync.start();
    expect(Object.keys(store.snapshot.records)).toEqual(["nimbus"]);
    expect((store.snapshot as unknown as Record<string, unknown>).polluted).toBeUndefined();
  });
});
