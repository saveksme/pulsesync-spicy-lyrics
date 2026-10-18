// Spicy's hover background (.line::before) spans the whole lyrics column, so on a line that
// wraps early it sticks out far past the words. It is fitted to the text when the pointer
// enters the line: --HoverLeft and --HoverWidth (ym.css), in the line's own pixels.
export function fitLineHover(line: HTMLElement): void {
  const extent = wordsExtent(line) ?? textExtent(line);
  if (!extent) {
    line.style.removeProperty("--HoverLeft");
    line.style.removeProperty("--HoverWidth");
    return;
  }
  const px = (value: number) => `${Math.round(value * 10) / 10}px`;
  line.style.setProperty("--HoverLeft", px(extent.left));
  line.style.setProperty("--HoverWidth", px(extent.right - extent.left));
}

type Extent = { left: number; right: number };

// Word-synced lines: the words' laid-out boxes. Their offsets leave out the scale and lift the
// word animation adds, so the background fits the line whether or not it is being sung.
function wordsExtent(line: HTMLElement): Extent | null {
  let left = Infinity;
  let right = -Infinity;
  for (const child of Array.from(line.children)) {
    if (!(child instanceof HTMLElement) || child.offsetWidth <= 0) continue;
    left = Math.min(left, child.offsetLeft);
    right = Math.max(right, child.offsetLeft + child.offsetWidth);
  }
  return right > left ? { left, right } : null;
}

// Line-synced and unsynced lines are plain text: its rectangles on screen, brought back to the
// line's own pixels in case the line itself is scaled.
function textExtent(line: HTMLElement): Extent | null {
  const box = line.getBoundingClientRect();
  const scale = line.offsetWidth > 0 ? box.width / line.offsetWidth : 0;
  if (!(scale > 0)) return null;
  const range = line.ownerDocument.createRange();
  range.selectNodeContents(line);
  let left = Infinity;
  let right = -Infinity;
  for (const rect of typeof range.getClientRects === "function" ? Array.from(range.getClientRects()) : []) {
    if (rect.width <= 0 || rect.height <= 0) continue;
    left = Math.min(left, rect.left);
    right = Math.max(right, rect.right);
  }
  return right > left ? { left: (left - box.left) / scale, right: (right - box.left) / scale } : null;
}
