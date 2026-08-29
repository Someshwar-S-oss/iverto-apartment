/**
 * Native HTML5 Web Audio API Sound Effects Synthesizer for iverto platform.
 * Provides zero-asset auditory feedback for incoming visitor rings, gate allow/deny decisions.
 */

class SoundSynthesizer {
  private audioCtx: AudioContext | null = null;
  private isMuted: boolean = false;

  private getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;

    if (!this.audioCtx) {
      const AudioCtxClass =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtxClass) {
        this.audioCtx = new AudioCtxClass();
      }
    }

    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {
        // Autoplay policy prevented immediate resume; will retry on next user interaction
      });
    }

    return this.audioCtx;
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
  }

  public getIsMuted(): boolean {
    return this.isMuted;
  }

  /**
   * 2-tone pleasant melodic bell chime for incoming visitor approval alerts.
   * Plays an initial bright fundamental note followed by a higher resonant bell harmonic.
   */
  public playRingChime(): void {
    if (this.isMuted) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // First Bell Tone: E5 (659.25 Hz)
    this.createBellNote(ctx, 659.25, now, 0.4, 0.25);

    // Second Bell Tone: A5 (880.0 Hz) slightly staggered
    this.createBellNote(ctx, 880.0, now + 0.18, 0.6, 0.3);
  }

  /**
   * Ascending cheerful major triad chime for ALLOW / APPROVED decisions.
   * Sequence: C5 (523.25 Hz) -> E5 (659.25 Hz) -> G5 (783.99 Hz) -> C6 (1046.5 Hz).
   */
  public playAllowChime(): void {
    if (this.isMuted) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const notes = [
      { freq: 523.25, timeOffset: 0.0, duration: 0.2, volume: 0.2 },
      { freq: 659.25, timeOffset: 0.08, duration: 0.2, volume: 0.22 },
      { freq: 783.99, timeOffset: 0.16, duration: 0.25, volume: 0.25 },
      { freq: 1046.5, timeOffset: 0.24, duration: 0.45, volume: 0.3 },
    ];

    for (const note of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(note.freq, now + note.timeOffset);

      gain.gain.setValueAtTime(0.001, now + note.timeOffset);
      gain.gain.exponentialRampToValueAtTime(note.volume, now + note.timeOffset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + note.timeOffset + note.duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + note.timeOffset);
      osc.stop(now + note.timeOffset + note.duration);
    }
  }

  /**
   * Low-frequency subtle double warning buzz for DENY / REJECT decisions.
   * Two quick distinct low buzz pulses (160 Hz -> 130 Hz) with low-pass filtering.
   */
  public playDenyChime(): void {
    if (this.isMuted) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // Pulse 1: 160 Hz
    this.createBuzzPulse(ctx, 160, now, 0.12, 0.22);

    // Pulse 2: 130 Hz (after 80ms pause)
    this.createBuzzPulse(ctx, 130, now + 0.18, 0.18, 0.25);
  }

  private createBellNote(
    ctx: AudioContext,
    frequency: number,
    startTime: number,
    duration: number,
    peakVolume: number,
  ): void {
    const osc = ctx.createOscillator();
    const harmonicOsc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(frequency, startTime);

    // Higher subtle overtone for rich metallic bell realism
    harmonicOsc.type = 'sine';
    harmonicOsc.frequency.setValueAtTime(frequency * 2.76, startTime);

    const harmonicGain = ctx.createGain();
    harmonicGain.gain.setValueAtTime(0.001, startTime);
    harmonicGain.gain.exponentialRampToValueAtTime(peakVolume * 0.3, startTime + 0.015);
    harmonicGain.gain.exponentialRampToValueAtTime(0.001, startTime + (duration * 0.5));

    gain.gain.setValueAtTime(0.001, startTime);
    gain.gain.exponentialRampToValueAtTime(peakVolume, startTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    osc.connect(gain);
    harmonicOsc.connect(harmonicGain);
    harmonicGain.connect(gain);
    gain.connect(ctx.destination);

    osc.start(startTime);
    harmonicOsc.start(startTime);
    osc.stop(startTime + duration);
    harmonicOsc.stop(startTime + duration);
  }

  private createBuzzPulse(
    ctx: AudioContext,
    frequency: number,
    startTime: number,
    duration: number,
    peakVolume: number,
  ): void {
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(frequency, startTime);

    // Low-pass filter to make it subtle and avoid harsh clicks
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(450, startTime);

    gain.gain.setValueAtTime(0.001, startTime);
    gain.gain.exponentialRampToValueAtTime(peakVolume, startTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start(startTime);
    osc.stop(startTime + duration);
  }
}

export const soundSynthesizer = new SoundSynthesizer();

/**
 * 2-tone melodic bell chime for incoming visitor approval alerts.
 */
export const playRingChime = (): void => soundSynthesizer.playRingChime();

/**
 * Ascending cheerful major triad chime for ALLOW decisions.
 */
export const playAllowChime = (): void => soundSynthesizer.playAllowChime();

/**
 * Low-frequency subtle double warning buzz for DENY / REJECT decisions.
 */
export const playDenyChime = (): void => soundSynthesizer.playDenyChime();

export default soundSynthesizer;
