# Copilot / AI Agent Instructions

Purpose: quick, actionable guidance so an AI coding assistant can be immediately productive.

- **Big picture:** This is a small CLI-first streaming search agent.
  - `src/cli.ts` implements the interactive prompt loop, spinner, and manages `history`.
  - `src/agent.ts` wraps LLM calls using the Vercel AI SDK (`streamText`) and the `@ai-sdk/openai` provider.
  - The app streams tokens to the terminal instead of waiting for full responses.

- **How to run (local):**
  - Dev (run directly with tsx): `npm run dev` (runs `tsx src/cli.ts`).
  - Build: `npm run build` (runs `tsc`).
  - Start built: `npm run start` -> `node dist/cli.js`.

- **Key conventions & patterns to preserve**
  - Explicit `Message` type in `src/agent.ts` (`role: 'user'|'assistant', content: string`). Keep this shape when changing the data passed to the LLM.
  - Caller-owned history: `cli.ts` pushes the user turn before calling `streamAnswer()` and pushes the assistant response after successful streaming. On error, it removes the last user turn. Follow this push/pop pattern to avoid polluting conversation history.
  - Streaming model usage: `streamText({...})` returns an object with `textStream` that is an async iterable. The CLI loops `for await (const chunk of stream.textStream)` to write chunks to stdout. Preserve first-chunk/clear-spinner behavior.
  - Environment loading: `dotenv.config()` is called at the top of `src/cli.ts`. Keep env-driven config (e.g. `OPENAI_MODEL`).

- **Integration points & dependencies**
  - LLM SDK: `@ai-sdk/openai` + `ai` (see `package.json`). Expect standard provider env vars (API keys) to be read via `.env`.
  - Future tool integrations live in the TODO roadmap: see `TODO.md` for planned `Tavily` web search tool, session persistence, and HTTP server split. If adding tools, prefer creating `src/tools.ts` and registering via the SDK's `tools:` option (see TODO Phase 2 notes).

- **Editing guidance / safe changes**
  - If you modify `streamAnswer()` to use a different SDK method (e.g. `generateText`), keep the streaming contract or update the CLI consumer accordingly.
  - Preserve the spinner/first-chunk logic in `src/cli.ts` (use `stopSpinner()` before printing the initial label).
  - Maintain explicit error-handling: on stream failure, log the error, pop the last user message, and continue the loop.

- **Files to inspect for context**
  - `src/agent.ts` — LLM call interface and `Message` type.
  - `src/cli.ts` — interactive prompt loop, spinner, and streaming consumption.
  - `package.json` — scripts: `dev`, `build`, `start` and dependencies.
  - `TODO.md` — roadmap and conventions for tool-calling and session persistence.

- **Quick examples (copyable)**
  - Run locally (dev):

```bash
npm run dev
```

  - Build + run:

```bash
npm run build
npm run start
```

- **What I did / merge note**
  - No existing copilot instructions were found; this file was added to centralize knowledge specific to this repo.

If anything here is unclear or you want more detailed rules (commit message style, branching, testing conventions), tell me which areas to expand.
