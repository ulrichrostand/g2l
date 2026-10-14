import { accountApi, sessionStore } from "../account/session";
import { ACCOUNTS_ENABLED, REQUIRE_ACCOUNT_TO_PLAY } from "../account/config";
import { openAuthDialog } from "../account/authDialog";
import { isSingular, LANG } from "../i18n/lang";
import { t } from "../i18n/messages/account";
import { button } from "../ui/dom";
import { textOf, type Course } from "./catalog";

/** Au-delà de ce délai, un clic sur « Jouer » ne attend plus la réponse du serveur : on traite le visiteur comme anonyme. */
const SESSION_WAIT_MS = 2500;

/** Vrai quand ce build gère les comptes (sinon le portail se comporte exactement comme avant). */
export const accountsEnabled = ACCOUNTS_ENABLED;

async function knownSession(): Promise<"authenticated" | "anonymous"> {
  if (sessionStore.current.status === "unknown") {
    await Promise.race([sessionStore.refresh(), new Promise((resolve) => setTimeout(resolve, SESSION_WAIT_MS))]);
  }
  return sessionStore.current.status === "authenticated" ? "authenticated" : "anonymous";
}

/**
 * Clic sur « Jouer » : c'est là que le joueur s'inscrit au cours. Connecté, on l'inscrit (idempotent) et on le laisse
 * jouer ; sinon on lui propose de créer un compte, avec « Jouer sans compte » tant que le compte n'est pas obligatoire.
 * Un clic « ouvrir dans un nouvel onglet » ou avec une touche de modification garde le comportement normal du lien.
 */
export function playClickHandler(course: Course, href: string): (event: MouseEvent) => void {
  const goPlay = (): void => window.location.assign(href);
  const enrollThenPlay = async (): Promise<void> => {
    // L'inscription ne doit jamais empêcher de jouer : en cas d'échec réseau, elle sera rejouée à la prochaine connexion.
    await accountApi.enroll(course.id).catch(() => undefined);
    goPlay();
  };
  return (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    void (async () => {
      if ((await knownSession()) === "authenticated") return enrollThenPlay();
      openAuthDialog({
        session: sessionStore,
        mode: "register",
        courseId: course.id,
        courseName: textOf(course, LANG).title,
        allowGuest: !REQUIRE_ACCOUNT_TO_PLAY,
        onSuccess: (_user, mode) => void (mode === "login" ? enrollThenPlay() : goPlay()),
        onGuest: goPlay,
      });
    })();
  };
}

/** Bouton de l'en-tête : « Connexion » ou « Déconnexion » selon l'état. Absent quand les comptes ne sont pas activés. */
export function accountHeaderControl(): HTMLElement | null {
  if (!ACCOUNTS_ENABLED) return null;
  const control = button("", () => {
    if (sessionStore.current.status === "authenticated") void sessionStore.logout();
    else openAuthDialog({ session: sessionStore, mode: "login", onSuccess: () => undefined });
  }, "account-control");
  const render = (): void => {
    const state = sessionStore.current;
    control.textContent = state.status === "authenticated" ? t("headerSignOut") : t("headerSignIn");
    if (state.status === "authenticated") control.title = t("headerSignedInAs", { email: state.user.email });
    else control.removeAttribute("title");
  };
  sessionStore.subscribe(render);
  render();
  return control;
}

/** Ligne « N joueurs inscrits » sous chaque jeu disponible ; silencieuse tant qu'il n'y a personne ou si le serveur ne répond pas. */
export function enrollmentLine(course: Course): HTMLElement | null {
  if (!ACCOUNTS_ENABLED || course.status !== "available") return null;
  const line = document.createElement("p");
  line.className = "game-enrolled";
  line.dataset.course = course.id;
  line.hidden = true;
  return line;
}

export async function loadEnrollmentCounts(): Promise<void> {
  if (!ACCOUNTS_ENABLED) return;
  let counts: Record<string, number>;
  try {
    counts = await accountApi.courseStats();
  } catch {
    return;
  }
  for (const line of document.querySelectorAll<HTMLElement>(".game-enrolled")) {
    const count = counts[line.dataset.course ?? ""] ?? 0;
    if (count < 1) continue;
    line.textContent = t(isSingular(count) ? "enrolledOne" : "enrolledOther", { count: count.toLocaleString(LANG === "en" ? "en-US" : "fr-FR") });
    line.hidden = false;
  }
}

export async function startPortalSession(): Promise<void> {
  if (ACCOUNTS_ENABLED) await sessionStore.refresh();
}
