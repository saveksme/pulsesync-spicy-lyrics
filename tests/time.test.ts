import { expect, it } from "vitest";
import { formatTime } from "../src/ui/time";

it("formats", () => {
  expect(formatTime(0)).toBe("0:00");
  expect(formatTime(61500)).toBe("1:01");
  expect(formatTime(3723000)).toBe("1:02:03");
});
