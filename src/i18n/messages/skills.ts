import { createTranslator } from "../translator";

export const t = createTranslator("skills", {
  fr: { todo: "À faire", learning: "À consolider", solid: "Acquis", mastered: "Maîtrisé" },
  en: { todo: "To do", learning: "Needs work", solid: "Solid", mastered: "Mastered" },
});
