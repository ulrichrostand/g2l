import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyError, type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { ZodError } from "zod";
import type { Config } from "./config.js";
import { ENROLLABLE_COURSE_IDS, isEnrollableCourse } from "./courses.js";
import { isUniqueViolation, type Db } from "./db.js";
import { AppError, notFound, unauthorized } from "./errors.js";
import { FailureLimiter } from "./limiter.js";
import { courseParams, deleteAccountBody, loginBody, MAX_PROGRESS_BYTES, progressBody, registerBody } from "./schemas.js";
import { hashPassword, normalizeEmail, passwordProblem, spendPasswordCheckTime, verifyPassword } from "./security.js";
import { clearSessionCookie, currentUser, endSession, startSession, type AuthenticatedUser } from "./sessions.js";

export interface RateLimits {
  global: { max: number; timeWindow: string };
  register: { max: number; timeWindow: string };
  login: { max: number; timeWindow: string };
  /** Échecs de connexion tolérés par adresse e-mail avant blocage temporaire. */
  loginFailuresPerEmail: { max: number; windowMs: number };
}

export const DEFAULT_RATE_LIMITS: RateLimits = {
  global: { max: 300, timeWindow: "1 minute" },
  register: { max: 5, timeWindow: "1 hour" },
  login: { max: 10, timeWindow: "10 minutes" },
  loginFailuresPerEmail: { max: 10, windowMs: 15 * 60_000 },
};

export interface AppDeps {
  config: Config;
  db: Db;
  rateLimits?: RateLimits;
}

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const STATS_CACHE_MS = 30_000;

const PASSWORD_MESSAGES = {
  too_short: "Le mot de passe doit contenir au moins 10 caractères.",
  too_long: "Le mot de passe est trop long (128 caractères au plus).",
  too_common: "Ce mot de passe est trop courant : choisis-en un moins prévisible.",
  same_as_email: "Le mot de passe ne doit pas être ton adresse e-mail.",
} as const;

