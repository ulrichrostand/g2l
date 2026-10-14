import { z } from "zod";

const booleanFromEnv = z.enum(["true", "false", "1", "0"]).transform((value) => value === "true" || value === "1");

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  /** Adresse d'écoute. Par défaut locale seulement : on n'expose jamais le serveur par accident. */
  HOST: z.string().min(1).default("127.0.0.1"),
  DATABASE_URL: z.string().url(),
  /** Origines autorisées à appeler l'API avec le cookie de session (adresse publique du site), séparées par des virgules. */
  ALLOWED_ORIGINS: z.string().min(1),
  /** Cookie « Secure » : obligatoire en production (HTTPS). Désactivable pour un essai en HTTP local seulement. */
  COOKIE_SECURE: booleanFromEnv.optional(),
  /** À activer derrière un reverse proxy de confiance (Caddy) pour lire la vraie adresse IP du visiteur. */
  TRUST_PROXY: booleanFromEnv.default("false"),
  SESSION_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  MIGRATE_ON_START: booleanFromEnv.default("true"),
});

export interface Config {
  nodeEnv: "development" | "test" | "production";
  port: number;
  host: string;
  databaseUrl: string;
  allowedOrigins: string[];
  cookieSecure: boolean;
  trustProxy: boolean;
  sessionDays: number;
  migrateOnStart: boolean;
}

function parseOrigins(raw: string): string[] {
  return raw
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin !== "")
    .map((origin) => {
      let parsed: URL;
      try {
        parsed = new URL(origin);
      } catch {
        throw new Error(`ALLOWED_ORIGINS : « ${origin} » n'est pas une adresse valide`);
      }
      if (parsed.pathname !== "/" || parsed.search || parsed.hash) throw new Error(`ALLOWED_ORIGINS : « ${origin} » doit être une origine (schéma, hôte, port), sans chemin`);
      return parsed.origin;
    });
}

/** Lit et valide l'environnement au démarrage : une configuration incorrecte arrête le serveur avec un message clair. */
export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => `${issue.path.join(".")} : ${issue.message}`).join("\n  ");
    throw new Error(`Configuration invalide :\n  ${problems}`);
  }
  const values = parsed.data;
  const allowedOrigins = parseOrigins(values.ALLOWED_ORIGINS);
  if (allowedOrigins.length === 0) throw new Error("ALLOWED_ORIGINS : au moins une origine est requise");
  const cookieSecure = values.COOKIE_SECURE ?? values.NODE_ENV === "production";
  if (values.NODE_ENV === "production" && !cookieSecure) throw new Error("COOKIE_SECURE=false est interdit en production (HTTPS obligatoire)");
  if (values.NODE_ENV === "production" && allowedOrigins.some((origin) => !origin.startsWith("https://"))) {
    throw new Error("ALLOWED_ORIGINS : en production, toutes les origines doivent être en https");
  }
  return {
    nodeEnv: values.NODE_ENV,
    port: values.PORT,
    host: values.HOST,
    databaseUrl: values.DATABASE_URL,
    allowedOrigins,
    cookieSecure,
    trustProxy: values.TRUST_PROXY,
    sessionDays: values.SESSION_DAYS,
    migrateOnStart: values.MIGRATE_ON_START,
  };
}
