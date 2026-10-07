import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { cosineSimilarity, SemanticIndex } from "../src/rag/semanticIndex.js";
import { withEmbeddingCache } from "../src/rag/embeddingCache.js";
import { articleToDocument, productToDocument } from "../src/rag/documents.js";
import type { EmbedFn, InputType } from "../src/utils/embeddings.js";

// A fake embedding: counts a few words, so texts that share words point in similar directions.
const VOCAB = ["shipping", "refund", "rash", "sunscreen", "password"];
const fakeVector = (text: string) => VOCAB.map(word => (text.toLowerCase().match(new RegExp(word, "g")) ?? []).length);

function fakeEmbed() {
  const calls: { texts: string[]; inputType: InputType }[] = [];
  const embed: EmbedFn = async (texts, inputType) => {
    calls.push({ texts, inputType });
    return texts.map(fakeVector);
  };
  return { embed, calls };
}

const docs = [
  { id: "ship", text: "shipping shipping times", data: null },
  { id: "refund", text: "refund policy", data: null },
  { id: "rash", text: "rash from sunscreen", data: null }
];

test("cosine similarity: identical = 1, unrelated = 0, empty vector = 0", () => {
  assert.ok(Math.abs(cosineSimilarity([1, 2], [2, 4]) - 1) < 1e-9); // floating point: 0.9999999999999998
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
  assert.equal(cosineSimilarity([0, 0], [1, 1]), 0);
});

test("search returns the closest documents first, limited by topK", async () => {
  const index = new SemanticIndex(docs, fakeEmbed().embed);
  const hits = await index.search("how long is shipping?", 2, 0);
  assert.equal(hits[0].document.id, "ship");
  assert.equal(hits[0].score, 1);
  assert.equal(hits.length, 2);
});

test("search returns nothing when no document reaches the minimum score", async () => {
  const index = new SemanticIndex(docs, fakeEmbed().embed);
  assert.deepEqual(await index.search("what's the weather?", 2, 0.5), []);
});

test("documents are embedded once, as documents; each query is embedded as a query", async () => {
  const { embed, calls } = fakeEmbed();
  const index = new SemanticIndex(docs, embed);
  await index.search("shipping", 1, 0);
  await index.search("refund", 1, 0);
  assert.deepEqual(calls.map(c => c.inputType), ["query", "document", "query"]);
  assert.equal(calls[1].texts.length, 3);
});

test("if embedding the documents fails, the next search tries again", async () => {
  let fail = true;
  const embed: EmbedFn = async (texts, inputType) => {
    if (fail && inputType === "document") throw new Error("API down");
    return texts.map(fakeVector);
  };
  const index = new SemanticIndex(docs, embed);
  await assert.rejects(index.search("shipping", 1, 0), /API down/);
  fail = false;
  assert.equal((await index.search("shipping", 1, 0))[0].document.id, "ship");
});

test("the cache only sends new or changed texts to the embedding API, and survives a restart", async () => {
  const file = path.join(mkdtempSync(path.join(tmpdir(), "emb-cache-")), "cache.json");
  const first = fakeEmbed();
  await withEmbeddingCache(first.embed, "model-a", file)(["refund", "rash"], "document");
  assert.equal(first.calls.length, 1);

  // "restart": a new cached function reading the same file
  const second = fakeEmbed();
  const cached = withEmbeddingCache(second.embed, "model-a", file);
  const vectors = await cached(["refund", "rash", "sunscreen"], "document");
  assert.deepEqual(second.calls, [{ texts: ["sunscreen"], inputType: "document" }]);
  assert.deepEqual(vectors, ["refund", "rash", "sunscreen"].map(fakeVector));

  // a different model or input type is a different entry
  await cached(["refund"], "query");
  await withEmbeddingCache(second.embed, "model-b", file)(["refund"], "document");
  assert.equal(second.calls.length, 3);
});

test("a broken cache file is ignored and rebuilt", async () => {
  const file = path.join(mkdtempSync(path.join(tmpdir(), "emb-cache-")), "cache.json");
  writeFileSync(file, "{not json");
  const { embed, calls } = fakeEmbed();
  assert.deepEqual(await withEmbeddingCache(embed, "m", file)(["refund"], "document"), [fakeVector("refund")]);
  assert.equal(calls.length, 1);
});

test("article and product documents include everything a customer might search by", () => {
  const article = articleToDocument({ id: "kb-1", title: "Return policy", tags: ["returns", "refund"], content: "Within 30 days." });
  assert.equal(article.text, "Return policy\nTopics: returns, refund\nWithin 30 days.");

  const product = productToDocument({
    id: "p1", name: "Gentle Cleanser", category: "Skincare", price: 24, skinTypes: ["dry", "sensitive"], description: "Fragrance-free."
  });
  assert.equal(product.text, "Gentle Cleanser (Skincare, $24)\nSuitable for: dry, sensitive skin\nFragrance-free.");
  assert.match(productToDocument({ ...product.data, skinTypes: ["all"] }).text, /Suitable for: all skin types/);
});
