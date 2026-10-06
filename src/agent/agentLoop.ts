import Anthropic from "@anthropic-ai/sdk";
import { toolDefinitions, executeTool } from "../tools/index.js";
import { systemPrompt } from "./systemPrompt.js";
import { logEvent } from "../utils/logger.js";
import { escalateToHuman } from "../tools/escalateToHuman.js";
import { sendEscalationEmail } from "../utils/email.js";
import { findCustomerEmail } from "../utils/conversation.js";
import type { ToolName } from "../types/index.js";


const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = "claude-sonnet-5";

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;
const MAX_LOOPS = 6;

// Call Claude with the given history, retrying up to MAX_RETRIES times if it fails.
// The function gets the history, and returns the response from Claude: tool_use, end_turn, or error.
async function callClaudeWithRetry(history: Anthropic.MessageParam[]): Promise<Anthropic.Message> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await anthropic.messages.create({
        model: MODEL,
        max_tokens: 1024,
        system: `${systemPrompt}\n\nToday's date is ${new Date().toISOString().slice(0, 10)}.`,
        tools: toolDefinitions,
        messages: history
      });
    } catch (err) {
      lastError = err;
      if (attempt < MAX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      }
    }
  }

  throw lastError;
}

/**
 * The core agent loop. This is the piece that actually makes this an
 * "agent" rather than a single LLM call: it lets Claude request tools,
 * executes them, feeds the results back, and repeats until Claude is
 * ready to give a final answer.
 *
 * On each step: call Claude with the current history. If it responds with
 * "tool_use", execute every requested tool, log the call and result, append
 * both the assistant's tool_use message and a new tool_result message to
 * history, and loop again. Once Claude responds with anything else (e.g.
 * "end_turn"), the reply is the text Claude wrote in all the steps of this
 * turn (including text written alongside tool calls), returned along with the
 * updated history so the caller can keep the conversation going across turns.
 * A max-iteration guard (MAX_LOOPS) stops a confused model from looping forever,
 * and escalates to a human instead.
 */
export async function runAgentLoop(
  conversationId: string,
  userMessage: string,
  history: Anthropic.MessageParam[]
): Promise<{ reply: string; history: Anthropic.MessageParam[] }> {
  let loopCounter = 0;
  // Text the model writes for the customer at every step of this turn - including text written
  // alongside a tool call (e.g. "I'm sorry... I'll escalate this"), not just the final response.
  const replyParts: string[] = [];
  const fullReply = (...extra: string[]) => [...replyParts, ...extra].join("\n\n");
  history.push({ role: "user", content: userMessage });

  await logEvent({
    timestamp: new Date().toISOString(),
    conversationId,
    type: "user_message",
    payload: { message: userMessage }
  });

  while (loopCounter < MAX_LOOPS) {
    loopCounter++;
    let response: Anthropic.Message;
    try {
      response = await callClaudeWithRetry(history);
    } catch (err) {
      await logEvent({
        timestamp: new Date().toISOString(),
        conversationId,
        type: "error",
        payload: { message: err instanceof Error ? err.message : String(err), loopCounter }
      });

      if (loopCounter === 1) {
        history.pop();
      }

      return {
        reply: fullReply("Sorry, I'm having trouble processing that right now — please try again in a moment."),
        history
      };
    }

    await logEvent({
      timestamp: new Date().toISOString(),
      conversationId,
      type: "agent_response",
      payload: response
    });

    const stepText = response.content
      .map(block => (block.type === "text" ? block.text.trim() : ""))
      .filter(Boolean)
      .join("\n\n");
    if (stepText) replyParts.push(stepText);

    if (response.stop_reason === "tool_use") {
      const toolResultBlocks: { type: "tool_result"; tool_use_id: string; content: string }[] = [];
      for (const block of response.content) {
        if (block.type === "tool_use") {
          const result = await executeTool(block.name as ToolName, block.input, conversationId);

          await logEvent({
            timestamp: new Date().toISOString(),
            conversationId,
            type: "tool_result",
            payload: { tool: block.name, input: block.input, result }
          });

          toolResultBlocks.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify(result)
          });
        }
      }

      history.push({ role: "assistant", content: response.content });
      history.push({ role: "user", content: toolResultBlocks });

      continue;
    }

    const replyText = fullReply();

    await logEvent({
      timestamp: new Date().toISOString(),
      conversationId,
      type: "agent_response",
      payload: { reply: replyText }
    });

    return { reply: replyText, history };
  }

  // Fallback: the model didn't reach a final answer within MAX_LOOPS steps, so escalate
  // directly (no second model call) with a fixed reason and urgency.
  const customerEmail = findCustomerEmail(history);
  const escalation = await escalateToHuman({
    reason: "max_iterations_exceeded",
    summary: `The agent could not resolve this conversation within ${MAX_LOOPS} steps (conversation ${conversationId}).\n` +
      `Customer's last message: "${userMessage}"\nCustomer email: ${customerEmail ?? "unknown"}`,
    urgency: "medium"
  }) as { escalated: boolean };

  await logEvent({
    timestamp: new Date().toISOString(),
    conversationId,
    type: "escalation",
    payload: { reason: "max_iterations_exceeded", customerEmail: customerEmail ?? "unknown", result: escalation }
  });

  // As with a normal handoff: confirm by email only if the team received it and we know who the customer is.
  let emailSent = false;
  if (escalation.escalated && customerEmail) {
    const email = await sendEscalationEmail(customerEmail, conversationId);
    await logEvent({
      timestamp: new Date().toISOString(),
      conversationId,
      type: "email",
      payload: email
    });
    emailSent = email.sent;
  }

  return {
    reply: fullReply(escalation.escalated
      ? `I'm having trouble completing this right now, so I've passed your request to a team member who will follow up shortly.${emailSent ? " You'll also get a confirmation email." : ""}`
      : "I'm having trouble completing this right now — please try again in a moment."),
    history
  };
}
