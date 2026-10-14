import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { buildApp, type RateLimits } from "../../src/app.js";
import type { Config } from "../../src/config.js";
import type { Db, QueryResult } from "../../src/db.js";
import { migrate } from "../../src/migrate.js";

export const SITE_ORIGIN = "https://site.test";
export const GOOD_PASSWORD = "un-mot-de-passe-solide-42";
const MIGRATIONS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../migrations");

export const testConfig: Config = {
  nodeEnv: "test",
  port: 0,
  host: "127.0.0.1",
  databaseUrl: "postgres://inutilise",
  allowedOrigins: [SITE_ORIGIN],
  cookieSecure: true,
  trustProxy: false,
  sessionDays: 30,
  migrateOnStart: false,
};

/** Limites larges : les tests de logique ne doivent pas être gênés par la limitation de débit (testée à part). */
export const relaxedLimits: RateLimits = {
  global: { max: 100_000, timeWindow: "1 minute" },
  register: { max: 100_000, timeWindow: "1 minute" },
  login: { max: 100_000, timeWindow: "1 minute" },
  loginFailuresPerEmail: { max: 5, windowMs: 60_000 },
};

function wrap(pg: { query: PGlite["query"]; exec: PGlite["exec"] }, transaction: Db["transaction"]): Db {
  return {
    async query<Row>(sql: string, params: readonly unknown[] = []): Promise<QueryResult<Row>> {
      const result = await pg.query<Row>(sql, params as unknown[]);
      return { rows: result.rows, rowCount: Math.max(result.affectedRows ?? 0, result.rows.length) };
    },
    async exec(sql: string): Promise<void> {
      await pg.exec(sql);
    },
    transaction,
    close: async () => undefined,
  };
}

/** Vraie base PostgreSQL (en mémoire, via PGlite) : les migrations et les requêtes SQL sont réellement exécutées. */
export async function createTestDb(): Promise<Db & { raw: PGlite }> {
  const pg = new PGlite();
  const db = wrap(pg, async (work) =>
    pg.transaction(async (tx) => {
      const inner: Db = wrap(tx, (nested) => nested(inner));
      return work(inner);
    }),
  );
  await migrate(db, MIGRATIONS);
  return Object.assign(db, { raw: pg });
}

export async function resetData(db: Db): Promise<void> {
  await db.query("truncate users cascade");
}

export interface Client {
  app: FastifyInstance;
  cookies: Record<string, string>;
  request(method: "GET" | "POST" | "PUT" | "DELETE", url: string, body?: unknown, headers?: Record<string, string>): Promise<LightMyRequestResponse>;
}

/** Client de test : garde les cookies reçus, comme un navigateur, et envoie l'origine du site sur les écritures. */
export function createClient(app: FastifyInstance): Client {
  const client: Client = {
    app,
    cookies: {},
    async request(method, url, body, headers = {}) {
      const response = await app.inject({
        method,
        url,
        headers: { origin: SITE_ORIGIN, ...headers },
        cookies: client.cookies,
        ...(body !== undefined ? { payload: body as object } : {}),
      });
      for (const cookie of response.cookies) {
        if (cookie.value === "") delete client.cookies[cookie.name];
        else client.cookies[cookie.name] = cookie.value;
      }
      return response;
    },
  };
  return client;
}

export async function newApp(db: Db, overrides: Partial<Config> = {}, limits: RateLimits = relaxedLimits): Promise<FastifyInstance> {
  return buildApp({ config: { ...testConfig, ...overrides }, db, rateLimits: limits });
}

let counter = 0;
export function uniqueEmail(): string {
  counter++;
  return `joueur${counter}@exemple.fr`;
}

export async function registerUser(client: Client, email = uniqueEmail(), courseId?: string): Promise<string> {
  const response = await client.request("POST", "/api/auth/register", { email, password: GOOD_PASSWORD, ...(courseId ? { courseId } : {}) });
  if (response.statusCode !== 201) throw new Error(`Inscription de test refusée : ${response.statusCode} ${response.body}`);
  return email;
}
