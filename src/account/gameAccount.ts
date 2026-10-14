import type { AccountApi } from "./api";
import { CloudSync, type SyncStatus } from "./cloudSync";
import { Observable } from "./observable";
import type { SessionStore } from "./session";
import type { ProgressStore } from "../game/progress";
import { sameProgress } from "../game/progressMerge";

/**
 * Compte du joueur côté jeu : démarre la synchronisation de la progression dès qu'on est connecté, l'arrête à la
 * déconnexion. Sans compte (ou hors ligne), le jeu fonctionne exactement comme avant, avec la sauvegarde locale.
 */
export class GameAccount {
  readonly syncStatus = new Observable<SyncStatus>("idle");
  /** Appelé quand la synchronisation a modifié la progression locale (données reçues du compte). */
  onProgressReplaced: (() => void) | null = null;
  private sync: CloudSync | null = null;

  constructor(
    readonly session: SessionStore,
    readonly api: AccountApi,
    private readonly store: ProgressStore,
    private readonly courseId: string,
  ) {}

  /** À appeler une fois au démarrage du jeu. */
  async init(): Promise<void> {
    this.session.subscribe((state) => {
      if (state.status === "authenticated") this.startSync();
      else this.stopSync();
    });
    await this.session.refresh();
  }

  private startSync(): void {
    if (this.sync) return;
    const before = JSON.parse(JSON.stringify(this.store.snapshot));
    const sync = new CloudSync(this.api, this.store, this.courseId);
    sync.onStatus = (status) => this.syncStatus.set(status);
    sync.onSessionExpired = () => this.session.markExpired();
    this.sync = sync;
    // Inscription au cours : idempotente, et sans conséquence si le réseau manque (rejouée à la prochaine connexion).
    this.api.enroll(this.courseId).catch(() => undefined);
    void sync.start().then(() => {
      if (this.sync === sync && !sameProgress(before, this.store.snapshot)) this.onProgressReplaced?.();
    });
  }

  private stopSync(): void {
    this.sync?.stop();
    this.sync = null;
    this.syncStatus.set("idle");
  }
}
