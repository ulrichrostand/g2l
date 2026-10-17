import { describe, expect, it } from "vitest";
import { screenSize, ANALYTICS_ENDPOINT, ANALYTICS_OPT_OUT_KEY, buildCountUrl, isValidEventName, pagePath, referrerHost, shouldTrack, sourceTag, type TrackEnvironment } from "../src/analytics/track";
import { CURRICULUM } from "../src/content/curriculum";

const visitor: TrackEnvironment = { hostname: "ulrichrostand.github.io", doNotTrack: false, automated: false, optedOut: false };

describe("quand mesurer", () => {
  it("mesure un visiteur ordinaire", () => {
    expect(shouldTrack(visitor)).toBe(true);
  });

  it("ne mesure ni en local, ni sous « Ne pas me suivre », ni les robots, ni après un refus", () => {
    expect(shouldTrack({ ...visitor, hostname: "localhost" })).toBe(false);
    expect(shouldTrack({ ...visitor, hostname: "127.0.0.1" })).toBe(false);
    expect(shouldTrack({ ...visitor, doNotTrack: true })).toBe(false);
    expect(shouldTrack({ ...visitor, automated: true })).toBe(false);
    expect(shouldTrack({ ...visitor, optedOut: true })).toBe(false);
  });
});

describe("données envoyées", () => {
  it("retire le préfixe de déploiement et index.html du chemin", () => {
    expect(pagePath("/g2l/", "/g2l/")).toBe("/");
    expect(pagePath("/g2l/en/games/devops/", "/g2l/")).toBe("/en/games/devops/");
    expect(pagePath("/g2l/mentions-legales/index.html", "/g2l/")).toBe("/mentions-legales/");
    expect(pagePath("/jeux/devops/", "/")).toBe("/jeux/devops/");
  });

  it("ne garde du référent que le nom de domaine, et rien pour une navigation interne ou invalide", () => {
    expect(referrerHost("https://www.google.com/search?q=secret&x=1", "ulrichrostand.github.io")).toBe("www.google.com");
    expect(referrerHost("https://ulrichrostand.github.io/g2l/", "ulrichrostand.github.io")).toBe("");
    expect(referrerHost("", "ulrichrostand.github.io")).toBe("");
    expect(referrerHost("pas une adresse", "ulrichrostand.github.io")).toBe("");
  });

  it("construit l'adresse de comptage avec la page, ou l'évènement", () => {
    const page = new URL(buildCountUrl(ANALYTICS_ENDPOINT, { path: "/en/", title: "Learn tech by playing", referrer: "www.google.com" }));
    expect(page.origin + page.pathname).toBe("https://g2l.goatcounter.com/count");
    expect(page.searchParams.get("p")).toBe("/en/");
    expect(page.searchParams.get("t")).toBe("Learn tech by playing");
    expect(page.searchParams.get("r")).toBe("www.google.com");
    expect(page.searchParams.get("e")).toBeNull();
    const event = new URL(buildCountUrl(ANALYTICS_ENDPOINT, { path: "campaign-start", event: true }));
    expect(event.searchParams.get("e")).toBe("true");
    expect([...event.searchParams.keys()].sort()).toEqual(["e", "p", "rnd"]);
  });

  it("transmet la taille d'écran sous forme de trois nombres bornés, pour les pages vues seulement", () => {
    expect(screenSize(1920, 1080, 1.25)).toBe("1920,1080,1.25");
    expect(screenSize(390.4, 844.6, 3)).toBe("390,845,3");
    expect(screenSize(Number.NaN, -5, 99)).toBe("0,0,10");
    const page = new URL(buildCountUrl(ANALYTICS_ENDPOINT, { path: "/", screen: "390,844,3" }));
    expect(page.searchParams.get("s")).toBe("390,844,3");
    const event = new URL(buildCountUrl(ANALYTICS_ENDPOINT, { path: "campaign-start", event: true }));
    expect(event.searchParams.get("s")).toBeNull();
  });

  it("n'accepte que des noms d'évènements sobres (pas de texte libre)", () => {
    expect(isValidEventName("campaign-start")).toBe(true);
    expect(isValidEventName("sector-complete/genesis")).toBe(true);
    expect(isValidEventName("Prénom Nom")).toBe(false);
    expect(isValidEventName("a@b.fr")).toBe(false);
    expect(isValidEventName("")).toBe(false);
    expect(isValidEventName("x".repeat(80))).toBe(false);
  });

  it("n'envoie rien vers une autre adresse que le compte GoatCounter déclaré", () => {
    expect(ANALYTICS_ENDPOINT).toMatch(/^https:\/\/[a-z0-9-]+\.goatcounter\.com\/count$/);
    expect(ANALYTICS_OPT_OUT_KEY).toBe("site-no-analytics");
  });
});

describe("évènements de suivi du parcours", () => {
  it("chaque évènement émis par le jeu et le portail est un nom valide, pour tous les secteurs", () => {
    const fixed = ["campaign-start", "tutorial-complete", "tutorial-skip", "contribute-click/guide", "contribute-click/issue", "contribute-click/footer", "contribute-click/game"];
    const perSector = CURRICULUM.flatMap((module) =>
      ["sector-complete", "terminal-hack", "player-down", "mission-failed", "mission-quit"].map((prefix) => `${prefix}/${module.id}`),
    );
    for (const name of [...fixed, ...perSector]) expect(isValidEventName(name), name).toBe(true);
  });
});

describe("étiquette de source des liens partagés", () => {
  it("lit ref, utm_source ou source, dans cet ordre, en minuscules", () => {
    expect(sourceTag("?ref=linkedin")).toBe("linkedin");
    expect(sourceTag("?ref=LinkedIn-FR")).toBe("linkedin-fr");
    expect(sourceTag("?utm_source=x")).toBe("x");
    expect(sourceTag("?source=newsletter")).toBe("newsletter");
    expect(sourceTag("?utm_source=x&ref=linkedin")).toBe("linkedin");
    expect(sourceTag("?autre=1&ref=post_1")).toBe("post_1");
  });

  it("ignore l'absence d'étiquette et tout ce qui n'est pas sobre (adresse, espaces, texte libre, trop long)", () => {
    expect(sourceTag("")).toBe("");
    expect(sourceTag("?foo=bar")).toBe("");
    expect(sourceTag("?ref=")).toBe("");
    expect(sourceTag("?ref=https://exemple.com/page")).toBe("");
    expect(sourceTag("?ref=jean dupont")).toBe("");
    expect(sourceTag("?ref=a.b")).toBe("");
    expect(sourceTag(`?ref=${"a".repeat(41)}`)).toBe("");
    expect(sourceTag("?ref=-tiret")).toBe("");
  });

  it("passe à l'étiquette suivante quand la première est invalide", () => {
    expect(sourceTag("?ref=https://x.y&utm_source=linkedin")).toBe("linkedin");
  });
});
