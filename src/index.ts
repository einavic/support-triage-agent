import "dotenv/config";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { randomUUID } from "node:crypto";
import { runAgentLoop } from "./agent/agentLoop.js";
import type Anthropic from "@anthropic-ai/sdk";

async function main() {
  const rl = readline.createInterface({ input, output });
  const conversationId = randomUUID();
  let history: Anthropic.MessageParam[] = [];

  console.log("Support Triage Agent - type 'exit' to quit.\n");

  while (true) {
    const userMessage = await rl.question("You: ");
    if (userMessage.trim().toLowerCase() === "exit") break;

    try {
      const result = await runAgentLoop(conversationId, userMessage, history);
      history = result.history;
      console.log(`\nAgent: ${result.reply}\n`);
    } catch (err) {
      console.error("Agent error:", err);
    }
  }

  rl.close();
}

main();
