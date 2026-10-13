import { element } from "../ui/dom";
import { LANG, LANGS, type Lang } from "./lang";
import { storeLang } from "./preference";
import { alternatePath } from "./routes";

const NAMES: Record<Lang, { short: string; full: string }> = {
  fr: { short: "FR", full: "Français" },
  en: { short: "EN", full: "English" },
};
const LABEL: Record<Lang, string> = { fr: "Langue", en: "Language" };

/**
 * Sélecteur de langue : un lien par langue vers la même page dans l'autre langue (navigation normale, donc pas
 * de JavaScript nécessaire pour que le lien marche, et les moteurs de recherche le suivent). Le clic mémorise le choix.
 * Renvoie null si la page courante n'a pas d'équivalent (adresse inconnue) : mieux vaut rien qu'un lien cassé.
 */
export function createLanguageSwitch(pathname: string, base: string): HTMLElement | null {
  const links: HTMLElement[] = [];
  for (const lang of LANGS) {
    const target = alternatePath(pathname, lang, base);
    if (target === null) return null;
    const current = lang === LANG;
    const link = element("a", {
      className: current ? "lang-link current" : "lang-link",
      text: NAMES[lang].short,
      attributes: { href: target, lang, hreflang: lang, "aria-label": NAMES[lang].full, ...(current ? { "aria-current": "true" } : {}) },
    });
    link.addEventListener("click", () => storeLang(lang));
    links.push(link);
  }
  return element("nav", { className: "lang-switch", attributes: { "aria-label": LABEL[LANG] } }, links);
}
