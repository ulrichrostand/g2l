import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { PgDb } from "./db.js";
import { migrate } from "./migrate.js";
import { purgeExpiredSessions } from "./sessions.js";

const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../migrations");
const PURGE_INTERVAL_MS = 3_600_000;

async function main(): Promise<void> {
  const config = loadConfig(process.env);
  const db = new PgDb(config.databaseUrl);
  if (config.migrateOnStart) {
    const applied = await migrate(db, MIGRATIONS_DIR);
    if (applied.length > 0) console.log(`Migrations appliquées : ${applied.join(", ")}`);
  }
  const app = await buildApp({ config, db });
  const purgeTimer = setInterval(() => {
    purgeExpiredSessions(db).catch((error: unknown) => app.log.error({ err: error }, "Nettoyage des sessions impossible"));
  }, PURGE_INTERVAL_MS);
  purgeTimer.unref();

  // Arrêt propre : on cesse d'accepter des requêtes, on laisse finir celles en cours, puis on ferme la base.
  const shutdown = async (signal: string): Promise<void> => {
    app.log.info(`${signal} reçu, arrêt en cours`);
    clearInterval(purgeTimer);
    await app.close();
    await db.close();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  await app.listen({ host: config.host, port: config.port });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
