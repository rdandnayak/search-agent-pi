import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tavily/core", () => ({
  tavily: vi.fn(() => ({
    search: vi.fn().mockResolvedValue({
      results: [
        { title: "Result One", url: "https://example.com/1", content: "Content one" },
        { title: "Result Two", url: "https://example.com/2", content: "Content two" },
      ],
    }),
  })),
}));

import { webSearch, calculate, readUrl, getWeather } from "../tools";
import { tavily } from "@tavily/core";

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

// ── webSearch ─────────────────────────────────────────────────────────────────

describe("webSearch", () => {
  it("throws when TAVILY_API_KEY is not set", async () => {
    vi.stubEnv("TAVILY_API_KEY", "");
    await expect(webSearch("test query")).rejects.toThrow("TAVILY_API_KEY");
  });

  it("returns a SearchResponse with the correct shape", async () => {
    vi.stubEnv("TAVILY_API_KEY", "test-key");
    const result = await webSearch("TypeScript tips");
    expect(result.query).toBe("TypeScript tips");
    expect(result.results[0]).toEqual({
      title: "Result One", url: "https://example.com/1", content: "Content one",
    });
  });

  it("passes the query and searchDepth to Tavily", async () => {
    vi.stubEnv("TAVILY_API_KEY", "test-key");
    await webSearch("India GDP 2025");
    const mockClient = (tavily as ReturnType<typeof vi.fn>).mock.results[0].value;
    expect(mockClient.search).toHaveBeenCalledWith(
      "India GDP 2025",
      expect.objectContaining({ searchDepth: "basic" })
    );
  });
});

// ── calculate ─────────────────────────────────────────────────────────────────

describe("calculate", () => {
  it("evaluates basic arithmetic", () => {
    expect(calculate("2 + 2").result).toBe("4");
    expect(calculate("100 * 0.18").result).toBe("18");
  });

  it("handles percentages expressed as multiplication", () => {
    expect(calculate("2500 * 0.15").result).toBe("375");
  });

  it("evaluates square roots and powers", () => {
    expect(calculate("sqrt(144)").result).toBe("12");
    expect(calculate("2 ^ 10").result).toBe("1024");
  });

  it("throws on invalid expressions", () => {
    expect(() => calculate("not a number")).toThrow("Cannot evaluate");
  });

  it("returns the original expression alongside the result", () => {
    const r = calculate("3 * 7");
    expect(r.expression).toBe("3 * 7");
    expect(r.result).toBe("21");
  });
});

// ── readUrl ───────────────────────────────────────────────────────────────────

describe("readUrl", () => {
  it("strips HTML tags and returns plain text", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        "<html><head><title>Test Page</title></head><body><p>Hello <b>world</b></p></body></html>",
    }));

    const result = await readUrl("https://example.com");
    expect(result.title).toBe("Test Page");
    expect(result.content).toContain("Hello");
    expect(result.content).toContain("world");
    expect(result.content).not.toContain("<p>");
  });

  it("strips script and style blocks entirely", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        "<html><body><script>alert('xss')</script><style>.x{color:red}</style><p>Clean</p></body></html>",
    }));

    const result = await readUrl("https://example.com");
    expect(result.content).not.toContain("alert");
    expect(result.content).not.toContain("color:red");
    expect(result.content).toContain("Clean");
  });

  it("throws when the server returns a non-2xx status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    await expect(readUrl("https://example.com/missing")).rejects.toThrow("HTTP 404");
  });
});

// ── getWeather ────────────────────────────────────────────────────────────────

describe("getWeather", () => {
  it("returns a WeatherResult with the correct shape", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce({
        json: async () => ({
          results: [{ latitude: 12.97, longitude: 77.59, name: "Bangalore", country: "India" }],
        }),
      })
      .mockResolvedValueOnce({
        json: async () => ({
          current: {
            temperature_2m: 28.5,
            relative_humidity_2m: 65,
            wind_speed_10m: 12,
            weather_code: 1,
          },
        }),
      })
    );

    const result = await getWeather("Bangalore");
    expect(result.city).toBe("Bangalore, India");
    expect(result.temperatureC).toBe(28.5);
    expect(result.humidity).toBe(65);
    expect(result.condition).toBe("Mainly clear");
  });

  it("throws when the city is not found", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      json: async () => ({ results: [] }),
    }));
    await expect(getWeather("Atlantis")).rejects.toThrow("City not found");
  });
});
