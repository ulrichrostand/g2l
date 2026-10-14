/**
 * Les comptes ne sont actifs que dans un build fait pour le VPS (VITE_ACCOUNTS=1). Sur GitHub Pages (pas d'API),
 * rien ne change : aucune interface de compte, aucun appel réseau.
 */
export const ACCOUNTS_ENABLED: boolean = import.meta.env.VITE_ACCOUNTS === "1";

/** L'API est servie par le même domaine que le site (reverse proxy) : adresse relative, donc cookies de session sans réglage. */
export const API_BASE = "/api";

/** Faux : le joueur peut jouer sans compte. Vrai : le clic sur « Jouer » exige de se connecter ou de s'inscrire. */
export const REQUIRE_ACCOUNT_TO_PLAY = false;

/** Identifiant du cours de ce jeu côté API (voir server/src/courses.ts). */
export const GAME_COURSE_ID = "devops";
