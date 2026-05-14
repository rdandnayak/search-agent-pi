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

## Phase 6 — Conversation Memory Trim
Goal: long conversations don't blow up the context window or cost too much.

- [ ] Track total token count using `usage` from the Vercel AI SDK response
- [ ] When history exceeds a threshold, summarize older turns into one
      "summary" message using a separate LLM call
- [ ] Keep the last N turns verbatim, replace older turns with the summary

**What you learn:** context window management — a real production concern
for any long-running agent.

---

## Phase 7 — Save Sessions to Disk
Goal: resume a conversation after restarting the CLI.

- [ ] On each turn, append to `sessions/<timestamp>.jsonl`
- [ ] On startup, offer to load the most recent session
- [ ] `--session <file>` flag to load a specific past session

**What you learn:** simple persistence without a database, JSONL format
for append-only logs.

---

## Phase 8 — Expose as HTTP API
Goal: the same agent logic, callable over HTTP (no CLI needed).

- [ ] Install `express` + `@types/express`
- [ ] Create `src/server.ts` — POST `/chat` accepts `{ messages }`, streams
      back the response using chunked transfer encoding
- [ ] `agent.ts` stays unchanged — only `server.ts` is new
- [ ] Test with `curl` or a REST client

**What you learn:** why the agent/CLI separation from Phase 1 pays off —
you swap `cli.ts` for `server.ts` and the core logic is untouched.

---

## Phase 9 — Simple Web UI (optional stretch)
Goal: a minimal browser chat interface backed by the Phase 8 API.

- [ ] Plain HTML + vanilla JS — no React, no framework
- [ ] `fetch` the `/chat` endpoint, render streamed chunks with
      `ReadableStream`
- [ ] Show sources as clickable links below each answer

**What you learn:** streaming HTTP responses in the browser, and how a
thin UI layer sits cleanly on top of an existing API.