export async function buildApp({ config, db, rateLimits = DEFAULT_RATE_LIMITS }: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    trustProxy: config.trustProxy,
    bodyLimit: MAX_PROGRESS_BYTES + 4096,
    logger:
      config.nodeEnv === "test"
        ? false
        : { level: "info", redact: ["req.headers.cookie", "req.headers.authorization", 'res.headers["set-cookie"]'] },
  });
  // Seul le JSON est accepté : un formulaire HTML classique (text/plain, urlencoded) venu d'un autre site est refusé d'emblée.
  app.removeContentTypeParser("text/plain");
  const allowedOrigins = new Set(config.allowedOrigins);
  const loginFailures = new FailureLimiter(rateLimits.loginFailuresPerEmail.max, rateLimits.loginFailuresPerEmail.windowMs);

  await app.register(helmet, { contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } }, hsts: config.cookieSecure });
  await app.register(cookie);
  await app.register(rateLimit, { global: true, ...rateLimits.global, errorResponseBuilder: () => rateLimitedError() });

  // CORS : uniquement pour les origines déclarées (utile en développement quand site et API n'ont pas le même port).
  app.addHook("onRequest", async (request, reply) => {
    const origin = request.headers.origin;
    if (origin !== undefined && allowedOrigins.has(origin)) {
      reply.header("Access-Control-Allow-Origin", origin);
      reply.header("Access-Control-Allow-Credentials", "true");
      reply.header("Vary", "Origin");
      if (request.method === "OPTIONS") {
        reply.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
        reply.header("Access-Control-Allow-Headers", "Content-Type");
        reply.header("Access-Control-Max-Age", "600");
        return reply.code(204).send();
      }
    }
  });

  // Protection CSRF des requêtes qui modifient des données : l'origine déclarée par le navigateur doit être la nôtre.
  app.addHook("onRequest", async (request) => {
    if (!WRITE_METHODS.has(request.method)) return;
    const origin = request.headers.origin;
    if (origin !== undefined) {
      if (!allowedOrigins.has(origin)) throw new AppError(403, "forbidden_origin", "Origine non autorisée.");
      return;
    }
    // Pas d'en-tête Origin : un client hors navigateur (curl). Un navigateur qui signale une requête d'un autre site est refusé.
    if (request.headers["sec-fetch-site"] === "cross-site") throw new AppError(403, "forbidden_origin", "Origine non autorisée.");
  });

  app.setErrorHandler((error: FastifyError | Error, request, reply) => handleError(error, request, reply));
  app.setNotFoundHandler((_request, reply) => reply.code(404).send({ error: { code: "not_found", message: "Route inconnue." } }));

  const requireUser = async (request: FastifyRequest): Promise<AuthenticatedUser> => {
    const user = await currentUser(db, config, request);
    if (!user) throw unauthorized();
    return user;
  };

  app.get("/api/health", async () => {
    await db.query("select 1");
    return { status: "ok" };
  });

  // --- Compteur public d'inscrits par cours ---
  let statsCache: { expiresAt: number; value: Record<string, { enrolled: number }> } | null = null;
  app.get("/api/courses/stats", async (_request, reply) => {
    const now = Date.now();
    if (!statsCache || statsCache.expiresAt <= now) {
      const counts = await db.query<{ course_id: string; n: number }>("select course_id, count(*)::int as n from enrollments group by course_id");
      const value: Record<string, { enrolled: number }> = Object.fromEntries(ENROLLABLE_COURSE_IDS.map((id) => [id, { enrolled: 0 }]));
      for (const row of counts.rows) if (isEnrollableCourse(row.course_id)) value[row.course_id] = { enrolled: row.n };
      statsCache = { expiresAt: now + STATS_CACHE_MS, value };
    }
    reply.header("Cache-Control", "public, max-age=30");
    return { courses: statsCache.value };
  });

  // --- Comptes ---
  app.post("/api/auth/register", { bodyLimit: 4096, config: { rateLimit: rateLimits.register } }, async (request, reply) => {
    const body = registerBody.parse(request.body);
    const problem = passwordProblem(body.password, body.email);
    if (problem) throw new AppError(400, "weak_password", PASSWORD_MESSAGES[problem], { reason: problem });
    if (body.courseId !== undefined && !isEnrollableCourse(body.courseId)) throw new AppError(400, "unknown_course", "Cours inconnu.");

    const passwordHash = await hashPassword(body.password);
    let userId: string;
    try {
      const created = await db.query<{ id: string }>(
        "insert into users (email, email_normalized, password_hash, last_login_at) values ($1, $2, $3, now()) returning id",
        [body.email.trim(), normalizeEmail(body.email), passwordHash],
      );
      userId = (created.rows[0] as { id: string }).id;
    } catch (error) {
      // Compromis assumé : sans vérification par e-mail, on doit dire que l'adresse existe déjà. La limite par IP freine l'énumération.
      if (isUniqueViolation(error)) throw new AppError(409, "email_taken", "Un compte existe déjà avec cette adresse e-mail.");
      throw error;
    }
    if (body.courseId !== undefined) await db.query("insert into enrollments (user_id, course_id) values ($1, $2) on conflict do nothing", [userId, body.courseId]);
    await startSession(db, config, reply, userId);
    return reply.code(201).send({ user: { id: userId, email: body.email.trim() }, enrolledIn: body.courseId ?? null });
  });

  app.post("/api/auth/login", { bodyLimit: 4096, config: { rateLimit: rateLimits.login } }, async (request, reply) => {
    const body = loginBody.parse(request.body);
    const emailKey = normalizeEmail(body.email);
    if (loginFailures.isBlocked(emailKey, Date.now())) throw rateLimitedError();

    const found = await db.query<{ id: string; email: string; password_hash: string }>(
      "select id, email, password_hash from users where email_normalized = $1",
      [emailKey],
    );
    const user = found.rows[0];
    const valid = user ? await verifyPassword(user.password_hash, body.password) : (await spendPasswordCheckTime(body.password), false);
    if (!user || !valid) {
      loginFailures.recordFailure(emailKey, Date.now());
      // Même message que l'e-mail soit inconnu ou le mot de passe faux.
      throw new AppError(401, "invalid_credentials", "Adresse e-mail ou mot de passe incorrect.");
    }
    loginFailures.reset(emailKey);
    await db.query("update users set last_login_at = now() where id = $1", [user.id]);
    await startSession(db, config, reply, user.id);
    return { user: { id: user.id, email: user.email } };
  });

  app.post("/api/auth/logout", async (request, reply) => {
    await endSession(db, config, request, reply);
    return reply.code(204).send();
  });

  app.get("/api/me", async (request, reply) => {
    const user = await requireUser(request);
    const enrollments = await db.query<{ course_id: string }>("select course_id from enrollments where user_id = $1 order by enrolled_at", [user.id]);
    reply.header("Cache-Control", "no-store");
    return { user, enrollments: enrollments.rows.map((row) => row.course_id) };
  });

  // Droit à la portabilité (RGPD) : toutes les données du compte, en JSON.
  app.get("/api/me/export", async (request, reply) => {
    const user = await requireUser(request);
    const account = await db.query<{ created_at: Date; last_login_at: Date | null }>("select created_at, last_login_at from users where id = $1", [user.id]);
    const enrollments = await db.query<{ course_id: string; enrolled_at: Date }>("select course_id, enrolled_at from enrollments where user_id = $1 order by enrolled_at", [user.id]);
    const progress = await db.query<{ course_id: string; version: number; updated_at: Date; data: unknown }>(
      "select course_id, version, updated_at, data from progress where user_id = $1 order by course_id",
      [user.id],
    );
    reply.header("Content-Disposition", 'attachment; filename="mes-donnees-g2l.json"');
    reply.header("Cache-Control", "no-store");
    return {
      exportedAt: new Date().toISOString(),
      account: { id: user.id, email: user.email, createdAt: account.rows[0]?.created_at, lastLoginAt: account.rows[0]?.last_login_at ?? null },
      enrollments: enrollments.rows.map((row) => ({ courseId: row.course_id, enrolledAt: row.enrolled_at })),
      progress: progress.rows.map((row) => ({ courseId: row.course_id, version: row.version, updatedAt: row.updated_at, data: row.data })),
    };
  });

  // Droit à l'effacement (RGPD) : suppression du compte et de tout ce qui s'y rattache (en cascade).
  app.delete("/api/me", { bodyLimit: 4096, config: { rateLimit: rateLimits.login } }, async (request, reply) => {
    const user = await requireUser(request);
    const body = deleteAccountBody.parse(request.body);
    const found = await db.query<{ password_hash: string }>("select password_hash from users where id = $1", [user.id]);
    const hashValue = found.rows[0]?.password_hash;
    if (!hashValue || !(await verifyPassword(hashValue, body.password))) throw new AppError(403, "wrong_password", "Mot de passe incorrect.");
    await db.query("delete from users where id = $1", [user.id]);
    clearSessionCookie(config, reply);
    return reply.code(204).send();
  });

  // --- Inscriptions ---
  app.post("/api/courses/:courseId/enroll", async (request, reply) => {
    const user = await requireUser(request);
    const { courseId } = courseParams.parse(request.params);
    if (!isEnrollableCourse(courseId)) throw new AppError(400, "unknown_course", "Cours inconnu.");
    const inserted = await db.query("insert into enrollments (user_id, course_id) values ($1, $2) on conflict do nothing", [user.id, courseId]);
    return reply.code(inserted.rowCount > 0 ? 201 : 200).send({ courseId, alreadyEnrolled: inserted.rowCount === 0 });
  });

  // --- Progression ---
  app.get("/api/progress/:courseId", async (request, reply) => {
    const user = await requireUser(request);
    const { courseId } = courseParams.parse(request.params);
    if (!isEnrollableCourse(courseId)) throw new AppError(400, "unknown_course", "Cours inconnu.");
    const row = (await db.query<{ version: number; updated_at: Date; data: unknown }>("select version, updated_at, data from progress where user_id = $1 and course_id = $2", [user.id, courseId])).rows[0];
    if (!row) throw notFound("Progression");
    reply.header("Cache-Control", "no-store");
    return { version: row.version, updatedAt: row.updated_at, data: row.data };
  });

  app.put("/api/progress/:courseId", async (request, reply) => {
    const user = await requireUser(request);
    const { courseId } = courseParams.parse(request.params);
    if (!isEnrollableCourse(courseId)) throw new AppError(400, "unknown_course", "Cours inconnu.");
    const body = progressBody.parse(request.body);
    if (Buffer.byteLength(JSON.stringify(body.data)) > MAX_PROGRESS_BYTES) throw new AppError(413, "progress_too_large", "Sauvegarde trop volumineuse.");

    const saved = await db.transaction(async (tx) => {
      if (body.baseVersion === 0) {
        return (await tx.query<{ version: number; updated_at: Date }>(
          "insert into progress (user_id, course_id, data, version) values ($1, $2, $3::jsonb, 1) on conflict do nothing returning version, updated_at",
          [user.id, courseId, JSON.stringify(body.data)],
        )).rows[0];
      }
      // Écriture conditionnelle : ne réussit que si la version de départ est toujours la version enregistrée.
      return (await tx.query<{ version: number; updated_at: Date }>(
        "update progress set data = $3::jsonb, version = version + 1, updated_at = now() where user_id = $1 and course_id = $2 and version = $4 returning version, updated_at",
        [user.id, courseId, JSON.stringify(body.data), body.baseVersion],
      )).rows[0];
    });
    if (saved) return { version: saved.version, updatedAt: saved.updated_at };

    // Une autre version existe (sauvegarde faite depuis un autre appareil) : on la renvoie pour que le client choisisse.
    const current = (await db.query<{ version: number; updated_at: Date; data: unknown }>("select version, updated_at, data from progress where user_id = $1 and course_id = $2", [user.id, courseId])).rows[0];
    throw new AppError(409, "conflict", "La progression a changé depuis ta dernière synchronisation.", {
      current: current ? { version: current.version, updatedAt: current.updated_at, data: current.data } : null,
    });
  });

  return app;
}

