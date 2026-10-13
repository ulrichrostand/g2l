import { describe, expect, it } from "vitest";
import { BRIGHTNESS_EXPOSURE, defaultQuality, isBrightness, nextBrightness, FrameRateMonitor, lowerQuality, nextQuality, QUALITY_PROFILES, SettingsStore } from "../src/core/settings";

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

describe("qualité graphique", () => {
  it("choisit moyenne sur mobile, haute sur ordinateur", () => {
    expect(defaultQuality(true)).toBe("medium");
    expect(defaultQuality(false)).toBe("high");
  });

  it("descend d'un cran jusqu'à basse, et le bouton boucle", () => {
    expect(lowerQuality("high")).toBe("medium");
    expect(lowerQuality("low")).toBeNull();
    expect(nextQuality("low")).toBe("high");
  });

  it("garde les androïdes animés en haute et moyenne, des robots simples en basse", () => {
    expect(QUALITY_PROFILES.high.detailedAndroids).toBe(true);
    expect(QUALITY_PROFILES.medium.detailedAndroids).toBe(true);
    expect(QUALITY_PROFILES.low.detailedAndroids).toBe(false);
  });

  it("mémorise le choix et ignore un réglage corrompu", () => {
    const storage = new MemoryStorage();
    new SettingsStore(storage, false).setQuality("low");
    expect(new SettingsStore(storage, false).quality).toBe("low");
    storage.setItem("shadow-ops-devops/settings", '{"quality":"ultra"}');
    expect(new SettingsStore(storage, true).quality).toBe("medium");
    storage.setItem("shadow-ops-devops/settings", "{oups");
    expect(new SettingsStore(storage, false).quality).toBe("high");
  });

  it("mémorise le son coupé sans perdre la qualité choisie", () => {
    const storage = new MemoryStorage();
    expect(new SettingsStore(storage, false).soundEnabled).toBe(true);
    const settings = new SettingsStore(storage, false);
    settings.setQuality("low");
    settings.setSoundEnabled(false);
    const reloaded = new SettingsStore(storage, false);
    expect(reloaded.soundEnabled).toBe(false);
    expect(reloaded.quality).toBe("low");
    storage.setItem("shadow-ops-devops/settings", '{"quality":"low","soundEnabled":"non"}');
    expect(new SettingsStore(storage, false)).toMatchObject({ quality: "low", soundEnabled: true });
  });
});

describe("FrameRateMonitor", () => {
  const run = (monitor: FrameRateMonitor, fps: number, seconds: number): boolean => {
    let flagged = false;
    for (let time = 0; time < seconds; time += 1 / fps) flagged = monitor.sample(1 / fps) || flagged;
    return flagged;
  };

  it("ne signale rien à 60 images/s", () => {
    expect(run(new FrameRateMonitor(), 60, 12)).toBe(false);
  });

  it("signale un appareil qui plafonne à 25 images/s, après l'échauffement", () => {
    const monitor = new FrameRateMonitor();
    expect(run(monitor, 25, 2.5)).toBe(false);
    expect(run(monitor, 25, 6)).toBe(true);
  });
});

describe("luminosité choisie par le joueur", () => {
  it("part de normale et le bouton boucle : Normale, Claire, Sombre", () => {
    expect(new SettingsStore(new MemoryStorage(), false).brightness).toBe("normal");
    expect(nextBrightness("normal")).toBe("bright");
    expect(nextBrightness("bright")).toBe("dim");
    expect(nextBrightness("dim")).toBe("normal");
  });

  it("l'exposition croît de sombre à claire, normale valant exactement 1", () => {
    expect(BRIGHTNESS_EXPOSURE.normal).toBe(1);
    expect(BRIGHTNESS_EXPOSURE.dim).toBeLessThan(1);
    expect(BRIGHTNESS_EXPOSURE.bright).toBeGreaterThan(1);
  });

  it("mémorise le choix sans effacer qualité ni son, et ignore une valeur corrompue", () => {
    const storage = new MemoryStorage();
    const store = new SettingsStore(storage, false);
    store.setQuality("low");
    store.setSoundEnabled(false);
    store.setBrightness("bright");
    const reloaded = new SettingsStore(storage, false);
    expect([reloaded.quality, reloaded.soundEnabled, reloaded.brightness]).toEqual(["low", false, "bright"]);
    storage.setItem("shadow-ops-devops/settings", '{"quality":"low","brightness":"blinding"}');
    const corrupted = new SettingsStore(storage, false);
    expect([corrupted.quality, corrupted.brightness]).toEqual(["low", "normal"]);
    expect(isBrightness("blinding")).toBe(false);
  });
});
