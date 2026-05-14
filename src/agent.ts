import { streamText, tool, zodSchema, stepCountIs } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { webSearch } from "./tools";

export type Message = {
  role: "user" | "assistant";
  content: string;
};

// streamAnswer sends the conversation + available tools to the LLM.
//
// How tool-calling works in AI SDK v6:
//   1. The model sees tool definitions (name, description, inputSchema).
//   2. Instead of replying with text, it can emit a tool-call with an `input` object.
//   3. execute() runs automatically and the result is fed back to the model.
//   4. The model continues — possibly calling tools again, or writing the final answer.
//   5. stopWhen: stepCountIs(5) caps how many rounds can happen.
//
// The model decides *when* (and if) to search. We never hardcode "always search".
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
After searching, synthesize the results into a clear, accurate answer.
Do not mention the tool by name in your response.`,
    messages,
    tools: {
      webSearch: tool({
        description:
          "Search the web for up-to-date information on a topic. " +
          "Use a specific, focused query for best results.",
        // AI SDK v6 uses inputSchema + zodSchema() instead of `parameters`.
        inputSchema: zodSchema(
          z.object({
            query: z.string().describe("A specific, focused search query"),
          })
        ),
        execute: async (input) => webSearch(input.query),
      }),
    },
    // Allow up to 5 search rounds before forcing a final answer.
    // Phase 5 will add a reflection step so the agent decides when to stop.
    stopWhen: stepCountIs(5),
  });

  return result;
}
