import express from "express";
import * as path from "path";
import { streamAnswer, Message } from "./agent";
import { config } from "./config";
import type { SearchResponse } from "./tools";

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
          const query = (event.input as { query: string }).query;
          send({ type: "status", message: `Searching: "${query}"…` });
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

// Only start listening when run directly (not when imported in tests).
if (require.main === module) {
  app.listen(config.port, () => {
    console.log(`Search Agent API  →  http://localhost:${config.port}`);
    console.log(`Web UI            →  http://localhost:${config.port}/`);
  });
}

export { app };
