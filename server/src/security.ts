import { createHash, randomBytes } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";

/**
 * Paramètres Argon2id : minimum recommandé par l'OWASP (19 Mo de mémoire, 2 passes, 1 fil). Assez coûteux pour
 * ralentir une attaque par essais, assez léger pour un petit VPS.
 */
const ARGON2_OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    // Empreinte illisible : on refuse, sans distinguer ce cas d'un mauvais mot de passe.
    return false;
  }
}

let dummyHash: Promise<string> | null = null;

/**
 * Vérifie un mot de passe contre une empreinte factice. Sert quand l'e-mail est inconnu : la réponse met autant de
 * temps qu'avec un vrai compte, ce qui empêche de deviner quelles adresses sont inscrites en chronométrant.
 */
export async function spendPasswordCheckTime(password: string): Promise<void> {
  dummyHash ??= hashPassword("mot de passe factice pour égaliser les temps de réponse");
  await verifyPassword(await dummyHash, password);
}

/** Jeton de session : 256 bits aléatoires. Seule son empreinte SHA-256 est stockée en base. */
export function newSessionToken(): { token: string; tokenHash: Buffer } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashSessionToken(token) };
}

export function hashSessionToken(token: string): Buffer {
  return createHash("sha256").update(token).digest();
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Mots de passe les plus courants : refusés même s'ils atteignent la longueur minimale. */
const COMMON_PASSWORDS = new Set([
  "1234567890", "0123456789", "123456789a", "azertyuiop", "qwertyuiop", "password12", "password123", "motdepasse",
  "motdepasse1", "motdepasse12", "motdepasse123", "iloveyou12", "azerty1234", "azerty12345", "qwerty1234", "qwerty12345",
  "1q2w3e4r5t", "abcdefghij", "abcd123456", "0000000000", "1111111111", "aaaaaaaaaa", "passw0rd12", "welcome123",
  "administrator", "letmein1234", "football123", "bonjour1234", "bienvenue1", "superman123", "123456789012",
]);

export type PasswordProblem = "too_short" | "too_long" | "too_common" | "same_as_email";

/** Règle simple et lisible : longueur d'abord (10 à 128), pas de mot de passe trivial, pas l'adresse e-mail elle-même. */
export function passwordProblem(password: string, email: string): PasswordProblem | null {
  if (password.length < PASSWORD_MIN_LENGTH) return "too_short";
  if (password.length > PASSWORD_MAX_LENGTH) return "too_long";
  const lowered = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lowered) || /^(.)\1+$/.test(lowered)) return "too_common";
  const normalizedEmail = normalizeEmail(email);
  if (lowered === normalizedEmail || lowered === normalizedEmail.split("@")[0]) return "same_as_email";
  return null;
}
