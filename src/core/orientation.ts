/**
 * Orientation et plein écran sur mobile. Aucun navigateur ne permet d'imposer le paysage partout :
 * Android (Chrome) ne verrouille l'orientation qu'en plein écran, et iPhone (Safari) ne sait ni l'un ni l'autre.
 * On propose donc un conseil que le joueur peut ignorer, et un plein écran verrouillé en paysage quand c'est possible.
 */

/** Carré compris : même convention que la media query CSS `(orientation: portrait)`. */
export function isPortrait(width: number, height: number): boolean {
  return Number.isFinite(width) && Number.isFinite(height) && height >= width;
}

export interface HintContext {
  touch: boolean;
  portrait: boolean;
  /** Le joueur a déjà écarté le conseil pendant cette session. */
  dismissed: boolean;
  /** Une mission est en cours : ni sur l'accueil ni sur la carte, où le portrait convient très bien. */
  inMission: boolean;
}

/** Le conseil n'a de sens que sur un écran tactile tenu en portrait, en mission, et tant qu'il n'est pas écarté. */
export function shouldSuggestLandscape(context: HintContext): boolean {
  return context.touch && context.portrait && context.inMission && !context.dismissed;
}

/** Ce que fait le navigateur : sous-ensembles de `Document` et `Screen` utilisés, injectables dans les tests. */
export interface FullscreenHost {
  fullscreenEnabled?: boolean;
  fullscreenElement?: Element | null;
  documentElement: { requestFullscreen?: (options?: FullscreenOptions) => Promise<void> };
  exitFullscreen?: () => Promise<void>;
}

export interface OrientationHost {
  orientation?: { lock?: (orientation: "landscape") => Promise<void>; unlock?: () => void };
}

export type LandscapeOutcome =
  /** Plein écran obtenu et paysage verrouillé. */
  | "locked"
  /** Plein écran obtenu, mais le navigateur refuse de verrouiller : le joueur tourne lui-même son téléphone. */
  | "fullscreen-only"
  /** Plein écran refusé ou impossible (iPhone, iframe sans autorisation, geste refusé). */
  | "unavailable";

export function fullscreenSupported(host: FullscreenHost): boolean {
  return host.fullscreenEnabled === true && typeof host.documentElement.requestFullscreen === "function";
}

/**
 * Plein écran puis verrouillage en paysage. À appeler depuis un geste du joueur (clic) : sans cela le navigateur
 * refuse. Ne lève jamais : un refus est un résultat normal (le jeu reste jouable), pas une erreur.
 */
export async function enterLandscapeFullscreen(host: FullscreenHost, screenHost: OrientationHost): Promise<LandscapeOutcome> {
  if (!fullscreenSupported(host)) return "unavailable";
  try {
    if (!host.fullscreenElement) await host.documentElement.requestFullscreen?.();
  } catch (error) {
    console.warn("Plein écran refusé par le navigateur.", error);
    return "unavailable";
  }
  const lock = screenHost.orientation?.lock;
  if (typeof lock !== "function") return "fullscreen-only";
  try {
    await lock.call(screenHost.orientation, "landscape");
    return "locked";
  } catch (error) {
    console.warn("Verrouillage du paysage refusé par le navigateur.", error);
    return "fullscreen-only";
  }
}
