// The response types come straight from the server code, so if the API changes, TypeScript flags this app too.
import type { ChatResponse } from "../../src/server/trace";

export type { ChatResponse, TraceStep } from "../../src/server/trace";

/** Sends one customer message to the agent. Leave out conversationId to start a new conversation. */
export async function sendMessage(message: string, conversationId?: string): Promise<ChatResponse> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, conversationId })
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    // The server sends safe, human-readable errors like { error: "message is too long ..." }
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return body as ChatResponse;
}
