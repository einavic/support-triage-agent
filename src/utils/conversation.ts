import type Anthropic from "@anthropic-ai/sdk";

/**
 * Finds the customer's email from earlier lookup_account results in the conversation
 * (the most recent one wins), or undefined if the customer was never looked up.
 */
export function findCustomerEmail(history: Anthropic.MessageParam[]): string | undefined {
  let email: string | undefined;
  for (const message of history) {
    if (message.role !== "user" || typeof message.content === "string") continue;
    for (const block of message.content) {
      if (block.type !== "tool_result" || typeof block.content !== "string") continue;
      try {
        const result = JSON.parse(block.content);
        if (result?.found && typeof result.customer?.email === "string") email = result.customer.email;
      } catch {
        // not JSON - not a lookup result
      }
    }
  }
  return email;
}
