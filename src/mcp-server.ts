import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { searchKnowledgeBase } from "./tools/searchKnowledgeBase.js";
import { lookupAccount } from "./tools/lookupAccount.js";
import { escalateToHuman } from "./tools/escalateToHuman.js";

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
  "escalate_to_human",
  {
    title: "escalate to human",
    description: "escalate the customer's issue to a human agent, in case the issue cannot be resolved by you.",    
    inputSchema: {
      reason: z.string().describe("Short machine-readable reason, e.g. 'refund_exception', 'angry_customer', 'low_confidence'."),
      summary: z.string().describe("A human-readable summary of the conversation for the support agent who picks this up."),
      urgency: z.enum(["low", "medium", "high"]).describe("The urgency of the customer's issue.")
    }
  },
  async ({ reason, summary, urgency }) => {
    const result = await escalateToHuman({ reason, summary, urgency });
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main();