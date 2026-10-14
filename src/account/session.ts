import { ACCOUNTS_ENABLED } from "./config";
import { AccountApi, ApiError, type AccountUser } from "./api";

export type SessionState = { status: "unknown" } | { status: "anonymous" } | { status: "authenticated"; user: AccountUser };

/** État de connexion partagé par l'interface : un seul endroit sait qui est connecté. */
export class SessionStore {
  private state: SessionState = { status: "unknown" };
  private readonly listeners = new Set<(state: SessionState) => void>();

  constructor(private readonly api: AccountApi) {}

  get current(): SessionState {
    return this.state;
  }

  subscribe(listener: (state: SessionState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private set(state: SessionState): void {
    this.state = state;
    for (const listener of this.listeners) listener(state);
  }

  /** Interroge le serveur. Une panne réseau laisse l'état tel quel (le jeu reste jouable hors ligne). */
  async refresh(): Promise<SessionState> {
    try {
      const me = await this.api.me();
      this.set(me ? { status: "authenticated", user: me.user } : { status: "anonymous" });
    } catch (error) {
      if (!(error instanceof ApiError && error.isNetworkError)) console.warn("État de connexion illisible.", error);
      if (this.state.status === "unknown") this.set({ status: "anonymous" });
    }
    return this.state;
  }

  async login(email: string, password: string): Promise<AccountUser> {
    const user = await this.api.login(email, password);
    this.set({ status: "authenticated", user });
    return user;
  }

  async register(email: string, password: string, courseId?: string): Promise<AccountUser> {
    const user = await this.api.register(email, password, courseId);
    this.set({ status: "authenticated", user });
    return user;
  }

  async logout(): Promise<void> {
    try {
      await this.api.logout();
    } finally {
      this.set({ status: "anonymous" });
    }
  }

  /** La session a expiré en cours de route (réponse 401) : on repasse en anonyme sans bruit. */
  markExpired(): void {
    if (this.state.status === "authenticated") this.set({ status: "anonymous" });
  }

  markDeleted(): void {
    this.set({ status: "anonymous" });
  }
}

export const accountApi = new AccountApi();
export const sessionStore = new SessionStore(accountApi);

export function accountsAvailable(): boolean {
  return ACCOUNTS_ENABLED;
}
