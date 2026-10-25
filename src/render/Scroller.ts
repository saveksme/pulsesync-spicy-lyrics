// Ported from Spicy Lyrics (AGPL-3.0, github.com/Spikerko/spicy-lyrics):
// src/utils/Scrolling/ScrollToActiveLine.ts (non-virtualized path),
// src/utils/ScrollIntoView/Center.ts (ScrollIntoCenterViewCSS)
import type { LineItem, RenderedLyrics } from "./model";

const USER_SCROLL_COOLDOWN = 750;
const VIEWPORT_CHECK_INTERVAL = 350;
// How far ahead (real lyric lines, background lines excluded) the highest active line may keep the anchor.
const PIN_LOOKAHEAD = 2;
const DRASTIC_CHANGE_MS = 1000;
const CENTER_OFFSET_PX = -30;
const AFTER_INTERLUDE_DELAY_MS = 240;
// A line taller than the viewport minus this band at both edges can never be followed
// by centring it; the follow keeps the sung word inside the band instead.
const OVERSIZED_BAND_RATIO = 0.2;

const isBackground = (line: LineItem) => line.BGLine === true;

function resolveToLead(lines: LineItem[], index: number): number {
  let i = index;
  while (i > 0 && isBackground(lines[i])) i--;
  return i;
}

function groupEndTime(lines: LineItem[], leadIndex: number): number {
  let end = lines[leadIndex].EndTime;
  for (let i = leadIndex + 1; i < lines.length && isBackground(lines[i]); i++) end = Math.max(end, lines[i].EndTime);
  return end;
}

function lookaheadLine(lines: LineItem[], leadIndex: number): LineItem | null {
  let remaining = PIN_LOOKAHEAD;
  for (let i = leadIndex + 1; i < lines.length; i++) {
    if (isBackground(lines[i])) continue;
    if (--remaining === 0) return lines[i];
  }
  return null;
}

export function getScrollLineIndex(lines: LineItem[], positionMs: number): number | null {
  const active: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].StartTime <= positionMs && lines[i].EndTime >= positionMs) active.push(i);
  }
  if (active.length === 0) return null;

  let frontLead = -1;
  for (const index of active) frontLead = Math.max(frontLead, resolveToLead(lines, index));
  const leads: number[] = [];
  for (const index of active) {
    const lead = resolveToLead(lines, index);
    // A background line still active above the front group is only the tail of a line already passed.
    if (isBackground(lines[index]) && lead < frontLead) continue;
    if (leads[leads.length - 1] !== lead) leads.push(lead);
  }

  const anchor = leads[0];
  const lookahead = lookaheadLine(lines, anchor);
  if (lookahead === null || groupEndTime(lines, anchor) <= lookahead.StartTime) return anchor;
  const first = leads[0];
  const last = leads[leads.length - 1];
  return last - first <= 1 ? first : last;
}

export class Scroller {
  private lastLine: HTMLElement | null = null;
  private lastPosition = 0;
  private lastUserScroll = 0;
  private userScrolling = false;
  private forceQueued = false;
  private smoothQueued = false;
  private scrolledToFirst = false;
  private scrolledToLast = false;
  private viewportCheckedAt = 0;
  private viewportLine: HTMLElement | null = null;
  private lineInViewport = false;
  private pendingTimer: ReturnType<typeof setTimeout> | null = null;
  private holdUntil = 0;
  private readonly onUserScroll = () => {
    if (!this.userScrolling) {
      this.userScrolling = true;
      this.contentEl.classList.add("HideLineBlur");
    }
    this.lastUserScroll = this.now();
    this.holdUntil = 0;
  };

  constructor(
    private readonly scrollEl: HTMLElement,
    private readonly contentEl: HTMLElement,
    private readonly now: () => number = () => performance.now(),
  ) {
    scrollEl.addEventListener("wheel", this.onUserScroll, { passive: true });
    scrollEl.addEventListener("touchmove", this.onUserScroll, { passive: true });
  }

  queueForceScroll(): void {
    this.forceQueued = true;
  }

  // Centres the active line on every frame for a while, as the layout is still changing (a view
  // change eases the column's padding and the lines rewrap all along). A scroll by hand ends it.
  holdCentre(durationMs: number): void {
    this.holdUntil = Math.max(this.holdUntil, this.now() + durationMs);
  }

  reset(): void {
    this.lastLine = null;
    this.viewportLine = null;
    this.lineInViewport = false;
    this.viewportCheckedAt = 0;
    this.userScrolling = false;
    this.lastUserScroll = 0;
    this.lastPosition = 0;
    this.forceQueued = false;
    this.holdUntil = 0;
    this.smoothQueued = false;
    this.scrolledToFirst = false;
    this.scrolledToLast = false;
    if (this.pendingTimer) clearTimeout(this.pendingTimer);
    this.pendingTimer = null;
    this.contentEl.classList.remove("HideLineBlur");
  }

  destroy(): void {
    this.reset();
    this.scrollEl.removeEventListener("wheel", this.onUserScroll);
    this.scrollEl.removeEventListener("touchmove", this.onUserScroll);
  }

  private applyScroll(target: number, instant: boolean): void {
    const container = this.scrollEl;
    if (instant) container.classList.add("InstantScroll");
    container.scrollTop = target;
    if (instant) setTimeout(() => container.classList.remove("InstantScroll"), 50);
  }

  private scrollTo(element: HTMLElement, instant: boolean): void {
    const target = element.offsetTop - (this.scrollEl.clientHeight / 2 - element.clientHeight / 2) - CENTER_OFFSET_PX;
    this.applyScroll(target, instant);
  }

