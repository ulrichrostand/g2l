import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createClient, createTestDb, GOOD_PASSWORD, newApp, registerUser, resetData } from "./support/testApp.js";

let db: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  db = await createTestDb();
});
afterAll(async () => db.raw.close());
beforeEach(async () => resetData(db));

const app = async () => createClient(await newApp(db));

describe("inscription à un cours", () => {
  it("exige d'être connecté, refuse un cours inconnu et est idempotente", async () => {
    const client = await app();
    expect((await client.request("POST", "/api/courses/devops/enroll")).statusCode).toBe(401);
    await registerUser(client);
    expect((await client.request("POST", "/api/courses/inconnu/enroll")).json().error.code).toBe("unknown_course");
    expect((await client.request("POST", "/api/courses/devops/enroll")).statusCode).toBe(201);
    const again = await client.request("POST", "/api/courses/devops/enroll");
    expect(again.statusCode).toBe(200);
    expect(again.json().alreadyEnrolled).toBe(true);
    expect((await db.query("select 1 from enrollments")).rowCount).toBe(1);
  });
});

describe("compteur public d'inscrits", () => {
  it("compte chaque joueur une seule fois et répond sans être connecté", async () => {
    const client = await app();
    const empty = await client.app.inject({ method: "GET", url: "/api/courses/stats" });
    expect(empty.json()).toEqual({ courses: { devops: { enrolled: 0 } } });
    expect(empty.headers["cache-control"]).toContain("public");

    const fresh = await app();
    await registerUser(fresh, undefined, "devops");
    const second = createClient(fresh.app);
    await registerUser(second);
    await second.request("POST", "/api/courses/devops/enroll");
    await second.request("POST", "/api/courses/devops/enroll");
    // Nouvelle instance : le cache de 30 s est propre à chaque application.
    const stats = await createClient(await newApp(db)).app.inject({ method: "GET", url: "/api/courses/stats" });
    expect(stats.json()).toEqual({ courses: { devops: { enrolled: 2 } } });
  });

  it("n'expose aucune donnée personnelle", async () => {
    const client = await app();
    await registerUser(client, "secret@exemple.fr", "devops");
    const stats = await client.app.inject({ method: "GET", url: "/api/courses/stats" });
    expect(stats.body).not.toContain("secret");
  });
});

