import { describe, expect, it } from "vitest";
import { AccountApi, ApiError, type FetchLike } from "../src/account/api";
import { SessionStore } from "../src/account/session";

interface Call {
  url: string;
  init: RequestInit;
}

function fakeFetch(handler: (call: Call) => Response | Promise<Response>): { fetch: FetchLike; calls: Call[] } {
  const calls: Call[] = [];
  return {
    calls,
    fetch: async (url, init = {}) => {
      const call = { url, init };
      calls.push(call);
      return handler(call);
    },
  };
}

const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const user = { id: "u1", email: "joueur@exemple.fr" };

describe("client de l'API", () => {
  it("envoie des requêtes JSON vers /api avec les cookies du même site, sans en-tête superflu quand il n'y a pas de corps", async () => {
    const { fetch, calls } = fakeFetch(() => json(200, { user, enrollments: ["devops"] }));
    const api = new AccountApi(fetch);
    await api.me();
    expect(calls[0]?.url).toBe("/api/me");
    expect(calls[0]?.init.credentials).toBe("same-origin");
    expect(calls[0]?.init.headers).toEqual({});
    await api.login("joueur@exemple.fr", "motdepasse");
    expect(calls[1]?.init.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(String(calls[1]?.init.body))).toEqual({ email: "joueur@exemple.fr", password: "motdepasse" });
  });

  it("renvoie le compte connecté, ou null en l'absence de session", async () => {
    expect(await new AccountApi(fakeFetch(() => json(200, { user, enrollments: ["devops", 3, "x"] })).fetch).me()).toEqual({ user, enrollments: ["devops", "x"] });
    expect(await new AccountApi(fakeFetch(() => json(401, { error: { code: "unauthorized" } })).fetch).me()).toBeNull();
  });

  it("traduit les erreurs de l'API en ApiError avec un code stable", async () => {
    const api = new AccountApi(fakeFetch(() => json(400, { error: { code: "weak_password", message: "trop court", reason: "too_short" } })).fetch);
    await expect(api.register("a@b.fr", "x")).rejects.toMatchObject({ status: 400, code: "weak_password", details: { reason: "too_short" } });
    const conflict = new AccountApi(fakeFetch(() => json(409, { error: { code: "conflict", current: { version: 3 } } })).fetch);
    await expect(conflict.putProgress("devops", 1, {})).rejects.toMatchObject({ status: 409, code: "conflict", details: { current: { version: 3 } } });
  });

  it("distingue une panne réseau d'une erreur du serveur, et gère une réponse illisible", async () => {
    const down = new AccountApi(async () => {
      throw new TypeError("Failed to fetch");
    });
    const error = await down.me().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).isNetworkError).toBe(true);
    const html = new AccountApi(fakeFetch(() => new Response("<html>502 Bad Gateway</html>", { status: 502 })).fetch);
    await expect(html.me()).rejects.toMatchObject({ status: 502, code: "unknown" });
  });

  it("refuse une réponse de succès dont la forme est inattendue", async () => {
    await expect(new AccountApi(fakeFetch(() => json(200, { user: { id: 1 } })).fetch).login("a@b.fr", "x")).rejects.toMatchObject({ code: "bad_response" });
    await expect(new AccountApi(fakeFetch(() => json(200, { version: "3" })).fetch).putProgress("devops", 0, {})).rejects.toMatchObject({ code: "bad_response" });
  });

  it("assainit le compteur d'inscrits", async () => {
    const api = new AccountApi(fakeFetch(() => json(200, { courses: { devops: { enrolled: 12.7 }, mauvais: { enrolled: -4 }, texte: { enrolled: "9" }, autre: 5 } })).fetch);
    expect(await api.courseStats()).toEqual({ devops: 12 });
  });

  it("lit la progression, ou null si le compte n'en a pas encore, et encode l'identifiant du cours", async () => {
    const found = fakeFetch(() => json(200, { version: 2, updatedAt: "2026-10-14T00:00:00Z", data: { a: 1 } }));
    expect(await new AccountApi(found.fetch).getProgress("devops")).toEqual({ version: 2, updatedAt: "2026-10-14T00:00:00Z", data: { a: 1 } });
    expect(await new AccountApi(fakeFetch(() => json(404, { error: { code: "not_found" } })).fetch).getProgress("devops")).toBeNull();
    await new AccountApi(found.fetch).getProgress("../x");
    expect(found.calls[1]?.url).toBe("/api/progress/..%2Fx");
  });

  it("exporte les données en JSON lisible et supprime le compte avec le mot de passe", async () => {
    const { fetch, calls } = fakeFetch((call) => (call.init.method === "DELETE" ? new Response(null, { status: 204 }) : json(200, { account: { email: "a@b.fr" } })));
    const api = new AccountApi(fetch);
    expect(JSON.parse(await api.exportData())).toEqual({ account: { email: "a@b.fr" } });
    await api.deleteAccount("mon-mot-de-passe");
    expect(JSON.parse(String(calls[1]?.init.body))).toEqual({ password: "mon-mot-de-passe" });
  });
});

describe("état de connexion", () => {
  it("passe de inconnu à connecté ou anonyme, et prévient les abonnés", async () => {
    const connected = new SessionStore(new AccountApi(fakeFetch(() => json(200, { user, enrollments: [] })).fetch));
    const seen: string[] = [];
    connected.subscribe((state) => seen.push(state.status));
    expect(connected.current.status).toBe("unknown");
    await connected.refresh();
    expect(connected.current).toEqual({ status: "authenticated", user });
    await connected.logout().catch(() => undefined);
    expect(connected.current.status).toBe("anonymous");
    expect(seen).toEqual(["authenticated", "anonymous"]);
    const anonymous = new SessionStore(new AccountApi(fakeFetch(() => json(401, { error: { code: "unauthorized" } })).fetch));
    await anonymous.refresh();
    expect(anonymous.current.status).toBe("anonymous");
  });

  it("garde l'état connu pendant une panne réseau, et repasse en anonyme si on ne savait rien", async () => {
    const down = new SessionStore(new AccountApi(async () => { throw new TypeError("offline"); }));
    await down.refresh();
    expect(down.current.status).toBe("anonymous");
    const store = new SessionStore(new AccountApi(fakeFetch(() => json(200, { user, enrollments: [] })).fetch));
    await store.refresh();
    store.markExpired();
    expect(store.current.status).toBe("anonymous");
  });

  it("se désabonne proprement", async () => {
    const store = new SessionStore(new AccountApi(fakeFetch(() => json(200, { user, enrollments: [] })).fetch));
    let count = 0;
    const unsubscribe = store.subscribe(() => count++);
    await store.refresh();
    unsubscribe();
    await store.refresh();
    expect(count).toBe(1);
  });
});
