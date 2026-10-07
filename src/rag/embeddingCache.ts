import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { EmbedFn, InputType } from "../utils/embeddings.js";

/**
 * Wraps an embedding function with a cache saved to a JSON file, so a text is only
 * sent to the embedding API once. Each entry is keyed by a fingerprint (SHA-256) of
 * model + input type + text, so changing a document's text (or the model) makes a new entry.
 */
export function withEmbeddingCache(embed: EmbedFn, model: string, cacheFile: string): EmbedFn {
  let cache: Record<string, number[]> = {};
  if (existsSync(cacheFile)) {
    try {
      cache = JSON.parse(readFileSync(cacheFile, "utf-8"));
    } catch {
      cache = {}; // a broken cache file is just rebuilt
    }
  }

  const key = (text: string, inputType: InputType) =>
    createHash("sha256").update(`${model}\n${inputType}\n${text}`).digest("hex");

  return async (texts, inputType) => {
    const missing = [...new Set(texts.filter(text => !cache[key(text, inputType)]))];
    if (missing.length > 0) {
      const vectors = await embed(missing, inputType);
      missing.forEach((text, i) => (cache[key(text, inputType)] = vectors[i]));
      mkdirSync(path.dirname(cacheFile), { recursive: true });
      writeFileSync(cacheFile, JSON.stringify(cache));
    }
    return texts.map(text => cache[key(text, inputType)]);
  };
}
