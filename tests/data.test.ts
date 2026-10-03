import { test } from "node:test";
import assert from "node:assert/strict";
import customers from "../src/data/customers.json" with { type: "json" };
import products from "../src/data/products.json" with { type: "json" };
import knowledgeBase from "../src/data/knowledgeBase.json" with { type: "json" };

const STATUSES = ["processing", "shipped", "delivered", "returned", "refunded"];

test("customers have exactly the Customer fields and 1-3 orders", () => {
  for (const customer of customers) {
    assert.deepEqual(Object.keys(customer), ["id", "email", "name", "orders"], customer.id);
    assert.ok(customer.orders.length >= 1 && customer.orders.length <= 3, customer.id);
  }
});

test("orders have exactly the Order fields, a valid status and a valid date", () => {
  for (const order of customers.flatMap(c => c.orders)) {
    assert.deepEqual(Object.keys(order), ["id", "product", "status", "purchaseDate"], order.id);
    assert.ok(STATUSES.includes(order.status), `${order.id} has status ${order.status}`);
    assert.match(order.purchaseDate, /^\d{4}-\d{2}-\d{2}$/, order.id);
    assert.ok(!Number.isNaN(Date.parse(order.purchaseDate)), order.id);
  }
});

test("customer ids, emails and order ids are unique", () => {
  const unique = (values: string[]) => new Set(values).size === values.length;
  assert.ok(unique(customers.map(c => c.id)));
  assert.ok(unique(customers.map(c => c.email.toLowerCase())));
  assert.ok(unique(customers.flatMap(c => c.orders.map(o => o.id))));
});

test("every ordered product exists in the catalog", () => {
  const names = new Set(products.map(p => p.name));
  for (const order of customers.flatMap(c => c.orders)) {
    assert.ok(names.has(order.product), `${order.id}: "${order.product}" is not in products.json`);
  }
});

test("products have unique ids and positive prices", () => {
  assert.equal(new Set(products.map(p => p.id)).size, products.length);
  for (const product of products) {
    assert.ok(product.price > 0, product.id);
  }
});

test("knowledge base articles have unique ids and no leftover gadget branding", () => {
  assert.equal(new Set(knowledgeBase.map(a => a.id)).size, knowledgeBase.length);
  assert.doesNotMatch(JSON.stringify(knowledgeBase), /wonderful|gadget/i);
});
