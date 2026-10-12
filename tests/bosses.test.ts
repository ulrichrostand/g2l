import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeCommand } from "../src/challenges/evaluate";
import { isStepCommandCorrect, simulateWrongCommand } from "../src/challenges/scenario";
import { WEAPONS } from "../src/combat/weapons";
import { BOSSES, bossFor } from "../src/content/bosses";
import { CURRICULUM } from "../src/content/curriculum";
import { SCENARIOS } from "../src/content/scenarios";
import { BossPanel } from "../src/ui/bossPanel";

/** Comparaison tolérante (casse, espaces) : on cherche une solution recopiée telle quelle dans un texte. */
function revealsCommand(text: string, command: string): boolean {
  const flatten = (value: string) => value.toLowerCase().replace(/\s+/g, " ");
  return flatten(text).includes(flatten(command));
}

/**
 * Tout ce que le module montre au joueur avant son boss : leçons, défis, intervention et textes des gadgets
 * qu'il débloque. Les commandes que les gadgets acceptent en silence n'en font pas partie : accepter n'est pas enseigner.
 */
function taughtText(moduleId: string): string {
  const module = CURRICULUM.find((candidate) => candidate.id === moduleId);
  if (!module) throw new RangeError(`Module inconnu : ${moduleId}`);
  const gadgets = WEAPONS.filter((weapon) => weapon.unlockModuleId === moduleId).map((weapon) => [weapon.listingCommand, weapon.objective, weapon.hint, weapon.note]);
  return JSON.stringify([module, SCENARIOS[moduleId] ?? null, gadgets]);
}

