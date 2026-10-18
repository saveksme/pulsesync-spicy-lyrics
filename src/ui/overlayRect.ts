export interface OverlayRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

// The Yandex Music content column (between the navbar and above the player bar).
export const CONTENT_SELECTORS = ['[class*="CommonLayout_content"]', '[class*="Content_main"]', "main"];
// Yandex Music's player bar. On My Wave the page runs under it (the bar floats over the wave).
export const PLAYER_BAR_SELECTORS = ['[class*="PlayerBarDesktopWithBackgroundProgressBar_root"]', '[class*="CommonLayout_playerBar"]'];
// Space Yandex Music leaves between the content and the player bar (--ym-spacer-size-m).
export const DEFAULT_LAYOUT_GAP = 12;

type Boxed = { getBoundingClientRect(): DOMRect };

export function computeOverlayRect(
  content: Boxed | null,
  viewport: { width: number; height: number },
  playerBar: Boxed | null = null,
  gap = DEFAULT_LAYOUT_GAP,
): OverlayRect {
  if (!content) return { top: 0, left: 0, width: viewport.width, height: viewport.height };
  const rect = content.getBoundingClientRect();
  if (rect.width < 200 || rect.height < 200) return { top: 0, left: 0, width: viewport.width, height: viewport.height };
  let bottom = rect.top + rect.height;
  const bar = playerBar?.getBoundingClientRect();
  if (bar && bar.height > 0 && bar.top > rect.top && bar.top < bottom && bar.left < rect.left + rect.width && bar.left + bar.width > rect.left) {
    bottom = Math.max(rect.top, bar.top - gap);
  }
  return { top: rect.top, left: rect.left, width: rect.width, height: bottom - rect.top };
}

// Yandex Music draws its window title bar (buttons and drag area) inside the page.
export const TITLE_BAR_SELECTOR = '[class*="TitleBar_root"]';
const MAX_TITLE_BAR_HEIGHT = 120;

// The cinema view fills the window below that title bar, so the window stays usable.
export function computeCinemaRect(
  titleBar: { getBoundingClientRect(): DOMRect } | null,
  viewport: { width: number; height: number },
): OverlayRect {
  const bottom = titleBar?.getBoundingClientRect().bottom ?? 0;
  const top = Number.isFinite(bottom) && bottom > 0 && bottom <= MAX_TITLE_BAR_HEIGHT ? bottom : 0;
  return { top, left: 0, width: viewport.width, height: Math.max(0, viewport.height - top) };
}

function findFirst(doc: Document, selectors: string[]): HTMLElement | null {
  for (const selector of selectors) {
    const element = doc.querySelector<HTMLElement>(selector);
    if (element) return element;
  }
  return null;
}

export const findContentArea = (doc: Document) => findFirst(doc, CONTENT_SELECTORS);

// Yandex Music's spacer in pixels, as its layout uses it; the default where it is not set.
function layoutGap(doc: Document): number {
  const view = doc.defaultView;
  const value = view?.getComputedStyle(doc.body ?? doc.documentElement).getPropertyValue("--ym-spacer-size-m").trim() ?? "";
  const size = parseFloat(value);
  if (!Number.isFinite(size) || size <= 0) return DEFAULT_LAYOUT_GAP;
  if (value.endsWith("rem")) return size * (parseFloat(view!.getComputedStyle(doc.documentElement).fontSize) || 16);
  return value.endsWith("px") ? size : DEFAULT_LAYOUT_GAP;
}

// Keeps `apply` called with the content area's rectangle while it moves or resizes.
export function followContentArea(doc: Document, apply: (rect: OverlayRect) => void): () => void {
  const view = doc.defaultView ?? window;
  let observed: HTMLElement | null = null;
  const update = () => {
    const content = findContentArea(doc);
    if (content !== observed) {
      if (observed) observer?.unobserve(observed);
      observed = content;
      if (content) observer?.observe(content);
    }
    apply(computeOverlayRect(content, { width: view.innerWidth, height: view.innerHeight }, findFirst(doc, PLAYER_BAR_SELECTORS), layoutGap(doc)));
  };
  const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
  view.addEventListener("resize", update);
  update();
  return () => {
    view.removeEventListener("resize", update);
    observer?.disconnect();
  };
}
