export type Cue =
  | "success"
  | "failure"
  | "alarm"
  | "hack"
  | "extract"
  | "takedown"
  | "shot"
  | "shotHit"
  | "shieldHit"
  | "enemyShot"
  | "playerHit"
  | "reload"
  | "dryFire"
  | "wake";

interface ToneCue {
  kind: "tone";
  frequencies: number[];
  duration: number;
  wave: OscillatorType;
  gain: number;
}

/** Bruit filtré : le « pfft » d'un silencieux ou un impact sourd, impossibles à rendre avec une simple note. */
interface NoiseCue {
  kind: "noise";
  duration: number;
  filter: BiquadFilterType;
  frequency: number;
  gain: number;
}

const tone = (frequencies: number[], duration: number, wave: OscillatorType, gain = 0.06): ToneCue => ({ kind: "tone", frequencies, duration, wave, gain });
const noise = (duration: number, filter: BiquadFilterType, frequency: number, gain: number): NoiseCue => ({ kind: "noise", duration, filter, frequency, gain });

const CUES: Record<Cue, ToneCue | NoiseCue> = {
  hack: tone([660], 0.08, "square"),
  success: tone([523, 784, 1046], 0.11, "triangle"),
  failure: tone([220, 165], 0.18, "sawtooth"),
  alarm: tone([880, 660, 880, 660], 0.14, "square"),
  extract: tone([392, 523, 659, 784], 0.13, "triangle"),
  takedown: tone([196, 98], 0.12, "sine"),
  shot: noise(0.09, "bandpass", 1700, 0.5),
  shotHit: tone([1600, 900, 450], 0.05, "square", 0.05),
  shieldHit: tone([2400, 2250], 0.07, "triangle", 0.05),
  enemyShot: tone([980, 420], 0.07, "sawtooth", 0.035),
  playerHit: noise(0.2, "lowpass", 380, 0.9),
  reload: tone([320, 520], 0.05, "square", 0.04),
  dryFire: tone([1300], 0.025, "square", 0.04),
  wake: tone([220, 330, 440], 0.09, "sawtooth", 0.04),
};

export interface AudioOutput {
  context: AudioContext;
  destination: AudioNode;
}

/**
 * Contexte audio unique (les navigateurs en limitent le nombre) et volume général.
 * Il est créé au premier son : les navigateurs exigent un geste de l'utilisateur.
 */
export class AudioEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private unavailable = false;

  constructor(private enabled: boolean) {}

  get isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!this.context || !this.master) return;
    // Rampe courte : couper net un son en cours produit un « clic ».
    this.master.gain.setTargetAtTime(enabled ? 1 : 0, this.context.currentTime, 0.05);
    if (enabled) void this.resume(this.context);
  }

  /** null si le son est coupé ou indisponible : l'appelant ne joue simplement rien. */
  output(): AudioOutput | null {
    if (!this.enabled) return null;
    const context = this.ensureContext();
    if (!context || !this.master) return null;
    if (context.state === "suspended") void this.resume(context);
    return { context, destination: this.master };
  }

  private ensureContext(): AudioContext | null {
    if (this.unavailable) return null;
    if (this.context) return this.context;
    try {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.connect(this.context.destination);
      return this.context;
    } catch (error) {
      this.unavailable = true;
      console.warn("Audio indisponible, le jeu continue sans son.", error);
      return null;
    }
  }

  private async resume(context: AudioContext): Promise<void> {
    try {
      await context.resume();
    } catch (error) {
      console.warn("Reprise de l'audio refusée par le navigateur.", error);
    }
  }
}

/** Effets sonores synthétisés (aucun fichier audio à charger). */
export class SoundFx {
  private noiseBuffer: AudioBuffer | null = null;

  constructor(private readonly engine: AudioEngine) {}

  play(cue: Cue): void {
    const output = this.engine.output();
    if (!output) return;
    const definition = CUES[cue];
    if (definition.kind === "tone") this.playTone(output, definition);
    else this.playNoise(output, definition);
  }

  private playTone({ context, destination }: AudioOutput, { frequencies, duration, wave, gain: volume }: ToneCue): void {
    frequencies.forEach((frequency, index) => {
      const startAt = context.currentTime + index * duration;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = wave;
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(volume, startAt);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
      oscillator.connect(gain).connect(destination);
      oscillator.start(startAt);
      oscillator.stop(startAt + duration);
    });
  }

  private playNoise({ context, destination }: AudioOutput, { duration, filter: filterType, frequency, gain: volume }: NoiseCue): void {
    const source = context.createBufferSource();
    source.buffer = this.whiteNoise(context);
    const filter = context.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = frequency;
    const gain = context.createGain();
    const startAt = context.currentTime;
    gain.gain.setValueAtTime(volume, startAt);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
    source.connect(filter).connect(gain).connect(destination);
    source.start(startAt);
    source.stop(startAt + duration);
  }

  /** Une demi-seconde de bruit blanc, générée une seule fois puis réutilisée par tous les sons. */
  private whiteNoise(context: AudioContext): AudioBuffer {
    if (this.noiseBuffer && this.noiseBuffer.sampleRate === context.sampleRate) return this.noiseBuffer;
    const buffer = context.createBuffer(1, Math.floor(context.sampleRate * 0.5), context.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let index = 0; index < samples.length; index++) samples[index] = Math.random() * 2 - 1;
    this.noiseBuffer = buffer;
    return buffer;
  }
}
