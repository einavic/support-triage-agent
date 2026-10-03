import "dotenv/config";
import { randomUUID } from "node:crypto";
import { runAgentLoop } from "../src/agent/agentLoop.js";
import type Anthropic from "@anthropic-ai/sdk";

/**
 * A handful of scripted conversations that exercise each path through the
 * agent. Run with `npm run scenarios`.
 */
const scenarios: string[] = [
  "How long does shipping usually take?",
  "Hi, I'm dana.levy@example.com - can you tell me the status of my order ord-5001?",
  "I want a refund for an order I placed 45 days ago, this is ridiculous, nobody is helping me!",
  "My lipstick melted after I left it in a hot car, can I get a free replacement?",
  "Can I cancel order ord-5003? I just placed it a few minutes ago.",
  "I'm michal.segal@example.com - the sunscreen I bought gave me a red, itchy rash. Can I return it even though I've opened it?"
];

async function main() {
  for (const message of scenarios) {
    const conversationId = randomUUID();
    console.log("\n=== Scenario ===");
    console.log("User:", message);
    const result = await runAgentLoop(conversationId, message, [] as Anthropic.MessageParam[]);
    console.log("Agent:", result.reply);
  }
}

main();
