import { LANG } from "../i18n/lang";
import { SCENARIOS_EN } from "./en/scenarios";
import { SCENARIOS_FR } from "./fr/scenarios";
import type { Scenario } from "./types";

export { SCENARIOS_EN, SCENARIOS_FR };

/** Les scénarios dans la langue de la page : mêmes modules, mêmes étapes dans les deux langues. */
export const SCENARIOS: Record<string, Scenario> = LANG === "en" ? SCENARIOS_EN : SCENARIOS_FR;
