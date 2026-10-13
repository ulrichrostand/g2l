import { createTranslator } from "../translator";

/** Libellés des niveaux de qualité graphique. */
export const t = createTranslator("settings", {
  fr: { qualityHigh: "Haute", qualityMedium: "Moyenne", qualityLow: "Basse", brightnessDim: "Sombre", brightnessNormal: "Normale", brightnessBright: "Claire" },
  en: { qualityHigh: "High", qualityMedium: "Medium", qualityLow: "Low", brightnessDim: "Dark", brightnessNormal: "Normal", brightnessBright: "Bright" },
});
