import { describe, it, expect, vi } from "vitest";
import request from "supertest";

// Mock agent.ts so no real LLM or search calls are made.
// mockImplementation (not mockResolvedValue) so a fresh generator is created
// on every call — generators are one-shot and would be exhausted after the first test.
vi.mock("../agent", () => ({
  streamAnswer: vi.fn().mockImplementation(async () => ({
    fullStream: (async function* () {
      yield { type: "text-delta", text: "Hello " };
      yield { type: "text-delta", text: "world." };
    })(),
  })),
  summarizeHistory: vi.fn(),
}));

// Vitest hoists vi.mock() calls before imports, so the mock is in place
// by the time server.ts is evaluated — no dynamic import needed.
import { app } from "../server";

// Parse a raw NDJSON response body into an array of objects.
function parseNdjson(body: string) {
  return body
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
}

describe("GET /health", () => {
  it("returns { status: ok }", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});

describe("POST /chat", () => {
  it("returns 400 when messages is missing", async () => {
    const res = await request(app).post("/chat").send({});
    expect(res.status).toBe(400);
  });

  it("returns 400 when messages is an empty array", async () => {
    const res = await request(app).post("/chat").send({ messages: [] });
    expect(res.status).toBe(400);
  });

  it("streams text events then sources then done", async () => {
    const res = await request(app)
      .post("/chat")
      .send({ messages: [{ role: "user", content: "hi" }] });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch("ndjson");

    const events = parseNdjson(res.text);
    const types  = events.map((e) => e.type);

    expect(types).toContain("text");
    expect(types).toContain("sources");
    expect(types.at(-1)).toBe("done");
  });

  it("concatenates streamed text chunks into the full response", async () => {
    const res    = await request(app)
      .post("/chat")
      .send({ messages: [{ role: "user", content: "hi" }] });

    const events  = parseNdjson(res.text);
    const fullText = events
      .filter((e) => e.type === "text")
      .map((e) => e.text)
      .join("");

    expect(fullText).toBe("Hello world.");
  });
});
