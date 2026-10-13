import { parseLang, type Lang } from "./lang";

export const LANG_STORAGE_KEY = "site-lang";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function safeStorage(): StorageLike | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    // Accès au stockage refusé (navigation privée stricte) : la préférence ne sera simplement pas mémorisée.
    return null;
  }
}

export function readStoredLang(storage: StorageLike | null = safeStorage()): Lang | null {
  if (!storage) return null;
  try {
    return parseLang(storage.getItem(LANG_STORAGE_KEY));
  } catch {
    return null;
  }
}

/** Mémorise le choix explicite du joueur (même origine pour le portail et les jeux). */
export function storeLang(lang: Lang, storage: StorageLike | null = safeStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(LANG_STORAGE_KEY, lang);
  } catch (error) {
    console.warn("Langue non mémorisée (stockage indisponible).", error);
  }
}

/** Première langue du navigateur que le site propose, sinon null. */
export function browserLang(languages: readonly string[]): Lang | null {
  for (const candidate of languages) {
    const lang = parseLang(candidate);
    if (lang) return lang;
  }
  return null;
}

/**
 * Langue à proposer à l'arrivée : le choix mémorisé d'abord, puis la langue du navigateur, sinon le français.
 * Un choix explicite l'emporte toujours sur la détection.
 */
export function preferredLang(stored: Lang | null, browserLanguages: readonly string[]): Lang {
  return stored ?? browserLang(browserLanguages) ?? "fr";
}

/**
 * Faut-il envoyer le visiteur vers la version anglaise à l'arrivée sur la page d'accueil française ? Oui seulement si
 * son choix mémorisé, ou à défaut la langue de son navigateur, est l'anglais. Jamais depuis une page anglaise : une adresse
 * anglaise partagée reste anglaise, et on ne boucle pas.
 */
export function autoRedirectTarget(pageLang: Lang, stored: Lang | null, browserLanguages: readonly string[]): Lang | null {
  return pageLang === "fr" && preferredLang(stored, browserLanguages) === "en" ? "en" : null;
}
