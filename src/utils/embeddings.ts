import { VoyageAIClient } from "voyageai";

// The client lives in this codebase; the actual embedding model runs on
// Voyage's infrastructure. embed() sends the request and returns the vectors.
const client = new VoyageAIClient({ apiKey: process.env.VOYAGE_API_KEY });

export async function embedTexts(
  texts: string[],
  inputType: "query" | "document"
): Promise<number[][]> {
  const response = await client.embed({ input: texts, model: "voyage-3.5-lite", inputType });
  return (response.data ?? []).map((d) => d.embedding ?? []);
}