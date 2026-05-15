import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock @tavily/core before importing tools so the real HTTP call never fires.
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

import { webSearch } from "../tools";
import { tavily } from "@tavily/core";

beforeEach(() => {
  vi.clearAllMocks(); // reset call counts so results[0] is always this test's call
  vi.unstubAllEnvs();
});

describe("webSearch", () => {
  it("throws when TAVILY_API_KEY is not set", async () => {
    vi.stubEnv("TAVILY_API_KEY", "");
    await expect(webSearch("test query")).rejects.toThrow("TAVILY_API_KEY");
  });

  it("returns a SearchResponse with the correct shape", async () => {
    vi.stubEnv("TAVILY_API_KEY", "test-key");
    const result = await webSearch("TypeScript tips");

    expect(result.query).toBe("TypeScript tips");
    expect(result.results).toHaveLength(2);
    expect(result.results[0]).toEqual({
      title:   "Result One",
      url:     "https://example.com/1",
      content: "Content one",
    });
  });

  it("passes the query and basic searchDepth to Tavily", async () => {
    vi.stubEnv("TAVILY_API_KEY", "test-key");
    await webSearch("India GDP 2025");

    const mockClient = (tavily as ReturnType<typeof vi.fn>).mock.results[0].value;
    expect(mockClient.search).toHaveBeenCalledWith(
      "India GDP 2025",
      expect.objectContaining({ searchDepth: "basic" })
    );
  });
});
