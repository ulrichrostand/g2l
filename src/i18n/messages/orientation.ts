import { createTranslator } from "../translator";

export const t = createTranslator("orientation", {
  fr: {
    locked: "Paysage activé.",
    fullscreenOnly: "Plein écran activé : tourne ton téléphone en paysage.",
    unavailable: "Ton navigateur ne permet pas le plein écran : tourne simplement ton téléphone en paysage.",
    fullscreen: "Plein écran",
    later: "Plus tard",
    hintFullscreen: "Le paysage est plus confortable pour jouer : vue plus large, commandes plus espacées.",
    hintRotate: "Le paysage est plus confortable pour jouer : tourne ton téléphone sur le côté.",
  },
  en: {
    locked: "Landscape enabled.",
    fullscreenOnly: "Fullscreen enabled: turn your phone to landscape.",
    unavailable: "Your browser does not allow fullscreen: just turn your phone to landscape.",
    fullscreen: "Fullscreen",
    later: "Later",
    hintFullscreen: "Landscape is more comfortable for playing: a wider view, more spaced-out controls.",
    hintRotate: "Landscape is more comfortable for playing: turn your phone on its side.",
  },
});
