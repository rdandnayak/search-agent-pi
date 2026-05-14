import { streamText, tool, zodSchema, stepCountIs } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { webSearch } from "./tools";

export type Message = {
  role: "user" | "assistant";
  content: string;
};

export const MAX_STEPS = 8;

export async function streamAnswer(messages: Message[]) {
  const model = process.env.OPENAI_MODEL ?? "gpt-4o";

  const result = streamText({
    model: openai(model),
    system: `You are a helpful research assistant with access to web search.
The user is based in Bangalore, India.
- Always show prices in Indian Rupees (₹). If a search returns USD prices, convert or search again for India-specific pricing.
- When searching for products, availability, or services, prefer results relevant to India.
- Tailor search queries to India where applicable (e.g. "iPhone 16 price in India" not just "iPhone 16 price").

Use the webSearch tool when the user's question needs current information,
recent events, specific facts, or anything you are not confident about.

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
