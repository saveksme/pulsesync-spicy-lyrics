import { describe, expect, it } from "vitest";
import { coverUrl, toTrackInfo } from "../src/core/track";

describe("track", () => {
  it("maps YM meta", () => {
    const t = toTrackInfo({
      id: "123",
      title: "Song",
      version: "Remix",
      durationMs: 200000,
      artists: [{ name: "A" }, { name: "B" }],
      albums: [{ id: 9, title: "Alb" }],
      coverUri: "avatars.yandex.net/get-music-content/1/ab/%%",
      derivedColors: { average: "#112233" },
    })!;
    expect(t).toMatchObject({
      id: "123",
      albumId: "9",
      title: "Song",
      version: "Remix",
      artists: ["A", "B"],
      album: "Alb",
      durationMs: 200000,
      averageColor: "#112233",
      isUgc: false,
    });
    expect(t.coverUrl).toBe("https://avatars.yandex.net/get-music-content/1/ab/1000x1000");
  });

  // Each artist links to its page in Yandex Music, which has none for "Various artists".
  it("keeps the artists' Yandex Music ids in their order", () => {
    const t = toTrackInfo({
      id: "1",
      title: "x",
      artists: [{ id: 975699, name: "Макс Корж", various: false }, { name: "" }, { id: 171, name: "Various artists", various: true }, { name: "No id" }],
    })!;
    expect(t.artists).toEqual(["Макс Корж", "Various artists", "No id"]);
    expect(t.artistIds).toEqual(["975699", null, null]);
    expect(toTrackInfo({ id: "2", title: "x", artists: [{ name: "A" }] })!.artistIds).toBeUndefined();
  });

  it("handles UGC/podcasts and missing fields", () => {
    expect(toTrackInfo({ id: "a1b2-uuid", title: "x" })!.isUgc).toBe(true);
    expect(toTrackInfo({ id: "1", title: "x", duration: 180 })!.durationMs).toBe(180000);
    expect(toTrackInfo(null)).toBeNull();
    expect(coverUrl(undefined)).toBeUndefined();
  });

  // ListenBrainz matches by name only, so a podcast episode must never reach Spicy or Spotify.
  it("treats podcasts and audiobooks like uploads (no catalogue lookups)", () => {
    expect(toTrackInfo({ id: "123", title: "Episode 12", type: "podcast-episode" })!.isUgc).toBe(true);
    expect(toTrackInfo({ id: "124", title: "Chapter 1", type: "audiobook" })!.isUgc).toBe(true);
    expect(toTrackInfo({ id: "125", title: "Song", type: "music" })!.isUgc).toBe(false);
    expect(toTrackInfo({ id: "126", title: "Song" })!.isUgc).toBe(false);
  });
});