  // Lines taller than the visible band leave the sung words off-screen when centred
  // (some uploads sync a whole verse as one line). Keep the active word inside the
  // middle band instead. Returns true when the line is oversized and handled here.
  private followOversizedLine(item: LineItem | null | undefined, positionMs: number, instant: boolean): boolean {
    if (!item) return false;
    const element = item.HTMLElement;
    const view = this.scrollEl.clientHeight;
    const margin = view * OVERSIZED_BAND_RATIO;
    if (element.clientHeight <= view - margin * 2) return false;
    const lead = item.Syllables?.Lead;
    if (!lead || lead.length === 0) return false;
    let word = null;
    for (const candidate of lead) {
      if (candidate.StartTime <= positionMs) word = candidate;
      else break;
    }
    const wordEl = word?.HTMLElement;
    if (!wordEl) return false;
    const top = element.offsetTop + wordEl.offsetTop;
    const bottom = top + wordEl.clientHeight;
    const viewTop = this.scrollEl.scrollTop;
    let target: number | null = null;
    if (top < viewTop + margin) target = top - margin;
    else if (bottom > viewTop + view - margin) target = bottom + margin - view;
    if (target !== null) this.applyScroll(target, instant);
    return true;
  }

  private isInViewport(element: HTMLElement): boolean {
    const now = this.now();
    if (now - this.viewportCheckedAt > VIEWPORT_CHECK_INTERVAL || this.viewportLine !== element) {
      const top = element.offsetTop;
      const bottom = top + element.clientHeight;
      const viewTop = this.scrollEl.scrollTop;
      const viewBottom = viewTop + this.scrollEl.clientHeight;
      this.lineInViewport = Math.max(0, Math.min(bottom, viewBottom) - Math.max(top, viewTop)) >= 5;
      this.viewportCheckedAt = now;
      this.viewportLine = element;
    }
    return this.lineInViewport;
  }

  frame(rendered: RenderedLyrics, positionMs: number, isPlaying: boolean): void {
    if (rendered.type === "Static") return;
    const lines = rendered.lines;
    if (lines.length === 0) return;
    const index = getScrollLineIndex(lines, positionMs);
    const current = index === null ? null : lines[index];

    let notSung = 0;
    let activeCount = 0;
    let sung = 0;
    for (const line of lines) {
      if (positionMs < line.StartTime) notSung++;
      else if (positionMs >= line.EndTime) sung++;
      else activeCount++;
    }
    const allNotSung = notSung === lines.length;
    const oneActiveNoneSung = activeCount === 1 && sung === 0;
    const allSung = sung === lines.length;

    const shouldForce = this.forceQueued || this.now() < this.holdUntil || this.lastLine === null;
    const drastic = this.lastPosition !== 0 && Math.abs(positionMs - this.lastPosition) > DRASTIC_CHANGE_MS;
    if (shouldForce || (!isPlaying && this.lastPosition !== positionMs) || drastic) {
      const item = allSung ? lines[lines.length - 1] : current;
      const target = item?.HTMLElement;
      if (!target) return;
      this.userScrolling = false;
      this.lastLine = target;
      if (!this.followOversizedLine(item, positionMs, shouldForce || drastic)) this.scrollTo(target, shouldForce || drastic);
      this.forceQueued = false;
      this.lastPosition = positionMs;
      return;
    }
    this.lastPosition = positionMs;

    if (this.smoothQueued) {
      const item = allSung ? lines[lines.length - 1] : current;
      const target = item?.HTMLElement;
      if (!target) return;
      this.userScrolling = false;
      this.lastLine = target;
      if (!this.followOversizedLine(item, positionMs, false)) this.scrollTo(target, false);
      this.smoothQueued = false;
      return;
    }

    if ((allNotSung || oneActiveNoneSung) && !this.scrolledToFirst) {
      // The initial smooth scroll is queued, but the frame still runs below: an oversized
      // first line needs its word follow for the whole time it is active.
      this.smoothQueued = true;
      this.scrolledToFirst = true;
    }
    if (allSung) {
      if (this.scrolledToLast) return;
      this.smoothQueued = true;
      this.scrolledToLast = true;
    }

    if (!current || index === null) return;
    const element = current.HTMLElement;
    if (this.now() - this.lastUserScroll <= USER_SCROLL_COOLDOWN) return;
    // Park only when the user scrolled away (Spicy's virtualizer behaves the same: mounted
    // lines count as visible, so the follow always chases the active line). Without this,
    // one activation below the fold — e.g. right after a line taller than the viewport —
    // parked the follow for the rest of the song.
    if (this.userScrolling && !this.isInViewport(element)) return;

    this.userScrolling = false;
    this.contentEl.classList.remove("HideLineBlur");
    if (this.lastLine === element) {
      this.followOversizedLine(current, positionMs, false);
      return;
    }
    this.lastLine = element;
    if (this.followOversizedLine(current, positionMs, false)) {
      this.scrolledToLast = false;
      this.scrolledToFirst = false;
      return;
    }
    const scroll = () => {
      this.scrollTo(element, false);
      this.scrolledToLast = false;
      this.scrolledToFirst = false;
    };
    // Leaving a "•••" interlude: let it collapse first.
    if (lines[index - 1]?.DotLine) {
      if (this.pendingTimer) clearTimeout(this.pendingTimer);
      this.pendingTimer = setTimeout(() => {
        this.pendingTimer = null;
        if (this.lastLine === element) scroll();
      }, AFTER_INTERLUDE_DELAY_MS);
    } else {
      scroll();
    }
  }
}
