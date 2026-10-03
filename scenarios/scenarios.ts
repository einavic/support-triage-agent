import "dotenv/config";
import { randomUUID } from "node:crypto";
import { runAgentLoop } from "../src/agent/agentLoop.js";
import type Anthropic from "@anthropic-ai/sdk";

/**
 * A handful of scripted conversations that exercise each path through the
 * agent. Run with `npm run scenarios`.
 * Each scenario is a list of customer messages sent in order, in one conversation.
 */
const scenarios: string[][] = [
  ["How long does shipping usually take?"],
  ["Hi, I'm dana.levy@example.com - can you tell me the status of my order ord-5001?"],
  [
    "I want a refund for an order I placed 45 days ago, this is ridiculous, nobody is helping me!",
    "noa.friedman@example.com"
  ],
  ["My lipstick melted after I left it in a hot car, can I get a free replacement?"],
  ["Can I cancel order ord-5003? I just placed it a few minutes ago."],
  ["I'm michal.segal@example.com - the sunscreen I bought gave me a red, itchy rash. Can I return it even though I've opened it?"]
];

async function main() {
  for (const messages of scenarios) {
    const conversationId = randomUUID();
    let history: Anthropic.MessageParam[] = [];
    console.log("\n=== Scenario ===");
    for (const message of messages) {
      console.log("User:", message);
      const result = await runAgentLoop(conversationId, message, history);
      history = result.history;
      console.log("Agent:", result.reply);
    }
  }
}

main();
