# Search Agent — Build Roadmap

## ✅ Phase 1 — Project Setup + Streaming CLI
- [x] npm init, TypeScript, Vercel AI SDK
- [x] `src/agent.ts` — LLM call + streaming
- [x] `src/cli.ts` — readline loop + history
- [x] Env var setup (.env.example)

---

## ✅ Phase 2 — Tavily Web Search Tool
Goal: agent can call a real web search and include results in its answer.

- [x] Install `@tavily/core`
- [x] Add `TAVILY_API_KEY` to `.env.example`
- [x] Create `src/tools.ts` — `webSearch(query)` calls Tavily, returns results
- [x] Register tool in `agent.ts` using Vercel AI SDK `tools:` option
- [x] Agent now decides *when* to search (tool-calling, not hardcoded)

**What you learn:** how LLM tool-calling works — the model emits a
"call this tool" intent, you run it, you feed results back, model continues.

---

## ✅ Phase 3 — Citations / Sources
Goal: show the user which URLs the answer came from.

- [x] Tavily results include `url` + `title` — collect them during tool calls
- [x] Print a "Sources:" section after the streamed answer in `cli.ts`
- [x] Deduplicate sources if the same URL was fetched multiple times

**What you learn:** separating *retrieval metadata* from *generated text*,
and why citations matter for trust in AI answers.

---

## ✅ Phase 4 — Iterative Search Loop
Goal: agent can search → read results → decide to search again if needed.

- [x] `streamText` + `stopWhen: stepCountIs(MAX_STEPS)` handles the loop natively in SDK v6 (no need to switch to `generateText` — that would lose streaming)
- [x] Agent automatically loops: search → reason → search again → answer
- [x] Step counter shown in spinner: "Searching (2/5): query…"
- [x] Loop capped via `MAX_STEPS = 5` exported from `agent.ts`

**What you learn:** agentic loops — the difference between a single LLM
call and a multi-step reasoning + acting cycle.

---

## ✅ Phase 5 — Reflection Step
Goal: agent explicitly decides "do I have enough info, or should I search more?"

- [x] Added `reflect` tool with `{ reasoning, hasEnoughInfo }` input
- [x] System prompt instructs agent to call reflect after each search round
- [x] If `hasEnoughInfo` is false, agent does another webSearch
- [x] Reasoning shown in `--debug` mode; "Reflecting…" spinner in normal mode

**What you learn:** chain-of-thought and self-evaluation — a simple form
of the "ReAct" pattern (Reason + Act).

---

## ✅ Phase 6 — Conversation Memory Trim
Goal: long conversations don't blow up the context window or cost too much.

- [x] `await stream.usage` captures `inputTokens` after each turn
- [x] When `inputTokens > TOKEN_TRIM_THRESHOLD` (6000), `summarizeHistory()` compresses old turns via a separate `generateText` call
- [x] Last `KEEP_TURNS` (4) turns kept verbatim; older turns replaced with summary + ack pair

**What you learn:** context window management — a real production concern
for any long-running agent.

---

## ✅ Phase 7 — Save Sessions to Disk
Goal: resume a conversation after restarting the CLI.

- [x] Each turn appends to `sessions/<timestamp>.jsonl` immediately (crash-safe)
- [x] On startup, prompts to resume most recent session if one exists
- [x] `--session <file>` flag to load a specific past session
- [x] New file per run; loaded history is mirrored into the new file so it's self-contained

**What you learn:** simple persistence without a database, JSONL format
for append-only logs.

---

## ✅ Phase 8 — Expose as HTTP API
Goal: the same agent logic, callable over HTTP (no CLI needed).

- [x] Installed `express` + `@types/express`
- [x] `src/server.ts` — POST `/chat` streams NDJSON (one JSON event per line)
- [x] `agent.ts` unchanged — confirmed the Phase 1 separation pays off
- [x] GET `/health` for sanity checks

**What you learn:** why the agent/CLI separation from Phase 1 pays off —
you swap `cli.ts` for `server.ts` and the core logic is untouched.

---

## ✅ Phase 9 — Simple Web UI (optional stretch)
Goal: a minimal browser chat interface backed by the Phase 8 API.

- [x] `public/index.html` — plain HTML + vanilla JS, no framework, no build step
- [x] `fetch` + `ReadableStream` to parse NDJSON line by line as it arrives
- [x] Status line updates in place ("Searching…", "Reflecting…", "Thinking…")
- [x] Sources shown as clickable links below each assistant bubble
- [x] `server.ts` now emits `status` events for tool calls and serves `public/`

**What you learn:** streaming HTTP responses in the browser, and how a
thin UI layer sits cleanly on top of an existing API.

---

## ✅ Phase 10 — Tests
Goal: make refactoring safe — change anything without fear of silent breakage.

- [x] Installed Vitest + supertest
- [x] `src/__tests__/sessions.test.ts` — append/load round-trip, blank line handling, summary count
- [x] `src/__tests__/tools.test.ts` — mock Tavily, assert SearchResponse shape, missing API key throws
- [x] `src/__tests__/server.test.ts` — mock streamAnswer, assert NDJSON event sequence + full text
- [x] `server.ts` exports `app`; `listen()` only runs when executed directly

**Why before adding more features:** without tests, every new phase risks
breaking something in a previous one silently.

---

## ✅ Phase 11 — Config File
Goal: tune agent behaviour without hunting through source files.

- [x] `src/config.ts` centralises all tunable values with documented safe ranges
- [x] `config.ts` also owns `dotenv.config()` — env vars loaded in one place
- [x] `agent.ts`, `tools.ts`, `server.ts`, `cli.ts` all import from `config`
- [x] Tests updated — stale constant stubs removed from server mock

**Why it matters:** right now changing agent behaviour means knowing which
of 3 files to edit. A single config surface makes experimentation fast.

---

## ✅ Phase 12 — More Tools
Goal: expand what the agent can actually do beyond web search.

- [x] **Calculator** — `calculate(expression)` via mathjs; prevents LLM arithmetic errors
- [x] **URL reader** — `readUrl(url)` strips HTML to plain text; capped at `config.urlReadMaxChars`
- [x] **Weather** — `getWeather(city)` via Open-Meteo (free, no key); defaults to `config.defaultCity`
- [x] All three wired into `agent.ts` tools + display in `cli.ts` spinner + `server.ts` status events
- [x] 11 new tests added; 24/24 passing

**Why these three:** calculator prevents hallucinated maths, URL reader lets
the agent read specific pages, weather is a useful zero-cost addition.

---

## ✅ Phase 15 — Docker
Goal: run the agent on any machine without installing Node or managing `.env` manually.

- [x] Multi-stage `Dockerfile` — builder stage compiles TS, runtime stage has only production deps
- [x] `docker-compose.yml` — mounts `.env`, exposes port 3000, persists `sessions/` as a volume
- [x] `README.md` — one-command setup, API reference, config table
- [x] `.dockerignore` — excludes node_modules, dist, .env, sessions from build context
- [x] Fixed: test files excluded from `tsconfig.json` build + Vitest scoped to `src/` only

**Why useful:** upgrade the app by rebuilding the image; run it on a home
server or small VPS without environment setup every time.

---

## Backlog

### Model Switching (was Phase 13)
- Add `MODEL_PROVIDER` env var (`openai` | `anthropic`), install `@ai-sdk/anthropic`
- Select provider in `agent.ts` based on config — rest of the code unchanged

### Conversation Export (was Phase 14)
- `export` command in CLI writes current session to `exports/<timestamp>.md`
- Formatted as Q&A with sources inline under each answer
