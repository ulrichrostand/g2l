import { LANG } from "../i18n/lang";
import { CURRICULUM_EN } from "./en/curriculum";
import { CURRICULUM_FR } from "./fr/curriculum";
import type { DevOpsModule } from "./types";

export { CURRICULUM_EN, CURRICULUM_FR };

/** Les modules dans la langue de la page : mêmes identifiants, mêmes numéros de leçons et de défis dans les deux langues. */
export const CURRICULUM: readonly DevOpsModule[] = LANG === "en" ? CURRICULUM_EN : CURRICULUM_FR;

export const ROADMAP_URL = "https://roadmap.sh/devops";
