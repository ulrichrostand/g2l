import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_RATE_LIMITS } from "../src/app.js";
import type { Db } from "../src/db.js";
import { hashSessionToken } from "../src/security.js";
import { createClient, createTestDb, GOOD_PASSWORD, newApp, registerUser, resetData, SITE_ORIGIN, uniqueEmail, type Client } from "./support/testApp.js";

let db: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  db = await createTestDb();
});
afterAll(async () => db.raw.close());
beforeEach(async () => resetData(db));

async function freshClient(): Promise<Client> {
  return createClient(await newApp(db));
}

describe("inscription", () => {
  it("crée le compte, pose un cookie de session HttpOnly/Secure/SameSite et inscrit au cours", async () => {
    const client = await freshClient();
    const response = await client.request("POST", "/api/auth/register", { email: " Joueur@Exemple.FR ", password: GOOD_PASSWORD, courseId: "devops" });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ user: { email: "Joueur@Exemple.FR" }, enrolledIn: "devops" });
    const setCookie = String(response.headers["set-cookie"]);
    expect(setCookie).toContain("__Host-g2l_session=");
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/Secure/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    expect(setCookie).toMatch(/Path=\//);
    expect(setCookie).not.toMatch(/Domain=/i);
    const me = await client.request("GET", "/api/me");
    expect(me.json()).toMatchObject({ user: { email: "Joueur@Exemple.FR" }, enrollments: ["devops"] });
  });

  it("ne stocke ni le mot de passe ni le jeton de session en clair", async () => {
    const client = await freshClient();
    await registerUser(client);
    const user = (await db.query<{ password_hash: string }>("select password_hash from users")).rows[0];
    expect(user?.password_hash).toMatch(/^\$argon2id\$/);
    expect(user?.password_hash).not.toContain(GOOD_PASSWORD);
    const token = Object.values(client.cookies)[0] as string;
    const sessions = await db.query<{ token_hash: Buffer }>("select token_hash from sessions");
    expect(sessions.rowCount).toBe(1);
    expect(Buffer.from(sessions.rows[0]!.token_hash).equals(hashSessionToken(token))).toBe(true);
    expect(Buffer.from(sessions.rows[0]!.token_hash).toString("utf8")).not.toContain(token);
  });

  it("refuse les entrées invalides sans renvoyer les valeurs reçues", async () => {
    const client = await freshClient();
    const bad = await client.request("POST", "/api/auth/register", { email: "pas-un-email", password: GOOD_PASSWORD });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.code).toBe("invalid_request");
    expect(bad.body).not.toContain("pas-un-email");
    expect((await client.request("POST", "/api/auth/register", { email: uniqueEmail() })).statusCode).toBe(400);
    expect((await client.request("POST", "/api/auth/register", { email: uniqueEmail(), password: GOOD_PASSWORD, admin: true })).statusCode).toBe(400);
    expect((await client.request("POST", "/api/auth/register", { email: uniqueEmail(), password: GOOD_PASSWORD, courseId: "inconnu" })).json().error.code).toBe("unknown_course");
    expect((await client.request("POST", "/api/auth/register", { email: uniqueEmail(), password: GOOD_PASSWORD, courseId: "../../etc" })).statusCode).toBe(400);
  });

  it("applique la politique de mot de passe", async () => {
    const client = await freshClient();
    const reason = async (password: string, email = uniqueEmail()) => (await client.request("POST", "/api/auth/register", { email, password })).json().error?.reason;
    expect(await reason("court")).toBe("too_short");
    expect(await reason("motdepasse123")).toBe("too_common");
    expect(await reason("zzzzzzzzzzzz")).toBe("too_common");
    expect(await reason("joueur@exemple.fr", "joueur@exemple.fr")).toBe("same_as_email");
    expect(await reason("x".repeat(129))).toBeTruthy();
    expect(await reason(GOOD_PASSWORD)).toBeUndefined();
  });

  it("refuse une adresse déjà inscrite, sans tenir compte de la casse", async () => {
    const client = await freshClient();
    await registerUser(client, "Joueur@exemple.fr");
    const second = await createClient(client.app).request("POST", "/api/auth/register", { email: "JOUEUR@EXEMPLE.FR", password: GOOD_PASSWORD });
    expect(second.statusCode).toBe(409);
    expect(second.json().error.code).toBe("email_taken");
    expect((await db.query("select 1 from users")).rowCount).toBe(1);
  });
});

