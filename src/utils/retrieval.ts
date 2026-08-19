import type { KnowledgeArticle } from "../types/index.js";

function tokenize(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

/**
 *
 * @returns a number where higher = more relevant. 0 = no match.
 */
export function scoreArticle(query: string, article: KnowledgeArticle): number {
  
  /* 
  we want to decide how relevant an article is to a query. 
   * for each word in the query, check if it appears in the article's title, tags, or content
   * if it appears in the tags, add 3 to the score
   * if it appears in the title, add 2 to the score
   * if it appears in the content, add 1 to the score
   * return the total score 
   * */
  
  const queryWords = tokenize(query);
  const titleWords = tokenize(article.title);
  const tagWords = article.tags.map(t => t.toLowerCase());
  const contentWords = tokenize(article.content);

  let score = 0;
  for (const word of queryWords) {
    if (tagWords.includes(word)) score += 3;
    if (titleWords.includes(word)) score += 2;
    if (contentWords.includes(word)) score += 1;
  }
  return score;
}

/**
 * uses scoreArticle to rank all articles against the query and
 * return the topK best matches (score > 0), sorted descending by score.
 */
export function searchArticles(
  query: string,
  articles: KnowledgeArticle[],
  topK = 2
): KnowledgeArticle[] {
  const scores: { article: KnowledgeArticle; score: number }[] = [];
  for (const article of articles) {
    const articleScore = scoreArticle(query, article);
    if (articleScore > 0) {
      scores.push({ article, score: articleScore });
    }
  }
  scores.sort((a, b) => b.score - a.score);
  return scores.slice(0, topK).map(({ article }) => article);
}



