import { describe, expect, it } from "vitest";
import { cameraZoomForAspect } from "../src/game/mission";
import { aimPadAngle, aimPadRelease, joystickIntent } from "../src/ui/touchControls";

describe("joystickIntent", () => {
  it("ignore les micro-mouvements (zone morte)", () => {
    expect(joystickIntent(3, -2, 52)).toEqual({ x: 0, z: 0, running: false });
  });

  it("pousser vers le haut fait avancer (Z négatif) sans courir", () => {
    const intent = joystickIntent(0, -40, 52);
    expect(intent.x).toBeCloseTo(0);
    expect(intent.z).toBeCloseTo(-1);
    expect(intent.running).toBe(false);
  });

  it("dépasser l'anneau déclenche la course, direction normalisée", () => {
    const intent = joystickIntent(60, 60, 52);
    expect(Math.hypot(intent.x, intent.z)).toBeCloseTo(1);
    expect(intent.running).toBe(true);
  });
});

describe("cameraZoomForAspect", () => {
  it("ne recule pas en paysage", () => {
    expect(cameraZoomForAspect(16 / 9)).toBe(1);
  });
  it("recule en portrait, dans la limite du plafond", () => {
    expect(cameraZoomForAspect(390 / 844)).toBeGreaterThan(1.5);
    expect(cameraZoomForAspect(0.2)).toBe(1.8);
  });
  it("résiste aux valeurs invalides", () => {
    expect(cameraZoomForAspect(Number.NaN)).toBe(1);
    expect(cameraZoomForAspect(0)).toBe(1);
  });
});

describe("pad de tir", () => {
  it("une tape (pouce immobile) ne vise pas : le tir part droit devant", () => {
    expect(aimPadAngle(3, -4)).toBeNull();
  });

  it("glisser vers la droite vise +X, vers le haut de l'écran vise -Z", () => {
    expect(aimPadAngle(40, 0)).toBeCloseTo(0, 10);
    expect(aimPadAngle(0, -40)).toBeCloseTo(-Math.PI / 2, 10);
  });
});

describe("relâchement du pad de tir", () => {
  it("une simple tape tire droit devant", () => {
    expect(aimPadRelease(false, 2, -3)).toBe("fire");
  });

  it("visée puis relâchée loin du centre : tir", () => {
    expect(aimPadRelease(true, 40, -20)).toBe("fire");
  });

  it("visée puis ramenée au centre : annulation, aucun tir", () => {
    expect(aimPadRelease(true, 3, -4)).toBe("cancel");
    expect(aimPadRelease(true, 0, 0)).toBe("cancel");
  });
});
