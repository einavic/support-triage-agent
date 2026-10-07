import { test, mock } from "node:test";
import assert from "node:assert/strict";
import knowledgeBase from "../src/data/knowledgeBase.json" with { type: "json" };
import { scoreArticle, searchArticles } from "../src/utils/retrieval.js";
import { createKnowledgeBaseSearch, KB_MIN_SCORE } from "../src/tools/searchKnowledgeBase.js";
import type { EmbedFn } from "../src/utils/embeddings.js";
import type { KnowledgeArticle } from "../src/types/index.js";

const articles = knowledgeBase as KnowledgeArticle[];

test("scoreArticle weights tags 3, title 2, content 1", () => {
  const article: KnowledgeArticle = { id: "t", title: "alpha", tags: ["beta"], content: "gamma" };
  assert.equal(scoreArticle("beta", article), 3);
  assert.equal(scoreArticle("alpha", article), 2);
  assert.equal(scoreArticle("gamma", article), 1);
  assert.equal(scoreArticle("delta", article), 0);
});

test("searchArticles returns at most topK results, best first", () => {
  const results = searchArticles("order shipping tracking", articles);
  assert.equal(results.length, 2);
  assert.equal(results[0].id, "kb-004");
});

test("searchArticles returns nothing when no words match", () => {
  assert.deepEqual(searchArticles("xyzzy", articles), []);
});

// The top article each scenario question should retrieve.
const scenarioExpectations: [string, string][] = [
  ["How long does shipping usually take?", "kb-001"],
  ["My lipstick melted after I left it in a hot car, can I get a free replacement?", "kb-003"],
  ["Can I cancel order ord-5003? I just placed it a few minutes ago.", "kb-005"],
  ["I'm michal.segal@example.com - the sunscreen I bought gave me a red, itchy rash. Can I return it even though I've opened it?", "kb-007"],
  ["is it covered under warranty?", "kb-003"],
  ["I forgot my password", "kb-006"],
  ["ok so whats the link for the website so i could check the products?", "kb-008"],
  ["what are your contact hours", "kb-008"]
];

for (const [query, expectedId] of scenarioExpectations) {
  test(`"${query}" retrieves ${expectedId} first`, () => {
    assert.equal(searchArticles(query, articles)[0]?.id, expectedId);
  });
}

// Keyword search (no embedding function)
const keywordKbSearch = createKnowledgeBaseSearch();

test("keyword search returns found: false for no matches", async () => {
  assert.deepEqual(await keywordKbSearch({ query: "xyzzy" }), { found: false, method: "keywords" });
});

test("keyword search returns id, title and content only", async () => {
  const result = await keywordKbSearch({ query: "shipping" });
  assert.equal(result.found, true);
  assert.equal(result.method, "keywords");
  for (const article of result.articles!) {
    assert.deepEqual(Object.keys(article), ["id", "title", "content"]);
  }
});

// Embedding search, with a fake embedding function that counts a few words
const VOCAB = ["shipping", "refund", "password", "rash"];
const fakeEmbed: EmbedFn = async texts =>
  texts.map(text => VOCAB.map(word => (text.toLowerCase().match(new RegExp(word, "g")) ?? []).length));

test("embedding search returns the best articles with their scores", async () => {
  const result = await createKnowledgeBaseSearch(fakeEmbed)({ query: "shipping" });
  assert.equal(result.method, "embeddings");
  assert.equal(result.articles![0].id, "kb-001");
  assert.equal(result.articles![0].score, 1);
  assert.ok(result.articles!.every(a => a.score! >= KB_MIN_SCORE));
});

test("embedding search returns found: false when nothing reaches the minimum score", async () => {
  assert.deepEqual(await createKnowledgeBaseSearch(fakeEmbed)({ query: "tree" }), { found: false, method: "embeddings" });
});

test("if embedding fails, it falls back to keyword search and says why", async () => {
  mock.method(console, "warn", () => {});
  const failing: EmbedFn = async () => {
    throw new Error("429 Too Many Requests");
  };
  const result = await createKnowledgeBaseSearch(failing)({ query: "shipping" });
  mock.restoreAll();
  assert.equal(result.method, "keywords");
  assert.equal(result.fallbackReason, "embedding search unavailable");
  assert.equal(result.found, true);
});
