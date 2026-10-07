import type { LogEntry } from "../types/index.js";

// Note: the web app (web/src) imports the types in this file, so keep it free of
// package imports - only plain types and functions.

/** The response of POST /api/chat. */
export interface ChatResponse {
  conversationId: string;
  reply: string;
  escalated: boolean;
  trace: TraceStep[];
  logFile?: string;
}

/**
 * One step of what the agents did during a turn, for the UI's debug panel.
 * Built from the same log events that go to logs/, but compact: no raw API responses.
 */
export type TraceStep =
  | {
      kind: "model_call";
      time: string;
      agent: "main" | "escalation";
      tokens?: { in: number; out: number };
      text?: string;                                // text the model wrote in this step
      toolCalls: { name: string; input: unknown }[];
      final: boolean;                               // true for the main agent's last step (its reply)
    }
  | { kind: "tool_result"; time: string; tool: string; result: unknown }
  | { kind: "email"; time: string; sent: boolean; intendedFor?: string; sentTo?: string; note?: string }
  | { kind: "fallback_escalation"; time: string; details: unknown }
  | { kind: "error"; time: string; message: string };

type ContentBlock = { type: string; text?: string; name?: string; input?: unknown };
type ModelResponse = {
  stop_reason?: string;
  content: ContentBlock[];
  usage?: { input_tokens: number; output_tokens: number };
};

const isModelResponse = (payload: unknown): payload is ModelResponse =>
  typeof payload === "object" && payload !== null && Array.isArray((payload as ModelResponse).content);

function modelCall(time: string, agent: "main" | "escalation", response: ModelResponse): TraceStep {
  const text = response.content
    .filter(block => block.type === "text" && block.text)
    .map(block => block.text!.trim())
    .join("\n\n");
  return {
    kind: "model_call",
    time,
    agent,
    tokens: response.usage ? { in: response.usage.input_tokens, out: response.usage.output_tokens } : undefined,
    text: text || undefined,
    toolCalls: response.content
      .filter(block => block.type === "tool_use")
      .map(block => ({ name: block.name ?? "", input: block.input })),
    final: agent === "main" && response.stop_reason !== "tool_use"
  };
}

/** Converts the log events of one turn into debug-panel steps (customer messages are skipped - the chat shows them). */
export function toTraceSteps(entries: LogEntry[]): TraceStep[] {
  const steps: TraceStep[] = [];
  for (const entry of entries) {
    const time = entry.timestamp;
    const payload = entry.payload as Record<string, unknown>;
    switch (entry.type) {
      case "agent_response":
        // the { reply } event repeats the final model response's text, which is already a step
        if (isModelResponse(payload)) steps.push(modelCall(time, "main", payload));
        break;
      case "tool_result":
        steps.push({ kind: "tool_result", time, tool: String(payload.tool), result: payload.result });
        break;
      case "escalation":
        if (isModelResponse(payload)) steps.push(modelCall(time, "escalation", payload));
        else steps.push({ kind: "fallback_escalation", time, details: payload });
        break;
      case "email":
        steps.push({
          kind: "email",
          time,
          sent: Boolean(payload.sent),
          intendedFor: payload.intendedFor as string | undefined,
          sentTo: payload.sentTo as string | undefined,
          note: payload.note as string | undefined
        });
        break;
      case "error":
        steps.push({ kind: "error", time, message: String(payload.message) });
        break;
      case "user_message":
        break;
    }
  }
  return steps;
}
