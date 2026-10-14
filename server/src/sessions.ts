import type { FastifyReply, FastifyRequest } from "fastify";
import type { Config } from "./config.js";
import type { Db } from "./db.js";
import { hashSessionToken, newSessionToken } from "./security.js";

const MAX_SESSIONS_PER_USER = 10;
const TOKEN_LENGTH_MAX = 100;

export interface AuthenticatedUser {
  id: string;
  email: string;
}

/** Préfixe « __Host- » : le navigateur refuse alors le cookie s'il n'est pas Secure, sans domaine et à la racine. */
export function sessionCookieName(config: Pick<Config, "cookieSecure">): string {
  return config.cookieSecure ? "__Host-g2l_session" : "g2l_session";
}

/** Crée une session (nouveau jeton à chaque connexion) et la pose dans un cookie HttpOnly. */
export async function startSession(db: Db, config: Config, reply: FastifyReply, userId: string): Promise<void> {
  const { token, tokenHash } = newSessionToken();
  await db.query("insert into sessions (token_hash, user_id, expires_at) values ($1, $2, now() + make_interval(days => $3))", [tokenHash, userId, config.sessionDays]);
  // Borne le nombre de sessions par compte : les plus anciennes sont supprimées.
  await db.query(
    "delete from sessions where user_id = $1 and token_hash not in (select token_hash from sessions where user_id = $1 order by created_at desc limit $2)",
    [userId, MAX_SESSIONS_PER_USER],
  );
  reply.setCookie(sessionCookieName(config), token, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: "lax",
    path: "/",
    maxAge: config.sessionDays * 86_400,
  });
}

export async function endSession(db: Db, config: Config, request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const token = request.cookies[sessionCookieName(config)];
  if (token && token.length <= TOKEN_LENGTH_MAX) await db.query("delete from sessions where token_hash = $1", [hashSessionToken(token)]);
  clearSessionCookie(config, reply);
}

export function clearSessionCookie(config: Config, reply: FastifyReply): void {
  reply.clearCookie(sessionCookieName(config), { httpOnly: true, secure: config.cookieSecure, sameSite: "lax", path: "/" });
}

/** Utilisateur connecté d'après le cookie, ou null. Repousse l'expiration d'une session utilisée (au plus une fois par heure). */
export async function currentUser(db: Db, config: Config, request: FastifyRequest): Promise<AuthenticatedUser | null> {
  const token = request.cookies[sessionCookieName(config)];
  if (!token || token.length > TOKEN_LENGTH_MAX) return null;
  const tokenHash = hashSessionToken(token);
  const found = await db.query<{ id: string; email: string; last_seen_at: Date }>(
    `select u.id, u.email, s.last_seen_at
       from sessions s join users u on u.id = s.user_id
      where s.token_hash = $1 and s.expires_at > now()`,
    [tokenHash],
  );
  const row = found.rows[0];
  if (!row) return null;
  if (Date.now() - new Date(row.last_seen_at).getTime() > 3_600_000) {
    await db.query("update sessions set last_seen_at = now(), expires_at = now() + make_interval(days => $2) where token_hash = $1", [tokenHash, config.sessionDays]);
  }
  return { id: row.id, email: row.email };
}

/** Supprime les sessions expirées (à lancer au démarrage puis régulièrement). */
export async function purgeExpiredSessions(db: Db): Promise<number> {
  const result = await db.query("delete from sessions where expires_at <= now()");
  return result.rowCount;
}
