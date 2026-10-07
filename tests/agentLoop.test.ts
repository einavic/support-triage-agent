import { test, before, after, mock } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";

// Logs from these tests go to a temporary folder, not logs/ (must be set before the logger is imported).
const logDir = mkdtempSync(path.join(tmpdir(), "support-agent-test-"));
process.env.LOG_DIR = logDir;
const { runAgentLoop } = await import("../src/agent/agentLoop.js");

const textResponse = (text: string) => ({
  id: "msg",
  type: "message",
  role: "assistant",
  model: "test",
  stop_reason: "end_turn",
  stop_sequence: null,
  content: [{ type: "text", text }],
  usage: { input_tokens: 1, output_tokens: 1 }
});

const toolResponse = (name: string, input: unknown) => ({
  ...textResponse(""),
  stop_reason: "tool_use",
  content: [{ type: "tool_use", id: "tool-1", name, input }]
});

// Each call to Claude is replaced by the next fake response; the messages Claude was sent are recorded.
let responses: unknown[] = [];
let sentMessages: Anthropic.MessageParam[][] = [];

before(() => {
  mock.method(Anthropic.Messages.prototype, "create", async (params: { messages: Anthropic.MessageParam[] }) => {
    sentMessages.push(structuredClone(params.messages));
    return responses.shift();
  });
});

after(() => {
  mock.restoreAll();
  rmSync(logDir, { recursive: true, force: true });
});

test("the final reply is saved in the history, so the next turn sees what was already said", async () => {
  responses = [textResponse("Shipping takes 3-5 business days."), textResponse("Express takes 1-2 days.")];
  sentMessages = [];

  const first = await runAgentLoop("conv-1", "How long is shipping?", []);
  assert.equal(first.reply, "Shipping takes 3-5 business days.");
  assert.deepEqual(first.history.map(m => m.role), ["user", "assistant"]);

  await runAgentLoop("conv-1", "And express?", first.history);
  // On the second turn, Claude must see its own first answer between the two customer messages
  const roles = sentMessages[1].map(m => m.role);
  assert.deepEqual(roles, ["user", "assistant", "user"]);
  assert.deepEqual(sentMessages[1][1].content, [{ type: "text", text: "Shipping takes 3-5 business days." }]);
});

test("after a tool call, the history holds the tool call, its result and the final reply", async () => {
  responses = [toolResponse("lookup_account", { identifier: "ord-5001" }), textResponse("Your order has shipped.")];
  sentMessages = [];

  const result = await runAgentLoop("conv-2", "Status of ord-5001?", []);
  assert.equal(result.reply, "Your order has shipped.");
  assert.deepEqual(result.history.map(m => m.role), ["user", "assistant", "user", "assistant"]);
  const toolResult = (result.history[2].content as Anthropic.ToolResultBlockParam[])[0];
  assert.equal(toolResult.type, "tool_result");
  assert.match(String(toolResult.content), /dana\.levy@example\.com/);
});
