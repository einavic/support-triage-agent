import { appendFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import type { LogEntry } from "../types/index.js";

// LOG_DIR can be overridden (tests write their logs to a temporary folder instead of logs/)
const LOG_DIR = path.resolve(process.env.LOG_DIR ?? "logs");

// conversationId -> file name (without extension), fixed by the conversation's first event
const fileNames = new Map<string, string>();

// Functions called with every logged event (e.g. the web server collecting a live trace for its debug panel)
const listeners = new Set<(entry: LogEntry) => void>();

/** Calls `listener` for every event logged from now on. Returns a function that stops listening. */
export function onLogEvent(listener: (entry: LogEntry) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The log file name (without extension) for a conversation, once it has logged its first event. */
export function getLogFileName(conversationId: string): string | undefined {
  return fileNames.get(conversationId);
}

/**
 * Logs one event for a conversation to two files in logs/, both named after the
 * local date and time the conversation started (e.g. 2026-10-03_16-25-41):
 *  - .log   a readable transcript: customer messages, tool calls and results,
 *           escalations, and the final reply
 *  - .jsonl the full raw event (one JSON object per line), for deep debugging
 */
export async function logEvent(entry: LogEntry): Promise<void> {
  for (const listener of listeners) listener(entry);

  if (!existsSync(LOG_DIR)) {
    await mkdir(LOG_DIR, { recursive: true });
  }

  let fileName = fileNames.get(entry.conversationId);
  if (!fileName) {
    fileName = uniqueFileName(new Date(entry.timestamp));
    fileNames.set(entry.conversationId, fileName);
    const header = `=== Conversation ${entry.conversationId} | started ${formatDateTime(new Date(entry.timestamp))} ===\n`;
    await appendFile(path.join(LOG_DIR, `${fileName}.log`), header, "utf-8");
  }

  await appendFile(path.join(LOG_DIR, `${fileName}.jsonl`), JSON.stringify(entry) + "\n", "utf-8");

  const readable = formatEntry(entry);
  if (readable) {
    await appendFile(path.join(LOG_DIR, `${fileName}.log`), readable, "utf-8");
  }
}

function uniqueFileName(date: Date): string {
  const base = formatDateTime(date).replace(" ", "_").replaceAll(":", "-");
  let name = base;
  for (let n = 2; existsSync(path.join(LOG_DIR, `${name}.log`)) || existsSync(path.join(LOG_DIR, `${name}.jsonl`)); n++) {
    name = `${base}-${n}`;
  }
  return name;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Local time as "YYYY-MM-DD HH:MM:SS". */
function formatDateTime(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/** Renders a value as indented "key: value" lines. */
function renderValue(value: unknown, indent: string): string {
  if (value === null || typeof value !== "object") {
    const text = typeof value === "string" ? value : JSON.stringify(value);
    return text.split("\n").join(`\n${indent}`);
  }
  if (Array.isArray(value)) {
    return value.map(item => `\n${indent}- ${renderValue(item, indent + "  ").trimStart()}`).join("");
  }
  return Object.entries(value)
    .map(([key, v]) => {
      const rendered = renderValue(v, indent + "  ");
      return typeof v === "object" && v !== null ? `\n${indent}${key}:${rendered}` : `\n${indent}${key}: ${rendered}`;
    })
    .join("");
}

type ContentBlock = { type: string; text?: string; name?: string; input?: unknown };
type ModelResponse = {
  stop_reason?: string;
  content: ContentBlock[];
  usage?: { input_tokens: number; output_tokens: number };
};

const isModelResponse = (payload: unknown): payload is ModelResponse =>
  typeof payload === "object" && payload !== null && Array.isArray((payload as ModelResponse).content);

function renderModelResponse(label: string, time: string, response: ModelResponse): string {
  const tokens = response.usage ? `   (tokens: ${response.usage.input_tokens} in / ${response.usage.output_tokens} out)` : "";
  let out = `\n[${time}] ${label}${tokens}`;
  for (const block of response.content) {
    if (block.type === "text" && block.text) {
      out += `\n  ${block.text.split("\n").join("\n  ")}`;
    } else if (block.type === "tool_use") {
      out += `\n  -> ${block.name}${renderValue(block.input, "     ")}`;
    }
  }
  return out + "\n";
}

/**
 * Turns one log entry into readable transcript lines (or "" to skip it).
 * The raw API responses become: tool calls as "AGENT -> tool", the final answer as "REPLY".
 */
export function formatEntry(entry: LogEntry): string {
  const time = formatDateTime(new Date(entry.timestamp)).slice(11);
  const payload = entry.payload as Record<string, unknown>;

  switch (entry.type) {
    case "user_message":
      return `\n[${time}] CUSTOMER\n  ${String(payload.message).split("\n").join("\n  ")}\n`;

    case "agent_response":
      // { reply } repeats the text of the final model response, which is already shown as REPLY
      if (!isModelResponse(payload)) return "";
      return renderModelResponse(payload.stop_reason === "tool_use" ? "AGENT" : "REPLY", time, payload);

    case "tool_result":
      return `[${time}] RESULT <- ${payload.tool}${renderValue(payload.result, "  ")}\n`;

    case "escalation":
      if (isModelResponse(payload)) return renderModelResponse("ESCALATION AGENT", time, payload);
      return `\n[${time}] FALLBACK ESCALATION${renderValue(payload, "  ")}\n`;

    case "email":
      return `[${time}] EMAIL${renderValue(payload, "  ")}\n`;

    case "error":
      return `\n[${time}] ERROR${renderValue(payload, "  ")}\n`;
  }
}
