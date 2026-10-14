import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { Db } from "./db.js";

const MIGRATION_FILE = /^\d{3}_[a-z0-9_]+\.sql$/;
/** Verrou consultatif : deux instances qui démarrent en même temps ne migrent pas en parallèle. */
const MIGRATION_LOCK_KEY = 727274;

/** Applique les fichiers migrations/NNN_nom.sql pas encore appliqués, dans l'ordre, chacun dans sa transaction. */
export async function migrate(db: Db, directory: string): Promise<string[]> {
  const files = (await readdir(directory)).filter((name) => MIGRATION_FILE.test(name)).sort();
  await db.exec("create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())");
  const applied: string[] = [];
  for (const name of files) {
    await db.transaction(async (tx) => {
      await tx.query("select pg_advisory_xact_lock($1)", [MIGRATION_LOCK_KEY]);
      const already = await tx.query("select 1 from schema_migrations where name = $1", [name]);
      if (already.rowCount > 0) return;
      const sql = await readFile(path.join(directory, name), "utf8");
      await tx.exec(sql);
      await tx.query("insert into schema_migrations (name) values ($1)", [name]);
      applied.push(name);
    });
  }
  return applied;
}
