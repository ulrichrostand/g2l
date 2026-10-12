import { describe, expect, it, vi } from "vitest";
import { enterLandscapeFullscreen, fullscreenSupported, isPortrait, shouldSuggestLandscape, type FullscreenHost, type OrientationHost } from "../src/core/orientation";

function host(overrides: Partial<FullscreenHost> & { request?: () => Promise<void> } = {}): FullscreenHost {
  const { request, ...rest } = overrides;
  return { fullscreenEnabled: true, fullscreenElement: null, documentElement: { requestFullscreen: request ?? (() => Promise.resolve()) }, ...rest };
}

describe("isPortrait", () => {
  it("reprend la règle CSS : le carré compte comme portrait", () => {
    expect(isPortrait(390, 844)).toBe(true);
    expect(isPortrait(800, 800)).toBe(true);
    expect(isPortrait(844, 390)).toBe(false);
  });

  it("résiste aux dimensions invalides", () => {
    expect(isPortrait(Number.NaN, 800)).toBe(false);
    expect(isPortrait(800, Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe("shouldSuggestLandscape", () => {
  const base = { touch: true, portrait: true, dismissed: false, inMission: true };

  it("seulement sur écran tactile, en portrait, en mission, et tant que le conseil n'est pas écarté", () => {
    expect(shouldSuggestLandscape(base)).toBe(true);
    expect(shouldSuggestLandscape({ ...base, touch: false })).toBe(false);
    expect(shouldSuggestLandscape({ ...base, portrait: false })).toBe(false);
    expect(shouldSuggestLandscape({ ...base, dismissed: true })).toBe(false);
    expect(shouldSuggestLandscape({ ...base, inMission: false })).toBe(false);
  });
});

describe("fullscreenSupported", () => {
  it("faux sur iPhone (pas d'API plein écran) ou quand la page ne l'autorise pas", () => {
    expect(fullscreenSupported(host())).toBe(true);
    expect(fullscreenSupported({ documentElement: {} })).toBe(false);
    expect(fullscreenSupported(host({ fullscreenEnabled: false }))).toBe(false);
    expect(fullscreenSupported({ fullscreenEnabled: true, documentElement: {} })).toBe(false);
  });
});

describe("enterLandscapeFullscreen", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

  it("plein écran puis verrouillage : « locked »", async () => {
    const lock = vi.fn(() => Promise.resolve());
    const request = vi.fn(() => Promise.resolve());
    const screenHost: OrientationHost = { orientation: { lock } };
    expect(await enterLandscapeFullscreen(host({ request }), screenHost)).toBe("locked");
    expect(request).toHaveBeenCalledTimes(1);
    expect(lock).toHaveBeenCalledWith("landscape");
  });

  it("déjà en plein écran : on ne le redemande pas, mais on verrouille", async () => {
    const request = vi.fn(() => Promise.resolve());
    const lock = vi.fn(() => Promise.resolve());
    const outcome = await enterLandscapeFullscreen(host({ request, fullscreenElement: {} as Element }), { orientation: { lock } });
    expect(outcome).toBe("locked");
    expect(request).not.toHaveBeenCalled();
  });

  it("pas d'API de verrouillage (ou verrouillage refusé) : plein écran seul, sans erreur", async () => {
    expect(await enterLandscapeFullscreen(host(), {})).toBe("fullscreen-only");
    expect(await enterLandscapeFullscreen(host(), { orientation: {} })).toBe("fullscreen-only");
    const refused = { orientation: { lock: () => Promise.reject(new DOMException("non", "NotSupportedError")) } };
    expect(await enterLandscapeFullscreen(host(), refused)).toBe("fullscreen-only");
  });

  it("plein écran refusé ou absent : « unavailable », et le verrouillage n'est jamais tenté", async () => {
    const lock = vi.fn(() => Promise.resolve());
    const denied = host({ request: () => Promise.reject(new TypeError("geste requis")) });
    expect(await enterLandscapeFullscreen(denied, { orientation: { lock } })).toBe("unavailable");
    expect(await enterLandscapeFullscreen({ documentElement: {} }, { orientation: { lock } })).toBe("unavailable");
    expect(lock).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });
});
