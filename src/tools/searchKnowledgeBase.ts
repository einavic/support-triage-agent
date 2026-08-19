import knowledgeBase from "../data/knowledgeBase.json" with { type: "json" };
import { searchArticles } from "../utils/retrieval.js";
import type { KnowledgeArticle, SearchKnowledgeBaseInput } from "../types/index.js";

// get an input object with a query string, and return the top 2 matching articles from the knowledge base
export async function searchKnowledgeBase(input: SearchKnowledgeBaseInput): Promise<unknown> {
  const matches = searchArticles(input.query, knowledgeBase as KnowledgeArticle[]);

  if (matches.length === 0) {
    return { found: false };
  }

  return {
    found: true,
    articles: matches.map(({ id, title, content }) => ({ id, title, content }))
  };
}
