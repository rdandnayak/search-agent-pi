# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev              # run normally with spinner
npm run dev -- --debug   # verbose debug mode (suppresses spinner, prints trace lines)
npm run build            # tsc compile → dist/
npm run start            # run compiled dist/cli.js
npx tsc --noEmit         # type-check without emitting
```

No test runner is configured yet.

## Architecture

Three files, strict separation of concerns:

- **`src/cli.ts`** — readline loop, spinner, `history` array. Knows nothing about LLM or search APIs. Owns the push/pop pattern: pushes the user turn before calling `streamAnswer`, pushes the assistant response on success, pops the user turn on error.
- **`src/agent.ts`** — wraps `streamText` from the Vercel AI SDK. Registers tools, owns the system prompt, sets `stopWhen`. No readline or terminal code.
- **`src/tools.ts`** — calls Tavily. No LLM knowledge. Returns `SearchResponse` (query + results array). Swapping search providers only touches this file.

The separation means `agent.ts` can be imported by a future HTTP server without changes.

## AI SDK v6 API (differs from older docs and v4 examples)

This project uses `ai@6.x` which has breaking changes from v4:

| Concept | v4 (old) | v6 (current) |
|---------|----------|---------------|
| Tool schema | `parameters: z.object(...)` | `inputSchema: zodSchema(z.object(...))` |
| Tool call arg field | `event.args` | `event.input` |
| Text chunk field | `event.textDelta` | `event.text` |
| Loop cap | `maxSteps: N` | `stopWhen: stepCountIs(N)` |
| Tool result field | `result` | `output` |

`fullStream` emits: `start-step`, `tool-call`, `tool-result`, `finish-step`, `text-delta`, `error`. The CLI handles all of these in a `switch` block.

## Key conventions

**Readline setup**: `terminal: false` is required on the readline interface. With `output: process.stdout`, readline's internal terminal management overwrites the spinner's `\r`-based frames. With `terminal: false`, readline stays out of stdout — prompts are written manually via `process.stdout.write`.

**Spinner lifecycle**: `startSpinner` returns a `stop()` function. The stop function must be called before any `process.stdout.write` or `console.log`, otherwise the `\r` clear writes over output. Lifecycle: `Thinking…` → (tool-call) → `Searching: "query"…` → (tool-result) → `Thinking…` → (text-delta) → cleared.

**System prompt personalisation**: The system prompt in `agent.ts` hardcodes Bangalore, India as the user's location. Price queries default to ₹/INR. Search queries are India-localised.

**Debug flag**: `--debug` suppresses the spinner and prints `  › tool called` / `  › tool result received` lines to stdout instead. Controlled by `process.argv.includes("--debug")` in `cli.ts`.

## Environment variables

```
OPENAI_API_KEY     # required
OPENAI_MODEL       # optional, defaults to gpt-4o
TAVILY_API_KEY     # required for web search
```
