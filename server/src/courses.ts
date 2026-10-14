/**
 * Cours auxquels on peut s'inscrire. Doit rester identique aux jeux « disponibles » du catalogue du site
 * (src/portal/catalog.ts) : un test du dépôt le vérifie. Un identifiant inconnu est refusé par l'API.
 */
export const ENROLLABLE_COURSE_IDS: readonly string[] = ["devops"];

export function isEnrollableCourse(courseId: string): boolean {
  return ENROLLABLE_COURSE_IDS.includes(courseId);
}
