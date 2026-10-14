/**
 * Limiteur d'échecs par clé (ici l'adresse e-mail visée). Complète la limite par IP : un attaquant qui change d'adresse IP
 * à chaque essai reste bloqué sur le compte qu'il vise. Compromis connu : on peut bloquer un compte quelques minutes en
 * multipliant les échecs ; c'est préférable à laisser deviner un mot de passe.
 */
export class FailureLimiter {
  private readonly failures = new Map<string, { count: number; windowStart: number }>();

  constructor(
    private readonly maxFailures: number,
    private readonly windowMs: number,
    private readonly maxKeys = 10_000,
  ) {}

  isBlocked(key: string, now: number): boolean {
    const entry = this.failures.get(key);
    if (!entry) return false;
    if (now - entry.windowStart >= this.windowMs) {
      this.failures.delete(key);
      return false;
    }
    return entry.count >= this.maxFailures;
  }

  recordFailure(key: string, now: number): void {
    const entry = this.failures.get(key);
    if (!entry || now - entry.windowStart >= this.windowMs) {
      // Mémoire bornée : au-delà, on oublie les plus anciennes entrées plutôt que de grossir sans fin.
      if (this.failures.size >= this.maxKeys) this.evictOldest();
      this.failures.set(key, { count: 1, windowStart: now });
      return;
    }
    entry.count++;
  }

  reset(key: string): void {
    this.failures.delete(key);
  }

  private evictOldest(): void {
    const oldest = this.failures.keys().next();
    if (!oldest.done) this.failures.delete(oldest.value);
  }
}
