import { test, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { escalateToHuman } from "../src/tools/escalateToHuman.js";

const input = { reason: "test", summary: "Test summary", urgency: "low" as const };
const originalWebhook = process.env.SLACK_WEBHOOK_URL;

afterEach(() => {
  mock.restoreAll();
  if (originalWebhook === undefined) delete process.env.SLACK_WEBHOOK_URL;
  else process.env.SLACK_WEBHOOK_URL = originalWebhook;
});

test("skips gracefully when no Slack webhook is configured", async () => {
  delete process.env.SLACK_WEBHOOK_URL;
  mock.method(console, "warn", () => {});
  const fetchMock = mock.method(globalThis, "fetch");
  const result = await escalateToHuman(input);
  assert.deepEqual(result, { escalated: false, note: "Escalation not sent (Slack not configured)." });
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("posts urgency, reason and summary to the webhook", async () => {
  process.env.SLACK_WEBHOOK_URL = "https://hooks.example.test/webhook";
  const fetchMock = mock.method(globalThis, "fetch", async () => new Response("ok", { status: 200 }));
  const result = await escalateToHuman(input);
  assert.deepEqual(result, { escalated: true, note: "A team member will follow up shortly." });
  const [url, init] = fetchMock.mock.calls[0].arguments as [string, RequestInit];
  assert.equal(url, "https://hooks.example.test/webhook");
  assert.deepEqual(JSON.parse(init.body as string), { text: "[low] test\nTest summary" });
});

test("reports failure when Slack returns an error", async () => {
  process.env.SLACK_WEBHOOK_URL = "https://hooks.example.test/webhook";
  mock.method(console, "warn", () => {});
  mock.method(globalThis, "fetch", async () => new Response("nope", { status: 500 }));
  const result = await escalateToHuman(input);
  assert.deepEqual(result, { escalated: false, note: "Escalation attempt failed." });
});
