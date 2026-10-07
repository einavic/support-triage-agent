import { test, before, after, mock } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import type Anthropic from "@anthropic-ai/sdk";

// Logs from these tests go to a temporary folder, not logs/ (must be set before the logger is imported).
const logDir = mkdtempSync(path.join(tmpdir(), "support-agent-test-"));
process.env.LOG_DIR = logDir;
const { createApp, MAX_MESSAGE_LENGTH } = await import("../src/server/app.js");
const { logEvent } = await import("../src/utils/logger.js");
type RunAgent = import("../src/server/app.js").RunAgent;

const log = (conversationId: string, type: "agent_response" | "tool_result" | "escalation" | "email", payload: unknown) =>
  logEvent({ timestamp: new Date().toISOString(), conversationId, type, payload });

// A fake agent that logs a realistic escalation turn, without calling Claude.
const escalatingAgent: RunAgent = async (conversationId, message, history) => {
  await log(conversationId, "agent_response", {
    stop_reason: "tool_use",
    content: [{ type: "tool_use", name: "hand_off_to_escalation_agent", input: { reason: "test" } }],
    usage: { input_tokens: 100, output_tokens: 20 }
  });
  await log(conversationId, "escalation", { content: [{ type: "tool_use", name: "escalate_to_human", input: { urgency: "high" } }] });
  await log(conversationId, "email", { sent: true, intendedFor: "dana.levy@example.com", sentTo: "me@example.test" });
  await log(conversationId, "tool_result", { tool: "hand_off_to_escalation_agent", input: {}, result: { escalated: true, emailSent: true } });
  await log(conversationId, "agent_response", { stop_reason: "end_turn", content: [{ type: "text", text: "Escalated." }] });
  return { reply: "Escalated.", history: [...history, { role: "user", content: message }] };
};

let agent: RunAgent = escalatingAgent;
let server: Server;
let baseUrl: string;

before(async () => {
  server = createApp((...args) => agent(...args)).listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => {
  server.close();
  rmSync(logDir, { recursive: true, force: true });
});

const chat = (body: unknown) =>
  fetch(`${baseUrl}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

test("rejects a missing or empty message", async () => {
  assert.equal((await chat({})).status, 400);
  assert.equal((await chat({ message: "   " })).status, 400);
});

test("rejects a message over the length limit", async () => {
  const res = await chat({ message: "x".repeat(MAX_MESSAGE_LENGTH + 1) });
  assert.equal(res.status, 400);
});

test("rejects invalid JSON with a JSON error", async () => {
  const res = await fetch(`${baseUrl}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{not json" });
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: "Invalid request." });
});

test("a new conversation returns an id, the reply, the escalation flag and the trace", async () => {
  agent = escalatingAgent;
  const res = await chat({ message: "I want a refund" });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.match(body.conversationId, /^[0-9a-f-]{36}$/);
  assert.equal(body.reply, "Escalated.");
  assert.equal(body.escalated, true);
  assert.deepEqual(body.trace.map((s: { kind: string }) => s.kind), ["model_call", "model_call", "email", "tool_result", "model_call"]);
  assert.equal(body.trace[0].agent, "main");
  assert.deepEqual(body.trace[0].tokens, { in: 100, out: 20 });
  assert.equal(body.trace[1].agent, "escalation");
  assert.equal(body.trace[4].final, true);
  assert.match(body.logFile, /^logs\/.+\.log$/);
});

test("continues an existing conversation with its stored history", async () => {
  const seen: number[] = [];
  agent = async (_id, message, history) => {
    seen.push(history.length);
    return { reply: "ok", history: [...history, { role: "user", content: message }] as Anthropic.MessageParam[] };
  };
  const first = await (await chat({ message: "one" })).json();
  const second = await (await chat({ message: "two", conversationId: first.conversationId })).json();
  assert.equal(second.conversationId, first.conversationId);
  assert.deepEqual(seen, [0, 1]);
  assert.equal(second.escalated, false);
});

test("an unknown conversation id starts a new conversation with a server-made id", async () => {
  agent = async (_id, _message, history) => ({ reply: "ok", history });
  const body = await (await chat({ message: "hi", conversationId: "made-up-id" })).json();
  assert.notEqual(body.conversationId, "made-up-id");
});

test("a second message while the first is still running gets 409", async () => {
  // Create a conversation first, so we know its id
  agent = async (_id, _message, history) => ({ reply: "ok", history });
  const { conversationId } = await (await chat({ message: "hello" })).json();

  // Now make the agent slow, and send a message that stays "running"
  let finish!: () => void;
  let started!: () => void;
  const agentStarted = new Promise<void>(resolve => (started = resolve));
  agent = async (_id, _message, history) => {
    started();
    await new Promise<void>(resolve => (finish = resolve));
    return { reply: "done", history };
  };
  const first = chat({ message: "slow one", conversationId });
  await agentStarted;

  const second = await chat({ message: "too soon", conversationId });
  assert.equal(second.status, 409);

  finish();
  assert.equal((await first).status, 200);
});

test("agent errors return a generic 500 without internal details", async () => {
  mock.method(console, "error", () => {});
  agent = async () => {
    throw new Error("secret internal detail");
  };
  const res = await chat({ message: "hi" });
  assert.equal(res.status, 500);
  const text = await res.text();
  assert.doesNotMatch(text, /secret internal detail/);
  mock.restoreAll();
});
