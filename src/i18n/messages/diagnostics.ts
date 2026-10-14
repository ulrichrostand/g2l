import { createTranslator } from "../translator";

/** Ligne de diagnostic du rendu, dans le menu Paramètres : aide à comprendre un jeu qui saccade. */
export const t = createTranslator("diagnostics", {
  fr: {
    gpuLine: "Rendu : {gpu}",
    fpsPart: " · {fps} images/s",
    scalePart: " · résolution {percent} %",
    hintSoftware: "Le navigateur calcule l'image avec le processeur, pas avec la carte graphique. Active l'accélération matérielle (Chrome : Paramètres, Système) et redémarre le navigateur.",
    hintIntegrated: "Le navigateur utilise la puce graphique intégrée. Avec une carte dédiée, choisis-la pour le navigateur dans les paramètres graphiques de Windows (« Haute performance »).",
    resolutionReduced: "Résolution du rendu réduite à {percent} % pour garder le jeu fluide. Les effets sont conservés.",
  },
  en: {
    gpuLine: "Rendering: {gpu}",
    fpsPart: " · {fps} frames/s",
    scalePart: " · resolution {percent}%",
    hintSoftware: "The browser draws the image with the processor, not the graphics card. Turn on hardware acceleration (Chrome: Settings, System) and restart the browser.",
    hintIntegrated: "The browser is using the integrated graphics chip. If you have a dedicated card, set the browser to \"High performance\" in Windows graphics settings.",
    resolutionReduced: "Render resolution lowered to {percent}% to keep the game smooth. Effects are kept.",
  },
});
