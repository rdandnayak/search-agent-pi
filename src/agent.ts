import { streamText, generateText, tool, zodSchema, stepCountIs } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { webSearch, calculate, readUrl, getWeather } from "./tools";
import { config } from "./config";

export type Message = {
  role: "user" | "assistant";
  content: string;
};

export async function summarizeHistory(turns: Message[]): Promise<string> {
  const conversation = turns
    .map((t) => `${t.role === "user" ? "User" : "Assistant"}: ${t.content}`)
    .join("\n\n");

  const { text } = await generateText({
    model: openai(config.model),
    prompt: `Summarize the following conversation concisely. Preserve all key facts, questions asked, and important answers:\n\n${conversation}`,
  });

  return text;
}

export async function streamAnswer(messages: Message[]) {
  const result = streamText({
    model: openai(config.model),
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

You also have these tools — use them proactively:
- calculate: for ANY arithmetic, percentages, or unit conversions — never compute in your head
- readUrl: when the user provides a URL, or when a search snippet isn't enough and you need the full page
- weather: for current weather queries; defaults to ${config.defaultCity} if no city is given

After each round of searching, call the reflect tool to assess whether you
have enough information to give a complete and accurate answer.
- If hasEnoughInfo is false, do another webSearch with a more targeted query.
- If hasEnoughInfo is true, write your final answer immediately after.
Do not mention tool names in your response.`,
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

      calculate: tool({
        description:
          "Evaluate a mathematical expression. Use for arithmetic, percentages, " +
          "and conversions instead of computing yourself.",
        inputSchema: zodSchema(
          z.object({
            expression: z
              .string()
              .describe("A valid mathjs expression, e.g. '2500 * 0.18' or 'sqrt(144)'"),
          })
        ),
        execute: async (input) => calculate(input.expression),
      }),

      readUrl: tool({
        description:
          "Fetch and read the plain-text content of a webpage. Use when the user " +
          "provides a URL, or when a search snippet is too short to answer from.",
        inputSchema: zodSchema(
          z.object({
            url: z.string().describe("The full URL to fetch"),
          })
        ),
        execute: async (input) => readUrl(input.url),
      }),

      weather: tool({
        description: `Get current weather for a city. Defaults to ${config.defaultCity} if no city is mentioned.`,
        inputSchema: zodSchema(
          z.object({
            city: z
              .string()
              .describe(`City name, e.g. "Mumbai" or "Delhi". Default: ${config.defaultCity}`),
          })
        ),
        execute: async (input) => getWeather(input.city),
      }),

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
    stopWhen: stepCountIs(config.maxSteps),
  });

  return result;
}
