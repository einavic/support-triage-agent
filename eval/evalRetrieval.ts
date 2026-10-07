import "dotenv/config";
import path from "node:path";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import knowledgeBase from "../src/data/knowledgeBase.json" with { type: "json" };
import productsData from "../src/data/products.json" with { type: "json" };
import { embedTexts, EMBEDDING_MODEL, embeddingsConfigured } from "../src/utils/embeddings.js";
import { withEmbeddingCache } from "../src/rag/embeddingCache.js";
import { articleToDocument, productToDocument, type Product } from "../src/rag/documents.js";
import { SemanticIndex } from "../src/rag/semanticIndex.js";
import { searchArticles, searchProductsByKeywords } from "../src/utils/retrieval.js";
import type { KnowledgeArticle } from "../src/types/index.js";

/**
 * Retrieval evaluation: does search find the right document? Compares keyword search with
 * embedding search on a labeled set of real customer questions (eval/retrieval-set.json).
 * Only retrieval is tested - Claude isn't involved. Run with: npm run eval:retrieval
 *
 * Metrics (per collection):
 *   Hit@1      - the right document came first
 *   Hit@3      - the right document was in the top 3
 *   MRR        - mean reciprocal rank: 1 if first, 1/2 if second, 1/3 if third... 0 if missing
 *   "nothing"  - for questions with no answer, search correctly returned nothing
 */

interface LabeledQuestion {
  id: number;
  question: string;
  kb: string[] | null;
  products: string[] | null;
  note?: string;
}

const articles = knowledgeBase as KnowledgeArticle[];
const products = productsData as Product[];
const set: LabeledQuestion[] = JSON.parse(readFileSync(path.resolve("eval/retrieval-set.json"), "utf-8")).questions;

// --- scoring helpers ---------------------------------------------------------

/** Did the top result (after the threshold) match the label? */
function topIsCorrect(label: string[], resultIds: string[]): boolean {
  if (label.length === 0) return resultIds.length === 0;
  if (resultIds.length === 0) return label.includes("none");
  return label.includes(resultIds[0]);
}

/** Was a correct document anywhere in the top 3 (or nothing returned, when that's acceptable)? */
function inTop3(label: string[], resultIds: string[]): boolean {
  if (resultIds.length === 0) return label.includes("none");
  return resultIds.slice(0, 3).some(id => label.includes(id));
}

/** 1/rank of the first correct document in the full ranking, 0 if it's not there. */
function reciprocalRank(label: string[], rankedIds: string[]): number {
  const rank = rankedIds.findIndex(id => label.includes(id));
  return rank === -1 ? 0 : 1 / (rank + 1);
}

const pct = (n: number, d: number) => (d === 0 ? "  -  " : `${Math.round((100 * n) / d)}%`.padStart(5));

interface Outcome {
  question: LabeledQuestion;
  label: string[];
  rankedIds: string[];        // full ranking, best first (for MRR)
  rankedScores?: number[];    // embedding scores, same order
}

/** Applies a threshold to embedding results; keyword results are used as they are. */
function results(outcome: Outcome, threshold?: number): string[] {
  if (threshold === undefined || !outcome.rankedScores) return outcome.rankedIds;
  return outcome.rankedIds.filter((_, i) => outcome.rankedScores![i] >= threshold);
}

function summarize(outcomes: Outcome[], threshold?: number) {
  const withAnswer = outcomes.filter(o => o.label.some(id => id !== "none"));
  const noAnswer = outcomes.filter(o => o.label.length === 0);
  const correct = outcomes.filter(o => topIsCorrect(o.label, results(o, threshold)));
  return {
    hit1: withAnswer.filter(o => topIsCorrect(o.label, results(o, threshold))).length,
    hit3: withAnswer.filter(o => inTop3(o.label, results(o, threshold))).length,
    mrr: withAnswer.reduce((sum, o) => sum + reciprocalRank(o.label, o.rankedIds), 0) / (withAnswer.length || 1),
    nothingCorrect: noAnswer.filter(o => results(o, threshold).length === 0).length,
    overall: correct.length,
    withAnswer: withAnswer.length,
    noAnswer: noAnswer.length,
    total: outcomes.length
  };
}

function printRow(name: string, s: ReturnType<typeof summarize>) {
  console.log(
    `  ${name.padEnd(26)} ${pct(s.hit1, s.withAnswer)}   ${pct(s.hit3, s.withAnswer)}   ${s.mrr.toFixed(2)}   ` +
    `${pct(s.nothingCorrect, s.noAnswer)}       ${pct(s.overall, s.total)}  (${s.overall}/${s.total})`
  );
}

function describe(o: Outcome, threshold?: number): string {
  const got = results(o, threshold).slice(0, 3);
  const shown = got.map(id => {
    const i = o.rankedIds.indexOf(id);
    return o.rankedScores ? `${id} ${o.rankedScores[i].toFixed(2)}` : id;
  });
  const want = o.label.length === 0 ? "nothing" : o.label.join(" / ");
  return `#${String(o.question.id).padEnd(3)} ${o.question.question.slice(0, 48).padEnd(48)} want: ${want.padEnd(18)} got: ${shown.join(", ") || "nothing"}`;
}

