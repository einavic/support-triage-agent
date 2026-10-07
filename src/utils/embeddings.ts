import { VoyageAIClient } from "voyageai";

// The client lives in this codebase; the actual embedding model runs on
// Voyage's infrastructure. embedTexts() sends the request and returns the vectors.
export const EMBEDDING_MODEL = "voyage-3.5-lite";
const MAX_BATCH = 128; // Voyage accepts at most 128 texts per request

export type InputType = "query" | "document";
/** Same shape as embedTexts - passed around so tests can use a fake embedding function. */
export type EmbedFn = (texts: string[], inputType: InputType) => Promise<number[][]>;

let client: VoyageAIClient | undefined;

/** True if a Voyage API key is configured (otherwise search falls back to keywords). */
export function embeddingsConfigured(): boolean {
  return Boolean(process.env.VOYAGE_API_KEY);
}

/**
 * Turns texts into embedding vectors. inputType tells the model whether these are
 * search queries or documents being indexed - it embeds them slightly differently,
 * so a short question can match a longer document with the same meaning.
 */
export const embedTexts: EmbedFn = async (texts, inputType) => {
  client ??= new VoyageAIClient({ apiKey: process.env.VOYAGE_API_KEY });
  const vectors: number[][] = [];
  for (let i = 0; i < texts.length; i += MAX_BATCH) {
    const batch = texts.slice(i, i + MAX_BATCH);
    const response = await client.embed({ input: batch, model: EMBEDDING_MODEL, inputType });
    const embeddings = (response.data ?? []).map(d => d.embedding ?? []);
    if (embeddings.length !== batch.length || embeddings.some(e => e.length === 0)) {
      throw new Error("Voyage returned an unexpected number of embeddings");
    }
    vectors.push(...embeddings);
  }
  return vectors;
};
