import Anthropic from "@anthropic-ai/sdk";
import { escalateToHuman } from "../tools/escalateToHuman.js";
import { logEvent } from "../utils/logger.js";
import { sendEscalationEmail } from "../utils/email.js";
import type { EscalateToHumanInput, HandOffToEscalationAgentInput } from "../types/index.js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = "claude-sonnet-5";

const escalationSystemPrompt = `
You are an escalation specialist for LookinGood's customer support.

You receive a reason and context handed off to you by the main support agent, describing a conversation that needs human attention. Your job:
1. Decide the urgency: "low", "medium", or "high". Health or safety issues (e.g. a severe skin reaction) are always "high".
2. Write a clear, human-readable summary for the human support agent who will pick this up.
3. Call escalate_to_human with your reason, summary, and urgency.

Always call escalate_to_human - that is your only job.
`.trim();

const escalationTool: Anthropic.Tool = {
  name: "escalate_to_human",
  description: "Escalate to a human via Slack with a reason, summary, and urgency.",
  input_schema: {
    type: "object",
    properties: {
      reason: { type: "string", description: "Short machine-readable reason." },
      summary: { type: "string", description: "Human-readable summary for the support agent." },
      urgency: { type: "string", enum: ["low", "medium", "high"] }
    },
    required: ["reason", "summary", "urgency"]
  }
};

export async function runEscalationAgent(conversationId: string, input: HandOffToEscalationAgentInput): Promise<unknown> {
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 512,
    system: escalationSystemPrompt,
    tools: [escalationTool],
    messages: [{ role: "user", content: `Reason for handoff: ${input.reason}\nCustomer email: ${input.customerEmail}\n\nContext:\n${input.context}` }]
  });

  await logEvent({
    timestamp: new Date().toISOString(),
    conversationId: conversationId,
    type: "escalation",
    payload: response
  });

  for (const block of response.content) {
    if (block.type === "tool_use" && block.name === "escalate_to_human") {
      const escalation = block.input as EscalateToHumanInput;
      // The customer's email is always added to the Slack message, so the team knows who to contact.
      const result = await escalateToHuman({
        ...escalation,
        summary: `${escalation.summary}\nCustomer email: ${input.customerEmail}`
      }) as { escalated: boolean; note: string };

      // Only confirm to the customer by email once the team actually received the escalation.
      if (!result.escalated) return { ...result, emailSent: false };

      const email = await sendEscalationEmail(input.customerEmail, conversationId);
      await logEvent({
        timestamp: new Date().toISOString(),
        conversationId,
        type: "email",
        payload: email
      });
      return { ...result, emailSent: email.sent };
    }
  }

  return { escalated: false, emailSent: false, note: "Escalation specialist did not escalate." };
}