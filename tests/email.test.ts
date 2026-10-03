import { test, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { sendEscalationEmail } from "../src/utils/email.js";

const original = {
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  EMAIL_TEST_RECIPIENT: process.env.EMAIL_TEST_RECIPIENT,
  EMAIL_FROM: process.env.EMAIL_FROM
};

function setEnv(values: Partial<Record<keyof typeof original, string | undefined>>) {
  for (const key of Object.keys(original) as (keyof typeof original)[]) {
    const value = key in values ? values[key] : undefined;
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

afterEach(() => {
  mock.restoreAll();
  setEnv(original);
});

test("skips without sending when RESEND_API_KEY is not set", async () => {
  setEnv({ EMAIL_TEST_RECIPIENT: "me@example.test" });
  mock.method(console, "warn", () => {});
  const fetchMock = mock.method(globalThis, "fetch");
  const result = await sendEscalationEmail("dana.levy@example.com", "abcdef12-3456");
  assert.equal(result.sent, false);
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("skips without sending when EMAIL_TEST_RECIPIENT is not set - never emails the customer directly", async () => {
  setEnv({ RESEND_API_KEY: "test-key" });
  mock.method(console, "warn", () => {});
  const fetchMock = mock.method(globalThis, "fetch");
  const result = await sendEscalationEmail("dana.levy@example.com", "abcdef12-3456");
  assert.equal(result.sent, false);
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("sends to the test recipient, with the intended customer and reference in the email", async () => {
  setEnv({ RESEND_API_KEY: "test-key", EMAIL_TEST_RECIPIENT: "me@example.test" });
  const fetchMock = mock.method(globalThis, "fetch", async () => new Response('{"id":"1"}', { status: 200 }));
  const result = await sendEscalationEmail("dana.levy@example.com", "abcdef12-3456");

  assert.deepEqual(result, {
    sent: true,
    intendedFor: "dana.levy@example.com",
    sentTo: "me@example.test",
    note: "Confirmation email sent."
  });
  const [url, init] = fetchMock.mock.calls[0].arguments as [string, RequestInit];
  assert.equal(url, "https://api.resend.com/emails");
  assert.equal((init.headers as Record<string, string>).Authorization, "Bearer test-key");
  const body = JSON.parse(init.body as string);
  assert.deepEqual(body.to, ["me@example.test"]);
  assert.equal(body.subject, "We've received your request (ref abcdef12)");
  assert.match(body.text, /delivered to the LookinGood support team/);
  assert.match(body.text, /meant for dana\.levy@example\.com/);
});

test("reports failure when Resend returns an error", async () => {
  setEnv({ RESEND_API_KEY: "test-key", EMAIL_TEST_RECIPIENT: "me@example.test" });
  mock.method(console, "warn", () => {});
  mock.method(globalThis, "fetch", async () => new Response("bad request", { status: 422 }));
  const result = await sendEscalationEmail("dana.levy@example.com", "abcdef12-3456");
  assert.equal(result.sent, false);
  assert.equal(result.note, "Email attempt failed.");
});
