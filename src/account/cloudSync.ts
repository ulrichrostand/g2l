import { ApiError, type AccountApi } from "./api";

/** Ce dont la synchronisation a besoin : permet de la tester avec un faux serveur. */
export type CloudApi = Pick<AccountApi, "getProgress" | "putProgress" | "parseCloudProgress">;
import { progressFromUnknown, type PlayerProgress, type ProgressStore } from "../game/progress";
import { hasProgressContent, mergeProgress, sameProgress } from "../game/progressMerge";

export type SyncStatus = "idle" | "syncing" | "synced" | "offline" | "error";

const PUSH_DELAY_MS = 3000;
const MAX_CONFLICT_RETRIES = 3;
const RETRY_DELAY_MS = 30_000;

export interface SyncTimers {
  setTimeout(handler: () => void, ms: number): number;
  clearTimeout(id: number): void;
}

/**
 * Synchronise la progression locale avec celle du compte. Règles :
 * - rien n'est jamais perdu : à chaque désaccord on FUSIONNE (meilleur de chaque côté) au lieu de choisir un camp ;
 * - la synchronisation est « au mieux » : une panne réseau ne gêne jamais le jeu, on réessaie plus tard ;
 * - les données reçues sont revalidées avant d'entrer dans la sauvegarde locale.
 */
export class CloudSync {
  private version = 0;
  private status: SyncStatus = "idle";
  private timer: number | null = null;
  private running: Promise<void> | null = null;
  private dirtyWhileRunning = false;
  /** Vrai pendant que la fusion écrit dans la sauvegarde locale : cette écriture ne doit pas déclencher un nouvel envoi. */
  private applyingRemote = false;
  private stopped = true;
  /** Dernière progression connue du serveur : tant que rien n'a changé depuis, inutile de le déranger. */
  private lastSynced: PlayerProgress | null = null;
  onStatus: ((status: SyncStatus) => void) | null = null;
  onSessionExpired: (() => void) | null = null;

  constructor(
    private readonly api: CloudApi,
    private readonly store: ProgressStore,
    private readonly courseId: string,
    private readonly timers: SyncTimers = { setTimeout: (handler, ms) => window.setTimeout(handler, ms), clearTimeout: (id) => window.clearTimeout(id) },
  ) {}

  get currentStatus(): SyncStatus {
    return this.status;
  }

  /** Démarre : synchronisation initiale, puis envoi différé après chaque sauvegarde locale. */
  start(): Promise<void> {
    this.stopped = false;
    const previous = this.store.onSaved;
    this.store.onSaved = (savedAt) => {
      previous?.(savedAt);
      if (!this.applyingRemote) this.scheduleSync();
    };
    return this.syncNow();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer !== null) this.timers.clearTimeout(this.timer);
    this.timer = null;
  }

  scheduleSync(delay = PUSH_DELAY_MS): void {
    if (this.stopped) return;
    if (this.timer !== null) this.timers.clearTimeout(this.timer);
    this.timer = this.timers.setTimeout(() => {
      this.timer = null;
      void this.syncNow();
    }, delay);
  }

  /** Une seule synchronisation à la fois ; une demande arrivée pendant l'une est rejouée juste après. */
  syncNow(): Promise<void> {
    if (this.stopped) return Promise.resolve();
    if (this.running) {
      this.dirtyWhileRunning = true;
      return this.running;
    }
    this.running = this.runOnce().finally(() => {
      this.running = null;
      if (this.dirtyWhileRunning) {
        this.dirtyWhileRunning = false;
        this.scheduleSync(0);
      }
    });
    return this.running;
  }

  private setStatus(status: SyncStatus): void {
    this.status = status;
    this.onStatus?.(status);
  }

  private async runOnce(): Promise<void> {
    // Après la première synchronisation, on n'envoie que ce qui a changé ; un désaccord éventuel sort par le conflit 409.
    if (this.lastSynced && sameProgress(this.store.snapshot, this.lastSynced)) return;
    this.setStatus("syncing");
    try {
      if (this.lastSynced) {
        await this.push();
        this.lastSynced = progressFromUnknown(this.store.snapshot);
        this.setStatus("synced");
        return;
      }
      const remote = await this.api.getProgress(this.courseId);
      let local: PlayerProgress = this.store.snapshot;
      if (remote) {
        this.version = remote.version;
        const merged = mergeProgress(local, progressFromUnknown(remote.data));
        if (!sameProgress(merged, local)) this.applyLocally(merged);
        local = this.store.snapshot;
        if (!sameProgress(local, progressFromUnknown(remote.data))) await this.push();
      } else if (hasProgressContent(local)) {
        this.version = 0;
        await this.push();
      }
      this.lastSynced = progressFromUnknown(this.store.snapshot);
      this.setStatus("synced");
    } catch (error) {
      this.handleFailure(error);
    }
  }

  /** Envoie la progression ; en cas de version périmée (autre appareil), fusionne avec celle du serveur puis réessaie. */
  private async push(): Promise<void> {
    for (let attempt = 0; attempt <= MAX_CONFLICT_RETRIES; attempt++) {
      try {
        const saved = await this.api.putProgress(this.courseId, this.version, this.store.snapshot);
        this.version = saved.version;
        return;
      } catch (error) {
        if (!(error instanceof ApiError) || error.code !== "conflict") throw error;
        const current = error.details.current;
        if (current === null || current === undefined) {
          this.version = 0;
          continue;
        }
        const cloud = this.api.parseCloudProgress(current);
        this.version = cloud.version;
        const merged = mergeProgress(this.store.snapshot, progressFromUnknown(cloud.data));
        if (!sameProgress(merged, this.store.snapshot)) this.applyLocally(merged);
        if (sameProgress(this.store.snapshot, progressFromUnknown(cloud.data))) return;
      }
    }
    throw new ApiError(409, "conflict", "Trop de conflits de synchronisation.");
  }

  private applyLocally(progress: PlayerProgress): void {
    this.applyingRemote = true;
    try {
      this.store.replaceWith(progress);
    } finally {
      this.applyingRemote = false;
    }
  }

  private handleFailure(error: unknown): void {
    if (error instanceof ApiError && error.status === 401) {
      this.stop();
      this.setStatus("idle");
      this.onSessionExpired?.();
      return;
    }
    if (error instanceof ApiError && error.isNetworkError) {
      this.setStatus("offline");
    } else {
      console.warn("Synchronisation impossible pour le moment.", error);
      this.setStatus("error");
    }
    // Nouvel essai plus tard : la progression locale est intacte, rien n'est perdu.
    this.scheduleSync(RETRY_DELAY_MS);
  }
}
