import { tavily } from "@tavily/core";

// The shape of a single search result we pass to the LLM.
// We only keep what's useful — title, URL, and a content snippet.
// Keeping this lean reduces token usage.
export type SearchResult = {
  title: string;
  url: string;
  content: string;
};

export type SearchResponse = {
  query: string;
  results: SearchResult[];
};

// webSearch calls the Tavily API and returns a structured result.
// This function knows nothing about the LLM — it just fetches data.
// The agent (agent.ts) decides *when* to call it; this function just *does* the work.
export async function webSearch(query: string): Promise<SearchResponse> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) throw new Error("TAVILY_API_KEY is not set in your .env file");

  const client = tavily({ apiKey });

  const response = await client.search(query, {
    maxResults: 5,
    // "basic" is faster and cheaper; "advanced" does deeper scraping.
    // Stick with basic for now — upgrade in a later phase if needed.
    searchDepth: "basic",
  });

  return {
    query,
    results: response.results.map((r) => ({
      title: r.title,
      url: r.url,
      content: r.content,
    })),
  };
}
