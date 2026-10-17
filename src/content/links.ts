import type { Lang } from "../i18n/lang";

/** Dépôt public du projet : issues, propositions de correction, code source consultable. */
export const REPOSITORY_URL = "https://github.com/ulrichrostand/g2l";

/** Page de choix du type de signalement (bug, correction de contenu, idée) : le point d'entrée le plus simple pour participer. */
export const NEW_ISSUE_URL = `${REPOSITORY_URL}/issues/new/choose`;

/** Guide de contribution dans la langue du visiteur (un guide par langue, car GitHub n'affiche pas de traduction). */
export function contributingUrl(lang: Lang): string {
  return `${REPOSITORY_URL}/blob/main/${lang === "en" ? "CONTRIBUTING.en.md" : "CONTRIBUTING.md"}`;
}
