import { test } from "node:test";
import assert from "node:assert/strict";
import { toTraceSteps } from "../src/server/trace.js";
import type { LogEntry } from "../src/types/index.js";

const entry = (type: LogEntry["type"], payload: unknown): LogEntry =>
  ({ timestamp: "2026-10-06T10:00:00.000Z", conversationId: "c1", type, payload });

test("skips customer messages and the duplicate { reply } event", () => {
  assert.deepEqual(toTraceSteps([entry("user_message", { message: "hi" }), entry("agent_response", { reply: "hello" })]), []);
});

test("a model response becomes a model_call with text, tool calls and tokens", () => {
  const [step] = toTraceSteps([entry("agent_response", {
    stop_reason: "tool_use",
    content: [{ type: "text", text: " Checking. " }, { type: "tool_use", name: "lookup_account", input: { identifier: "ord-5001" } }],
    usage: { input_tokens: 10, output_tokens: 5 }
  })]);
  assert.deepEqual(step, {
    kind: "model_call",
    time: "2026-10-06T10:00:00.000Z",
    agent: "main",
    tokens: { in: 10, out: 5 },
    text: "Checking.",
    toolCalls: [{ name: "lookup_account", input: { identifier: "ord-5001" } }],
    final: false
  });
});

test("the main agent's last response is marked final; the escalation agent's never is", () => {
  const steps = toTraceSteps([
    entry("escalation", { stop_reason: "end_turn", content: [] }),
    entry("agent_response", { stop_reason: "end_turn", content: [{ type: "text", text: "Done" }] })
  ]);
  assert.deepEqual(steps.map(s => s.kind === "model_call" && [s.agent, s.final]), [["escalation", false], ["main", true]]);
});

test("tool results, emails, fallback escalations and errors are converted", () => {
  const steps = toTraceSteps([
    entry("tool_result", { tool: "search_knowledge_base", input: {}, result: { found: false } }),
    entry("email", { sent: false, intendedFor: "a@example.com", note: "Email not sent (email not configured)." }),
    entry("escalation", { reason: "max_iterations_exceeded", result: { escalated: true } }),
    entry("error", { message: "boom" })
  ]);
  assert.deepEqual(steps.map(s => s.kind), ["tool_result", "email", "fallback_escalation", "error"]);
  assert.equal(steps[1].kind === "email" && steps[1].sent, false);
});
