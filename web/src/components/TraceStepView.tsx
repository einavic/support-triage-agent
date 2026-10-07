import type { TraceStep } from "../api";

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour12: false });

/** A collapsible block with pretty-printed JSON. */
function Json({ label, value }: { label: string; value: unknown }) {
  return (
    <details className="json">
      <summary>{label}</summary>
      <pre>{JSON.stringify(value, null, 2)}</pre>
    </details>
  );
}

/** A one-line summary of a tool result, so the panel is readable without opening the JSON. */
function summarizeResult(tool: string, result: unknown): string {
  const r = (result ?? {}) as Record<string, any>;
  switch (tool) {
    case "search_knowledge_base": {
      const method = `${r.method ?? "search"}${r.fallbackReason ? ` (fallback: ${r.fallbackReason})` : ""}`;
      const found = (r.articles ?? [])
        .map((a: { id: string; score?: number }) => (a.score !== undefined ? `${a.id} (${a.score})` : a.id))
        .join(", ");
      return r.found ? `${method}: ${found}` : `${method}: no matching articles`;
    }
    case "lookup_account":
      return r.found ? `found ${r.customer?.name ?? "customer"} (${r.customer?.id}), ${r.customer?.orders?.length ?? 0} order(s)` : "no matching account";
    case "hand_off_to_escalation_agent":
      return `escalated: ${r.escalated ? "yes" : "no"}, email sent: ${r.emailSent ? "yes" : "no"}`;
    default:
      return "";
  }
}

/** One step the agents took: a model call, a tool result, an email, an error... */
export function TraceStepView({ step }: { step: TraceStep }) {
  switch (step.kind) {
    case "model_call": {
      const isEscalation = step.agent === "escalation";
      const escalateCall = step.toolCalls.find(c => c.name === "escalate_to_human")?.input as
        | { urgency?: string; reason?: string; summary?: string }
        | undefined;
      return (
        <li className={`step model ${isEscalation ? "escalation" : ""}`}>
          <div className="step-head">
            <span className="step-time">{time(step.time)}</span>
            <span className="step-title">{isEscalation ? "Escalation agent" : step.final ? "Main agent: reply" : "Main agent"}</span>
            {step.tokens && <span className="tokens">{step.tokens.in} in / {step.tokens.out} out</span>}
          </div>

          {step.text && !step.final && <p className="step-text">“{step.text}”</p>}

          {step.toolCalls.map((call, i) => (
            <div key={i} className="tool-call">
              <span className="arrow">→</span> <code>{call.name}</code>
              <Json label="input" value={call.input} />
            </div>
          ))}

          {escalateCall && (
            <div className="escalation-info">
              <span className={`badge urgency-${escalateCall.urgency}`}>urgency: {escalateCall.urgency}</span>
              <span className="badge">{escalateCall.reason}</span>
              <p className="step-text">{escalateCall.summary}</p>
            </div>
          )}
        </li>
      );
    }

    case "tool_result":
      return (
        <li className="step result">
          <div className="step-head">
            <span className="step-time">{time(step.time)}</span>
            <span className="step-title">Result ← <code>{step.tool}</code></span>
          </div>
          <p className="step-summary">{summarizeResult(step.tool, step.result)}</p>
          <Json label="full result" value={step.result} />
        </li>
      );

    case "email":
      return (
        <li className={`step email ${step.sent ? "" : "warn"}`}>
          <div className="step-head">
            <span className="step-time">{time(step.time)}</span>
            <span className="step-title">Confirmation email {step.sent ? "sent" : "not sent"}</span>
          </div>
          <p className="step-summary">
            {step.sent ? `to ${step.sentTo} (meant for ${step.intendedFor})` : step.note}
          </p>
        </li>
      );

    case "fallback_escalation":
      return (
        <li className="step warn">
          <div className="step-head">
            <span className="step-time">{time(step.time)}</span>
            <span className="step-title">Fallback escalation (agent got stuck)</span>
          </div>
          <Json label="details" value={step.details} />
        </li>
      );

    case "error":
      return (
        <li className="step error">
          <div className="step-head">
            <span className="step-time">{time(step.time)}</span>
            <span className="step-title">Error</span>
          </div>
          <p className="step-summary">{step.message}</p>
        </li>
      );
  }
}
