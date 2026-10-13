import { createTranslator } from "../translator";

export const t = createTranslator("entities", {
  fr: {
    bossKneelPrompt: "À GENOUX : TAPE LA COMMANDE",
    terminalAccessOk: "ACCÈS OK",
    terminalIncident: "INCIDENT",
    terminalLocked: "VERROUILLÉ",
  },
  en: {
    bossKneelPrompt: "ON HIS KNEES: TYPE THE COMMAND",
    terminalAccessOk: "ACCESS OK",
    terminalIncident: "INCIDENT",
    terminalLocked: "LOCKED",
  },
});
