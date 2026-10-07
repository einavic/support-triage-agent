# Support Triage Agent

An agentic customer support assistant for a fictional company ("LookinGood", a cosmetics brand), built to practice the core skills of a Forward Deployed Engineer: a Claude tool-calling loop, integration with a real external system (Slack), and a decision trail suitable for debugging in production.

## What it does

A customer sends a message. The agent decides, turn by turn, how to help:

- answers from a knowledge base of policy/FAQ articles via `search_knowledge_base`
- looks up the customer's real order/account data via `lookup_account`
- hands off to a dedicated escalation agent when it's not confident, the request needs authority it doesn't have (e.g. approving a refund exception), or the customer is upset
- before handing off, makes sure it knows who the customer is (their email, given directly or found from an order id), so the team can follow up
- after a successful escalation, emails the customer a confirmation that their request reached the support team (in addition to the chat reply)

Every customer message, tool call, model response, and final reply is logged, so a full decision trail is inspectable after the fact — not just the final answer, but every step that led to it. Each conversation gets two files in `logs/`, named after the local date and time it started (e.g. `2026-10-03_16-25-41`):

- `.log` — a readable transcript (customer, agent tool calls with token counts, tool results, escalations, reply)
- `.jsonl` — the full raw events, one JSON object per line, for deep debugging

## Architecture

