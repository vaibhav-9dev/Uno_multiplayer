/**
 * Procedural Web Audio API sound synthesizer for UNO.
 * Zero external asset dependencies - guaranteed 100% reliable offline & online.
 */

class SoundService {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;

  constructor() {
    // Keep this safe if the module is evaluated during server-side rendering.
    try {
      this.isMuted = typeof localStorage !== 'undefined' &&
        localStorage.getItem('uno_muted') === 'true';
    } catch {
      this.isMuted = false;
    }
  }

  private initContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('uno_muted', muted ? 'true' : 'false');
      }
    } catch {
      // Sound preference storage is optional.
    }
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
  ) {
    if (this.isMuted) return;

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
          // Snappy card slap sound
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(450, now);