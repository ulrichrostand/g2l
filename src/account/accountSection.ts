import { t } from "../i18n/messages/account";
import { button, element } from "../ui/dom";
import { ApiError } from "./api";
import { openAuthDialog } from "./authDialog";
import type { GameAccount } from "./gameAccount";
import { openModal } from "./modal";
import type { SyncStatus } from "./cloudSync";

const SYNC_LABEL: Record<SyncStatus, (() => string) | null> = {
  idle: null,
  syncing: () => t("syncSyncing"),
  synced: () => t("syncSynced"),
  offline: () => t("syncOffline"),
  error: () => t("syncError"),
};

/**
 * Bloc « Compte » du menu Paramètres : connexion, état de synchronisation, export et suppression des données.
 * Il se redessine tout seul quand la session ou la synchronisation changent, et se désabonne dès qu'il quitte la page.
 */
export function createAccountSection(account: GameAccount): HTMLElement {
  const root = element("div", { className: "settings-account" });

  const render = (): void => {
    const state = account.session.current;
    const nodes: (Node | null)[] = [element("span", { className: "settings-heading", text: t("accountHeading") })];
    if (state.status === "authenticated") {
      const label = SYNC_LABEL[account.syncStatus.current];
      nodes.push(
        element("p", { className: "settings-account-line", text: t("accountSignedInAs", { email: state.user.email }) }),
        label ? element("p", { className: "settings-account-line sync", text: label(), attributes: { role: "status" } }) : null,
        button(t("accountExport"), () => void exportData(account, root), "btn ghost small"),
        button(t("accountSignOut"), () => void account.session.logout(), "btn ghost small"),
        button(t("accountDelete"), () => openDeleteDialog(account), "btn ghost small danger"),
      );
    } else {
      nodes.push(
        button(
          t("accountSignIn"),
          () => openAuthDialog({ session: account.session, mode: "login", onSuccess: () => undefined }),
          "btn ghost small",
        ),
      );
    }
    root.replaceChildren(...nodes.filter((node): node is Node => node !== null));
  };

  const unsubscribers: (() => void)[] = [];
  const refresh = (): void => {
    if (!root.isConnected && unsubscribers.length > 0 && root.dataset.mounted === "1") {
      for (const unsubscribe of unsubscribers) unsubscribe();
      return;
    }
    if (root.isConnected) root.dataset.mounted = "1";
    render();
  };
  unsubscribers.push(account.session.subscribe(refresh), account.syncStatus.subscribe(refresh));
  render();
  return root;
}

async function exportData(account: GameAccount, root: HTMLElement): Promise<void> {
  try {
    const text = await account.api.exportData();
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const link = element("a", { attributes: { href: url, download: "mes-donnees-g2l.json" } });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  } catch {
    root.querySelector(".export-error")?.remove();
    root.append(element("p", { className: "settings-account-line g2l-error export-error", text: t("exportFailed"), attributes: { role: "alert" } }));
  }
}

function openDeleteDialog(account: GameAccount): void {
  const passwordInput = element("input", { className: "g2l-input", attributes: { id: "g2l-delete-password", type: "password", autocomplete: "current-password", required: "", maxlength: "128" } });
  const errorLine = element("p", { className: "g2l-error", attributes: { role: "alert" } });
  const confirm = element("button", { className: "g2l-submit danger", text: t("deleteConfirm"), attributes: { type: "submit" } });
  const form = element("form", { className: "g2l-form", attributes: { novalidate: "" } }, [
    element("p", { className: "g2l-lead", text: t("deleteText") }),
    element("label", { className: "g2l-label", text: t("passwordLabel"), attributes: { for: "g2l-delete-password" } }),
    passwordInput,
    errorLine,
    confirm,
  ]);
  const modal = openModal({ title: t("deleteTitle"), content: element("div", { className: "g2l-auth" }, [form, button(t("cancel"), () => modal.close(), "g2l-link-button")]) });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (passwordInput.value === "") return;
    confirm.disabled = true;
    errorLine.textContent = "";
    account.api
      .deleteAccount(passwordInput.value)
      .then(() => {
        account.session.markDeleted();
        modal.close();
      })
      .catch((error: unknown) => {
        errorLine.textContent = error instanceof ApiError && error.code === "wrong_password" ? t("deleteWrongPassword") : error instanceof ApiError && error.isNetworkError ? t("errorNetwork") : t("errorGeneric");
        confirm.disabled = false;
        passwordInput.value = "";
        passwordInput.focus();
      });
  });
  passwordInput.focus();
}
