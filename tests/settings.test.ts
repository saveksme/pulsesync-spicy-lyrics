import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, normalizeSettings } from "../src/settings";

describe("normalizeSettings", () => {
  it("returns defaults for garbage", () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings({ backgroundStyle: "rainbow", timingOffsetMs: "x" })).toEqual(DEFAULT_SETTINGS);
  });

  it("reads raw and {value, default} shapes", () => {
    const s = normalizeSettings({ simpleLyricsMode: { value: true, default: false }, useLrclib: false });
    expect(s.simpleLyricsMode).toBe(true);
    expect(s.useLrclib).toBe(false);
    expect(normalizeSettings({ lineBlur: { default: false } }).lineBlur).toBe(false);
  });

  it("trims secrets and clamps numbers", () => {
    const s = normalizeSettings({ spicyApiKey: "  sl_sk_abc\n", timingOffsetMs: 99999 });
    expect(s.spicyApiKey).toBe("sl_sk_abc");
    expect(s.timingOffsetMs).toBe(2000);
    expect(normalizeSettings({ timingOffsetMs: "-150" }).timingOffsetMs).toBe(-150);
    expect(normalizeSettings({ useSpicy: "false" }).useSpicy).toBe(false);
  });
});
