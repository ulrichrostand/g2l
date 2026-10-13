import { LANG, LANGS, type Lang } from "./lang";

export type MessageParams = Record<string, string | number>;

/** Un catalogue : ses messages français et anglais, avec exactement les mêmes clés (vérifié à la compilation et par test). */
export interface Catalog<K extends string = string> {
  area: string;
  messages: Record<Lang, Record<K, string>>;
}

const registry: Catalog[] = [];

/** Tous les catalogues créés : sert au test de parité (mêmes clés, mêmes paramètres dans les deux langues). */
export function registeredCatalogs(): readonly Catalog[] {
  return registry;
}

const PLACEHOLDER = /\{([A-Za-z0-9_]+)\}/g;

/** Noms des paramètres `{nom}` d'un message. */
export function placeholdersOf(message: string): string[] {
  return [...message.matchAll(PLACEHOLDER)].map((match) => match[1] as string).sort();
}

/**
 * Remplace `{nom}` par la valeur fournie. Un paramètre manquant lève une erreur : un « {nom} » affiché au joueur
 * est un bug qu'on veut voir tout de suite, pas un texte approximatif.
 */
export function formatMessage(template: string, params: MessageParams = {}): string {
  return template.replace(PLACEHOLDER, (_, name: string) => {
    const value = params[name];
    if (value === undefined) throw new RangeError(`Paramètre de traduction manquant : {${name}} dans « ${template} »`);
    return String(value);
  });
}

/**
 * Crée le traducteur d'une zone de l'interface. Le catalogue anglais doit avoir exactement les clés du français :
 * une traduction oubliée ne compile pas.
 *
 *   const t = createTranslator("hud", { fr: { ammo: "MUN" }, en: { ammo: "AMMO" } });
 *   t("ammo")
 */
export function createTranslator<K extends string>(area: string, messages: { fr: Record<K, string>; en: Record<NoInfer<K>, string> }): (key: K, params?: MessageParams) => string {
  registry.push({ area, messages } as Catalog);
  return (key, params) => formatMessage(messages[LANG][key], params);
}

/** Traduit dans une langue donnée (tests, ou contenu rendu pour l'autre langue). */
export function translateIn(catalog: Catalog, lang: Lang, key: string, params?: MessageParams): string {
  const message = catalog.messages[lang][key];
  if (message === undefined) throw new RangeError(`Clé inconnue « ${key} » dans le catalogue « ${catalog.area} » (${lang})`);
  return formatMessage(message, params);
}

export { LANGS };
