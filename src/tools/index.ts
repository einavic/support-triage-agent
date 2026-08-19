import { searchKnowledgeBase } from "./searchKnowledgeBase.js";
import { lookupAccount } from "./lookupAccount.js";
import { runEscalationAgent } from "../agent/escalationAgent.js";
import type { ToolName } from "../types/index.js";
import type Anthropic from "@anthropic-ai/sdk";
import type { HandOffToEscalationAgentInput } from "../types/index.js";

/**
 * These are the tool definitions passed to the Claude API's `tools` param.
 * The input_schema is plain JSON Schema - Claude uses the description fields
 * heavily to decide *when* to call each tool, so be specific.
 */
export const toolDefinitions: Anthropic.Tool[] = [
  {
    name: "search_knowledge_base",
    description:
      "Search the support knowledge base (FAQ/policy articles) for information relevant to the customer's question. Always try this before answering questions about policy, shipping, returns, warranty, etc.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "The customer's question or topic to search for." }
      },
      required: ["query"]
    }
  },
  {
    name: "lookup_account",
    description:
      "Look up a customer's account and orders by email or order id. Use this whenever the customer refers to their own order, account, or purchase - never guess or invent account details.",
    input_schema: {
      type: "object",
      properties: {
        identifier: { type: "string", description: "The customer's email address or an order id." }
      },
      required: ["identifier"]
    }
  },
  {
    name: "hand_off_to_escalation_agent",
    description:
      "Escalate the conversation to a human support agent via Slack. Use this when you are not confident in the answer, the request needs authority you don't have (e.g. approving a refund exception), or the customer is upset/angry. ",
    input_schema: {
      type: "object",
      properties: {
        reason: { type: "string", description: "Short machine-readable reason, e.g. 'refund_exception', 'angry_customer', 'low_confidence'." },
        context: { type: "string", description: "A human-readable summary of the conversation for the support agent who picks this up." }
      },
      required: ["reason", "context"]
    }
  }
];

/**
 * Dispatches a tool call by name to its handler. This is the piece
 * agentLoop.ts calls every time Claude returns a tool_use block.
 */
export async function executeTool(name: ToolName, input: unknown, conversationId: string): Promise<unknown> {
  switch (name) {
    case "search_knowledge_base":
      return searchKnowledgeBase(input as any);
    case "lookup_account":
      return lookupAccount(input as any);
    case "hand_off_to_escalation_agent":
      return runEscalationAgent(conversationId as string, input as HandOffToEscalationAgentInput);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
