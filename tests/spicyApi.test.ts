import { describe, expect, it, vi } from "vitest";
import { fetchSpicyLyrics, normalizeSpicyBody } from "../src/sources/spicyApi";
import { fakeFetch } from "./helpers/fakeHost";

const syllableBody = {
  Type: "Syllable",
  StartTime: 7.3,
  source: "spicy_lyrics",
  SongWriters: ["A"],
  UploadAttribution: { Uploader: { id: "1", username: "up", url: "https://spicylyrics.org/uid/1" } },
  Content: [
    {
      Type: "Vocal",
      OppositeAligned: false,
      Lead: {
        StartTime: 7.3,
        EndTime: 9,
        Syllables: [
          { Text: "Hi", StartTime: 7.3, EndTime: 8, IsPartOfWord: false },
          { Text: "  ", StartTime: 8, EndTime: 9, IsPartOfWord: false },
        ],
      },
    },
  ],
};

describe("spicy api", () => {
  it("sends bearer key to /v1/lyrics/{id}", async () => {
    let seen = "";
    const host = {
      fetch: fakeFetch({
        "https://api.spicylyrics.org/v1/lyrics/": (u, init) => {
          seen = `${u.pathname} ${(init?.headers as Record<string, string>).Authorization}`;
          return Response.json({ Body: syllableBody, Status: 200, Type: "object" });
        },
      }),
    };
    const r = await fetchSpicyLyrics(host, "sl_sk_k", "1QV6tiMFM6fSOKOGLMHYYg");
    expect(seen).toBe("/v1/lyrics/1QV6tiMFM6fSOKOGLMHYYg Bearer sl_sk_k");
    expect(r.ok && r.lyrics.Type).toBe("Syllable");
  });

  it("maps errors", async () => {
    const mk = (status: number, headers = {}) => ({
      fetch: fakeFetch({ "https://api.spicylyrics.org/": () => new Response("{}", { status, headers }) }),
    });
    expect(await fetchSpicyLyrics(mk(404), "k", "x")).toEqual({ ok: false, reason: "not-found" });
    expect(await fetchSpicyLyrics(mk(401), "k", "x")).toEqual({ ok: false, reason: "unauthorized" });
    expect(await fetchSpicyLyrics(mk(403), "k", "x")).toEqual({ ok: false, reason: "unauthorized" });
    expect(await fetchSpicyLyrics(mk(429, { "Retry-After": "30" }), "k", "x")).toEqual({
      ok: false,
      reason: "rate-limited",
      retryAfterSec: 30,
    });
    expect(await fetchSpicyLyrics(mk(502), "k", "x")).toEqual({ ok: false, reason: "error" });
    expect(await fetchSpicyLyrics(mk(200), "", "x")).toEqual({ ok: false, reason: "no-key" });
  });

  it("normalizes body: drops empty syllables, keeps attribution, unknown source -> unknown", () => {
    const l = normalizeSpicyBody({ ...syllableBody, source: "weird" }) as any;
    expect(l.Content[0].Lead.Syllables).toHaveLength(1);
    expect(l.source).toBe("unknown");
    expect(l.UploadAttribution.Uploader.username).toBe("up");
    expect(normalizeSpicyBody({ Type: "Line", Content: [] })).toBeNull();
    expect(normalizeSpicyBody({ Type: "Static", Lines: [{ Text: "a" }], source: "spotify" })!.Type).toBe("Static");
  });

  // Yandex Music's page sends Origin: music-application://desktop, which Spicy cannot allowlist;
  // the host's opaque-origin fetch sends Origin: null instead.
  it("sends Spicy requests through the host's opaque-origin fetch when it has one", async () => {
    const fetch = vi.fn(async () => Response.json({ Body: syllableBody }));
    const fetchOpaque = vi.fn(async () => Response.json({ Body: syllableBody }));
    const result = await fetchSpicyLyrics({ fetch, fetchOpaque }, "sl_pk_x", "x".repeat(22));
    expect(result.ok).toBe(true);
    expect(fetchOpaque).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
  });

  // PulseSync's isolated world throws on javascript: hrefs, which would break the credits.
  it("keeps only http(s) links and avatars for contributors", () => {
    const body = {
      ...syllableBody,
      UploadAttribution: {
        Uploader: { id: "1", username: "up", url: "javascript:alert(1)", avatar: "javascript:alert(2)" },
        Maker: { id: "2", username: "mk", url: "https://example.org/mk", avatar: "https://cdn.discordapp.com/a.png" },
      },
    };
    const attribution = (normalizeSpicyBody(body) as any).UploadAttribution;
    expect(attribution.Uploader.url).toBe("https://spicylyrics.org/uid/1");
    expect(attribution.Uploader.avatar).toBeUndefined();
    expect(attribution.Maker.url).toBe("https://example.org/mk");
    expect(attribution.Maker.avatar).toBe("https://cdn.discordapp.com/a.png");
  });
});
