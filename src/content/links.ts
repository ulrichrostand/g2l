import type { Lang } from "../i18n/lang";

/** Dépôt public du projet : issues, propositions de correction, code source consultable. */
export const REPOSITORY_URL = "https://github.com/ulrichrostand/g2l";

/** Guide de contribution dans la langue du visiteur (un guide par langue, car GitHub n'affiche pas de traduction). */
export function contributingUrl(lang: Lang): string {
  return `${REPOSITORY_URL}/blob/main/${lang === "en" ? "CONTRIBUTING.en.md" : "CONTRIBUTING.md"}`;
}
