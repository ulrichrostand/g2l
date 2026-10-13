import { createTranslator } from "../translator";

/** Réponses simulées du faux terminal (les vraies erreurs d'outils, comme « command not found », restent telles quelles). */
export const t = createTranslator("challenge", {
  fr: {
    notWhatAsked: "(la commande s'exécute, mais ce n'est pas ce qui est demandé à cette étape)",
  },
  en: {
    notWhatAsked: "(the command runs, but it is not what this step asks for)",
  },
});
