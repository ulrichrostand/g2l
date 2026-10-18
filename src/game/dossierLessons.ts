/**
 * Lien entre les dossiers ramassés, les leçons lues et les terminaux à question.
 * Règle de jeu : le n-ième dossier trouvé ouvre la n-ième leçon, et un terminal ne se pirate qu'une fois sa leçon lue.
 * Les terminaux se débloquent donc dans l'ordre pédagogique, sans rattacher un dossier à un endroit précis du plan.
 * Logique pure (ni DOM ni Three.js) : testable sans navigateur.
 */

/** Un terminal à question est verrouillé tant que sa leçon n'a pas été lue ; la console principale (au-delà des défis) ne l'est jamais. */
export function isTerminalLocked(terminalIndex: number, challengeCount: number, readLessons: ReadonlySet<number>): boolean {
  return terminalIndex < challengeCount && !readLessons.has(terminalIndex);
}

export interface DossierLesson {
  /** Position de la leçon à afficher. */
  index: number;
  /** Vrai quand toutes les leçons ont déjà été lues : le dossier sert alors de révision. */
  review: boolean;
}

/**
 * Leçon que révèle le dossier qu'on vient de ramasser : la première leçon non lue, ou, quand tout est lu, une leçon de révision
 * choisie en tournant sur le nombre de dossiers ramassés.
 */
export function lessonForDossier(readLessons: ReadonlySet<number>, lessonCount: number, dossiersCollected: number): DossierLesson {
  if (lessonCount <= 0) throw new RangeError("Un secteur sans leçon ne peut pas avoir de dossier.");
  for (let index = 0; index < lessonCount; index++) {
    if (!readLessons.has(index)) return { index, review: false };
  }
  return { index: Math.max(dossiersCollected - 1, 0) % lessonCount, review: true };
}
