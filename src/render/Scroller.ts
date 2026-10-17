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
  private readonly onUserScroll = () => {
    if (!this.userScrolling) {
      this.userScrolling = true;
      this.contentEl.classList.add("HideLineBlur");
    }
    this.lastUserScroll = this.now();
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

  reset(): void {
    this.lastLine = null;
    this.viewportLine = null;
    this.lineInViewport = false;
    this.viewportCheckedAt = 0;
    this.userScrolling = false;
    this.lastUserScroll = 0;
    this.lastPosition = 0;
    this.forceQueued = false;
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

  private scrollTo(element: HTMLElement, instant: boolean): void {
    const container = this.scrollEl;
    const target = element.offsetTop - (container.clientHeight / 2 - element.clientHeight / 2) - CENTER_OFFSET_PX;
    if (instant) container.classList.add("InstantScroll");
    container.scrollTop = target;
    if (instant) setTimeout(() => container.classList.remove("InstantScroll"), 50);
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

    const shouldForce = this.forceQueued || this.lastLine === null;
    const drastic = this.lastPosition !== 0 && Math.abs(positionMs - this.lastPosition) > DRASTIC_CHANGE_MS;
    if (shouldForce || (!isPlaying && this.lastPosition !== positionMs) || drastic) {
      const target = allSung ? lines[lines.length - 1].HTMLElement : current?.HTMLElement;
      if (!target) return;
      this.userScrolling = false;
      this.lastLine = target;
      this.scrollTo(target, shouldForce || drastic);
      this.forceQueued = false;
      this.lastPosition = positionMs;
      return;
    }
    this.lastPosition = positionMs;

    if (this.smoothQueued) {
      const target = allSung ? lines[lines.length - 1].HTMLElement : current?.HTMLElement;
      if (!target) return;
      this.userScrolling = false;
      this.lastLine = target;
      this.scrollTo(target, false);
      this.smoothQueued = false;
      return;
    }

    if (allNotSung || oneActiveNoneSung) {
      if (this.scrolledToFirst) return;
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
    if (this.now() - this.lastUserScroll <= USER_SCROLL_COOLDOWN || !this.isInViewport(element)) return;

    this.userScrolling = false;
    this.contentEl.classList.remove("HideLineBlur");
    if (this.lastLine === element) return;
    this.lastLine = element;
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
