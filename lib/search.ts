type SearxResult = {
  title: string;
  url: string;
  content: string;
  score?: number;
};

type SearxResponse = {
  results: SearxResult[];
  unresponsive_engines?: [string, string][];
};

/**
 * Search SearXNG and return a list of text snippets suitable for LLM context injection.
 * Returns empty array on any failure so callers can degrade gracefully.
 */
export async function webSearch(query: string, maxResults = 5): Promise<string[]> {
  const base = process.env.SEARXNG_URL ?? "http://localhost:8080";

  try {
    const url = new URL("/search", base);
    url.searchParams.set("q", query);
    url.searchParams.set("format", "json");
    url.searchParams.set("categories", "general");
    url.searchParams.set("language", "en");
    url.searchParams.set("safesearch", "0");

    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) {
      console.warn(`[webSearch] SearXNG returned ${res.status} for "${query}"`);
      return [];
    }

    const data: SearxResponse = await res.json();

    // All engines down (e.g. broken DNS inside the SearXNG container) looks
    // identical to "no results" — surface it so the degradation isn't silent.
    if (!data.results?.length && data.unresponsive_engines?.length) {
      console.warn(
        `[webSearch] 0 results for "${query}" — unresponsive engines: ${data.unresponsive_engines.map(([name, why]) => `${name} (${why})`).join(", ")}`,
      );
    }

    return (data.results ?? [])
      .slice(0, maxResults)
      .map((r) => {
        const snippet = r.content?.trim();
        return snippet ? `${r.title}: ${snippet}` : r.title;
      })
      .filter(Boolean);
  } catch (err) {
    console.warn(`[webSearch] failed for "${query}" (SearXNG at ${base}):`, err instanceof Error ? err.message : err);
    return [];
  }
}
