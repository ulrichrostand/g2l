export const POINTS_PER_TERMINAL = 100;
/** Chaque tentative ratée coûte des points : on récompense la compréhension, pas le hasard. */
export const PENALTY_PER_WRONG_ATTEMPT = 40;
export const PENALTY_PER_DETECTION = 75;
export const STEALTH_BONUS = 150;
export const MIN_POINTS_PER_TERMINAL = 20;
/**
 * Réserve de points « bonus » : 20 par dossier du secteur. Les dossiers étant obligatoires pour débloquer les terminaux, ils ne
 * rapportent plus rien en eux-mêmes ; la réserve garde sa taille (donc le score maximum et les meilleurs scores déjà enregistrés
 * restent comparables) et récompense désormais le sang-froid et l'autonomie.
 */
export const BONUS_POINTS_PER_DOSSIER = 20;
/** Part de la réserve attribuée au sang-froid ; le reste va à l'autonomie. */
export const COMPOSURE_SHARE = 0.5;

export interface MissionStats {
  terminalCount: number;
  wrongAttemptsPerTerminal: number[];
  detections: number;
  elapsedSeconds: number;
  /** Nombre de dossiers du secteur : donne la taille de la réserve de points bonus. */
  intelTotal: number;
  /** Vies perdues pendant la mission, sur le nombre de vies de départ. */
  livesLost: number;
  livesTotal: number;
  /** Terminaux à question résolus sans aide (ni indice, ni dossier rouvert), sur le nombre de terminaux à question. */
  unassistedChallenges: number;
  challengeCount: number;
}

/** Une part de score : les points gagnés et le maximum possible, pour l'afficher au débriefing (« 33/50 »). */
export interface ScorePart {
  points: number;
  max: number;
}

export interface MissionScore {
  score: number;
  maxScore: number;
  stars: 1 | 2 | 3;
  ghost: boolean;
  firstTryAccuracy: number;
  /** Sang-froid : aucune vie perdue = le maximum ; chaque vie perdue en retire une part égale. */
  composure: ScorePart;
  /** Autonomie : chaque terminal à question résolu sans aide rapporte une part égale. */
  autonomy: ScorePart;
}

function clampRatio(value: number): number {
  return Number.isFinite(value) ? Math.min(Math.max(value, 0), 1) : 0;
}

export function computeMissionScore(stats: MissionStats): MissionScore {
  const terminalPoints = stats.wrongAttemptsPerTerminal.reduce(
    (total, wrongAttempts) =>
      total + Math.max(MIN_POINTS_PER_TERMINAL, POINTS_PER_TERMINAL - wrongAttempts * PENALTY_PER_WRONG_ATTEMPT),
    0,
  );
  const ghost = stats.detections === 0;
  const bonusPool = stats.intelTotal * BONUS_POINTS_PER_DOSSIER;
  const composureMax = Math.round(bonusPool * COMPOSURE_SHARE);
  const autonomyMax = bonusPool - composureMax;
  const composure: ScorePart = {
    points: Math.round(composureMax * clampRatio(stats.livesTotal > 0 ? 1 - stats.livesLost / stats.livesTotal : 1)),
    max: composureMax,
  };
  const autonomy: ScorePart = {
    points: Math.round(autonomyMax * clampRatio(stats.challengeCount > 0 ? stats.unassistedChallenges / stats.challengeCount : 1)),
    max: autonomyMax,
  };
  const score = Math.max(
    0,
    terminalPoints + composure.points + autonomy.points - stats.detections * PENALTY_PER_DETECTION + (ghost ? STEALTH_BONUS : 0),
  );
  const maxScore = stats.terminalCount * POINTS_PER_TERMINAL + bonusPool + STEALTH_BONUS;
  const firstTryCount = stats.wrongAttemptsPerTerminal.filter((wrongAttempts) => wrongAttempts === 0).length;
  const firstTryAccuracy = stats.terminalCount === 0 ? 0 : firstTryCount / stats.terminalCount;
  const ratio = maxScore === 0 ? 0 : score / maxScore;
  const stars = ratio >= 0.85 ? 3 : ratio >= 0.55 ? 2 : 1;
  return { score, maxScore, stars, ghost, firstTryAccuracy, composure, autonomy };
}
