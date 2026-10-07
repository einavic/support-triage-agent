import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { Turn } from "../App";
import { MessageText } from "./MessageText";

const MAX_LENGTH = 2000; // same limit as the server

/** "14:05" */
const hhmm = (date: Date) => date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });

interface Props {
  turns: Turn[];
  loading: boolean;
  onSend: (message: string) => void;
}

/** The chat: the conversation so far, and the box to type the next message. */
export function ChatPanel({ turns, loading, onSend }: Props) {
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  // useEffect runs after React updates the screen: here, scroll to the newest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, loading]);

  function submit(e?: { preventDefault(): void }) {
    e?.preventDefault();
    const message = draft.trim();
    if (!message || loading) return;
    onSend(message);
    setDraft("");
  }

  // Enter sends, Shift+Enter adds a new line
  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <section className="panel chat" aria-label="Chat">
      <div className="messages">
        {turns.length === 0 && (
          <div className="empty">
            <p>Hi! Ask about shipping, returns, your order, or anything else.</p>
            <p className="hint">Try: "Hi, I'm dana.levy@example.com - what's the status of ord-5001?"</p>
          </div>
        )}

        {turns.map(turn => (
          <div key={turn.id} className="turn">
            <div className="bubble customer">
              {turn.message}
              <time className="msg-time">{hhmm(turn.sentAt)}</time>
            </div>

            {turn.response && (
              <div className="bubble agent">
                <MessageText text={turn.response.reply} />
                {turn.response.escalated && <span className="badge escalated">Escalated to the support team</span>}
                {turn.repliedAt && <time className="msg-time">{hhmm(turn.repliedAt)}</time>}
              </div>
            )}
            {turn.error && (
              <div className="bubble error">
                {turn.error}
                {turn.repliedAt && <time className="msg-time">{hhmm(turn.repliedAt)}</time>}
              </div>
            )}
          </div>
        ))}

        {loading && <div className="bubble agent typing">Agent is typing…</div>}
        <div ref={bottomRef} />
      </div>

      <form className="composer" onSubmit={submit}>
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type your message… (Enter to send, Shift+Enter for a new line)"
          maxLength={MAX_LENGTH}
          rows={2}
          disabled={loading}
          aria-label="Message"
        />
        <button type="submit" disabled={loading || draft.trim() === ""}>Send</button>
      </form>
    </section>
  );
}
