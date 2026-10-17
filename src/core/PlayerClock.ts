// Playback position between the player's progress updates (~4 per second in
// Yandex Music, driven by the audio element's timeupdate).
const SEEK_THRESHOLD_MS = 1000;
// A fresh update that lands slightly behind what was already shown is jitter:
// hold the shown position instead of stepping back.
const JITTER_HOLD_MS = 80;

export class PlayerClock {
  offsetMs = 0;
  private basePosition = 0;
  private baseTime = 0;
  private playing = false;
  private hasBase = false;
  private shown = -Infinity;
  private lastSample = Number.NaN;

  constructor(private readonly now: () => number = () => performance.now()) {}

  get isPlaying(): boolean {
    return this.playing;
  }

  private predict(at: number): number {
    return this.playing ? this.basePosition + (at - this.baseTime) : this.basePosition;
  }

  update(state: { progressSec: number | null; status: string }): { seeked: boolean } {
    const at = this.now();
    const playing = state.status === "playing";
    if (state.progressSec === null || !Number.isFinite(state.progressSec)) {
      if (this.hasBase) {
        this.basePosition = this.predict(at);
        this.baseTime = at;
      }
      this.playing = playing;
      return { seeked: false };
    }
    const position = state.progressSec * 1000;
    // Snapshots sent for a volume, like or shuffle change repeat the last (already old)
    // progress sample; re-anchoring on it would step the lyrics back.
    if (this.hasBase && playing && this.playing && position === this.lastSample) return { seeked: false };
    this.lastSample = position;
    const seeked = this.hasBase && Math.abs(position - this.predict(at)) > SEEK_THRESHOLD_MS;
    this.basePosition = position;
    this.baseTime = at;
    this.playing = playing;
    this.hasBase = true;
    if (seeked) this.shown = -Infinity;
    return { seeked };
  }

  getPositionMs(): number {
    const raw = this.predict(this.now());
    const held = this.playing && raw < this.shown && this.shown - raw <= JITTER_HOLD_MS;
    this.shown = held ? this.shown : raw;
    return this.shown + this.offsetMs;
  }

  reset(): void {
    this.basePosition = 0;
    this.baseTime = 0;
    this.playing = false;
    this.hasBase = false;
    this.shown = -Infinity;
    this.lastSample = Number.NaN;
  }
}
