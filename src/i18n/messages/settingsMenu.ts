import { createTranslator } from "../translator";

/** Menu « hamburger » regroupant les réglages (langue, graphismes, luminosité, son). */
export const t = createTranslator("settingsMenu", {
  fr: { menuLabel: "Paramètres", menuTitle: "Réglages du jeu", languageHeading: "Langue" },
  en: { menuLabel: "Settings", menuTitle: "Game settings", languageHeading: "Language" },
});
