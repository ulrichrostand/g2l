import { describe, expect, it } from "vitest";
import { isAnswerCorrect } from "../src/challenges/evaluate";
import { isStepCommandCorrect } from "../src/challenges/scenario";
import { BOSSES_EN, BOSSES_FR } from "../src/content/bosses";
import { CURRICULUM_EN, CURRICULUM_FR } from "../src/content/curriculum";
import { SCENARIOS_EN, SCENARIOS_FR } from "../src/content/scenarios";
import type { Challenge, DevOpsModule, ScenarioStep } from "../src/content/types";

/**
 * Le contenu pédagogique existe en deux langues. L'anglais doit avoir exactement la même structure que le français
 * (mêmes identifiants, mêmes nombres de leçons, défis, étapes et phases) : la progression est enregistrée par identifiant
 * et par numéro, elle doit rester valable quand le joueur change de langue.
 */

const FRENCH_LETTERS = /[àâçéèêëîïôûùœÀÉÈÊ]/;

function* strings(value: unknown): Generator<string> {
  if (typeof value === "string") yield value;
  else if (Array.isArray(value)) for (const item of value) yield* strings(item);
  else if (value && typeof value === "object") for (const item of Object.values(value)) yield* strings(item);
}

function correctAnswerFor(challenge: Challenge): Parameters<typeof isAnswerCorrect>[1] {
  if (challenge.kind === "choice") return { kind: "choice", selectedIndex: challenge.correctIndex };
  if (challenge.kind === "command") return { kind: "command", typedCommand: challenge.acceptedAnswers[0] as string };
  return { kind: "order", orderedSteps: [...challenge.steps] };
}

function stepProblems(step: ScenarioStep): string[] {
  const problems: string[] = [];
  if (step.accepted.length === 0) problems.push("aucune commande acceptée");
  for (const command of step.accepted) if (!isStepCommandCorrect(step, command)) problems.push(`commande canonique refusée : ${command}`);
  for (const pattern of step.patterns ?? []) {
    try {
      new RegExp(pattern);
    } catch {
      problems.push(`motif invalide : ${pattern}`);
    }
  }
  return problems;
}

describe("parcours DevOps : parité du français et de l'anglais", () => {
  it("mêmes modules, dans le même ordre, avec les mêmes identifiants", () => {
    expect(CURRICULUM_EN.map((module) => module.id)).toEqual(CURRICULUM_FR.map((module) => module.id));
  });

  it.each(CURRICULUM_FR.map((module, index) => [module.id, index] as const))("module %s : même structure en anglais", (_id, index) => {
    const fr: DevOpsModule = CURRICULUM_FR[index]!;
    const en: DevOpsModule = CURRICULUM_EN[index]!;
    expect(en.roadmapTopics).toHaveLength(fr.roadmapTopics.length);
    expect(en.roadmapSection.trim()).not.toBe("");
    expect(en.lessons).toHaveLength(fr.lessons.length);
    expect(en.challenges).toHaveLength(fr.challenges.length);
    en.lessons.forEach((lesson, i) => {
      expect(Boolean(lesson.example), `leçon ${i} : exemple`).toBe(Boolean(fr.lessons[i]!.example));
      // Le code d'un exemple est de la vraie syntaxe : il ne change pas d'une langue à l'autre sauf s'il contient du texte à traduire.
      expect(lesson.keyPoint.trim()).not.toBe("");
    });
    en.challenges.forEach((challenge, i) => {
      const reference = fr.challenges[i]!;
      expect(challenge.kind, `défi ${i} : type`).toBe(reference.kind);
      if (challenge.kind === "choice" && reference.kind === "choice") {
        expect(challenge.options, `défi ${i} : options`).toHaveLength(reference.options.length);
        expect(challenge.correctIndex, `défi ${i} : bonne réponse`).toBe(reference.correctIndex);
      }
      if (challenge.kind === "order" && reference.kind === "order") expect(challenge.steps, `défi ${i} : étapes`).toHaveLength(reference.steps.length);
      if (challenge.kind === "command") expect(challenge.acceptedAnswers.length, `défi ${i} : réponses`).toBeGreaterThan(0);
      expect(isAnswerCorrect(challenge, correctAnswerFor(challenge)), `défi ${i} : la bonne réponse doit être acceptée`).toBe(true);
    });
  });

  it("l'anglais n'est plus du français : titres et briefings traduits, aucune lettre accentuée française", () => {
    for (const [index, module] of CURRICULUM_EN.entries()) {
      const fr = CURRICULUM_FR[index]!;
      expect(module.title, `${module.id} : titre`).not.toBe(fr.title);
      expect(module.briefing, `${module.id} : briefing`).not.toBe(fr.briefing);
      for (const text of strings(module)) expect(FRENCH_LETTERS.test(text), `${module.id} : « ${text.slice(0, 70)} » contient du français`).toBe(false);
    }
  });
});

describe("scénarios de terminal : parité du français et de l'anglais", () => {
  it("mêmes modules", () => {
    expect(Object.keys(SCENARIOS_EN).sort()).toEqual(Object.keys(SCENARIOS_FR).sort());
  });

  it.each(Object.keys(SCENARIOS_FR))("scénario %s : même nombre d'étapes, mêmes étapes d'examen, commandes valides", (moduleId) => {
    const fr = SCENARIOS_FR[moduleId]!;
    const en = SCENARIOS_EN[moduleId]!;
    expect(en.steps).toHaveLength(fr.steps.length);
    en.steps.forEach((step, i) => {
      expect(Boolean(step.exam), `étape ${i} : question d'examen`).toBe(Boolean(fr.steps[i]!.exam));
      expect(stepProblems(step), `étape ${i}`).toEqual([]);
    });
    expect(en.title).not.toBe(fr.title);
    for (const text of strings(en)) expect(FRENCH_LETTERS.test(text), `« ${text.slice(0, 70)} » contient du français`).toBe(false);
  });
});

describe("boss : parité du français et de l'anglais", () => {
  it("mêmes boss, mêmes couleurs", () => {
    expect(Object.keys(BOSSES_EN).sort()).toEqual(Object.keys(BOSSES_FR).sort());
    for (const [id, boss] of Object.entries(BOSSES_FR)) {
      expect(BOSSES_EN[id]!.color).toBe(boss.color);
      expect(BOSSES_EN[id]!.moduleId).toBe(boss.moduleId);
    }
  });

  it.each(Object.keys(BOSSES_FR))("boss %s : trois phases, commandes valides, nom et textes traduits", (moduleId) => {
    const fr = BOSSES_FR[moduleId]!;
    const en = BOSSES_EN[moduleId]!;
    expect(en.phases).toHaveLength(3);
    en.phases.forEach((phase, i) => {
      expect(stepProblems(phase), `phase ${i}`).toEqual([]);
      expect(phase.context.length, `phase ${i} : contexte`).toBe(fr.phases[i]!.context.length > 0 ? phase.context.length : 0);
      expect(phase.hint.trim(), `phase ${i} : indice`).not.toBe("");
    });
    expect(en.intro).not.toBe(fr.intro);
    expect(en.defeat).not.toBe(fr.defeat);
    for (const text of strings(en)) expect(FRENCH_LETTERS.test(text), `« ${text.slice(0, 70)} » contient du français`).toBe(false);
  });
});
