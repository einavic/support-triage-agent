import type { KnowledgeArticle } from "../types/index.js";

export interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  skinTypes: string[];
  description: string;
}

/** Something the semantic index can search: an id, the text that gets embedded, and the original data. */
export interface SearchDocument<T> {
  id: string;
  text: string;
  data: T;
}

/** The text embedded for a knowledge base article: title, tags and content. */
export function articleToDocument(article: KnowledgeArticle): SearchDocument<KnowledgeArticle> {
  return {
    id: article.id,
    text: `${article.title}\nTopics: ${article.tags.join(", ")}\n${article.content}`,
    data: article
  };
}

/** The text embedded for a product: everything a customer might search for it by. */
export function productToDocument(product: Product): SearchDocument<Product> {
  const skinTypes = product.skinTypes.includes("all") ? "all skin types" : `${product.skinTypes.join(", ")} skin`;
  return {
    id: product.id,
    text: `${product.name} (${product.category}, $${product.price})\nSuitable for: ${skinTypes}\n${product.description}`,
    data: product
  };
}
