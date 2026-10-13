import { createTranslator } from "../translator";

/** Mentions obligatoires des affiches : une publicité doit toujours être identifiable comme telle. */
export const t = createTranslator("ads", {
  fr: { adLabel: "PUBLICITÉ", partnerLabel: "Partenaire : {advertiser}" },
  en: { adLabel: "ADVERTISEMENT", partnerLabel: "Partner: {advertiser}" },
});
