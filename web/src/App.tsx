import { useState } from "react";
import { sendMessage, type ChatResponse } from "./api";
import { ChatPanel } from "./components/ChatPanel";
import { DebugPanel } from "./components/DebugPanel";

/** One customer message and what came back for it (the agent's response, or an error). */
export interface Turn {
  id: number;
  message: string;
  sentAt: Date;
  response?: ChatResponse; // undefined while the agent is still working
  error?: string;
  repliedAt?: Date;        // when the response (or error) arrived
}

/**
 * The top component. It owns the conversation state and passes it down:
 * ChatPanel shows the messages, DebugPanel shows what the agents did for each one.
 */
export function App() {
  // useState = data that, when it changes, makes React re-draw the components that use it
  const [conversationId, setConversationId] = useState<string>();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [loading, setLoading] = useState(false);

  async function handleSend(message: string) {
    const id = Date.now();
    // Show the customer's message right away; the response is filled in when it arrives
    setTurns(prev => [...prev, { id, message, sentAt: new Date() }]);
    setLoading(true);
    try {
      const response = await sendMessage(message, conversationId);
      setConversationId(response.conversationId);
      setTurns(prev => prev.map(turn => (turn.id === id ? { ...turn, response, repliedAt: new Date() } : turn)));
    } catch (err) {
      const error = err instanceof Error ? err.message : "Something went wrong.";
      setTurns(prev => prev.map(turn => (turn.id === id ? { ...turn, error, repliedAt: new Date() } : turn)));
    } finally {
      setLoading(false);
    }
  }

  function handleNewConversation() {
    setConversationId(undefined);
    setTurns([]);
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand-name">LookinGood</span>
          <span className="brand-sub">Customer Support</span>
        </div>
        <button className="secondary" onClick={handleNewConversation} disabled={loading || turns.length === 0}>
          New conversation
        </button>
      </header>
      <main className="layout">
        <ChatPanel turns={turns} loading={loading} onSend={handleSend} />
        <DebugPanel turns={turns} conversationId={conversationId} loading={loading} />
      </main>
    </div>
  );
}
