import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { FailureLimiter } from "../src/limiter.js";
import { migrate } from "../src/migrate.js";
import { hashPassword, hashSessionToken, newSessionToken, normalizeEmail, passwordProblem, verifyPassword } from "../src/security.js";
import { createTestDb } from "./support/testApp.js";

const baseEnv = { DATABASE_URL: "postgres://u:p@localhost:5432/g2l", ALLOWED_ORIGINS: "https://g2l.exemple.fr" };

describe("configuration", () => {
  it("lit les valeurs avec des défauts prudents (écoute locale, proxy non approuvé)", () => {
    const config = loadConfig({ ...baseEnv, NODE_ENV: "development" });
    expect(config).toMatchObject({ host: "127.0.0.1", port: 3000, trustProxy: false, sessionDays: 30, cookieSecure: false, migrateOnStart: true });
    expect(config.allowedOrigins).toEqual(["https://g2l.exemple.fr"]);
  });

  it("exige HTTPS et le cookie Secure en production", () => {
    expect(loadConfig({ ...baseEnv, NODE_ENV: "production" }).cookieSecure).toBe(true);
    expect(() => loadConfig({ ...baseEnv, NODE_ENV: "production", COOKIE_SECURE: "false" })).toThrow(/COOKIE_SECURE/);
    expect(() => loadConfig({ ...baseEnv, NODE_ENV: "production", ALLOWED_ORIGINS: "http://g2l.exemple.fr" })).toThrow(/https/);
  });

  it("refuse une configuration incomplète ou invalide, avec un message clair", () => {
    expect(() => loadConfig({ ALLOWED_ORIGINS: "https://a.fr" })).toThrow(/DATABASE_URL/);
    expect(() => loadConfig({ DATABASE_URL: baseEnv.DATABASE_URL })).toThrow(/ALLOWED_ORIGINS/);
    expect(() => loadConfig({ ...baseEnv, ALLOWED_ORIGINS: "https://a.fr/chemin" })).toThrow(/origine/);
    expect(() => loadConfig({ ...baseEnv, ALLOWED_ORIGINS: "pas une adresse" })).toThrow(/valide/);
    expect(() => loadConfig({ ...baseEnv, PORT: "99999" })).toThrow(/PORT/);
    expect(() => loadConfig({ ...baseEnv, SESSION_DAYS: "9999" })).toThrow(/SESSION_DAYS/);
  });

  it("accepte plusieurs origines et normalise leur forme", () => {
    expect(loadConfig({ ...baseEnv, ALLOWED_ORIGINS: "https://A.fr/, http://localhost:5173" }).allowedOrigins).toEqual(["https://a.fr", "http://localhost:5173"]);
  });
});

describe("mots de passe et jetons", () => {
  it("hache en Argon2id avec un sel différent à chaque fois, et vérifie", async () => {
    const first = await hashPassword("un-mot-de-passe-solide");
    const second = await hashPassword("un-mot-de-passe-solide");
    expect(first).toMatch(/^\$argon2id\$/);
    expect(first).not.toBe(second);
    expect(await verifyPassword(first, "un-mot-de-passe-solide")).toBe(true);
    expect(await verifyPassword(first, "un-autre-mot-de-passe")).toBe(false);
    expect(await verifyPassword("empreinte-illisible", "x")).toBe(false);
  });

  it("génère des jetons imprévisibles dont seule l'empreinte est conservée", () => {
    const first = newSessionToken();
    const second = newSessionToken();
    expect(first.token).not.toBe(second.token);
    expect(first.token.length).toBeGreaterThanOrEqual(43);
    expect(first.tokenHash).toHaveLength(32);
    expect(hashSessionToken(first.token).equals(first.tokenHash)).toBe(true);
  });

  it("normalise les adresses e-mail", () => {
    expect(normalizeEmail("  Joueur@Exemple.FR ")).toBe("joueur@exemple.fr");
  });

  it("explique pourquoi un mot de passe est refusé", () => {
    expect(passwordProblem("court", "a@b.fr")).toBe("too_short");
    expect(passwordProblem("x".repeat(200), "a@b.fr")).toBe("too_long");
    expect(passwordProblem("Motdepasse123", "a@b.fr")).toBe("too_common");
    expect(passwordProblem("jean.dupont", "Jean.Dupont@exemple.fr")).toBe("same_as_email");
    expect(passwordProblem("jean.dupont-2026", "Jean.Dupont@exemple.fr")).toBeNull();
    expect(passwordProblem("JEAN.DUPONT@EXEMPLE.FR", "jean.dupont@exemple.fr")).toBe("same_as_email");
    expect(passwordProblem("un-mot-de-passe-solide-42", "a@b.fr")).toBeNull();
  });
});

describe("limiteur d'échecs", () => {
  it("bloque après le seuil, puis oublie une fois la fenêtre écoulée", () => {
    const limiter = new FailureLimiter(3, 1000);
    for (let attempt = 0; attempt < 2; attempt++) limiter.recordFailure("a", 0);
    expect(limiter.isBlocked("a", 10)).toBe(false);
    limiter.recordFailure("a", 20);
    expect(limiter.isBlocked("a", 30)).toBe(true);
    expect(limiter.isBlocked("b", 30)).toBe(false);
    expect(limiter.isBlocked("a", 1500)).toBe(false);
  });

  it("se remet à zéro après un succès, et garde une mémoire bornée", () => {
    const limiter = new FailureLimiter(1, 1000, 3);
    limiter.recordFailure("a", 0);
    limiter.reset("a");
    expect(limiter.isBlocked("a", 1)).toBe(false);
    for (const key of ["k1", "k2", "k3", "k4"]) limiter.recordFailure(key, 0);
    expect(limiter.isBlocked("k1", 1)).toBe(false);
    expect(limiter.isBlocked("k4", 1)).toBe(true);
  });
});

describe("migrations", () => {
  it("crée le schéma, ne s'applique qu'une fois et est reproductible", async () => {
    const db = await createTestDb();
    for (const table of ["users", "sessions", "enrollments", "progress", "schema_migrations"]) {
      expect((await db.query("select 1 from information_schema.tables where table_name = $1", [table])).rowCount, table).toBe(1);
    }
    const directory = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../migrations");
    expect(await migrate(db, directory)).toEqual([]);
    await db.raw.close();
  });

  it("applique les nouveaux fichiers dans l'ordre et annule une migration qui échoue", async () => {
    const db = await createTestDb();
    const directory = await mkdtemp(path.join(tmpdir(), "migrations-"));
    await writeFile(path.join(directory, "001_a.sql"), "create table a (id int);");
    await writeFile(path.join(directory, "002_b.sql"), "create table b (id int); select * from table_inexistante;");
    await writeFile(path.join(directory, "note.txt"), "ignoré");
    await expect(migrate(db, directory)).rejects.toThrow();
    expect((await db.query("select 1 from information_schema.tables where table_name = 'a'")).rowCount).toBe(1);
    expect((await db.query("select 1 from information_schema.tables where table_name = 'b'")).rowCount).toBe(0);
    expect((await db.query("select name from schema_migrations where name like '00%_%' and name in ('001_a.sql','002_b.sql')")).rows).toEqual([{ name: "001_a.sql" }]);
    await db.raw.close();
  });
});
