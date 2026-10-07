import { test } from "node:test";
import assert from "node:assert/strict";
import knowledgeBase from "../src/data/knowledgeBase.json" with { type: "json" };
import { scoreArticle, searchArticles } from "../src/utils/retrieval.js";
import { searchKnowledgeBase } from "../src/tools/searchKnowledgeBase.js";
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

test("searchKnowledgeBase returns found: false for no matches", async () => {
  assert.deepEqual(await searchKnowledgeBase({ query: "xyzzy" }), { found: false });
});

test("searchKnowledgeBase returns id, title and content only", async () => {
  const result = (await searchKnowledgeBase({ query: "shipping" })) as { found: boolean; articles: object[] };
  assert.equal(result.found, true);
  for (const article of result.articles) {
    assert.deepEqual(Object.keys(article), ["id", "title", "content"]);
  }
});
