import express, { type NextFunction, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import type Anthropic from "@anthropic-ai/sdk";
import { onLogEvent, getLogFileName } from "../utils/logger.js";
import { toTraceSteps, type ChatResponse, type TraceStep } from "./trace.js";
import type { LogEntry } from "../types/index.js";

export const MAX_MESSAGE_LENGTH = 2000;

/** Same shape as runAgentLoop - passed in so tests can use a fake agent instead of calling Claude. */
export type RunAgent = (
  conversationId: string,
  message: string,
  history: Anthropic.MessageParam[]
) => Promise<{ reply: string; history: Anthropic.MessageParam[] }>;

interface Session {
  history: Anthropic.MessageParam[];
  busy: boolean; // a turn is running - a second message must wait, or the history would get mixed up
}

/** True if this turn handed the conversation to the support team. */
function wasEscalated(trace: TraceStep[]): boolean {
  return trace.some(step => {
    if (step.kind === "tool_result" && step.tool === "hand_off_to_escalation_agent") {
      return (step.result as { escalated?: boolean } | undefined)?.escalated === true;
    }
    if (step.kind === "fallback_escalation") {
      return (step.details as { result?: { escalated?: boolean } }).result?.escalated === true;
    }
    return false;
  });
}

export function createApp(runAgent: RunAgent) {
  const app = express();
  // conversationId -> session. In memory: conversations are lost when the server restarts.
  const sessions = new Map<string, Session>();

  app.use(express.json({ limit: "20kb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.post("/api/chat", async (req: Request, res: Response) => {
    const { message, conversationId } = req.body ?? {};

    if (typeof message !== "string" || message.trim() === "") {
      res.status(400).json({ error: "message is required." });
      return;
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
      res.status(400).json({ error: `message is too long (max ${MAX_MESSAGE_LENGTH} characters).` });
      return;
    }

    // Continue an existing conversation, or start a new one. The server always creates the ids,
    // so a client can't pick an id of its own.
    let id = typeof conversationId === "string" && sessions.has(conversationId) ? conversationId : undefined;
    if (!id) {
      id = randomUUID();
      sessions.set(id, { history: [], busy: false });
    }
    const session = sessions.get(id)!;

    if (session.busy) {
      res.status(409).json({ error: "Still answering the previous message - please wait." });
      return;
    }
    session.busy = true;

    // Collect this conversation's log events while the agent runs, for the debug panel.
    const events: LogEntry[] = [];
    const stopListening = onLogEvent(entry => {
      if (entry.conversationId === id) events.push(entry);
    });

    try {
      const result = await runAgent(id, message.trim(), session.history);
      session.history = result.history;
      const trace = toTraceSteps(events);
      const logFileName = getLogFileName(id);
      const body: ChatResponse = {
        conversationId: id,
        reply: result.reply,
        escalated: wasEscalated(trace),
        trace,
        logFile: logFileName ? `logs/${logFileName}.log` : undefined
      };
      res.json(body);
    } catch (err) {
      // Details go to the server console, never to the browser.
      console.error("Chat request failed:", err);
      res.status(500).json({ error: "Something went wrong - please try again." });
    } finally {
      stopListening();
      session.busy = false;
    }
  });

  // Invalid JSON and other request errors: answer in JSON, without internal details.
  app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status && err.status < 500 ? err.status : 500;
    if (status === 500) console.error("Request failed:", err);
    res.status(status).json({ error: status === 500 ? "Something went wrong - please try again." : "Invalid request." });
  });

  return app;
}
