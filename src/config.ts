import * as dotenv from "dotenv";

// Load .env before any process.env reads happen.
// config.ts is imported early in the module graph, so this runs first.
dotenv.config();

export const config = {
  // ── Model ──────────────────────────────────────────────────────────────
  // Which OpenAI model to use. gpt-4o is the default — good balance of
  // speed and quality. Switch to gpt-4o-mini to cut cost during development.
  model: process.env.OPENAI_MODEL ?? "gpt-4o",

  // ── Agent loop ─────────────────────────────────────────────────────────
  // Maximum LLM steps (each search + reflect = 2 steps).
  // 8 allows up to 3 search-reflect cycles before forcing a final answer.
  // Raise for deep research tasks; lower to save tokens on simple queries.
  maxSteps: 8,

  // Compress conversation history when inputTokens exceeds this.
  // 6000 ≈ 10–15 exchanges. gpt-4o supports 128k, so this is conservative.
  // Lower to 2000–3000 to test the compression logic quickly.
  tokenTrimThreshold: 6000,

  // How many recent turns to keep verbatim after compression (must be even
  // to preserve complete user/assistant pairs).
  keepTurns: 4,

  // ── Search ─────────────────────────────────────────────────────────────
  // "basic" is faster and cheaper; "advanced" does deeper page scraping.
  // Stick with "basic" unless results are consistently shallow.
  searchDepth: "basic" as "basic" | "advanced",

  // Number of Tavily results per query. 5 is a good default —
  // more results = more context but also more tokens sent to the LLM.
  maxSearchResults: 5,

  // Request image URLs alongside search results. Tavily returns direct image
  // URLs (not page links) which the agent can embed as markdown images.
  includeImages: true,

  // Drop results whose Tavily relevance score is below this threshold (0–1).
  // 0.3 removes clearly off-topic results while keeping borderline ones.
  // Set to 0 to disable filtering entirely.
  minSearchScore: 0.3,

  // Drop results whose publishedDate is older than this many days.
  // Undated (evergreen) results are always kept.
  // Fallback: if < 2 results survive filtering, all results are returned.
  resultMaxAgeDays: 30,

  // ── URL reader ─────────────────────────────────────────────────────────
  // Max characters of page content sent to the LLM. Higher = more context
  // but more tokens. 5000 covers most article intros and product pages.
  urlReadMaxChars: 5000,

  // ── Weather ────────────────────────────────────────────────────────────
  // Fallback city when the user asks about weather without specifying one.
  defaultCity: "Bangalore",

  // ── Server ─────────────────────────────────────────────────────────────
  port: Number(process.env.PORT ?? 3000),
};
