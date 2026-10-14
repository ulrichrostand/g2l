import { describe, expect, it } from "vitest";
import { classifyRenderer, describeRenderer } from "../src/core/diagnostics";

describe("nom du processeur graphique", () => {
  it("extrait le nom du produit d'une chaîne ANGLE", () => {
    expect(describeRenderer("ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Direct3D11 vs_5_0 ps_5_0, D3D11)")).toBe("NVIDIA GeForce RTX 3070");
    expect(describeRenderer("ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)")).toBe("Intel(R) UHD Graphics 630");
    expect(describeRenderer("Mesa llvmpipe (LLVM 15.0.7, 256 bits)")).toBe("Mesa llvmpipe (LLVM 15.0.7, 256 bits)");
    expect(describeRenderer("  ")).toBe("inconnu");
  });
});

describe("famille de processeur graphique", () => {
  it("reconnaît le rendu logiciel", () => {
    expect(classifyRenderer("ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)")).toBe("software");
    expect(classifyRenderer("Mesa llvmpipe")).toBe("software");
    expect(classifyRenderer("Microsoft Basic Render Driver")).toBe("software");
  });

  it("reconnaît une carte dédiée", () => {
    expect(classifyRenderer("NVIDIA GeForce RTX 3070")).toBe("dedicated");
    expect(classifyRenderer("AMD Radeon RX 6700 XT")).toBe("dedicated");
    expect(classifyRenderer("NVIDIA GeForce GTX 1650")).toBe("dedicated");
  });

  it("reconnaît une puce intégrée", () => {
    expect(classifyRenderer("Intel(R) UHD Graphics 630")).toBe("integrated");
    expect(classifyRenderer("Intel(R) Iris(R) Xe Graphics")).toBe("integrated");
    expect(classifyRenderer("AMD Radeon(TM) Graphics")).toBe("integrated");
  });

  it("répond « inconnu » plutôt que de deviner, y compris pour les puces de Mac et de téléphone", () => {
    expect(classifyRenderer("Truc 9000")).toBe("unknown");
    expect(classifyRenderer("Apple M2")).toBe("unknown");
    expect(classifyRenderer("Adreno (TM) 740")).toBe("unknown");
  });
});
