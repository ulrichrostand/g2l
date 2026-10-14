/**
 * Mesure d'audience anonyme, sans cookie, via GoatCounter (https://www.goatcounter.com).
 * Pas de script tiers : on envoie un simple « pixel » (requête d'image) qui porte la page vue ou l'évènement.
 * Rien d'identifiant n'est transmis : ni identifiant persistant, ni progression, ni contenu du stockage local.
 */

/** Code du compte GoatCounter : `<code>.goatcounter.com`. Seule valeur à changer si le compte porte un autre nom. */
export const ANALYTICS_SITE_CODE = "g2l";
export const ANALYTICS_ENDPOINT = `https://${ANALYTICS_SITE_CODE}.goatcounter.com/count`;
/** Posée dans le stockage local quand le visiteur refuse la mesure (bouton des mentions légales). */
export const ANALYTICS_OPT_OUT_KEY = "site-no-analytics";

export interface TrackEnvironment {
  hostname: string;
  /** Navigateur configuré « Ne pas me suivre ». */
  doNotTrack: boolean;
  /** Navigateur piloté par un robot (tests automatisés, scripts) : ses visites ne sont pas de vrais joueurs. */
  automated: boolean;
  optedOut: boolean;
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", ""]);

/** Pas de mesure en local, sous « Ne pas me suivre », pour les robots, ni après un refus explicite. */
export function shouldTrack(environment: TrackEnvironment): boolean {
  return !LOCAL_HOSTS.has(environment.hostname) && !environment.doNotTrack && !environment.automated && !environment.optedOut;
}

/** Chemin vu par la mesure : sans préfixe de déploiement (« /rostand/ ») ni `index.html`, toujours avec une barre initiale. */
export function pagePath(pathname: string, base: string): string {
  const relative = pathname.startsWith(base) ? pathname.slice(base.length) : pathname.replace(/^\/+/, "");
  return `/${relative.replace(/index\.html$/, "")}`;
}

/** Seul le nom de domaine d'où l'on vient est transmis (jamais l'adresse complète), et rien pour une navigation interne. */
export function referrerHost(referrer: string, ownHost: string): string {
  try {
    const { hostname } = new URL(referrer);
    return hostname === ownHost ? "" : hostname;
  } catch {
    return "";
  }
}

export interface CountParameters {
  path: string;
  title?: string;
  referrer?: string;
  /** Vrai pour un évènement (clic, étape franchie) plutôt qu'une page vue. */
  event?: boolean;
}

export function buildCountUrl(endpoint: string, parameters: CountParameters): string {
  const query = new URLSearchParams({ p: parameters.path });
  if (parameters.title) query.set("t", parameters.title);
  if (parameters.referrer) query.set("r", parameters.referrer);
  if (parameters.event) query.set("e", "true");
  // Évite qu'un cache serve la même réponse à deux visites différentes.
  query.set("rnd", Math.random().toString(36).slice(2, 10));
  return `${endpoint}?${query.toString()}`;
}

/** Noms d'évènements autorisés : minuscules, chiffres, tirets et barres. Pas de texte libre, donc pas de donnée personnelle. */
const EVENT_NAME = /^[a-z0-9][a-z0-9/-]{0,60}$/;

export function isValidEventName(name: string): boolean {
  return EVENT_NAME.test(name);
}

function readEnvironment(): TrackEnvironment {
  let optedOut = false;
  try {
    optedOut = window.localStorage.getItem(ANALYTICS_OPT_OUT_KEY) === "1";
  } catch {
    // Stockage indisponible (navigation privée, blocage) : aucune préférence enregistrée, la mesure reste anonyme.
  }
  return {
    hostname: window.location.hostname,
    doNotTrack: navigator.doNotTrack === "1" || (window as { doNotTrack?: string }).doNotTrack === "1",
    automated: navigator.webdriver === true,
    optedOut,
  };
}

/** Envoi « au mieux » : un échec de mesure ne doit jamais gêner le visiteur, il n'a donc aucun effet visible. */
function send(parameters: CountParameters): void {
  if (!shouldTrack(readEnvironment())) return;
  const pixel = new Image(1, 1);
  pixel.referrerPolicy = "no-referrer";
  pixel.src = buildCountUrl(ANALYTICS_ENDPOINT, parameters);
}

export function trackPageview(base: string): void {
  send({
    path: pagePath(window.location.pathname, base),
    title: document.title,
    referrer: referrerHost(document.referrer, window.location.hostname),
  });
}

export function trackEvent(name: string): void {
  if (!isValidEventName(name)) throw new RangeError(`Nom d'évènement invalide : ${name}`);
  send({ path: name, event: true });
}

export function isOptedOut(): boolean {
  return readEnvironment().optedOut;
}

/** Renvoie false si le navigateur refuse d'enregistrer le choix (stockage bloqué). */
export function setOptOut(optedOut: boolean): boolean {
  try {
    if (optedOut) window.localStorage.setItem(ANALYTICS_OPT_OUT_KEY, "1");
    else window.localStorage.removeItem(ANALYTICS_OPT_OUT_KEY);
    return true;
  } catch {
    return false;
  }
}
