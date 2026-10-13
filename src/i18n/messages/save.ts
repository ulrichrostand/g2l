import { createTranslator } from "../translator";

export const t = createTranslator("save", {
  fr: {
    empty: "Le code est vide.",
    tooLong: "Ce code est beaucoup trop long pour être un code de sauvegarde.",
    notSaveCode: "Ce n'est pas un code de sauvegarde Shadow Ops (il doit commencer par SHADOWOPS1).",
    checksum: "Le code est incomplet ou a été modifié. Recopie-le en entier.",
    unreadable: "Le contenu du code est illisible.",
  },
  en: {
    empty: "The code is empty.",
    tooLong: "This code is far too long to be a save code.",
    notSaveCode: "This is not a Shadow Ops save code (it must start with SHADOWOPS1).",
    checksum: "The code is incomplete or has been altered. Copy it again in full.",
    unreadable: "The code's content is unreadable.",
  },
});