describe("progression", () => {
  const save = { niveau: 3, secteurs: ["kernel", "nimbus"] };

  it("exige d'être connecté et renvoie 404 tant que rien n'est enregistré", async () => {
    const client = await app();
    expect((await client.request("GET", "/api/progress/devops")).statusCode).toBe(401);
    await registerUser(client);
    expect((await client.request("GET", "/api/progress/devops")).statusCode).toBe(404);
  });

  it("crée la version 1, puis incrémente à chaque écriture à partir de la dernière version", async () => {
    const client = await app();
    await registerUser(client);
    const first = await client.request("PUT", "/api/progress/devops", { baseVersion: 0, data: save });
    expect(first.statusCode).toBe(200);
    expect(first.json().version).toBe(1);
    const second = await client.request("PUT", "/api/progress/devops", { baseVersion: 1, data: { ...save, niveau: 4 } });
    expect(second.json().version).toBe(2);
    const read = await client.request("GET", "/api/progress/devops");
    expect(read.json()).toMatchObject({ version: 2, data: { niveau: 4, secteurs: ["kernel", "nimbus"] } });
  });

  it("refuse une écriture à partir d'une version périmée et renvoie la version en place", async () => {
    const client = await app();
    await registerUser(client);
    await client.request("PUT", "/api/progress/devops", { baseVersion: 0, data: save });
    await client.request("PUT", "/api/progress/devops", { baseVersion: 1, data: { niveau: 9 } });
    const stale = await client.request("PUT", "/api/progress/devops", { baseVersion: 1, data: { niveau: 1 } });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error).toMatchObject({ code: "conflict", current: { version: 2, data: { niveau: 9 } } });
    const recreate = await client.request("PUT", "/api/progress/devops", { baseVersion: 0, data: { niveau: 0 } });
    expect(recreate.statusCode).toBe(409);
    const missing = await client.request("PUT", "/api/progress/devops", { baseVersion: 5, data: { niveau: 0 } });
    expect(missing.statusCode).toBe(409);
    expect((await client.request("GET", "/api/progress/devops")).json().data).toEqual({ niveau: 9 });
  });

  it("isole les joueurs : l'un ne voit ni n'écrase la progression de l'autre", async () => {
    const alice = await app();
    const bob = createClient(alice.app);
    await registerUser(alice);
    await registerUser(bob);
    await alice.request("PUT", "/api/progress/devops", { baseVersion: 0, data: save });
    expect((await bob.request("GET", "/api/progress/devops")).statusCode).toBe(404);
    const bobSave = await bob.request("PUT", "/api/progress/devops", { baseVersion: 0, data: { niveau: 1 } });
    expect(bobSave.statusCode).toBe(200);
    expect((await alice.request("GET", "/api/progress/devops")).json().data).toEqual(save);
  });

  it("refuse les données invalides, trop volumineuses, ou pour un cours inconnu", async () => {
    const client = await app();
    await registerUser(client);
    expect((await client.request("PUT", "/api/progress/devops", { baseVersion: 0, data: "texte" })).statusCode).toBe(400);
    expect((await client.request("PUT", "/api/progress/devops", { baseVersion: 0, data: [1, 2] })).statusCode).toBe(400);
    expect((await client.request("PUT", "/api/progress/devops", { baseVersion: -1, data: {} })).statusCode).toBe(400);
    expect((await client.request("PUT", "/api/progress/devops", { baseVersion: 0 })).statusCode).toBe(400);
    expect((await client.request("PUT", "/api/progress/inconnu", { baseVersion: 0, data: {} })).json().error.code).toBe("unknown_course");
    const big = await client.request("PUT", "/api/progress/devops", { baseVersion: 0, data: { blob: "x".repeat(300 * 1024) } });
    expect([413]).toContain(big.statusCode);
  });

  it("garde le JSON tel quel, y compris des clés inattendues, sans l'exécuter ni l'interpréter", async () => {
    const client = await app();
    await registerUser(client);
    const hostile = { "__proto__": { polluted: true }, texte: "<script>alert(1)</script>", sql: "'; drop table users; --" };
    const written = await client.request("PUT", "/api/progress/devops", { baseVersion: 0, payload: 1, data: hostile });
    expect(written.statusCode).toBe(400);
    const ok = await client.request("PUT", "/api/progress/devops", { baseVersion: 0, data: { texte: "<script>alert(1)</script>", sql: "'; drop table users; --" } });
    expect(ok.statusCode).toBe(200);
    expect((await client.request("GET", "/api/progress/devops")).json().data.sql).toBe("'; drop table users; --");
    expect((await db.query("select 1 from users")).rowCount).toBe(1);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe("export et suppression du compte (RGPD)", () => {
  it("exporte toutes les données du compte", async () => {
    const client = await app();
    const email = await registerUser(client, undefined, "devops");
    await client.request("PUT", "/api/progress/devops", { baseVersion: 0, data: { niveau: 2 } });
    const response = await client.request("GET", "/api/me/export");
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-disposition"]).toContain("attachment");
    const body = response.json();
    expect(body.account.email).toBe(email);
    expect(body.enrollments).toHaveLength(1);
    expect(body.progress[0]).toMatchObject({ courseId: "devops", version: 1, data: { niveau: 2 } });
    expect(response.body).not.toContain("argon2");
    expect((await createClient(client.app).request("GET", "/api/me/export")).statusCode).toBe(401);
  });

  it("supprime le compte et tout ce qui s'y rattache, après confirmation du mot de passe", async () => {
    const client = await app();
    await registerUser(client, undefined, "devops");
    await client.request("PUT", "/api/progress/devops", { baseVersion: 0, data: { niveau: 2 } });
    const wrong = await client.request("DELETE", "/api/me", { password: "pas-le-bon-mot-de-passe" });
    expect(wrong.statusCode).toBe(403);
    expect((await db.query("select 1 from users")).rowCount).toBe(1);
    const noBody = await client.request("DELETE", "/api/me");
    expect(noBody.statusCode).toBeGreaterThanOrEqual(400);
    const done = await client.request("DELETE", "/api/me", { password: GOOD_PASSWORD });
    expect(done.statusCode).toBe(204);
    for (const table of ["users", "sessions", "enrollments", "progress"]) expect((await db.query(`select 1 from ${table}`)).rowCount, table).toBe(0);
    expect((await client.request("GET", "/api/me")).statusCode).toBe(401);
  });
});
