import Anthropic from "@anthropic-ai/sdk";
import { toolDefinitions, executeTool } from "../tools/index.js";
import { systemPrompt } from "./systemPrompt.js";
import { logEvent } from "../utils/logger.js";
import type { ToolName } from "../types/index.js";


const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = "claude-sonnet-5";

/**
 * The core agent loop. This is the piece that actually makes this an
 * "agent" rather than a single LLM call: it lets Claude request tools,
 * executes them, feeds the results back, and repeats until Claude is
 * ready to give a final answer.
 *
 * On each turn: call Claude with the current history. If it responds with
 * "tool_use", execute every requested tool, log the call and result, append
 * both the assistant's tool_use message and a new tool_result message to
 * history, and loop again. Once Claude responds with anything else (e.g.
 * "end_turn"), extract the text as the final reply and return it along with
 * the updated history, so index.ts can keep the conversation going across
 * turns. A max-iteration guard (6 loops) stops a confused model from
 * looping forever.
 */

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;

async function callClaudeWithRetry(history: Anthropic.MessageParam[]): Promise<Anthropic.Message> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await anthropic.messages.create({
        model: MODEL,
        max_tokens: 1024,
        system: systemPrompt,
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


export async function runAgentLoop(
  conversationId: string,
  userMessage: string,
  history: Anthropic.MessageParam[]
): Promise<{ reply: string; history: Anthropic.MessageParam[] }> {
    
    let loopCounter = 0;
    history.push({ role: "user", content: userMessage });
    
    while (loopCounter < 6) {      
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
          reply: "Sorry, I'm having trouble processing that right now — please try again in a moment.",
          history
        };
      }

      await logEvent({
        timestamp: new Date().toISOString(),
        conversationId,
        type: "agent_response",
       payload: response
      }); 
      
      if (response.stop_reason === "tool_use") {
        const toolResultBlocks: { type: "tool_result"; tool_use_id: string; content: string }[] = [];
        for (const block of response.content) {
          if (block.type === "tool_use") {
            const result = await executeTool(block.name as ToolName, block.input, conversationId as string);

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

      let replyText = "";
      for (const block of response.content) {
        if (block.type === "text") {
          replyText += block.text;
        }
      }

      await logEvent({
        timestamp: new Date().toISOString(),
        conversationId,
        type: "agent_response",
        payload: { reply: replyText }
      });

      return { reply: replyText, history };
    } 
    return {
    reply: "I'm having trouble completing this right now — let me get a human to help.",
    history
  };
}

