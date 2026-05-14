import { streamText, generateText, tool, zodSchema, stepCountIs } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { webSearch } from "./tools";

export type Message = {
  role: "user" | "assistant";
  content: string;
};

export const MAX_STEPS = 8;

// When inputTokens from the last call exceeds this, compress old turns.
// 6000 tokens ≈ 10–15 back-and-forth exchanges — well within gpt-4o's
// 128k window, but trimming early keeps costs predictable.
export const TOKEN_TRIM_THRESHOLD = 6000;

// How many recent turns to keep verbatim after compression (must be even
// so we always preserve complete user/assistant pairs).
export const KEEP_TURNS = 4;

// Summarises a slice of conversation history into a single paragraph.
// Called by cli.ts when history grows past TOKEN_TRIM_THRESHOLD.
// Uses generateText (non-streaming) since this is a background operation.
export async function summarizeHistory(turns: Message[]): Promise<string> {
  const model = process.env.OPENAI_MODEL ?? "gpt-4o";
  const conversation = turns
    .map((t) => `${t.role === "user" ? "User" : "Assistant"}: ${t.content}`)
    .join("\n\n");

  const { text } = await generateText({
    model: openai(model),
    prompt: `Summarize the following conversation concisely. Preserve all key facts, questions asked, and important answers:\n\n${conversation}`,
  });

  return text;
}

export async function streamAnswer(messages: Message[]) {
  const model = process.env.OPENAI_MODEL ?? "gpt-4o";

  const result = streamText({
    model: openai(model),
    system: `You are a helpful research assistant with access to web search.
The user is based in Bangalore, India.
Today's date is ${new Date().toDateString()}.

IMPORTANT — your training data is outdated. For any of the following, you MUST search and never answer from memory:
- Product releases, latest models, or "which is newest" questions
- Prices (always search for current India pricing in ₹)
- Current events, news, or recent announcements

When searching for products or releases:
- Always include the current year in your query (e.g. "latest iPhone 2025 India")
- If results mention a model you didn't know about, that is the correct answer — do not second-guess it
- Prefer results relevant to India; show prices in Indian Rupees (₹)

After each round of searching, call the reflect tool to assess whether you
have enough information to give a complete and accurate answer.
- If hasEnoughInfo is false, do another webSearch with a more targeted query.
- If hasEnoughInfo is true, write your final answer immediately after.
Do not mention either tool by name in your response.`,
    messages,
    tools: {
      webSearch: tool({
        description:
          "Search the web for up-to-date information on a topic. " +
          "Use a specific, focused query for best results.",
        inputSchema: zodSchema(
          z.object({
            query: z.string().describe("A specific, focused search query"),
          })
        ),
        execute: async (input) => webSearch(input.query),
      }),

      // The reflect tool is a structured "think out loud" checkpoint.
      // It has no side effects — execute() just echoes the decision back.
      // Its value is making the agent's reasoning observable (visible in
      // debug mode) and giving the model a clear moment to decide whether
      // to search more or answer now, rather than guessing when to stop.
      reflect: tool({
        description:
          "Assess whether your current search results are sufficient to give " +
          "a complete, accurate answer. Call this after every search round.",
        inputSchema: zodSchema(
          z.object({
            reasoning: z
              .string()
              .describe("What you know so far and what might still be missing"),
            hasEnoughInfo: z
              .boolean()
              .describe("True if you can answer fully; false if more searching is needed"),
          })
        ),
        execute: async (input) => ({
          decision: input.hasEnoughInfo ? "answer" : "search_more",
        }),
      }),
    },
    stopWhen: stepCountIs(MAX_STEPS),
  });

  return result;
}
