import "dotenv/config";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { searchKnowledgeBase } from "./tools/searchKnowledgeBase.js";
import { lookupAccount } from "./tools/lookupAccount.js";
import { runEscalationAgent } from "./agent/escalationAgent.js";

// This file is the entry point for the MCP server. 
// It registers the tools and starts the server.
// The server listens for incoming requests from the MCP client, 
// and dispatches them to the appropriate tool handler.
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
    description: "Pass the conversation to a human support team member via Slack (a specialist agent decides the urgency and writes the summary), and email the customer a confirmation. Use this when the customer needs something only a team member can do (cancelling an order, starting a return or refund, approving a policy exception), asks for something outside policy, is frustrated or angry, describes a severe skin reaction, or when the knowledge base doesn't answer the question. Don't ask the customer for permission first.",
    inputSchema: {
      reason: z.string().describe("Short machine-readable reason, e.g. 'refund_exception', 'angry_customer', 'low_confidence'."),
      context: z.string().describe("A human-readable summary of the conversation for the support agent who picks this up."),
      customerEmail: z.string().describe("The customer's email address - given by the customer or found with lookup_account.")
    }
  },
  async ({ reason, context, customerEmail }) => {
    // MCP calls have no conversation of their own, so each handoff gets a fresh id for its log file.
    const result = await runEscalationAgent(randomUUID(), { reason, context, customerEmail });
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main();