// --- run -----------------------------------------------------------------------

async function evaluateCollection<T>(
  name: string,
  labelOf: (q: LabeledQuestion) => string[] | null,
  index: SemanticIndex<T> | undefined,
  keywordRank: (question: string) => string[]
) {
  const scored = set.filter(q => labelOf(q) !== null);
  console.log(`\n=== ${name}: ${scored.length} scored questions ===`);

  const keywordOutcomes: Outcome[] = scored.map(q => ({ question: q, label: labelOf(q)!, rankedIds: keywordRank(q.question) }));

  console.log(`  ${"method".padEnd(26)} Hit@1   Hit@3   MRR    "nothing" ok   overall`);
  printRow("keywords", summarize(keywordOutcomes));

  if (!index) {
    console.log("  (embeddings skipped - VOYAGE_API_KEY not set)");
    return;
  }

  const embeddingOutcomes: Outcome[] = [];
  for (const q of scored) {
    const ranked = await index.rank(q.question);
    embeddingOutcomes.push({
      question: q,
      label: labelOf(q)!,
      rankedIds: ranked.map(h => h.document.id),
      rankedScores: ranked.map(h => h.score)
    });
  }

  // Try thresholds and keep the one with the best overall accuracy (ties: the lower threshold)
  const thresholds = Array.from({ length: 17 }, (_, i) => Math.round((0.2 + i * 0.025) * 1000) / 1000);
  let best = thresholds[0];
  for (const t of thresholds) {
    if (summarize(embeddingOutcomes, t).overall > summarize(embeddingOutcomes, best).overall) best = t;
  }
  printRow("embeddings (no threshold)", summarize(embeddingOutcomes));
  printRow(`embeddings (threshold ${best})`, summarize(embeddingOutcomes, best));

  console.log(`\n  Threshold sweep (embeddings): threshold -> Hit@1 of answerable / "nothing" ok / overall`);
  for (const t of thresholds) {
    const s = summarize(embeddingOutcomes, t);
    console.log(`    ${t.toFixed(3)}  ${pct(s.hit1, s.withAnswer)} / ${pct(s.nothingCorrect, s.noAnswer)} / ${pct(s.overall, s.total)}${t === best ? "   <- best" : ""}`);
  }

  console.log(`\n  Top score per question (does a threshold separate "has an answer" from "nothing"?):`);
  for (const o of [...embeddingOutcomes].sort((a, b) => b.rankedScores![0] - a.rankedScores![0])) {
    const kind = o.label.length === 0 ? "nothing " : "answer  ";
    console.log(`    ${o.rankedScores![0].toFixed(3)}  ${kind} #${o.question.id} ${o.question.question.slice(0, 55)}`);
  }

  const kwFails = keywordOutcomes.filter(o => !topIsCorrect(o.label, results(o)));
  const embFails = embeddingOutcomes.filter(o => !topIsCorrect(o.label, results(o, best)));
  console.log(`\n  Keyword failures (${kwFails.length}):`);
  kwFails.forEach(o => console.log(`    ${describe(o)}`));
  console.log(`\n  Embedding failures at threshold ${best} (${embFails.length}):`);
  embFails.forEach(o => console.log(`    ${describe(o, best)}`));
}

async function main() {
  // Everything printed is also saved to eval/results/retrieval-<date>_<time>.txt, to compare runs over time
  const report: string[] = [];
  const print = console.log;
  console.log = (...args: unknown[]) => {
    report.push(args.join(" "));
    print(...args);
  };

  let kbIndex: SemanticIndex<KnowledgeArticle> | undefined;
  let productIndex: SemanticIndex<Product> | undefined;

  if (embeddingsConfigured()) {
    const embed = withEmbeddingCache(embedTexts, EMBEDDING_MODEL, path.resolve(".cache/embeddings.json"));
    // Embed all questions in one request up front (the cache then answers every later lookup),
    // to stay within low API rate limits.
    await embed(set.map(q => q.question), "query");
    kbIndex = new SemanticIndex(articles.map(articleToDocument), embed);
    productIndex = new SemanticIndex(products.map(productToDocument), embed);
  }

  console.log(`Retrieval evaluation - ${set.length} questions, model ${EMBEDDING_MODEL}`);

  await evaluateCollection("Knowledge base", q => q.kb, kbIndex, question =>
    searchArticles(question, articles, articles.length).map(a => a.id)
  );
  await evaluateCollection("Products", q => q.products, productIndex, question =>
    searchProductsByKeywords(question, products, products.length).map(p => p.id)
  );

  console.log = print;
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}`;
  const file = path.resolve(`eval/results/retrieval-${stamp}.txt`);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, report.join("\n") + "\n");
  console.log(`\nReport saved to ${path.relative(process.cwd(), file)}`);
}

main();
