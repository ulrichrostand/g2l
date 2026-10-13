import { createTranslator } from "../translator";

/** Libellés des niveaux de qualité graphique. */
export const t = createTranslator("settings", {
  fr: { qualityHigh: "Haute", qualityMedium: "Moyenne", qualityLow: "Basse" },
  en: { qualityHigh: "High", qualityMedium: "Medium", qualityLow: "Low" },
});
