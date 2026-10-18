// Spicy's hover background (.line::before) spans the whole lyrics column, so on a line that
// wraps early it sticks out far past the words. It is fitted to the text when the pointer
// enters the line: --HoverLeft and --HoverWidth (ym.css), in the line's own pixels.
export function fitLineHover(line: HTMLElement): void {
  const box = line.getBoundingClientRect();
  const range = line.ownerDocument.createRange();
  range.selectNodeContents(line);
  let left = Infinity;
  let right = -Infinity;
  for (const rect of typeof range.getClientRects === "function" ? Array.from(range.getClientRects()) : []) {
    if (rect.width <= 0 || rect.height <= 0) continue;
    left = Math.min(left, rect.left);
    right = Math.max(right, rect.right);
  }
  // A line scaled by its animation: the rectangles are in screen pixels, the background in the line's.
  const scale = line.offsetWidth > 0 ? box.width / line.offsetWidth : 0;
  if (!(right > left) || !(scale > 0)) {
    line.style.removeProperty("--HoverLeft");
    line.style.removeProperty("--HoverWidth");
    return;
  }
  const px = (value: number) => `${Math.round((value / scale) * 10) / 10}px`;
  line.style.setProperty("--HoverLeft", px(left - box.left));
  line.style.setProperty("--HoverWidth", px(right - left));
}
