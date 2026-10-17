export interface OverlayRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

// The Yandex Music content column (between the navbar and above the player bar).
export const CONTENT_SELECTORS = ['[class*="CommonLayout_content"]', '[class*="Content_main"]', "main"];

export function computeOverlayRect(
  content: { getBoundingClientRect(): DOMRect } | null,
  viewport: { width: number; height: number },
): OverlayRect {
  if (!content) return { top: 0, left: 0, width: viewport.width, height: viewport.height };
  const rect = content.getBoundingClientRect();
  if (rect.width < 200 || rect.height < 200) return { top: 0, left: 0, width: viewport.width, height: viewport.height };
  return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
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

export function findContentArea(doc: Document): HTMLElement | null {
  for (const selector of CONTENT_SELECTORS) {
    const element = doc.querySelector<HTMLElement>(selector);
    if (element) return element;
  }
  return null;
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
    apply(computeOverlayRect(content, { width: view.innerWidth, height: view.innerHeight }));
  };
  const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
  view.addEventListener("resize", update);
  update();
  return () => {
    view.removeEventListener("resize", update);
    observer?.disconnect();
  };
}
