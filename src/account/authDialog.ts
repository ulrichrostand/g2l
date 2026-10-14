import { LANG } from "../i18n/lang";
import { t } from "../i18n/messages/account";
import { legalPath } from "../i18n/routes";
import { button, element } from "../ui/dom";
import type { AccountUser } from "./api";
import { authErrorMessage } from "./authMessages";
import { openModal, type ModalHandle } from "./modal";
import type { SessionStore } from "./session";

export type AuthMode = "register" | "login";

export interface AuthDialogOptions {
  session: SessionStore;
  mode: AuthMode;
  /** Cours auquel s'inscrire en créant le compte (identifiant API), et son nom affiché. */
  courseId?: string;
  courseName?: string;
  /** Propose « Jouer sans compte » (le compte reste facultatif). */
  allowGuest?: boolean;
  onSuccess(user: AccountUser, mode: AuthMode): void;
  onGuest?(): void;
}

const MIN_PASSWORD_LENGTH = 10;

/** Fenêtre d'inscription / de connexion. Tout le texte passe par textContent ; aucune donnée saisie n'est écrite dans le DOM en HTML. */
export function openAuthDialog(options: AuthDialogOptions): ModalHandle {
  const content = element("div", { className: "g2l-auth" });
  const handle = openModal({ title: titleFor(options.mode), content });
  let mode = options.mode;

  const render = (): void => {
    const titleNode = handle.element.querySelector<HTMLElement>(".g2l-modal-title");
    if (titleNode) titleNode.textContent = titleFor(mode);

    const emailInput = element("input", { className: "g2l-input", attributes: { id: "g2l-email", name: "email", type: "email", autocomplete: "email", required: "", maxlength: "254", inputmode: "email", spellcheck: "false" } });
    const passwordInput = element("input", {
      className: "g2l-input",
      attributes: { id: "g2l-password", name: "password", type: "password", autocomplete: mode === "register" ? "new-password" : "current-password", required: "", maxlength: "128", ...(mode === "register" ? { minlength: String(MIN_PASSWORD_LENGTH) } : {}) },
    });
    const errorLine = element("p", { className: "g2l-error", attributes: { role: "alert" } });
    const submit = element("button", { className: "g2l-submit", text: mode === "register" ? t("submitRegister") : t("submitLogin"), attributes: { type: "submit" } });
    const switchMode = button(mode === "register" ? t("switchToLogin") : t("switchToRegister"), () => {
      mode = mode === "register" ? "login" : "register";
      render();
    }, "g2l-link-button");

    const form = element("form", { className: "g2l-form", attributes: { novalidate: "" } }, [
      element("p", { className: "g2l-lead", text: leadFor(mode, options) }),
      element("label", { className: "g2l-label", text: t("emailLabel"), attributes: { for: "g2l-email" } }),
      emailInput,
      element("label", { className: "g2l-label", text: t("passwordLabel"), attributes: { for: "g2l-password" } }),
      passwordInput,
      mode === "register" ? element("p", { className: "g2l-hint", text: t("passwordHint") }) : null,
      errorLine,
      submit,
      element("div", { className: "g2l-secondary" }, [
        switchMode,
        options.allowGuest && options.onGuest ? button(t("playAsGuest"), () => { handle.close(); options.onGuest?.(); }, "g2l-link-button") : null,
      ]),
      mode === "register" ? privacyNote() : null,
    ]);

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      void submitForm(form, emailInput, passwordInput, errorLine, submit);
    });
    content.replaceChildren(form);
    emailInput.focus();
  };

  async function submitForm(form: HTMLFormElement, emailInput: HTMLInputElement, passwordInput: HTMLInputElement, errorLine: HTMLElement, submit: HTMLButtonElement): Promise<void> {
    errorLine.textContent = "";
    const email = emailInput.value.trim();
    if (!emailInput.checkValidity() || email === "") {
      errorLine.textContent = t("errorInvalidEmail");
      emailInput.focus();
      return;
    }
    if (mode === "register" && passwordInput.value.length < MIN_PASSWORD_LENGTH) {
      errorLine.textContent = t("errorPasswordShort");
      passwordInput.focus();
      return;
    }
    if (passwordInput.value === "") {
      passwordInput.focus();
      return;
    }
    const submittedMode = mode;
    const idleLabel = submit.textContent ?? "";
    for (const control of form.elements) (control as HTMLInputElement | HTMLButtonElement).disabled = true;
    submit.textContent = t("pending");
    try {
      const user = submittedMode === "register" ? await options.session.register(email, passwordInput.value, options.courseId) : await options.session.login(email, passwordInput.value);
      handle.close();
      options.onSuccess(user, submittedMode);
    } catch (error) {
      errorLine.textContent = authErrorMessage(error);
      for (const control of form.elements) (control as HTMLInputElement | HTMLButtonElement).disabled = false;
      submit.textContent = idleLabel;
      passwordInput.value = "";
      passwordInput.focus();
    }
  }

  render();
  return handle;
}

function titleFor(mode: AuthMode): string {
  return mode === "register" ? t("titleRegister") : t("titleLogin");
}

function leadFor(mode: AuthMode, options: AuthDialogOptions): string {
  if (mode === "login") return t("leadLogin");
  return options.courseName ? t("leadRegister", { course: options.courseName }) : t("leadRegisterNoCourse");
}

function privacyNote(): HTMLElement {
  const link = element("a", { text: t("privacyLink"), attributes: { href: legalPath(LANG, import.meta.env.BASE_URL), target: "_blank", rel: "noopener noreferrer" } });
  return element("p", { className: "g2l-privacy" }, [document.createTextNode(t("privacyNote")), link, document.createTextNode(".")]);
}