```
User message
    -> agentLoop.ts  (calls Claude with tools + system prompt/policy, retries on API errors)
         -> if Claude requests a tool:
              -> tools/index.ts dispatches to the right handler
                   -> searchKnowledgeBase.ts   (semantic search over data/knowledgeBase.json with Voyage AI
                                                embeddings, see rag/; keyword search as fallback)
                   -> lookupAccount.ts          (looks up data/customers.json by email or order id)
                   -> hand_off_to_escalation_agent -> escalationAgent.ts
                        (a second Claude call with its own system prompt: decides urgency,
                         writes a human-readable summary, then calls escalateToHuman.ts
                         which posts to a Slack webhook; if that succeeds, utils/email.ts
                         sends the customer a confirmation email via Resend)
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
   - `RESEND_API_KEY` and `EMAIL_TEST_RECIPIENT` (optional) - for confirmation emails. Create a "Sending access" API key at resend.com and set `EMAIL_TEST_RECIPIENT` to the address you signed up with. The demo's customer addresses are fake, so **every email goes to `EMAIL_TEST_RECIPIENT`** (the intended customer is named in the email); if either is unset, no email is sent.
3. `npm run dev` for the interactive CLI, or `npm run scenarios` to run scripted conversations that exercise each path (knowledge base answer, account lookup, angry customer, out-of-policy refund, damage not covered by the quality guarantee, cancellation, skin reaction return).
4. `npm run server` starts the web API on http://localhost:3000 (see below).
5. Chat UI (React): run `npm install --prefix web` once, then either
   - **development:** `npm run server` and, in a second terminal, `npm run web` → open http://localhost:5173 (changes to the page reload instantly), or
   - **built version:** `npm run web:build` once, then `npm run server` → open http://localhost:3000 (one process serves both the page and the API).
6. `npm test` runs the offline unit tests (no API keys needed; Slack, email, embeddings and the agent are mocked).
7. `npm run eval:retrieval` runs the retrieval evaluation (needs `VOYAGE_API_KEY`; see below).

## Retrieval (RAG)

`search_knowledge_base` searches by meaning, not just matching words:

- **Indexing** — each article (title, topics, content) is turned into an embedding with Voyage AI (`voyage-3.5-lite`, `src/rag/`). Embeddings are cached in `.cache/embeddings.json`, keyed by a hash of model + text, so a text is only ever embedded once; a changed article is simply re-embedded.
- **Search** — the question is embedded (as a *query*), compared with every article by cosine similarity, and the top 2 articles scoring at least `KB_MIN_SCORE` (0.40) are returned **with their scores**, so Claude can judge a loosely related match. Nothing above the threshold → `found: false`.
- **Fallback** — if the embedding API fails (no key, outage, rate limit), the tool falls back to keyword search and says so in the result (`method`, `fallbackReason`), which the debug panel shows.

**Evaluation** — `eval/retrieval-set.json` holds 41 real customer-style questions (typos, slang, Hebrew, off-topic messages), each labeled with the article/product it should find, or with "nothing". `npm run eval:retrieval` scores keyword search against embedding search (Hit@1, Hit@3, MRR, and how often "nothing" is correctly returned), sweeps thresholds, lists every failure, and saves the report to `eval/results/`. First run (2026-10-07):

| Collection | Keywords (overall) | Embeddings (overall, best threshold) |
|---|---|---|
| Knowledge base (34 questions) | 44% | 71% — Hit@1 40% → 76% without threshold, MRR 0.55 → 0.85 |
| Products (14 questions) | 43% | 86% — only misses: "cheapest" and "under $20" (price filtering, not meaning) |

The answerable and unanswerable questions' scores overlap (0.37–0.71 vs 0.33–0.51), so no threshold separates them perfectly — hence the lenient 0.40 plus letting Claude judge. Caveats: small sample, threshold chosen on the same questions, and raw customer messages (the agent rewrites them into cleaner queries first).

## Web API

`src/server/` is an Express server (listening on `127.0.0.1` only) that runs the same agent as the CLI:

- `POST /api/chat` with `{ "message": "...", "conversationId": "..." }` (leave out `conversationId` to start a new conversation) returns:
  - `conversationId` — send it back with the next message to continue the conversation
  - `reply` — the agent's answer
  - `escalated` — whether this turn handed the conversation to the support team
  - `trace` — every step the agents took this turn (model calls with token counts, tool calls and results, escalation, email), built live from the same events the logger writes
  - `logFile` — the conversation's readable log file
- `GET /api/health` — a simple liveness check

## Chat UI

`web/` is a React + TypeScript app built with Vite: a chat on the left and a **debug panel** on the right that shows, for every message, each step the agents took — main-agent model calls (with token counts and the tools they called), tool results (with a one-line summary and the full JSON), the escalation agent's urgency and Slack summary, and whether the confirmation email was sent. It's the same decision trail as the `.log` file, live next to the conversation. The app imports the API's response types from `src/server/trace.ts`, so a change in the API's shape is caught by TypeScript in the UI too. Agent replies are rendered as React elements (never raw HTML), so model output can't inject markup into the page.

Conversation history is kept in memory per conversation (lost when the server restarts). The server creates all conversation ids itself, allows one running turn per conversation at a time, limits messages to 2000 characters, and never sends internal error details to the client.

Requires Node 18+ (20+ recommended, for JSON import attributes).

## Design decisions worth knowing about

- **Fixed 1-second retry delay (2 attempts) instead of exponential backoff** — deliberate scope cut. Fine for a single local user hitting the API directly; a production version fielding many concurrent conversations would need backoff + jitter to avoid hammering a rate limit.
- **In-memory vector search instead of a vector database** — with 8 articles and 20 products, comparing the question against every embedding is instant. Past a few thousand documents this would move to a vector database (or an approximate-nearest-neighbor index), without changing the tool interface.
- **JSON files instead of a real datastore** — `data/customers.json` and `data/knowledgeBase.json` stand in for a database. Swapping them for a real DB wouldn't change the tool interface, just the implementation behind `lookupAccount.ts` / `searchKnowledgeBase.ts`.
- **No auth/session persistence** — conversation history lives in memory for the process lifetime (in the CLI, and per conversation in the web API). A real deployment would need session storage that survives a server restart.

## What I'd build next

- Add an eval harness to measure how often escalation decisions are actually correct (not just whether the agent escalates, but whether it *should have*)
- Route escalations by topic/urgency to different Slack channels instead of one webhook
