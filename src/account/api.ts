import { API_BASE } from "./config";

export interface AccountUser {
  id: string;
  email: string;
}

export interface CloudProgress {
  version: number;
  updatedAt: string;
  data: unknown;
}

/** Erreur renvoyée par l'API (code stable, utilisé pour choisir le message affiché) ou panne réseau (status 0). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }

  get isNetworkError(): boolean {
    return this.status === 0;
  }
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const REQUEST_TIMEOUT_MS = 10_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Client de l'API. Toutes les réponses sont revalidées : on ne fait pas confiance à la forme d'un JSON reçu.
 * Aucune méthode ne renvoie d'élément HTML : les textes d'erreur du serveur ne sont jamais affichés tels quels
 * (l'interface choisit son propre message d'après le code).
 */
export class AccountApi {
  constructor(
    private readonly fetchImpl: FetchLike = (input, init) => fetch(input, init),
    private readonly base: string = API_BASE,
  ) {}

  private async request(method: string, path: string, body?: unknown): Promise<{ status: number; json: unknown }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.base}${path}`, {
        method,
        credentials: "same-origin",
        headers: body !== undefined ? { "Content-Type": "application/json" } : {},
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: controller.signal,
      });
    } catch {
      throw new ApiError(0, "network", "Serveur injoignable.");
    } finally {
      clearTimeout(timer);
    }
    let json: unknown = null;
    if (response.status !== 204) {
      try {
        json = await response.json();
      } catch {
        json = null;
      }
    }
    if (!response.ok) {
      const error = isRecord(json) && isRecord(json.error) ? json.error : {};
      const code = typeof error.code === "string" ? error.code : "unknown";
      const details: Record<string, unknown> = {};
      if (typeof error.reason === "string") details.reason = error.reason;
      if (error.current !== undefined) details.current = error.current;
      throw new ApiError(response.status, code, typeof error.message === "string" ? error.message : "Erreur.", details);
    }
    return { status: response.status, json };
  }

  private parseUser(json: unknown): AccountUser {
    const user = isRecord(json) ? json.user : null;
    if (!isRecord(user) || typeof user.id !== "string" || typeof user.email !== "string") throw new ApiError(502, "bad_response", "Réponse invalide.");
    return { id: user.id, email: user.email };
  }

  /** Compte connecté, ou null si personne n'est connecté. */
  async me(): Promise<{ user: AccountUser; enrollments: string[] } | null> {
    try {
      const { json } = await this.request("GET", "/me");
      const enrollments = isRecord(json) && Array.isArray(json.enrollments) ? json.enrollments.filter((id): id is string => typeof id === "string") : [];
      return { user: this.parseUser(json), enrollments };
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return null;
      throw error;
    }
  }

  async register(email: string, password: string, courseId?: string): Promise<AccountUser> {
    const { json } = await this.request("POST", "/auth/register", { email, password, ...(courseId ? { courseId } : {}) });
    return this.parseUser(json);
  }

  async login(email: string, password: string): Promise<AccountUser> {
    const { json } = await this.request("POST", "/auth/login", { email, password });
    return this.parseUser(json);
  }

  async logout(): Promise<void> {
    await this.request("POST", "/auth/logout");
  }

  async enroll(courseId: string): Promise<void> {
    await this.request("POST", `/courses/${encodeURIComponent(courseId)}/enroll`);
  }

  /** Nombre d'inscrits par cours ; un cours absent de la réponse vaut 0. */
  async courseStats(): Promise<Record<string, number>> {
    const { json } = await this.request("GET", "/courses/stats");
    const courses = isRecord(json) && isRecord(json.courses) ? json.courses : {};
    const stats: Record<string, number> = {};
    for (const [courseId, value] of Object.entries(courses)) {
      if (isRecord(value) && typeof value.enrolled === "number" && Number.isFinite(value.enrolled) && value.enrolled >= 0) stats[courseId] = Math.floor(value.enrolled);
    }
    return stats;
  }

  /** Progression enregistrée, ou null s'il n'y en a pas encore. */
  async getProgress(courseId: string): Promise<CloudProgress | null> {
    try {
      const { json } = await this.request("GET", `/progress/${encodeURIComponent(courseId)}`);
      return this.parseCloudProgress(json);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    }
  }

  /** Écriture conditionnelle : 409 (ApiError « conflict », avec `details.current`) si la version de départ est périmée. */
  async putProgress(courseId: string, baseVersion: number, data: unknown): Promise<{ version: number; updatedAt: string }> {
    const { json } = await this.request("PUT", `/progress/${encodeURIComponent(courseId)}`, { baseVersion, data });
    if (!isRecord(json) || typeof json.version !== "number" || typeof json.updatedAt !== "string") throw new ApiError(502, "bad_response", "Réponse invalide.");
    return { version: json.version, updatedAt: json.updatedAt };
  }

  /** Données du compte au format JSON, prêtes à être enregistrées dans un fichier. */
  async exportData(): Promise<string> {
    const { json } = await this.request("GET", "/me/export");
    return JSON.stringify(json, null, 2);
  }

  async deleteAccount(password: string): Promise<void> {
    await this.request("DELETE", "/me", { password });
  }

  parseCloudProgress(json: unknown): CloudProgress {
    if (!isRecord(json) || typeof json.version !== "number" || typeof json.updatedAt !== "string" || !("data" in json)) throw new ApiError(502, "bad_response", "Réponse invalide.");
    return { version: json.version, updatedAt: json.updatedAt, data: json.data };
  }
}
