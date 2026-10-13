import { t } from "../i18n/messages/settingsMenu";
import { element } from "./dom";

let menuCounter = 0;

/**
 * Menu de réglages replié par défaut : un bouton « hamburger » déplie un panneau qui s'insère dans le flux
 * (pas de fenêtre flottante, donc rien à rogner sur petit écran). Accessible : aria-expanded, Échap pour fermer,
 * focus rendu au bouton. Échap ne remonte pas, sinon il mettrait aussi le jeu en pause ou le relancerait.
 */
export function createSettingsMenu(controls: readonly HTMLElement[], variant: "inline" | "corner" = "inline"): HTMLElement {
  // « corner » : icône seule dans un coin de l'écran, panneau flottant (accueil plein écran). « inline » : bouton avec libellé, panneau dans le flux.
  const iconOnly = variant === "corner";
  const panelId = `settings-panel-${++menuCounter}`;
  const toggle = element(
    "button",
    {
      className: iconOnly ? "settings-toggle icon-only" : "btn ghost small settings-toggle",
      attributes: { type: "button", "aria-expanded": "false", "aria-controls": panelId, "aria-label": t("menuLabel"), title: t("menuTitle") },
    },
    [
      element("span", { className: "burger", attributes: { "aria-hidden": "true" } }, [element("span"), element("span"), element("span")]),
      iconOnly ? null : element("span", { text: t("menuLabel") }),
    ],
  );
  const panel = element("div", { className: "settings-panel", attributes: { id: panelId, role: "group", "aria-label": t("menuTitle") } }, [...controls]);
  panel.hidden = true;
  const wrapper = element("div", { className: iconOnly ? "settings-menu corner" : "settings-menu" }, [toggle, panel]);

  const closeOnOutsidePress = (event: PointerEvent): void => {
    if (!wrapper.isConnected) return stopListening();
    if (!wrapper.contains(event.target as Node)) setOpen(false);
  };
  const stopListening = (): void => document.removeEventListener("pointerdown", closeOnOutsidePress);

  function setOpen(open: boolean): void {
    panel.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
    toggle.classList.toggle("open", open);
    if (open) document.addEventListener("pointerdown", closeOnOutsidePress);
    else stopListening();
  }

  toggle.addEventListener("click", () => setOpen(panel.hidden));
  wrapper.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || panel.hidden) return;
    event.stopPropagation();
    setOpen(false);
    toggle.focus({ preventScroll: true });
  });
  return wrapper;
}

/** Ligne « Langue » : intitulé + sélecteur, pour le panneau. */
export function languageRow(switcher: HTMLElement): HTMLElement {
  return element("div", { className: "settings-row" }, [element("span", { className: "settings-heading", text: t("languageHeading") }), switcher]);
}
