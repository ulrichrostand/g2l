import { createTranslator } from "../translator";

export const t = createTranslator("touch", {
  fr: {
    aimPad: "Tirer : glisser pour viser, relâcher pour tirer",
    fire: "Tirer",
    hack: "Pirater",
    crouch: "Accroupir",
    gadget: "Gadget",
    vision: "Vision",
    pause: "Pause",
    shrink: "Réduire",
    exitFullscreen: "Quitter le plein écran",
    action: "Action",
  },
  en: {
    aimPad: "Fire: drag to aim, release to shoot",
    fire: "Fire",
    hack: "Hack",
    crouch: "Crouch",
    gadget: "Gadget",
    vision: "Vision",
    pause: "Pause",
    shrink: "Minimize",
    exitFullscreen: "Exit fullscreen",
    action: "Action",
  },
});
