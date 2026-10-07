import type { EmbedFn } from "../utils/embeddings.js";
import type { SearchDocument } from "./documents.js";

export interface SearchHit<T> {
  document: SearchDocument<T>;
  score: number; // cosine similarity: ~1 = same meaning, ~0 = unrelated
}

/** Cosine similarity: how closely two vectors point in the same direction (1 = identical, 0 = unrelated). */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return normA === 0 || normB === 0 ? 0 : dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * A searchable set of documents. The documents are embedded once, on the first search
 * (not at import time, so starting the app doesn't need the network).
 */
export class SemanticIndex<T> {
  private vectors?: Promise<number[][]>;

  constructor(private readonly documents: SearchDocument<T>[], private readonly embed: EmbedFn) {}

  private documentVectors(): Promise<number[][]> {
    this.vectors ??= this.embed(this.documents.map(d => d.text), "document").catch(err => {
      this.vectors = undefined; // let the next search try again
      throw err;
    });
    return this.vectors;
  }

  /** Every document with its score for the query, best first (no threshold applied). */
  async rank(query: string): Promise<SearchHit<T>[]> {
    const [queryVector] = await this.embed([query], "query");
    const vectors = await this.documentVectors();
    return this.documents
      .map((document, i) => ({ document, score: cosineSimilarity(queryVector, vectors[i]) }))
      .sort((a, b) => b.score - a.score);
  }

  /** The best `topK` documents that score at least `minScore` - possibly none. */
  async search(query: string, topK: number, minScore: number): Promise<SearchHit<T>[]> {
    return (await this.rank(query)).filter(hit => hit.score >= minScore).slice(0, topK);
  }
}
