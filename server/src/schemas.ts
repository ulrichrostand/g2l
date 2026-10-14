import { z } from "zod";
import { PASSWORD_MAX_LENGTH } from "./security.js";

/** Taille maximale d'une sauvegarde de progression (octets, une fois sérialisée en JSON). */
export const MAX_PROGRESS_BYTES = 256 * 1024;

const email = z.string().trim().min(3).max(254).email();
const courseId = z.string().regex(/^[a-z0-9-]{1,40}$/);
// La longueur minimale est vérifiée par passwordProblem() pour renvoyer un message précis ; ici seulement un plafond.
const password = z.string().min(1).max(PASSWORD_MAX_LENGTH + 1);

export const registerBody = z.object({ email, password, courseId: courseId.optional() }).strict();
export const loginBody = z.object({ email, password }).strict();
export const deleteAccountBody = z.object({ password }).strict();
export const courseParams = z.object({ courseId });
export const progressBody = z
  .object({
    baseVersion: z.number().int().min(0).max(2_000_000_000),
    data: z.record(z.unknown()),
  })
  .strict();
