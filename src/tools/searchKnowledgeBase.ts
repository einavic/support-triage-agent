import path from "node:path";
import knowledgeBase from "../data/knowledgeBase.json" with { type: "json" };
import { searchArticles } from "../utils/retrieval.js";
import { embedTexts, embeddingsConfigured, EMBEDDING_MODEL, type EmbedFn } from "../utils/embeddings.js";
import { withEmbeddingCache } from "../rag/embeddingCache.js";
import { articleToDocument } from "../rag/documents.js";
import { SemanticIndex } from "../rag/semanticIndex.js";
import type { KnowledgeArticle, SearchKnowledgeBaseInput } from "../types/index.js";

const articles = knowledgeBase as KnowledgeArticle[];
const TOP_K = 2;

/**
 * Minimum similarity for an article to be returned. Chosen from the retrieval evaluation
 * (eval/results/): answerable questions scored 0.37-0.71 and unanswerable ones 0.33-0.51, so no
 * threshold separates them perfectly. We use a lenient one - better to pass Claude a loosely
 * related article (it sees the score and can decide it doesn't answer) than to hide a relevant one.
 */
export const KB_MIN_SCORE = 0.4;

export interface KnowledgeBaseResult {
  found: boolean;
  method: "embeddings" | "keywords";
  fallbackReason?: string; // why keyword search was used instead of embeddings
  articles?: { id: string; title: string; content: string; score?: number }[];
}

/**
 * Builds the search function. With an embedding function it searches by meaning, and falls back
 * to keyword search if embedding fails (API down, rate limit...); without one it uses keywords.
 * The embedding function is a parameter so tests can pass a fake one.
 */
export function createKnowledgeBaseSearch(embed?: EmbedFn) {
  const index = embed ? new SemanticIndex(articles.map(articleToDocument), embed) : undefined;

  const keywordSearch = (query: string, fallbackReason?: string): KnowledgeBaseResult => {
    const matches = searchArticles(query, articles, TOP_K);
    return {
      found: matches.length > 0,
      method: "keywords",
      ...(fallbackReason && { fallbackReason }),
      ...(matches.length > 0 && { articles: matches.map(({ id, title, content }) => ({ id, title, content })) })
    };
  };

  return async (input: SearchKnowledgeBaseInput): Promise<KnowledgeBaseResult> => {
    if (!index) return keywordSearch(input.query);
    try {
      const hits = await index.search(input.query, TOP_K, KB_MIN_SCORE);
      return {
        found: hits.length > 0,
        method: "embeddings",
        ...(hits.length > 0 && {
          articles: hits.map(({ document, score }) => ({
            id: document.data.id,
            title: document.data.title,
            content: document.data.content,
            score: Math.round(score * 100) / 100
          }))
        })
      };
    } catch (err) {
      console.warn("Embedding search failed - using keyword search:", err instanceof Error ? err.message : err);
      return keywordSearch(input.query, "embedding search unavailable");
    }
  };
}

let defaultSearch: ReturnType<typeof createKnowledgeBaseSearch> | undefined;

/**
 * Tool handler for search_knowledge_base: embedding search when VOYAGE_API_KEY is set (with a
 * cache in .cache/, so each text is embedded only once), otherwise keyword search.
 */
export async function searchKnowledgeBase(input: SearchKnowledgeBaseInput): Promise<KnowledgeBaseResult> {
  defaultSearch ??= createKnowledgeBaseSearch(
    embeddingsConfigured()
      ? withEmbeddingCache(embedTexts, EMBEDDING_MODEL, path.resolve(".cache/embeddings.json"))
      : undefined
  );
  return defaultSearch(input);
}
