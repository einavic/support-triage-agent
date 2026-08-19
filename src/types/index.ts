export interface KnowledgeArticle {
  id: string;
  title: string;
  tags: string[];
  content: string;
}

export interface Order {
  id: string;
  product: string;
  status: "processing" | "shipped" | "delivered" | "returned" | "refunded";
  purchaseDate: string;
}

export interface Customer {
  id: string;
  email: string;
  name: string;
  orders: Order[];
}

export type ToolName = "search_knowledge_base" | "lookup_account" | "hand_off_to_escalation_agent";

export interface SearchKnowledgeBaseInput {
  query: string;
}

export interface LookupAccountInput {
  identifier: string; // email or order id
}

export interface EscalateToHumanInput {
  reason: string;
  summary: string;
  urgency: "low" | "medium" | "high";
}

export interface HandOffToEscalationAgentInput {
  reason: string;
  context: string;
}

export interface LogEntry {
  timestamp: string;
  conversationId: string;
  type: "user_message" | "tool_call" | "tool_result" | "agent_response" | "escalation" | "error";
  payload: unknown;
}

export interface ConversationTurnResult {
  reply: string;
  escalated: boolean;
}
