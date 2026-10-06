import { test } from "node:test";
import assert from "node:assert/strict";
import type Anthropic from "@anthropic-ai/sdk";
import { findCustomerEmail } from "../src/utils/conversation.js";

const toolResult = (content: string): Anthropic.MessageParam => ({
  role: "user",
  content: [{ type: "tool_result", tool_use_id: "t1", content }]
});

test("returns undefined when the customer was never looked up", () => {
  const history: Anthropic.MessageParam[] = [
    { role: "user", content: "How long does shipping take?" },
    toolResult(JSON.stringify({ found: true, articles: [{ id: "kb-001" }] }))
  ];
  assert.equal(findCustomerEmail(history), undefined);
});

test("finds the email from a lookup_account result", () => {
  const history: Anthropic.MessageParam[] = [
    { role: "user", content: "Can I cancel ord-5003?" },
    toolResult(JSON.stringify({ found: true, customer: { id: "cust-1002", email: "omer.cohen@example.com" } }))
  ];
  assert.equal(findCustomerEmail(history), "omer.cohen@example.com");
});

test("ignores failed lookups and non-JSON results, and the latest lookup wins", () => {
  const history: Anthropic.MessageParam[] = [
    toolResult(JSON.stringify({ found: true, customer: { email: "first@example.com" } })),
    toolResult(JSON.stringify({ found: false })),
    toolResult("not json"),
    toolResult(JSON.stringify({ found: true, customer: { email: "second@example.com" } }))
  ];
  assert.equal(findCustomerEmail(history), "second@example.com");
});
