import { t } from "../i18n/messages/account";
import { button, element } from "../ui/dom";
import "./account.css";

export interface ModalHandle {
  readonly element: HTMLDialogElement;
  close(): void;
}

let modalCounter = 0;

/**
 * Fenêtre modale accessible, basée sur <dialog> : le navigateur gère le piège du focus, la touche Échap et le retour du
 * focus à l'élément d'origine. Le clavier reste dans la fenêtre : les touches tapées ici n'atteignent pas les commandes du jeu.
 */
export function openModal(options: { title: string; content: HTMLElement; onClose?: () => void }): ModalHandle {
  const titleId = `g2l-modal-title-${++modalCounter}`;
  const dialog = element("dialog", { className: "g2l-modal", attributes: { "aria-labelledby": titleId } });
  const closeButton = button("×", () => dialog.close(), "g2l-modal-close");
  closeButton.setAttribute("aria-label", t("close"));
  dialog.append(closeButton, element("h2", { className: "g2l-modal-title", text: options.title, attributes: { id: titleId } }), options.content);

  for (const type of ["keydown", "keyup"]) dialog.addEventListener(type, (event) => event.stopPropagation());
  // Clic sur le fond (hors du contenu) : ferme.
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener("close", () => {
    dialog.remove();
    options.onClose?.();
  });
  document.body.append(dialog);
  dialog.showModal();
  return { element: dialog, close: () => dialog.close() };
}
