import { tavily } from "@tavily/core";
import type { PipelineState, CuratedTheme } from "../pipeline/state.js";

export async function deepDiveAgent(state: typeof PipelineState.State) {
  const tavilyClient = tavily({ apiKey: process.env.TAVILY_API_KEY! });
  const { curatedThemes } = state;

  // For each curated theme, run one targeted follow-up search to enrich supporting articles
  const enrichedThemes = await Promise.all(
    curatedThemes.map(async (theme): Promise<CuratedTheme> => {
      if (!theme.deep_dive_query) return theme;

      try {
        const result = await tavilyClient.search(theme.deep_dive_query, {
          maxResults: 5,
          includeRawContent: true,
        });

        const existingUrls = new Set(theme.supporting_articles.map((a) => a.url));
        const newArticles = result.results
          .filter((r) => !existingUrls.has(r.url))
          .slice(0, 3)
          .map((r) => ({
            id: "",
            title: r.title,
            url: r.url,
            markdown: (r as any).rawContent || r.content || "",
            sourceLabel: "deep-dive",
            sourceType: "tavily" as const,
          }));

        return {
          ...theme,
          supporting_articles: [...theme.supporting_articles, ...newArticles],
        };
      } catch {
        // Deep-dive failure is non-fatal — proceed with existing articles
        return theme;
      }
    })
  );

  return { curatedThemes: enrichedThemes };
}
