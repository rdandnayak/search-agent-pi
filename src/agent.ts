import { streamText, generateText, tool, zodSchema, stepCountIs } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { webSearch, calculate, readUrl, getWeather, calculateTripCost } from "./tools";
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
  The user is based in Jayanagar, Bangalore, India.
  The user drives a Tata Altroz (~12 kmpl, petrol).
  The user is a engineering manager taking care of Frontend & QA team in organization called Soroco.
  The user is family person, raising girl toddler.
  The user is interested in Investments, Financial freedom, Learning something new, Credit cards.
The user is based in Bangalore, India.
Today's date is ${new Date().toDateString()}.

ACCURACY IS YOUR TOP PRIORITY. Follow these rules strictly:
- Never guess, approximate, or fill in gaps from memory — if you don't have a confirmed fact, say so and search for it.
- Never use vague language like "around", "roughly", "typically", "usually", "may vary" unless you explicitly cannot find a precise value and explain why.
- Every specific claim (price, rating, date, name, distance, spec) must be traceable to a search result you actually received. Do not invent plausible-sounding details.
- If search results conflict, say so and cite both sources rather than picking one silently.
- If you genuinely cannot find accurate information, say "I couldn't find a reliable source for this" — do not pad the answer with guesses.

IMPORTANT — your training data is outdated. For any of the following, you MUST search and never answer from memory:
- Product releases, latest models, or "which is newest" questions
- Prices (always search for current India pricing in ₹)
- Current events, news, or recent announcements

When searching for products or releases:
- Always include the current year in your query (e.g. "latest iPhone 2025 India")
- If results mention a model you didn't know about, that is the correct answer — do not second-guess it
- Prefer results relevant to India; show prices in Indian Rupees (₹)

This interface fully renders markdown including images. Embed images proactively — do NOT wait to be asked:
- For any query about a place, restaurant, food, product, person, or event: if the search result includes images, embed them.
- Use markdown: ![description](url) — use the image's "description" field as alt text when available.
- Use ONLY URLs from the search result's "images" array — these are direct image file URLs (.jpg, .png, .webp etc).
- NEVER use "results[].url" as image sources — those are webpage links, not image files.
- Never say "I can't display images" — you can and should show them.

When search results include ratings, reviews, or scores:
- Always prefer Google Maps as the primary source. Format: ⭐ 4.5/5 · 1,200 reviews — [Google Maps](url)
- Only fall back to Zomato, Swiggy, TripAdvisor etc. if no Google Maps result is available; still name and link the source.
- If no rating is found, search again with "[place name] Google Maps reviews rating" before giving up.
- The "answer" field in a search result is a quick AI summary — treat it as a useful starting point but verify with the full results.

You also have these tools — use them proactively:
- calculate: for ANY arithmetic, percentages, or unit conversions — never compute in your head
- readUrl: when the user provides a URL, or when a search snippet isn't enough and you need the full page
- weather: for current weather queries; defaults to ${config.defaultCity} if no city is given
- tripCost: ALWAYS use this for any fuel/driving cost question. NEVER calculate trip costs manually or ask for fuel price/mileage — call the tool immediately with just the distance, it handles all defaults.

After each round of searching, call the reflect tool to assess whether you have enough information.
- Set hasEnoughInfo to false if: any key fact is missing, results are vague/outdated, or you'd have to guess to complete the answer.
- Set hasEnoughInfo to true only when you can back every claim with a specific search result.
- If false, search again with a more targeted query — do not write a partial or hedged answer instead.
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

      tripCost: tool({
        description:
          "Calculate fuel cost for a road trip. Call immediately with just the distance — " +
          "DO NOT ask the user for fuel price or mileage, the API has defaults (12 kmpl, ₹102.92/L, round trip). " +
          "Only pass fuel_price_per_litre or mileage_kmpl if the user explicitly stated them.",
        inputSchema: zodSchema(
          z.object({
            distance_km: z.number().describe("One-way distance in kilometres"),
            round_trip: z.boolean().optional().describe("True for round trip (default), false for one-way"),
            fuel_price_per_litre: z.number().optional().describe("Fuel price in ₹ per litre — only if user specified"),
            mileage_kmpl: z.number().optional().describe("Vehicle mileage in km per litre — only if user specified"),
          })
        ),
        execute: async (input) => calculateTripCost(input),
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
