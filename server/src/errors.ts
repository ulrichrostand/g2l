/** Erreur attendue (entrée invalide, accès refusé...) : son message est montré au client, contrairement à une erreur interne. */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const unauthorized = (): AppError => new AppError(401, "unauthorized", "Connexion requise.");
export const notFound = (what: string): AppError => new AppError(404, "not_found", `${what} introuvable.`);
