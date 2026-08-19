import type { EscalateToHumanInput } from "../types/index.js";

/**
 * Tool handler for `escalate_to_human`. Posts a formatted message to a Slack
 * Incoming Webhook. If no webhook is configured (e.g. local dev without
 * Slack set up), logs a warning and returns gracefully instead of crashing.
 */
export async function escalateToHuman(input: EscalateToHumanInput): Promise<unknown> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;

  if (!webhookUrl) {
    console.warn("SLACK_WEBHOOK_URL not set - skipping Slack escalation.");
    return { escalated: false, note: "Escalation not sent (Slack not configured)." };
  }

  const text = `[${input.urgency}] ${input.reason}\n${input.summary}`;
  const response = await fetch(webhookUrl, { 
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text })
  });

  if (!response.ok) {
    console.warn(`Slack escalation failed: ${response.status}`);
    return { escalated: false, note: "Escalation attempt failed." };
  }

  return { escalated: true, note: "A team member will follow up shortly." };
}
