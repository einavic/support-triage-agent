import { test } from "node:test";
import assert from "node:assert/strict";
import { formatEntry } from "../src/utils/logger.js";
import type { LogEntry } from "../src/types/index.js";

// Tests for the logger's formatting of events into readable text. 
// The logger also writes JSONL files, but those are not tested here.

const entry = (type: LogEntry["type"], payload: unknown): LogEntry =>
  ({ timestamp: new Date(2026, 9, 3, 16, 25, 41).toISOString(), conversationId: "c1", type, payload });

test("customer message shows local time and text", () => {
  assert.equal(formatEntry(entry("user_message", { message: "Hi there" })), "\n[16:25:41] CUSTOMER\n  Hi there\n");
});

test("tool-calling response shows the tool, its input and token counts", () => {
  const text = formatEntry(entry("agent_response", {
    stop_reason: "tool_use",
    content: [{ type: "tool_use", name: "lookup_account", input: { identifier: "ord-5001" } }],
    usage: { input_tokens: 100, output_tokens: 20 }
  }));
  assert.match(text, /\[16:25:41\] AGENT   \(tokens: 100 in \/ 20 out\)/);
  assert.match(text, /-> lookup_account\n\s+identifier: ord-5001/);
});

test("final response is shown as REPLY, and the duplicate { reply } event is skipped", () => {
  const text = formatEntry(entry("agent_response", { stop_reason: "end_turn", content: [{ type: "text", text: "All done" }] }));
  assert.match(text, /REPLY\n  All done/);
  assert.equal(formatEntry(entry("agent_response", { reply: "All done" })), "");
});

test("tool result renders nested objects as indented key: value lines", () => {
  const text = formatEntry(entry("tool_result", { tool: "lookup_account", input: {}, result: { found: true, customer: { id: "cust-1" } } }));
  assert.equal(text, "[16:25:41] RESULT <- lookup_account\n  found: true\n  customer:\n    id: cust-1\n");
});

test("email events show who it was meant for and where it went", () => {
  const text = formatEntry(entry("email", { sent: true, intendedFor: "dana.levy@example.com", sentTo: "me@example.test", note: "Confirmation email sent." }));
  assert.equal(text, "[16:25:41] EMAIL\n  sent: true\n  intendedFor: dana.levy@example.com\n  sentTo: me@example.test\n  note: Confirmation email sent.\n");
});

test("fallback escalation and errors are labelled", () => {
  assert.match(formatEntry(entry("escalation", { reason: "max_iterations_exceeded" })), /FALLBACK ESCALATION\n  reason: max_iterations_exceeded/);
  assert.match(formatEntry(entry("error", { message: "boom" })), /ERROR\n  message: boom/);
});
