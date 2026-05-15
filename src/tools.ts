import { tavily } from "@tavily/core";
import { evaluate } from "mathjs";
import { config } from "./config";

// ── Web search ────────────────────────────────────────────────────────────────

export type SearchResult = {
  title: string;
  url: string;
  content: string;
};

export type SearchResponse = {
  query: string;
  results: SearchResult[];
};

export async function webSearch(query: string): Promise<SearchResponse> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) throw new Error("TAVILY_API_KEY is not set in your .env file");

  const client = tavily({ apiKey });
  const response = await client.search(query, {
    maxResults: config.maxSearchResults,
    searchDepth: config.searchDepth,
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