/** Mot entier : « -x » ne doit pas être trouvé dans « -xeu », ni « ansible » dans « ansible-playbook ». */
function mentionsWord(text: string, word: string): boolean {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![\\w-])${escaped}(?![\\w-])`).test(text);
}

/** Préfixe « fichier:numéro: » que grep n'écrit qu'avec l'option -n. */
const GREP_LINE_NUMBER = /(?:^|\s)[\w.-]*[./][\w./-]*:\d+:/;

const allPhases = Object.values(BOSSES).flatMap((boss) => boss.phases.map((phase, index) => ({ boss, phase, label: `${boss.moduleId} phase ${index + 1}` })));

describe("boss de fin de secteur", () => {
  it("chaque module du cursus a exactement un boss, avec 3 phases", () => {
    expect(Object.keys(BOSSES).sort()).toEqual(CURRICULUM.map((module) => module.id).sort());
    for (const module of CURRICULUM) {
      const boss = bossFor(module.id);
      expect(boss.moduleId).toBe(module.id);
      expect(boss.phases).toHaveLength(3);
      expect(boss.title.length).toBeGreaterThan(5);
      expect(boss.intro.length).toBeGreaterThan(40);
      expect(boss.defeat.length).toBeGreaterThan(40);
    }
  });

  it("a des noms uniques et des couleurs 0xRRGGBB valides", () => {
    const names = Object.values(BOSSES).map((boss) => boss.name);
    expect(new Set(names).size).toBe(names.length);
    for (const boss of Object.values(BOSSES)) {
      expect(Number.isInteger(boss.color)).toBe(true);
      expect(boss.color).toBeGreaterThanOrEqual(0);
      expect(boss.color).toBeLessThanOrEqual(0xffffff);
    }
  });

  it.each(allPhases.map(({ label, phase }) => [label, phase] as const))("%s : contenu complet et commandes acceptées", (_, phase) => {
    expect(phase.context.length).toBeGreaterThan(0);
    expect(phase.context.every((line) => line.length > 0)).toBe(true);
    expect(phase.hint.trim().length).toBeGreaterThan(0);
    expect(phase.goal.trim().length).toBeGreaterThan(15);
    expect(Array.isArray(phase.output)).toBe(true);
    expect(phase.accepted.length).toBeGreaterThan(0);
    for (const pattern of phase.patterns ?? []) expect(() => new RegExp(pattern)).not.toThrow();
    // La commande montrée en solution (accepted[0]) et toutes ses variantes doivent passer.
    for (const command of phase.accepted) expect(isStepCommandCorrect(phase, command)).toBe(true);
  });

  it.each(allPhases.map(({ label, phase }) => [label, phase] as const))("%s : ni l'objectif ni la sortie ne donnent la commande", (_, phase) => {
    for (const command of phase.accepted.filter((accepted) => accepted.trim().includes(" "))) {
      expect(revealsCommand(phase.goal, command), `objectif : ${command}`).toBe(false);
      expect(revealsCommand(phase.context.join("\n"), command), `sortie : ${command}`).toBe(false);
    }
  });

  it.each(allPhases.map(({ label, phase }) => [label, phase] as const))("%s : le faux terminal connaît le programme attendu", (_, phase) => {
    // Sinon une bonne commande avec une petite faute répondrait « command not found » et égarerait le joueur.
    for (const command of phase.accepted) {
      const [firstLine] = simulateWrongCommand(`${command} x`);
      expect(firstLine ?? "", command).not.toContain("command not found");
    }
  });

  it.each(allPhases.map(({ label, boss, phase }) => [label, boss.moduleId, phase] as const))(
    "%s : la commande attendue et ses options ont été vues dans le module, ou sont annoncées dans l'objectif",
    (_, moduleId, phase) => {
      // Le boss est un examen pratique : découvrir une syntaxe sous pression, chaque erreur coûtant du temps, serait injuste.
      const taught = `${taughtText(moduleId)} ${phase.goal}`;
      const [program = "", ...args] = normalizeCommand(phase.accepted[0] ?? "").split(" ");
      expect(mentionsWord(taught, program), `programme ${program}`).toBe(true);
      for (const option of args.filter((arg) => arg.startsWith("-")).map((arg) => arg.split("=")[0] ?? arg)) {
        expect(mentionsWord(taught, option), `option ${option} de « ${phase.accepted[0]} »`).toBe(true);
      }
    },
  );

  it("grep sans -n n'invente pas de numéro de ligne, ni dans sa sortie ni quand une phase suivante la recopie", () => {
    for (const boss of Object.values(BOSSES)) {
      const grepWithoutLineNumbers = boss.phases.some((phase) => {
        const [program, ...args] = normalizeCommand(phase.accepted[0] ?? "").split(" ");
        return program === "grep" && !args.some((arg) => /^-[a-zA-Z]*n/.test(arg));
      });
      if (!grepWithoutLineNumbers) continue;
      for (const line of boss.phases.flatMap((phase) => [...phase.context, ...phase.output])) {
        expect(line, boss.moduleId).not.toMatch(GREP_LINE_NUMBER);
      }
    }
  });

  it("accepte sudo, les guillemets simples et un message de commit libre", () => {
    expect(isStepCommandCorrect(bossFor("gateway").phases[1], "sudo systemctl reload nginx")).toBe(true);
    expect(isStepCommandCorrect(bossFor("genesis").phases[2], "echo 'LUMIERE'")).toBe(true);
    expect(isStepCommandCorrect(bossFor("branch").phases[2], "git commit -m 'garde 3 réplicas'")).toBe(true);
    expect(isStepCommandCorrect(bossFor("branch").phases[2], "git commit")).toBe(false);
  });

  it("exige de lire la sortie : mauvais PID, mauvais nom ou mauvais signal sont refusés", () => {
    const kernel = bossFor("kernel");
    expect(isStepCommandCorrect(kernel.phases[1], "kill 6671")).toBe(false);
    // La copie de secours intercepte SIGTERM : seul le signal 9 l'arrête.
    expect(isStepCommandCorrect(kernel.phases[2], "kill 7013")).toBe(false);
    expect(isStepCommandCorrect(kernel.phases[2], "kill -9 6666")).toBe(false);
    expect(isStepCommandCorrect(kernel.phases[2], "sudo kill -9 7013")).toBe(true);
    expect(isStepCommandCorrect(bossFor("container").phases[2], "docker stop db")).toBe(false);
    expect(isStepCommandCorrect(bossFor("helm").phases[1], "kubectl logs web-5c8d7f9b4-qm7nz")).toBe(false);
    // Le mot de passe fuité est révoqué : seul le nouveau doit entrer au coffre.
    expect(isStepCommandCorrect(bossFor("vault").phases[1], "vault kv put secret/db password=hx-pass-2026")).toBe(false);
    expect(isStepCommandCorrect(bossFor("pipeline").phases[1], "gh run view --log-failed 6602")).toBe(true);
    expect(isStepCommandCorrect(bossFor("pipeline").phases[1], "gh run view 6588 --log-failed")).toBe(false);
  });

  it("refuse un module inconnu, y compris les clés héritées de Object", () => {
    expect(() => bossFor("inconnu")).toThrow(RangeError);
    expect(() => bossFor("__proto__")).toThrow(RangeError);
    expect(() => bossFor("toString")).toThrow(RangeError);
    expect(() => bossFor("constructor")).toThrow(RangeError);
  });

  it("garde ENTROPIA pour le dernier secteur", () => {
    const lastModule = CURRICULUM[CURRICULUM.length - 1]!;
    expect(bossFor(lastModule.id).name).toBe("ENTROPIA");
  });
});

type FakeListener = (event: { preventDefault(): void }) => void;

/**
 * DOM minimal, limité à ce que BossPanel utilise : vitest tourne sous Node sans DOM, et le panneau doit
 * pouvoir être testé de bout en bout (saisie → callbacks → texte affiché).
 */
class FakeElement {
  readonly children: FakeElement[] = [];
  private readonly attributes = new Map<string, string>();
  private readonly listeners = new Map<string, FakeListener[]>();
  private ownText = "";
  className = "";
  hidden = false;
  disabled = false;
  value = "";
  scrollTop = 0;
  scrollHeight = 0;

  constructor(readonly tagName: string) {}

  get textContent(): string {
    return this.ownText + this.children.map((child) => child.textContent).join("");
  }

  set textContent(text: string) {
    this.ownText = text;
    this.children.length = 0;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  hasAttribute(name: string): boolean {
    return this.attributes.has(name);
  }

  append(...nodes: FakeElement[]): void {
    this.children.push(...nodes);
  }

  replaceChildren(...nodes: FakeElement[]): void {
    this.ownText = "";
    this.children.splice(0, this.children.length, ...nodes);
  }

  addEventListener(type: string, listener: FakeListener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  dispatch(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) listener({ preventDefault: () => undefined });
  }

  focus(): void {
    // Le focus n'a pas d'effet observable dans ces tests.
  }

  scrollIntoView(): void {
    // Aucun défilement à simuler : la mise en page est vérifiée dans un vrai navigateur.
  }

  /** Premier descendant, en profondeur, qui vérifie la condition. */
  find(matches: (node: FakeElement) => boolean): FakeElement | undefined {
    for (const child of this.children) {
      if (matches(child)) return child;
      const found = child.find(matches);
      if (found) return found;
    }
    return undefined;
  }
}

function findRequired(root: FakeElement, description: string, matches: (node: FakeElement) => boolean): FakeElement {
  const found = root.find(matches);
  if (!found) throw new Error(`Élément introuvable : ${description}`);
  return found;
}

const byClass = (className: string) => (node: FakeElement) => node.className.split(" ").includes(className);

describe("console de combat (BossPanel)", () => {
  beforeEach(() => {
    vi.stubGlobal("document", {
      createElement: (tag: string) => new FakeElement(tag),
      createTextNode: (text: string) => {
        const node = new FakeElement("#text");
        node.textContent = text;
        return node;
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** Panneau ouvert comme dans main.ts : chaque erreur coûte du temps d'exposition, que l'appelant redonne au panneau. */
  function openContainerPanel(secondsLeft: number, secondsAfterError: number): { root: FakeElement; panel: BossPanel } {
    const root = new FakeElement("div");
    const panel: BossPanel = new BossPanel(root as unknown as HTMLElement, bossFor("container"), 1, secondsLeft, {
      onWrongCommand: () => panel.updateSecondsLeft(secondsAfterError),
      onSuccess: () => undefined,
      onCancel: () => undefined,
    });
    panel.open();
    return { root, panel };
  }

  function submit(root: FakeElement, command: string): void {
    findRequired(root, "champ de saisie", (node) => node.tagName === "input").value = command;
    findRequired(root, "formulaire", (node) => node.tagName === "form").dispatch("submit");
  }

  it("annonce la pénalité, puis affiche le temps d'exposition raccourci après une erreur", () => {
    const { root, panel } = openContainerPanel(7.3, 1.3);
    const freeze = findRequired(root, ".boss-freeze", byClass("boss-freeze"));
    expect(freeze.textContent).toContain("il reste 8 s");
    expect(freeze.textContent).toContain("chaque erreur");

    submit(root, "docker stop db");
    expect(freeze.textContent).toContain("il reste 2 s");

    panel.updateSecondsLeft(Number.NaN);
    expect(freeze.textContent).toContain("il reste 0 s");
  });

  it("la sortie à lire est une région nommée par son libellé visible, sans aria-label interdit sur un <pre>", () => {
    const { root } = openContainerPanel(5, 2);
    const output = findRequired(root, ".boss-context", byClass("boss-context"));
    expect(output.tagName).toBe("pre");
    expect(output.getAttribute("role")).toBe("region");
    expect(output.hasAttribute("aria-label")).toBe(false);
    const labelId = output.getAttribute("aria-labelledby");
    expect(labelId).not.toBeNull();
    const label = findRequired(root, `#${labelId}`, (node) => node.getAttribute("id") === labelId);
    expect(label.textContent).toContain("Sortie du terminal");
  });
});
