import { useEffect, useRef } from "react";
import type { Turn } from "../App";
import type { TraceStep } from "../api";
import { TraceStepView } from "./TraceStepView";

interface Props {
  turns: Turn[];
  conversationId?: string;
  loading: boolean;
}

function totalTokens(trace: TraceStep[]) {
  return trace.reduce(
    (sum, step) => (step.kind === "model_call" && step.tokens
      ? { in: sum.in + step.tokens.in, out: sum.out + step.tokens.out }
      : sum),
    { in: 0, out: 0 }
  );
}

/** Shows, for every turn, each step the agents took - the same decision trail as the log file, live. */
export function DebugPanel({ turns, conversationId, loading }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, loading]);

  const conversationTokens = totalTokens(turns.flatMap(t => t.response?.trace ?? []));
  const logFile = [...turns].reverse().find(t => t.response?.logFile)?.response?.logFile;

  return (
    <section className="panel debug" aria-label="Debug panel">
      <div className="debug-header">
        <h2>Debug</h2>
        <div className="debug-meta">
          <span>conversation: <code>{conversationId ? conversationId.slice(0, 8) : "—"}</code></span>
          <span>tokens: {conversationTokens.in} in / {conversationTokens.out} out</span>
          {logFile && <span>log: <code>{logFile}</code></span>}
        </div>
      </div>

      <div className="debug-turns">
        {turns.length === 0 && <p className="empty">Each message's steps will show up here: model calls, tool calls and results, escalations and emails.</p>}

        {turns.map((turn, index) => {
          const tokens = turn.response ? totalTokens(turn.response.trace) : undefined;
          return (
            <div key={turn.id} className="debug-turn">
              <div className="debug-turn-head">
                <span className="turn-number">Turn {index + 1}</span>
                <span className="turn-message">“{turn.message}”</span>
                {tokens && <span className="tokens">{tokens.in} in / {tokens.out} out</span>}
              </div>
              {turn.response && (
                <ol className="steps">
                  {turn.response.trace.map((step, i) => <TraceStepView key={i} step={step} />)}
                </ol>
              )}
              {turn.error && <p className="step error">Request failed: {turn.error}</p>}
              {!turn.response && !turn.error && <p className="working">Agent working…</p>}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    </section>
  );
}
