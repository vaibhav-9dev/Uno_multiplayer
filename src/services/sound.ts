/**
 * Procedural Web Audio API sound synthesizer for UNO.
 * Zero external asset dependencies.
 */

class SoundService {
  private ctx: AudioContext | null = null;
  private isMuted = false;

  constructor() {
    const saved =
      typeof localStorage !== 'undefined'
        ? localStorage.getItem('uno_muted')
        : null;

    this.isMuted = saved === 'true';
  }

  private initContext(): void {
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as any).webkitAudioContext;

      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }

    if (this.ctx?.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;

    try {
      localStorage.setItem('uno_muted', muted ? 'true' : 'false');
    } catch {}
  }

  public toggleMute(): boolean {
    this.setMuted(!this.isMuted);
    return this.isMuted;
  }

  public play(
    sound:
      | 'card_play'
      | 'card_draw'
      | 'draw_cards'
      | 'skip'
      | 'reverse'
      | 'wild_pick'
      | 'uno_shout'
      | 'penalty'
      | 'challenge'
      | 'win'
      | 'round_start'
      | 'click'
  ): void {
    if (this.isMuted || typeof window === 'undefined') return;

    try {
      this.initContext();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;

      switch (sound) {
        case 'click': {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();

          osc.type = 'sine';
          osc.frequency.setValueAtTime(600, now);
          osc.frequency.exponentialRampToValueAtTime(300, now + 0.05);

          gain.gain.setValueAtTime(0.15, now);
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);

          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(now);
          osc.stop(now + 0.05);
          break;
        }

        case 'card_play': {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();

          osc.type = 'triangle';
          osc.frequency.setValueAtTime(450, now);
          osc.frequency.exponentialRampToValueAtTime(120, now + 0.08);

          gain.gain.setValueAtTime(0.3, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(now);
          osc.stop(now + 0.09);
          break;
        }

        case 'card_draw': {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();

          osc.type = 'sine';
          osc.frequency.setValueAtTime(300, now);
          osc.frequency.exponentialRampToValueAtTime(550, now + 0.1);

          gain.gain.setValueAtTime(0.2, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(now);
          osc.stop(now + 0.12);
          break;
        }

        case 'draw_cards': {
          [0, 0.07, 0.14].forEach((delay, index) => {
            const osc = this.ctx!.createOscillator();
            const gain = this.ctx!.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(320 + index * 60, now + delay);
            osc.frequency.exponentialRampToValueAtTime(
              500,
              now + delay + 0.08
            );

            gain.gain.setValueAtTime(0.18, now + delay);
            gain.gain.exponentialRampToValueAtTime(
              0.001,
              now + delay + 0.08
            );

            osc.connect(gain);
            gain.connect(this.ctx!.destination);
            osc.start(now + delay);
            osc.stop(now + delay + 0.08);
          });
          break;
        }

        case 'skip': {
          [523.25, 659.25].forEach((frequency, index) => {
            const osc = this.ctx!.createOscillator();
            const gain = this.ctx!.createGain();
            const start = now + index * 0.08;

            osc.type = 'sine';
            osc.frequency.setValueAtTime(frequency, start);

            gain.gain.setValueAtTime(0.25, start);
            gain.gain.exponentialRampToValueAtTime(0.001, start + 0.12);

            osc.connect(gain);
            gain.connect(this.ctx!.destination);
            osc.start(start);
            osc.stop(start + 0.12);
          });
          break;
        }

        case 'reverse': {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();

          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(300, now);
          osc.frequency.linearRampToValueAtTime(700, now + 0.12);
          osc.frequency.linearRampToValueAtTime(400, now + 0.25);

          gain.gain.setValueAtTime(0.15, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(now);
          osc.stop(now + 0.25);
          break;
        }

        case 'wild_pick': {
          [523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => {
            const osc = this.ctx!.createOscillator();
            const gain = this.ctx!.createGain();
            const start = now + index * 0.05;

            osc.type = 'triangle';
            osc.frequency.setValueAtTime(frequency, start);

            gain.gain.setValueAtTime(0.2, start);
            gain.gain.exponentialRampToValueAtTime(0.001, start + 0.25);

            osc.connect(gain);
            gain.connect(this.ctx!.destination);
            osc.start(start);
            osc.stop(start + 0.25);
          });
          break;
        }

        case 'uno_shout': {
          [440, 554.37, 659.25, 880].forEach((frequency) => {
            const osc = this.ctx!.createOscillator();
            const gain = this.ctx!.createGain();

            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(frequency, now);

            gain.gain.setValueAtTime(0.15, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

            osc.connect(gain);
            gain.connect(this.ctx!.destination);
            osc.start(now);
            osc.stop(now + 0.4);
          });
          break;
        }

        case 'penalty': {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();

          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(160, now);
          osc.frequency.linearRampToValueAtTime(110, now + 0.35);

          gain.gain.setValueAtTime(0.3, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(now);
          osc.stop(now + 0.35);
          break;
        }

        case 'challenge': {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();

          osc.type = 'triangle';
          osc.frequency.setValueAtTime(180, now);
          osc.frequency.exponentialRampToValueAtTime(60, now + 0.4);

          gain.gain.setValueAtTime(0.4, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(now);
          osc.stop(now + 0.45);
          break;
        }

        case 'round_start': {
          [440, 660, 880].forEach((frequency, index) => {
            const osc = this.ctx!.createOscillator();
            const gain = this.ctx!.createGain();
            const start = now + index * 0.08;

            osc.type = 'sine';
            osc.frequency.setValueAtTime(frequency, start);

            gain.gain.setValueAtTime(0.2, start);
            gain.gain.exponentialRampToValueAtTime(0.001, start + 0.2);

            osc.connect(gain);
            gain.connect(this.ctx!.destination);
            osc.start(start);
            osc.stop(start + 0.2);
          });
          break;
        }

        case 'win': {
          [523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => {
            const osc = this.ctx!.createOscillator();
            const gain = this.ctx!.createGain();
            const start = now + index * 0.12;

            osc.type = 'triangle';
            osc.frequency.setValueAtTime(frequency, start);

            gain.gain.setValueAtTime(0.3, start);
            gain.gain.exponentialRampToValueAtTime(0.001, start + 0.4);

            osc.connect(gain);
            gain.connect(this.ctx!.destination);
            osc.start(start);
            osc.stop(start + 0.4);
          });
          break;
        }
      }
    } catch (error) {
      console.warn('[Sound] Playback error:', error);
    }
  }
}

export const soundService = new SoundService();