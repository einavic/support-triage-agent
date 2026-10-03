import "dotenv/config";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { searchKnowledgeBase } from "./tools/searchKnowledgeBase.js";
import { lookupAccount } from "./tools/lookupAccount.js";
import { runEscalationAgent } from "./agent/escalationAgent.js";

const server = new McpServer({ name: "support-triage-tools", version: "1.0.0" });

server.registerTool(
  "search_knowledge_base",
  {
    title: "Search Knowledge Base",
    description: "Search the support knowledge base for FAQ/policy articles relevant to a customer's question.",
    inputSchema: {
      query: z.string().describe("The customer's question or topic to search for.")
    }
  },
  async ({ query }) => {
    const result = await searchKnowledgeBase({ query });
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  }
);

server.registerTool(
  "lookup_account",
  {
    title: "lookup account",
    description: "find the specific customer's account given their email address or order-ID.",    
    inputSchema: {
      identifier: z.string().describe("The customer's email address or order-ID.")
    }
  },
  async ({ identifier }) => {
    const result = await lookupAccount({ identifier });
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  }
);

server.registerTool(
  "hand_off_to_escalation_agent",
  {
    title: "hand off to escalation agent",
    description: "Escalate the conversation to a human support agent via Slack. A specialist agent decides the urgency and writes the summary. Use this when you are not confident in the answer, the request needs authority you don't have (e.g. approving a refund exception), or the customer is upset/angry.",
    inputSchema: {
      reason: z.string().describe("Short machine-readable reason, e.g. 'refund_exception', 'angry_customer', 'low_confidence'."),
      context: z.string().describe("A human-readable summary of the conversation for the support agent who picks this up.")
    }
  },
  async ({ reason, context }) => {
    // MCP calls have no conversation of their own, so each handoff gets a fresh id for its log file.
    const result = await runEscalationAgent(randomUUID(), { reason, context });
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main();