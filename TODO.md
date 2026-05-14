# Search Agent — Build Roadmap

## ✅ Phase 1 — Project Setup + Streaming CLI
- [x] npm init, TypeScript, Vercel AI SDK
- [x] `src/agent.ts` — LLM call + streaming
- [x] `src/cli.ts` — readline loop + history
- [x] Env var setup (.env.example)

---

## Phase 2 — Tavily Web Search Tool
Goal: agent can call a real web search and include results in its answer.

- [ ] Install `@tavily/core`
- [ ] Add `TAVILY_API_KEY` to `.env.example`
- [ ] Create `src/tools.ts` — `webSearch(query)` calls Tavily, returns results
- [ ] Register tool in `agent.ts` using Vercel AI SDK `tools:` option
- [ ] Agent now decides *when* to search (tool-calling, not hardcoded)

**What you learn:** how LLM tool-calling works — the model emits a
"call this tool" intent, you run it, you feed results back, model continues.

---

## Phase 3 — Citations / Sources
Goal: show the user which URLs the answer came from.

- [ ] Tavily results include `url` + `title` — collect them during tool calls
- [ ] Print a "Sources:" section after the streamed answer in `cli.ts`
- [ ] Deduplicate sources if the same URL was fetched multiple times

**What you learn:** separating *retrieval metadata* from *generated text*,
and why citations matter for trust in AI answers.

---

## Phase 4 — Iterative Search Loop
Goal: agent can search → read results → decide to search again if needed.

- [ ] Switch `streamText` to `generateText` with `maxSteps` (Vercel AI SDK
      supports multi-step tool loops natively)
- [ ] Agent automatically loops: search → reason → search again → answer
- [ ] Add a step counter so the user can see "Searching (step 2/5)…"
- [ ] Cap max steps to avoid runaway loops

**What you learn:** agentic loops — the difference between a single LLM
call and a multi-step reasoning + acting cycle.

---

## Phase 5 — Reflection Step
Goal: agent explicitly decides "do I have enough info, or should I search more?"

- [ ] Add a `reflect` tool (or system prompt instruction) that forces the
      agent to reason about answer completeness before responding
- [ ] If reflection says "not enough", trigger another search round
- [ ] Show reflection reasoning in the terminal (behind a --verbose flag)

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