function rateLimitedError(): AppError {
  return new AppError(429, "rate_limited", "Trop de tentatives. Réessaie dans quelques minutes.");
}

function handleError(error: FastifyError | Error, request: FastifyRequest, reply: FastifyReply): FastifyReply {
  if (error instanceof AppError) {
    return reply.code(error.status).send({ error: { code: error.code, message: error.message, ...(error.details ?? {}) } });
  }
  if (error instanceof ZodError) {
    // On renvoie les champs fautifs, jamais les valeurs reçues (elles peuvent contenir un mot de passe).
    const fields = [...new Set(error.issues.map((issue) => issue.path.join(".") || "(corps)"))];
    return reply.code(400).send({ error: { code: "invalid_request", message: "Requête invalide.", fields } });
  }
  const status = "statusCode" in error && typeof error.statusCode === "number" ? error.statusCode : 500;
  if (status >= 400 && status < 500) {
    // Erreurs de protocole gérées par Fastify : mauvais Content-Type (415), corps trop gros (413), JSON invalide (400)...
    return reply.code(status).send({ error: { code: "bad_request", message: "Requête refusée." } });
  }
  request.log.error({ err: error }, "Erreur interne");
  return reply.code(500).send({ error: { code: "internal_error", message: "Erreur interne." } });
}
