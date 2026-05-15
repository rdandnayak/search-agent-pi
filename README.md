# Search Agent

A personal CLI + web search agent built with Node.js, TypeScript, Vercel AI SDK, and Tavily.

## Prerequisites

Copy `.env.example` to `.env` and fill in your keys:

```bash
cp .env.example .env
```

```
OPENAI_API_KEY=sk-...
TAVILY_API_KEY=tvly-...
OPENAI_MODEL=gpt-4o        # optional, defaults to gpt-4o
```

---

## Run with Docker (recommended)

Requires [Docker Desktop](https://www.docker.com/products/docker-desktop/) or Docker Engine.

```bash
docker compose up
```

- Web UI → http://localhost:3000
- API → `POST http://localhost:3000/chat`
- Sessions are saved to `./sessions/` on your machine

To rebuild after code changes:

```bash
docker compose up --build
```

---

## Run locally (CLI)

Requires Node.js 20+.

```bash
npm install
npm run dev              # interactive CLI with spinner
npm run dev -- --debug   # verbose mode — shows tool calls, reflection steps
npm run server           # HTTP API + web UI on port 3000
```

---

## Commands

| Command | What it does |
|---------|-------------|
| `npm run dev` | Interactive CLI |
| `npm run dev -- --debug` | CLI with step-by-step trace |
| `npm run dev -- --session <file>` | Resume a saved session |
| `npm run server` | HTTP API + web UI |
| `npm test` | Run all tests |
| `npm run build` | Compile TypeScript → `dist/` |

---

## API

```bash
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Latest iPhone price in India?"}]}' \
  --no-buffer
```

Response is NDJSON — one JSON event per line:

```json
{"type":"status","message":"Searching: \"latest iPhone 2025 India\"…"}
{"type":"text","text":"The iPhone 17 starts at ₹79,900…"}
{"type":"sources","sources":[{"title":"...","url":"..."}]}
{"type":"done"}
```

---

## Tuning

All agent behaviour is controlled from [`src/config.ts`](src/config.ts):

| Value | Default | Effect |
|-------|---------|--------|
| `model` | `gpt-4o` | LLM model (override with `OPENAI_MODEL` env var) |
| `maxSteps` | `8` | Max search+reflect cycles per question |
| `searchDepth` | `basic` | `basic` = fast/cheap, `advanced` = deeper scraping |
| `maxSearchResults` | `5` | Tavily results per query |
| `tokenTrimThreshold` | `6000` | Compress history after this many input tokens |
| `defaultCity` | `Bangalore` | Default city for weather queries |