describe("connexion et déconnexion", () => {
  it("connecte avec le bon mot de passe, quelle que soit la casse de l'e-mail", async () => {
    const first = await freshClient();
    const email = await registerUser(first);
    const second = createClient(first.app);
    const response = await second.request("POST", "/api/auth/login", { email: email.toUpperCase(), password: GOOD_PASSWORD });
    expect(response.statusCode).toBe(200);
    expect((await second.request("GET", "/api/me")).statusCode).toBe(200);
  });

  it("répond pareil pour un e-mail inconnu et un mauvais mot de passe", async () => {
    const client = await freshClient();
    const email = await registerUser(client);
    const wrongPassword = await createClient(client.app).request("POST", "/api/auth/login", { email, password: "mauvais-mot-de-passe" });
    const unknownEmail = await createClient(client.app).request("POST", "/api/auth/login", { email: "inconnu@exemple.fr", password: GOOD_PASSWORD });
    expect(wrongPassword.statusCode).toBe(401);
    expect(unknownEmail.statusCode).toBe(401);
    expect(wrongPassword.json()).toEqual(unknownEmail.json());
    expect(wrongPassword.headers["set-cookie"]).toBeUndefined();
  });

  it("bloque temporairement une adresse après trop d'échecs, même avec le bon mot de passe, puis se rétablit après un succès hors blocage", async () => {
    const client = await freshClient();
    const email = await registerUser(client);
    const attacker = createClient(client.app);
    for (let attempt = 0; attempt < 5; attempt++) expect((await attacker.request("POST", "/api/auth/login", { email, password: "essai-numero-" + attempt })).statusCode).toBe(401);
    const blocked = await attacker.request("POST", "/api/auth/login", { email, password: GOOD_PASSWORD });
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json().error.code).toBe("rate_limited");
  });

  it("invalide la session à la déconnexion", async () => {
    const client = await freshClient();
    await registerUser(client);
    const stolen = { ...client.cookies };
    expect((await client.request("POST", "/api/auth/logout")).statusCode).toBe(204);
    expect((await client.request("GET", "/api/me")).statusCode).toBe(401);
    const replay = await client.app.inject({ method: "GET", url: "/api/me", cookies: stolen });
    expect(replay.statusCode).toBe(401);
    expect((await db.query("select 1 from sessions")).rowCount).toBe(0);
  });

  it("refuse une session expirée et limite à 10 sessions par compte", async () => {
    const client = await freshClient();
    const email = await registerUser(client);
    await db.query("update sessions set expires_at = now() - interval '1 minute'");
    expect((await client.request("GET", "/api/me")).statusCode).toBe(401);
    for (let index = 0; index < 12; index++) await createClient(client.app).request("POST", "/api/auth/login", { email, password: GOOD_PASSWORD });
    expect((await db.query("select 1 from sessions")).rowCount).toBeLessThanOrEqual(10);
  });

  it("n'accepte pas un jeton inventé ou démesuré", async () => {
    const client = await freshClient();
    const forged = await client.app.inject({ method: "GET", url: "/api/me", cookies: { "__Host-g2l_session": "inventé" } });
    expect(forged.statusCode).toBe(401);
    const huge = await client.app.inject({ method: "GET", url: "/api/me", cookies: { "__Host-g2l_session": "a".repeat(5000) } });
    expect(huge.statusCode).toBe(401);
  });
});

describe("protection contre les requêtes venues d'un autre site (CSRF)", () => {
  it("refuse une écriture dont l'origine n'est pas celle du site", async () => {
    const client = await freshClient();
    const foreign = await client.request("POST", "/api/auth/register", { email: uniqueEmail(), password: GOOD_PASSWORD }, { origin: "https://pirate.example" });
    expect(foreign.statusCode).toBe(403);
    expect(foreign.json().error.code).toBe("forbidden_origin");
    const nullOrigin = await client.request("POST", "/api/auth/logout", undefined, { origin: "null" });
    expect(nullOrigin.statusCode).toBe(403);
  });

  it("refuse une écriture que le navigateur déclare venir d'un autre site, même sans en-tête Origin", async () => {
    const client = await freshClient();
    const response = await client.app.inject({ method: "POST", url: "/api/auth/logout", headers: { "sec-fetch-site": "cross-site" } });
    expect(response.statusCode).toBe(403);
  });

  it("refuse un corps qui n'est pas du JSON (formulaire classique)", async () => {
    const client = await freshClient();
    const response = await client.app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { origin: SITE_ORIGIN, "content-type": "text/plain" },
      payload: "email=a@b.fr&password=x",
    });
    expect(response.statusCode).toBe(415);
  });

  it("ne répond aux demandes CORS préalables que pour l'origine déclarée", async () => {
    const client = await freshClient();
    const allowed = await client.app.inject({ method: "OPTIONS", url: "/api/me", headers: { origin: SITE_ORIGIN, "access-control-request-method": "GET" } });
    expect(allowed.statusCode).toBe(204);
    expect(allowed.headers["access-control-allow-origin"]).toBe(SITE_ORIGIN);
    expect(allowed.headers["access-control-allow-credentials"]).toBe("true");
    const denied = await client.app.inject({ method: "GET", url: "/api/health", headers: { origin: "https://pirate.example" } });
    expect(denied.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

describe("limitation de débit", () => {
  it("limite les inscriptions par adresse IP", async () => {
    const app = await newApp(db, {}, DEFAULT_RATE_LIMITS);
    const client = createClient(app);
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 7; attempt++) statuses.push((await client.request("POST", "/api/auth/register", { email: uniqueEmail(), password: GOOD_PASSWORD })).statusCode);
    expect(statuses.slice(0, 5)).toEqual([201, 201, 201, 201, 201]);
    expect(statuses[5]).toBe(429);
    expect(statuses[6]).toBe(429);
  });
});

describe("erreurs", () => {
  it("ne révèle rien d'interne lors d'une panne de la base", async () => {
    const broken: Db = { ...db, query: async () => { throw new Error("connexion refusée à postgres://secret:motdepasse@10.0.0.5/base"); } };
    const app = await newApp(broken);
    const response = await app.inject({ method: "GET", url: "/api/health" });
    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain("secret");
    expect(response.json()).toEqual({ error: { code: "internal_error", message: "Erreur interne." } });
  });

  it("renvoie du JSON pour une route inconnue", async () => {
    const client = await freshClient();
    const response = await client.app.inject({ method: "GET", url: "/api/nexiste-pas" });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("not_found");
  });

  it("pose les en-têtes de sécurité", async () => {
    const client = await freshClient();
    const response = await client.app.inject({ method: "GET", url: "/api/health" });
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["content-security-policy"]).toContain("default-src 'none'");
    expect(response.headers["strict-transport-security"]).toBeDefined();
  });
});
