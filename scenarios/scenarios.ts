import "dotenv/config";
import { randomUUID } from "node:crypto";
import { runAgentLoop } from "../src/agent/agentLoop.js";
import type Anthropic from "@anthropic-ai/sdk";

/**
 * A handful of scripted conversations that exercise each path through the
 * agent. Run with `npm run scenarios` once agentLoop.ts is implemented.
 * Good material for your README / demo recording too.
 */
const scenarios: string[] = [
  "How long does shipping usually take?",
  "Hi, I'm dana.levy@example.com - can you tell me the status of my order ord-5001?",
  "I want a refund for an order I placed 45 days ago, this is ridiculous, nobody is helping me!",
  "My gadget stopped working after I dropped it in water, is that covered under warranty?",
  "Can I cancel order ord-5003? I just placed it a few minutes ago."
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
