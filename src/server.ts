import express from "express";
import * as dotenv from "dotenv";
import { streamAnswer, Message } from "./agent";
import type { SearchResponse } from "./tools";

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT ?? 3000;

// Health check — useful for confirming the server is up.
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// POST /chat
//
// Body:  { messages: [{ role: "user"|"assistant", content: string }] }
//
// Response: NDJSON stream — one JSON object per line:
//   { type: "text",    text: "..." }       — streamed text chunk
//   { type: "sources", sources: [...] }    — deduplicated search sources
//   { type: "done" }                       — stream finished
//   { type: "error",   message: "..." }    — something went wrong
//
// The server is stateless — the client sends the full message history each
// request and appends the assistant reply to its own history. Same model
// as the OpenAI Chat API.
app.post("/chat", async (req, res) => {
  const { messages } = req.body as { messages: Message[] };

  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "messages must be a non-empty array" });
    return;
  }

  // NDJSON: each write is a complete JSON line.
  // Chunked transfer encoding is set automatically by Express when you
  // call res.write() before res.end().
  res.setHeader("Content-Type", "application/x-ndjson");
  res.setHeader("Cache-Control", "no-cache");

  const send = (obj: object) => res.write(JSON.stringify(obj) + "\n");

  const sources: Array<{ title: string; url: string }> = [];

  try {
    const stream = await streamAnswer(messages);

    for await (const event of stream.fullStream) {
      if (event.type === "text-delta") {
        send({ type: "text", text: event.text });
      } else if (event.type === "tool-result" && event.toolName === "webSearch") {
        const result = event.output as SearchResponse;
        for (const r of result.results) {
          sources.push({ title: r.title, url: r.url });
        }
      }
    }

    // Deduplicate by URL before sending.
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

app.listen(PORT, () => {
  console.log(`Search Agent API listening on http://localhost:${PORT}`);
  console.log(`  POST /chat  — stream a response`);
  console.log(`  GET  /health — health check\n`);
});
