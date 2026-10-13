import { createTranslator } from "../translator";

export const t = createTranslator("exam", {
  fr: {
    honorsHigh: "Mention très bien",
    honors: "Mention bien",
    honorsLow: "Mention assez bien",
    passed: "Admis",
    failed: "Ajourné — à retravailler",
  },
  en: {
    honorsHigh: "High distinction",
    honors: "Distinction",
    honorsLow: "Merit",
    passed: "Passed",
    failed: "Not passed — keep practicing",
  },
});
