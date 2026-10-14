import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import type { QualityProfile } from "../core/settings";

/**
 * Seuls les éléments très lumineux (néons, écrans, visières, LED) dépassent ce seuil et « bavent » :
 * le reste de la scène reste net et sombre, comme dans un jeu d'infiltration.
 */
const BLOOM_THRESHOLD = 0.82;
const BLOOM_STRENGTH = 0.85;
const BLOOM_RADIUS = 0.55;

const VignetteShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    darkness: { value: 1.15 },
    offset: { value: 1.05 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float darkness;
    uniform float offset;
    varying vec2 vUv;
    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec2 centered = (vUv - 0.5) * offset;
      float vignette = clamp(1.0 - dot(centered, centered) * darkness, 0.0, 1.0);
      gl_FragColor = vec4(texel.rgb * vignette, texel.a);
    }
  `,
};

/** Rendu de la scène : direct en qualité basse, avec post-traitement (bloom, vignette) sinon. */
export class RenderPipeline {
  readonly renderer: THREE.WebGLRenderer;
  private readonly composer: EffectComposer;
  private readonly renderPass: RenderPass;
  private readonly bloomPass: UnrealBloomPass;
  private readonly vignettePass: ShaderPass;
  private profile: QualityProfile;
  private renderScale = 1;
  private width = 1;
  private height = 1;

  constructor(canvas: HTMLCanvasElement, profile: QualityProfile) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // HalfFloat : le bloom a besoin de valeurs > 1 (HDR) pour isoler les zones vraiment lumineuses.
    const renderTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, renderTarget);
    this.renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), BLOOM_STRENGTH, BLOOM_RADIUS, BLOOM_THRESHOLD);
    this.vignettePass = new ShaderPass(VignetteShader);
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(this.vignettePass);
    this.composer.addPass(new OutputPass());

    this.profile = profile;
    this.applyProfile(profile);
  }

  get shadowsEnabled(): boolean {
    return this.profile.shadows;
  }

  set exposure(value: number) {
    this.renderer.toneMappingExposure = value;
  }

  /** Nom du processeur graphique déclaré par le navigateur (pour le diagnostic), ou « inconnu » s'il le masque. */
  get gpuName(): string {
    const gl = this.renderer.getContext();
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const raw = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    return typeof raw === "string" ? raw : "";
  }

  /** Résolution effective du rendu 3D par rapport à l'écran (1 = pleine résolution, plafond du profil compris). */
  get effectiveScale(): number {
    return this.renderScale;
  }

  /**
   * `renderScale` réduit la résolution du rendu 3D sans toucher aux effets (bloom, ombres) : l'interface, en HTML,
   * reste nette, et la scène est simplement un peu plus douce. C'est la première réponse à un jeu qui ralentit.
   */
  applyProfile(profile: QualityProfile, renderScale = 1): void {
    const shadowsChanged = this.profile.shadows !== profile.shadows;
    this.profile = profile;
    this.renderScale = renderScale;
    this.renderer.shadowMap.enabled = profile.shadows;
    this.bloomPass.enabled = profile.bloom;
    this.vignettePass.enabled = profile.vignette;
    const pixelRatio = Math.min(window.devicePixelRatio, profile.pixelRatioCap) * renderScale;
    this.renderer.setPixelRatio(pixelRatio);
    this.composer.setPixelRatio(pixelRatio);
    this.setSize(this.width, this.height);
    // Activer/désactiver les ombres change les shaders : il faut forcer leur recompilation.
    if (shadowsChanged) this.renderer.shadowMap.needsUpdate = true;
  }

  setSize(width: number, height: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.renderer.setSize(this.width, this.height, false);
    this.composer.setSize(this.width, this.height);
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    if (!this.profile.bloom && !this.profile.vignette) {
      this.renderer.render(scene, camera);
      return;
    }
    this.renderPass.scene = scene;
    this.renderPass.camera = camera;
    this.composer.render();
  }
}
