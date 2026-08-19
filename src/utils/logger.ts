import { appendFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import type { LogEntry } from "../types/index.js";

const LOG_DIR = path.resolve("logs");

/**
 * Appends one structured log entry (as a JSON line) to logs/<conversationId>.jsonl.
 * This is what gives you a full, inspectable decision trail per conversation -
 * every tool call, tool result, and final reply - which is the "debuggable in
 * production" story you want to be able to tell in the interview.
 */
export async function logEvent(entry: LogEntry): Promise<void> {
  if (!existsSync(LOG_DIR)) {
    await mkdir(LOG_DIR, { recursive: true });
  }
  const file = path.join(LOG_DIR, `${entry.conversationId}.jsonl`);
  await appendFile(file, JSON.stringify(entry) + "\n", "utf-8");
}
