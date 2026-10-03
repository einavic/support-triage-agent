import { test } from "node:test";
import assert from "node:assert/strict";
import { lookupAccount } from "../src/tools/lookupAccount.js";
import type { Customer } from "../src/types/index.js";

type LookupResult = { found: boolean; customer?: Customer };

test("finds a customer by email", async () => {
  const result = (await lookupAccount({ identifier: "dana.levy@example.com" })) as LookupResult;
  assert.equal(result.found, true);
  assert.equal(result.customer?.id, "cust-1001");
});

test("finds a customer by order id", async () => {
  const result = (await lookupAccount({ identifier: "ord-5003" })) as LookupResult;
  assert.equal(result.found, true);
  assert.equal(result.customer?.name, "Omer Cohen");
});

test("lookup is case-insensitive", async () => {
  const byEmail = (await lookupAccount({ identifier: "DANA.LEVY@EXAMPLE.COM" })) as LookupResult;
  const byOrder = (await lookupAccount({ identifier: "ORD-5001" })) as LookupResult;
  assert.equal(byEmail.customer?.id, "cust-1001");
  assert.equal(byOrder.customer?.id, "cust-1001");
});

test("returns found: false for unknown identifiers", async () => {
  assert.deepEqual(await lookupAccount({ identifier: "nobody@example.com" }), { found: false });
  assert.deepEqual(await lookupAccount({ identifier: "ord-9999" }), { found: false });
});

// Scenarios depend on these exact records.
test("scenario orders have the expected status", async () => {
  const dana = (await lookupAccount({ identifier: "ord-5001" })) as LookupResult;
  const omer = (await lookupAccount({ identifier: "ord-5003" })) as LookupResult;
  assert.equal(dana.customer?.orders.find(o => o.id === "ord-5001")?.status, "shipped");
  assert.equal(omer.customer?.orders.find(o => o.id === "ord-5003")?.status, "processing");
});
