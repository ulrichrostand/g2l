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

/** Chemin vu par la mesure : sans préfixe de déploiement (« /g2l/ ») ni `index.html`, toujours avec une barre initiale. */
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

/** Étiquette de source ajoutée à un lien partagé (`?ref=linkedin`) : sobre, jamais une adresse ni du texte libre. */
const SOURCE_TAG = /^[a-z0-9][a-z0-9_-]{0,39}$/;
/** Mêmes noms que ceux que GoatCounter reconnaît pour la source d'une visite. */
const SOURCE_PARAMETERS = ["ref", "utm_source", "source"] as const;

/**
 * Origine déclarée dans l'adresse de la page, ou « » si elle est absente ou invalide. Beaucoup d'applications (LinkedIn, X,
 * messageries) ne transmettent aucun site d'origine : l'étiquette permet de savoir d'où viennent les visites sans rien traquer.
 */
export function sourceTag(search: string): string {
  const parameters = new URLSearchParams(search);
  for (const name of SOURCE_PARAMETERS) {
    const value = (parameters.get(name) ?? "").trim().toLowerCase();
    if (SOURCE_TAG.test(value)) return value;
  }
  return "";
}

export interface CountParameters {
  path: string;
  title?: string;
  referrer?: string;
  /** Taille d'écran « largeur,hauteur,densité » : sert uniquement à savoir si le site est utilisé sur téléphone ou ordinateur. */
  screen?: string;
  /** Vrai pour un évènement (clic, étape franchie) plutôt qu'une page vue. */
  event?: boolean;
}

export function buildCountUrl(endpoint: string, parameters: CountParameters): string {
  const query = new URLSearchParams({ p: parameters.path });
  if (parameters.title) query.set("t", parameters.title);
  if (parameters.referrer) query.set("r", parameters.referrer);
  if (parameters.screen) query.set("s", parameters.screen);
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

/**
 * Aucune mesure depuis le serveur de développement (`npm run dev`, même ouvert depuis un téléphone sur le réseau local) ni depuis une copie
 * de test construite avec `VITE_ANALYTICS_OFF=1` : les essais ne doivent pas se mélanger aux vraies statistiques.
 */
function disabledByBuild(): boolean {
  return import.meta.env.DEV || import.meta.env.VITE_ANALYTICS_OFF === "1";
}

/** Envoi « au mieux » : un échec de mesure ne doit jamais gêner le visiteur, il n'a donc aucun effet visible. */
function send(parameters: CountParameters): void {
  if (disabledByBuild() || !shouldTrack(readEnvironment())) return;
  const pixel = new Image(1, 1);
  pixel.referrerPolicy = "no-referrer";
  pixel.src = buildCountUrl(ANALYTICS_ENDPOINT, parameters);
}

/** Format attendu par GoatCounter : largeur,hauteur,densité de pixels. Valeurs entières bornées, jamais d'autre information. */
export function screenSize(width: number, height: number, pixelRatio: number): string {
  const clamp = (value: number): number => (Number.isFinite(value) ? Math.min(Math.max(Math.round(value), 0), 20000) : 0);
  return `${clamp(width)},${clamp(height)},${Math.min(Math.max(Math.round(pixelRatio * 100) / 100, 0), 10)}`;
}

export function trackPageview(base: string): void {
  send({
    screen: screenSize(window.screen.width, window.screen.height, window.devicePixelRatio || 1),
    path: pagePath(window.location.pathname, base),
    title: document.title,
    // L'étiquette du lien, plus précise, passe avant le site d'origine déduit du navigateur.
    referrer: sourceTag(window.location.search) || referrerHost(document.referrer, window.location.hostname),
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
