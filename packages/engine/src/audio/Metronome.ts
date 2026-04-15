/**
 * Metronome
 *
 * Simple Web Audio metronome that produces a click on every beat, with
 * accented pitch on beat 1 of each bar. No sample library, no synthesis
 * beyond a short oscillator burst through a fast-decay gain envelope.
 *
 * Scheduling uses the standard look-ahead approach: a setInterval-driven
 * scheduler queues any clicks that fall within the next ~100ms of the
 * AudioContext clock. This keeps timing precise regardless of main-thread
 * jitter (Web Audio ignores main-thread timing for scheduled events).
 */

/** Frequency (Hz) of the accented click (beat 1). */
const ACCENT_FREQ = 1500;

/** Frequency (Hz) of the unaccented click (other beats). */
const NORMAL_FREQ = 1000;

/** Duration of the click's decay envelope (seconds). */
const CLICK_DECAY_S = 0.05;

/** How far ahead of the audio clock to schedule clicks (seconds). */
const SCHEDULE_LOOKAHEAD_S = 0.1;

/** How often the scheduler runs (ms). */
const SCHEDULER_INTERVAL_MS = 25;

export interface MetronomeConfig {
  /** Master volume 0–1. Default 0.3. */
  volume?: number;
}

export class Metronome {
  private ctx: AudioContext;
  private gain: GainNode;
  private running = false;
  private nextBeatTime = 0;
  private nextBeatNumber = 0;
  private tempo: number | null = null;
  private beatsPerBar = 4;
  private schedulerId: ReturnType<typeof setInterval> | null = null;

  constructor(ctx: AudioContext, config: MetronomeConfig = {}) {
    this.ctx = ctx;
    this.gain = ctx.createGain();
    this.gain.gain.value = config.volume ?? 0.3;
    this.gain.connect(ctx.destination);
  }

  setTempo(bpm: number | null): void {
    this.tempo = bpm;
    if (bpm === null && this.running) {
      this.stop();
    }
  }

  setMeter(beatsPerBar: number): void {
    this.beatsPerBar = Math.max(1, beatsPerBar);
  }

  setVolume(v: number): void {
    this.gain.gain.value = Math.max(0, Math.min(1, v));
  }

  isRunning(): boolean {
    return this.running;
  }

  start(): void {
    if (this.running || this.tempo === null) return;
    // Resume context if it was suspended (browsers require user gesture)
    if (this.ctx.state === "suspended") {
      void this.ctx.resume();
    }
    this.running = true;
    this.nextBeatTime = this.ctx.currentTime + 0.05;
    this.nextBeatNumber = 0;
    this.schedulerId = setInterval(() => this.schedule(), SCHEDULER_INTERVAL_MS);
  }

  stop(): void {
    this.running = false;
    if (this.schedulerId !== null) {
      clearInterval(this.schedulerId);
      this.schedulerId = null;
    }
  }

  private schedule(): void {
    if (this.tempo === null) return;
    const beatDuration = 60 / this.tempo;
    const horizon = this.ctx.currentTime + SCHEDULE_LOOKAHEAD_S;
    while (this.nextBeatTime < horizon) {
      const accented = this.nextBeatNumber === 0;
      this.scheduleClick(this.nextBeatTime, accented);
      this.nextBeatNumber = (this.nextBeatNumber + 1) % this.beatsPerBar;
      this.nextBeatTime += beatDuration;
    }
  }

  private scheduleClick(time: number, accented: boolean): void {
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = accented ? ACCENT_FREQ : NORMAL_FREQ;
    // Fast attack, exponential decay — classic click envelope
    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(1, time + 0.001);
    env.gain.exponentialRampToValueAtTime(0.001, time + CLICK_DECAY_S);
    osc.connect(env);
    env.connect(this.gain);
    osc.start(time);
    osc.stop(time + CLICK_DECAY_S);
  }
}
