/** @vitest-environment happy-dom */
import { afterEach, expect, it, vi } from "vitest";
import { fitLineHover } from "../src/ui/lineHover";

const rect = (left: number, width: number, top = 0, height = 40) =>
  ({ left, width, top, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;

function line(box: DOMRect, layoutWidth: number): HTMLElement {
  const element = document.createElement("div");
  element.className = "line";
  element.textContent = "Все треки с зубами";
  document.body.appendChild(element);
  element.getBoundingClientRect = () => box;
  Object.defineProperty(element, "offsetWidth", { configurable: true, value: layoutWidth });
  return element;
}

function textRects(rects: DOMRect[]) {
  if (typeof Range.prototype.getClientRects !== "function") {
    Object.defineProperty(Range.prototype, "getClientRects", { configurable: true, writable: true, value: () => [] });
  }
  vi.spyOn(Range.prototype, "getClientRects").mockReturnValue(rects as unknown as DOMRectList);
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

// Words grow and lift as they are sung; the background follows their laid-out boxes, so it
// fits the line whether or not it is the active one.
it("fits the hover background to where the words are laid out, not to their animation", () => {
  const element = line(rect(100, 600), 600);
  element.textContent = "";
  const words = [
    [10, 120],
    [140, 100],
    [10, 230],
  ].map(([offsetLeft, offsetWidth]) => {
    const word = document.createElement("span");
    word.className = "word";
    word.textContent = "w";
    Object.defineProperty(word, "offsetLeft", { configurable: true, value: offsetLeft });
    Object.defineProperty(word, "offsetWidth", { configurable: true, value: offsetWidth });
    return word;
  });
  element.append(...words);
  textRects([rect(115, 200)]); // what the words measure while scaled down before they are sung
  fitLineHover(element);
  expect(element.style.getPropertyValue("--HoverLeft")).toBe("10px");
  expect(element.style.getPropertyValue("--HoverWidth")).toBe("230px");
});

// Spicy's hover background spans the whole column; wrapped lines end well before its edge.
it("fits the hover background to a plain-text line's text", () => {
  const element = line(rect(100, 600), 600);
  textRects([rect(110, 300, 0), rect(110, 420, 40), rect(0, 0)]);
  fitLineHover(element);
  expect(element.style.getPropertyValue("--HoverLeft")).toBe("10px");
  expect(element.style.getPropertyValue("--HoverWidth")).toBe("420px");
});

it("measures in the line's own pixels while the line is scaled", () => {
  const element = line(rect(100, 660), 600);
  textRects([rect(122, 462)]);
  fitLineHover(element);
  expect(element.style.getPropertyValue("--HoverLeft")).toBe("20px");
  expect(element.style.getPropertyValue("--HoverWidth")).toBe("420px");
});

it("keeps the full-width background when there is nothing to measure", () => {
  const element = line(rect(100, 600), 600);
  element.style.setProperty("--HoverWidth", "10px");
  textRects([]);
  fitLineHover(element);
  expect(element.style.getPropertyValue("--HoverWidth")).toBe("");
});
