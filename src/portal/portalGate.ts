/**
 * Portail lumineux du haut de page : un seul shader WebGL (pas de Three.js, quelques Ko), dessiné dans un canvas carré.
 * Anneau d'énergie, vortex intérieur et segments qui tournent lentement. Il se met en pause hors écran et onglet caché,
 * et ne dessine qu'une image fixe si l'utilisateur a demandé moins d'animations.
 */

const VERTEX_SHADER = `
attribute vec2 position;
varying vec2 uv;
void main() {
  uv = position;
  gl_Position = vec4(position, 0.0, 1.0);
}`;

const FRAGMENT_SHADER = `
precision mediump float;
varying vec2 uv;
uniform float time;
uniform vec3 tint;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int octave = 0; octave < 4; octave++) {
    value += amplitude * noise(p);
    p *= 2.03;
    amplitude *= 0.5;
  }
  return value;
}

void main() {
  float radius = length(uv);
  float angle = atan(uv.y, uv.x);

  // Vortex : le bruit tourne d'autant plus vite qu'on approche du centre.
  float twist = angle + time * 0.35 + 2.2 / (radius + 0.25);
  vec2 swirl = vec2(cos(twist), sin(twist)) * radius * 3.0;
  float energy = fbm(swirl + vec2(time * 0.15, 0.0));
  float inside = smoothstep(0.62, 0.05, radius);
  float vortex = inside * pow(energy, 1.6) * 1.9 * smoothstep(0.02, 0.4, radius);
  // Lueur intérieure contre l'anneau : l'énergie semble déborder du cadre.
  float rim = radius < 0.62 ? exp(-(0.62 - radius) * 7.0) * 0.55 : 0.0;

  // Anneau principal, net, avec une lueur qui décroît vers l'extérieur.
  float ringDistance = abs(radius - 0.62);
  float ring = smoothstep(0.022, 0.0, ringDistance) + 0.35 * exp(-ringDistance * 18.0);

  // Couronne segmentée qui tourne en sens inverse.
  float segments = step(0.55, fract((angle + time * -0.12) * 24.0 / 6.2831853));
  float crown = segments * smoothstep(0.012, 0.0, abs(radius - 0.74));

  // Fine couronne extérieure continue.
  float halo = smoothstep(0.006, 0.0, abs(radius - 0.82)) * 0.55;

  float light = vortex + rim + ring + crown * 0.8 + halo;
  vec3 color = tint * light + vec3(1.0) * pow(max(ring - 0.6, 0.0), 2.0) * 0.6;
  float alpha = clamp(light, 0.0, 1.0) * smoothstep(0.98, 0.84, radius);
  gl_FragColor = vec4(color * alpha, alpha);
}`;

const MAX_PIXEL_RATIO = 1.5;
/** Instant figé montré quand l'utilisateur préfère moins d'animations : l'anneau y est bien formé. */
const STILL_FRAME_SECONDS = 2.4;

export class PortalGate {
  private readonly gl: WebGLRenderingContext;
  private readonly timeLocation: WebGLUniformLocation | null;
  private frameRequest = 0;
  private visible = true;
  private readonly startedAt = performance.now();
  private readonly observer: IntersectionObserver | null;
  private readonly onVisibilityChange = (): void => this.updateLoop();
  private readonly reducedMotion: boolean;

  private constructor(
    private readonly canvas: HTMLCanvasElement,
    gl: WebGLRenderingContext,
    program: WebGLProgram,
  ) {
    this.gl = gl;
    this.timeLocation = gl.getUniformLocation(program, "time");
    gl.uniform3f(gl.getUniformLocation(program, "tint"), 0.776, 0.945, 0.208);
    this.reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    this.observer =
      typeof IntersectionObserver === "function"
        ? new IntersectionObserver((entries) => {
            this.visible = entries.some((entry) => entry.isIntersecting);
            this.updateLoop();
          })
        : null;
    this.observer?.observe(canvas);
    document.addEventListener("visibilitychange", this.onVisibilityChange);
    this.resize();
    this.draw(this.reducedMotion ? STILL_FRAME_SECONDS : 0);
    this.updateLoop();
  }

  /** Renvoie null (sans lever) si WebGL est indisponible : la page reste complète sans l'animation. */
  static mount(canvas: HTMLCanvasElement): PortalGate | null {
    const gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: true });
    if (!gl) {
      console.warn("Portail : WebGL indisponible, animation désactivée.");
      return null;
    }
    const program = buildProgram(gl);
    if (!program) return null;
    gl.useProgram(program);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    return new PortalGate(canvas, gl, program);
  }

  dispose(): void {
    cancelAnimationFrame(this.frameRequest);
    this.observer?.disconnect();
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
  }

  /** Taille du tampon calée sur la taille affichée (plafonnée) : net sans payer les écrans très denses. */
  resize(): void {
    const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    const size = Math.max(1, Math.round(this.canvas.clientWidth * ratio));
    if (this.canvas.width !== size || this.canvas.height !== size) {
      this.canvas.width = size;
      this.canvas.height = size;
      this.gl.viewport(0, 0, size, size);
    }
    if (this.reducedMotion) this.draw(STILL_FRAME_SECONDS);
  }

  private updateLoop(): void {
    cancelAnimationFrame(this.frameRequest);
    if (this.reducedMotion || !this.visible || document.hidden) return;
    const tick = (): void => {
      this.draw((performance.now() - this.startedAt) / 1000);
      this.frameRequest = requestAnimationFrame(tick);
    };
    this.frameRequest = requestAnimationFrame(tick);
  }

  private draw(seconds: number): void {
    const gl = this.gl;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(this.timeLocation, seconds);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}

function buildProgram(gl: WebGLRenderingContext): WebGLProgram | null {
  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  if (!vertex || !fragment) return null;
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn("Portail : liaison du shader impossible, animation désactivée.", gl.getProgramInfoLog(program));
    return null;
  }
  return program;
}

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn("Portail : compilation du shader impossible, animation désactivée.", gl.getShaderInfoLog(shader));
    return null;
  }
  return shader;
}
