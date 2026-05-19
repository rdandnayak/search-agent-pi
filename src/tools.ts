import { tavily } from "@tavily/core";
import { evaluate } from "mathjs";
import { config } from "./config";

// ── Web search ────────────────────────────────────────────────────────────────

export type SearchResult = {
  title: string;
  url: string;
  content: string;
};

export type SearchImage = {
  url: string;
  description?: string;
};

export type SearchResponse = {
  query: string;
  results: SearchResult[];
  images: SearchImage[];
  answer?: string; // Tavily AI summary — quick starting point for the agent
};

// Per-session cache: avoids duplicate Tavily calls within one CLI run or server process.
// Keyed by normalised query string (lowercase + trimmed).
const searchCache = new Map<string, SearchResponse>();
export function clearSearchCache() { searchCache.clear(); }

export async function webSearch(query: string): Promise<SearchResponse> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) throw new Error("TAVILY_API_KEY is not set in your .env file");

  // Phase 18 — cache check: identical query in the same session returns instantly.
  const cacheKey = query.toLowerCase().trim();
  if (searchCache.has(cacheKey)) return searchCache.get(cacheKey)!;

  const client = tavily({ apiKey });
  const response = await client.search(query, {
    maxResults: config.maxSearchResults,
    searchDepth: config.searchDepth,
    includeImages: config.includeImages,
    includeImageDescriptions: true,
    includeAnswer: "basic",
  });

  // Phase 16 — score filter: drop results below the relevance threshold.
  // Fallback: if every result is below the threshold, keep all rather than
  // returning an empty list (a bad search is better than no search).
  const scored = response.results.filter(r => r.score >= config.minSearchScore);
  const afterScore = scored.length > 0 ? scored : response.results;

  // Phase 17 — date filter: drop stale dated results; keep undated ones.
  // Fallback: if fewer than 2 results survive, skip date filtering for this
  // query (evergreen content should not be discarded entirely).
  const cutoff = Date.now() - config.resultMaxAgeDays * 86_400_000;
  const dated = afterScore.filter(r => {
    if (!r.publishedDate) return true;
    return new Date(r.publishedDate).getTime() >= cutoff;
  });
  const afterDate = dated.length >= 2 ? dated : afterScore;

  // Keep only URLs that point to actual image files, not webpages.
  // This prevents the agent accidentally embedding page links as <img> src.
  const IMAGE_EXT = /\.(jpe?g|png|webp|gif|svg|avif)(\?.*)?$/i;
  const images: SearchImage[] = (response.images ?? [])
    .filter(img => IMAGE_EXT.test(img.url))
    .map(img => ({ url: img.url, description: img.description }));

  const result: SearchResponse = {
    query,
    results: afterDate.map(r => ({ title: r.title, url: r.url, content: r.content })),
    images,
    answer: response.answer,
  };

  // Phase 18 — cache store.
  searchCache.set(cacheKey, result);
  return result;
}

// ── Calculator ────────────────────────────────────────────────────────────────

export type CalcResult = {
  expression: string;
  result: string;
};

// Evaluates maths expressions using mathjs — safer than eval() and handles
// percentages, trig, unit conversions, etc. The LLM calls this instead of
// doing arithmetic itself, which prevents silent calculation errors.
export function calculate(expression: string): CalcResult {
  try {
    const result = evaluate(expression);
    return { expression, result: String(result) };
  } catch {
    throw new Error(`Cannot evaluate "${expression}" — check the syntax`);
  }
}

// ── URL reader ────────────────────────────────────────────────────────────────

export type UrlContent = {
  url: string;
  title: string;
  content: string;
};

// Fetches a URL and strips HTML down to plain readable text.
// Useful when the user pastes a link or when a search result needs
// to be read in full rather than relying on a Tavily snippet.
export async function readUrl(url: string): Promise<UrlContent> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; SearchAgent/1.0)" },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`);

  const html = await res.text();

  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : url;

  const content = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, config.urlReadMaxChars);

  return { url, title, content };
}

// ── Weather ───────────────────────────────────────────────────────────────────

export type WeatherResult = {
  city: string;
  temperatureC: number;
  humidity: number;
  windKph: number;
  condition: string;
};

// WMO weather code → human-readable condition.
// Full list: https://open-meteo.com/en/docs#weathervariables
const WMO_CODES: Record<number, string> = {
  0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
  45: "Foggy", 48: "Icy fog",
  51: "Light drizzle", 53: "Moderate drizzle", 55: "Heavy drizzle",
  61: "Light rain", 63: "Moderate rain", 65: "Heavy rain",
  71: "Light snow", 73: "Moderate snow", 75: "Heavy snow",
  80: "Light showers", 81: "Moderate showers", 82: "Heavy showers",
  95: "Thunderstorm", 96: "Thunderstorm with hail",
};

// Uses Open-Meteo (free, no API key). Geocoding + weather in two calls.
export async function getWeather(city: string): Promise<WeatherResult> {
  const geoRes  = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`
  );
  const geoData = await geoRes.json() as { results?: Array<{ latitude: number; longitude: number; name: string; country: string }> };

  if (!geoData.results?.length) throw new Error(`City not found: "${city}"`);

  const { latitude, longitude, name, country } = geoData.results[0];

  const wxRes  = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
    `&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code`
  );
  const wxData = await wxRes.json() as {
    current: { temperature_2m: number; relative_humidity_2m: number; wind_speed_10m: number; weather_code: number }
  };

  const c = wxData.current;
  return {
    city:         `${name}, ${country}`,
    temperatureC: c.temperature_2m,
    humidity:     c.relative_humidity_2m,
    windKph:      c.wind_speed_10m,
    condition:    WMO_CODES[c.weather_code] ?? `Code ${c.weather_code}`,
  };
}

// ── Trip cost ─────────────────────────────────────────────────────────────────

export type TripCostResult = {
  fuel_needed: number;
  cost: number;
  currency: string;
  distance_calculated: number;
  trip_type: string;
  input_distance: number;
};

export async function calculateTripCost(params: {
  distance_km: number;
  round_trip?: boolean;
  fuel_price_per_litre?: number;
  mileage_kmpl?: number;
}): Promise<TripCostResult> {
  const url = new URL(`${config.tripCostApiUrl}/trip-cost`);
  url.searchParams.set("distance_km", String(params.distance_km));
  url.searchParams.set("format", "json");
  if (params.round_trip !== undefined)         url.searchParams.set("round_trip", String(params.round_trip));
  if (params.fuel_price_per_litre !== undefined) url.searchParams.set("fuel_price_per_litre", String(params.fuel_price_per_litre));
  if (params.mileage_kmpl !== undefined)       url.searchParams.set("mileage_kmpl", String(params.mileage_kmpl));

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(5_000) });
  if (!res.ok) throw new Error(`Trip cost API error: HTTP ${res.status}`);
  return res.json() as Promise<TripCostResult>;
}
