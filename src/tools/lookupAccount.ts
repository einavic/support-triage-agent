import customers from "../data/customers.json" with { type: "json" };
import type { Customer, LookupAccountInput } from "../types/index.js";

// get an input object with an identifier string (email or order id), and return the matching customer if found
export async function lookupAccount(input: LookupAccountInput): Promise<unknown> {
  for (const customer of customers as Customer[]) {
    if (customer.email.toLocaleLowerCase() === input.identifier.toLocaleLowerCase() || customer.orders.some(order => order.id.toLocaleLowerCase() === input.identifier.toLocaleLowerCase())) {
      return {found: true, customer};
      }
    }
  return { found: false };
}
