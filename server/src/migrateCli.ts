import path from "node:path";
import { fileURLToPath } from "node:url";
import { PgDb } from "./db.js";
import { migrate } from "./migrate.js";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL est requis");
  process.exit(1);
}
const db = new PgDb(url);
migrate(db, path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../migrations"))
  .then((applied) => console.log(applied.length > 0 ? `Migrations appliquées : ${applied.join(", ")}` : "Base déjà à jour"))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.close());
