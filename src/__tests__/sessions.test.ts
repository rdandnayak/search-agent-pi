import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { appendMessage, loadSession, sessionSummary } from "../sessions";
import type { Message } from "../agent";

// Each test gets its own isolated temp directory — no shared state between tests.
let tmpDir: string;
let tmpFile: string;

beforeEach(() => {
  tmpDir  = fs.mkdtempSync(path.join(os.tmpdir(), "sessions-test-"));
  tmpFile = path.join(tmpDir, "test.jsonl");
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("appendMessage", () => {
  it("creates the file and writes a valid JSON line", () => {
    const msg: Message = { role: "user", content: "hello" };
    appendMessage(tmpFile, msg);

    const lines = fs.readFileSync(tmpFile, "utf-8").trim().split("\n");
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toEqual(msg);
  });

  it("appends multiple messages as separate lines", () => {
    const messages: Message[] = [
      { role: "user",      content: "first"  },
      { role: "assistant", content: "second" },
      { role: "user",      content: "third"  },
    ];
    messages.forEach((m) => appendMessage(tmpFile, m));

    const lines = fs.readFileSync(tmpFile, "utf-8").trim().split("\n");
    expect(lines).toHaveLength(3);
    lines.forEach((line, i) => expect(JSON.parse(line)).toEqual(messages[i]));
  });
});

describe("loadSession", () => {
  it("round-trips messages written by appendMessage", () => {
    const messages: Message[] = [
      { role: "user",      content: "What is TypeScript?" },
      { role: "assistant", content: "A typed superset of JavaScript." },
    ];
    messages.forEach((m) => appendMessage(tmpFile, m));

    expect(loadSession(tmpFile)).toEqual(messages);
  });

  it("ignores blank lines without throwing", () => {
    fs.writeFileSync(tmpFile, '{"role":"user","content":"hi"}\n\n{"role":"assistant","content":"hey"}\n');
    expect(loadSession(tmpFile)).toHaveLength(2);
  });
});

describe("sessionSummary", () => {
  it("reports the correct exchange count", () => {
    const messages: Message[] = [
      { role: "user",      content: "Q1" },
      { role: "assistant", content: "A1" },
      { role: "user",      content: "Q2" },
      { role: "assistant", content: "A2" },
    ];
    messages.forEach((m) => appendMessage(tmpFile, m));

    // 4 messages = 2 exchanges
    expect(sessionSummary(tmpFile)).toMatch("2 exchanges");
  });

  it("returns a fallback string for a missing file", () => {
    const missing = path.join(tmpDir, "nonexistent.jsonl");
    // Should not throw — just return something readable
    expect(() => sessionSummary(missing)).not.toThrow();
  });
});
