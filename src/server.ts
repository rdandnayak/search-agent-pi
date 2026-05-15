import express from "express";
import * as path from "path";
import OpenAI from "openai";
import { streamAnswer, Message } from "./agent";
import { config } from "./config";
import type { SearchResponse } from "./tools";

const openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const app = express();
app.use(express.json());
app.use(express.static(path.join(process.cwd(), "public")));

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// POST /chat
//
// Body:  { messages: [{ role: "user"|"assistant", content: string }] }
//
// Response: NDJSON stream — one JSON object per line:
//   { type: "status",  message: "Searching…" }  — tool activity
//   { type: "text",    text: "..." }             — streamed text chunk
//   { type: "sources", sources: [...] }          — deduplicated search sources
//   { type: "done" }                             — stream finished
//   { type: "error",   message: "..." }          — something went wrong
//
// Stateless: client owns history and sends it in full each request.
app.post("/chat", async (req, res) => {
  const { messages } = req.body as { messages: Message[] };

  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "messages must be a non-empty array" });
    return;
  }

  res.setHeader("Content-Type", "application/x-ndjson");
  res.setHeader("Cache-Control", "no-cache");

  const send = (obj: object) => res.write(JSON.stringify(obj) + "\n");
  const sources: Array<{ title: string; url: string }> = [];

  try {
    const stream = await streamAnswer(messages);

    for await (const event of stream.fullStream) {
      if (event.type === "tool-call") {
        if (event.toolName === "webSearch") {
          const { query } = event.input as { query: string };
          send({ type: "status", message: `Searching: "${query}"…` });
        } else if (event.toolName === "calculate") {
          const { expression } = event.input as { expression: string };
          send({ type: "status", message: `Calculating: ${expression}…` });
        } else if (event.toolName === "readUrl") {
          const { url } = event.input as { url: string };
          send({ type: "status", message: `Reading: ${url}…` });
        } else if (event.toolName === "weather") {
          const { city } = event.input as { city: string };
          send({ type: "status", message: `Getting weather for ${city}…` });
        } else if (event.toolName === "reflect") {
          send({ type: "status", message: "Reflecting…" });
        }
      } else if (event.type === "tool-result") {
        if (event.toolName === "webSearch") {
          const result = event.output as SearchResponse;
          for (const r of result.results) sources.push({ title: r.title, url: r.url });
        }
        send({ type: "status", message: "Thinking…" });
      } else if (event.type === "text-delta") {
        send({ type: "text", text: event.text });
      }
    }

    const seen = new Set<string>();
    const unique = sources.filter(({ url }) => !seen.has(url) && seen.add(url) as unknown as boolean);
    send({ type: "sources", sources: unique });
    send({ type: "done" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    send({ type: "error", message });
  }

  res.end();
});

// POST /transcribe
//
// Body:  raw audio binary (audio/webm, audio/ogg, audio/mp4 …)
// Response: { transcript: string }
//
// Forwards to OpenAI Whisper. The browser sends whatever MediaRecorder
// produces (typically audio/webm;codecs=opus). Whisper accepts all common
// browser audio formats and handles Indian-accent English well.
app.post(
  "/transcribe",
  express.raw({ type: "audio/*", limit: "25mb" }),
  async (req, res) => {
    if (!req.body || !Buffer.isBuffer(req.body) || req.body.length === 0) {
      res.status(400).json({ error: "No audio data received" });
      return;
    }

    const mimeType = (req.headers["content-type"] ?? "audio/webm").split(";")[0];
    const ext = mimeType.includes("ogg") ? "ogg" : mimeType.includes("mp4") ? "mp4" : "webm";

    try {
      const file = new File([req.body as unknown as BlobPart], `audio.${ext}`, { type: mimeType });
      const transcription = await openaiClient.audio.transcriptions.create({
        file,
        model: "whisper-1",
        language: "en",
        // Vocabulary hint — primes Whisper for Indian-accent English.
        // Use a word list, not a sentence: Whisper "continues" sentences
        // when audio is ambiguous, which leaks prompt text into the output.
        prompt: "India, Bangalore, Mumbai, Delhi, rupees, lakhs, crores",
      });
      res.json({ transcript: transcription.text });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  }
);

// Only start listening when run directly (not when imported in tests).
if (require.main === module) {
  app.listen(config.port, () => {
    console.log(`Search Agent API  →  http://localhost:${config.port}`);
    console.log(`Web UI            →  http://localhost:${config.port}/`);
  });
}

export { app };
