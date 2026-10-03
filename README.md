# Support Triage Agent

An agentic customer support assistant for a fictional company ("LookinGood", a cosmetics brand), built to practice the core skills of a Forward Deployed Engineer: a Claude tool-calling loop, integration with a real external system (Slack), and a decision trail suitable for debugging in production.

## What it does

A customer sends a message. The agent decides, turn by turn, how to help:

- answers from a knowledge base of policy/FAQ articles via `search_knowledge_base`
- looks up the customer's real order/account data via `lookup_account`
- hands off to a dedicated escalation agent when it's not confident, the request needs authority it doesn't have (e.g. approving a refund exception), or the customer is upset

Every customer message, tool call, model response, and final reply is logged, so a full decision trail is inspectable after the fact — not just the final answer, but every step that led to it. Each conversation gets two files in `logs/`, named after the local date and time it started (e.g. `2026-10-03_16-25-41`):

- `.log` — a readable transcript (customer, agent tool calls with token counts, tool results, escalations, reply)
- `.jsonl` — the full raw events, one JSON object per line, for deep debugging

## Architecture

```
User message
    -> agentLoop.ts  (calls Claude with tools + system prompt/policy, retries on API errors)
         -> if Claude requests a tool:
              -> tools/index.ts dispatches to the right handler
                   -> searchKnowledgeBase.ts   (keyword-scores data/knowledgeBase.json, see utils/retrieval.ts)
                   -> lookupAccount.ts          (looks up data/customers.json by email or order id)
                   -> hand_off_to_escalation_agent -> escalationAgent.ts
                        (a second Claude call with its own system prompt: decides urgency,
                         writes a human-readable summary, then calls escalateToHuman.ts
                         which posts to a Slack webhook)
              -> result fed back to Claude, loop continues (max 6 iterations, then a
                 fallback escalation so a confused model can't loop forever)
         -> once Claude has a final answer: return it, log it
```

The escalation path is a small multi-agent handoff rather than a plain function call: the main agent doesn't decide urgency or write the Slack message itself, it delegates that to a specialist agent with a narrower job and its own prompt. That mirrors how a real support/HR workflow would split "handle the conversation" from "triage what gets escalated."

`src/mcp-server.ts` exposes the same three tools over the Model Context Protocol (including the handoff to the escalation agent, so it needs `ANTHROPIC_API_KEY` as well as `SLACK_WEBHOOK_URL`) as a separate entry point (run/tested via `src/test-mcp-client.ts`) — a way to check that the tools work as standalone, reusable capabilities rather than being hardcoded into this one CLI.

## Setup

1. `npm install`
2. Copy `.env.example` to `.env` and fill in:
   - `ANTHROPIC_API_KEY` - from console.anthropic.com
   - `SLACK_WEBHOOK_URL` - create a free Incoming Webhook at api.slack.com/messaging/webhooks (takes ~5 min)
3. `npm run dev` for the interactive CLI, or `npm run scenarios` to run scripted conversations that exercise each path (knowledge base answer, account lookup, angry customer, out-of-policy refund, damage not covered by the quality guarantee, cancellation, skin reaction return).
4. `npm test` runs the offline unit tests (no API keys needed; Slack calls are mocked).

Requires Node 18+ (20+ recommended, for JSON import attributes).

## Design decisions worth knowing about

- **Fixed 1-second retry delay (2 attempts) instead of exponential backoff** — deliberate scope cut. Fine for a single local user hitting the API directly; a production version fielding many concurrent conversations would need backoff + jitter to avoid hammering a rate limit.
- **Naive keyword scoring instead of embeddings** — `utils/retrieval.ts` scores articles by whether query words appear in tags/title/content. Works fine for 7 knowledge base articles, would not scale past a few dozen. `utils/embeddings.ts` already wraps the Voyage AI embeddings API as a starting point for swapping in real vector search.
- **JSON files instead of a real datastore** — `data/customers.json` and `data/knowledgeBase.json` stand in for a database. Swapping them for a real DB wouldn't change the tool interface, just the implementation behind `lookupAccount.ts` / `searchKnowledgeBase.ts`.
- **No auth/session persistence** — single-user CLI, conversation history lives in memory for the process lifetime. A real deployment would need session storage that survives a server restart.

## What I'd build next

- Swap naive retrieval for the embeddings pipeline that's already stubbed in
- Add unit tests per tool handler, plus an eval harness to measure how often escalation decisions are actually correct (not just whether the agent escalates, but whether it *should have*)
- Route escalations by topic/urgency to different Slack channels instead of one webhook
- Add a lightweight web or Slack-bot front end instead of CLI
