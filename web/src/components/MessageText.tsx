import type { ReactNode } from "react";

/** Turns "**bold**" inside a line into <strong> elements. */
function renderInline(line: string): ReactNode[] {
  return line.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4 ? <strong key={i}>{part.slice(2, -2)}</strong> : part
  );
}

/**
 * Shows the agent's text with the little formatting it uses: paragraphs, "- " bullet lists and **bold**.
 * Everything is rendered as React elements (never as raw HTML), so text from the model
 * can't inject HTML or scripts into the page.
 */
export function MessageText({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];
  let paragraph: string[] = [];

  const flushBullets = () => {
    if (bullets.length) {
      blocks.push(<ul key={blocks.length}>{bullets.map((b, i) => <li key={i}>{renderInline(b)}</li>)}</ul>);
      bullets = [];
    }
  };
  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push(
        <p key={blocks.length}>
          {paragraph.map((line, i) => <span key={i}>{i > 0 && <br />}{renderInline(line)}</span>)}
        </p>
      );
      paragraph = [];
    }
  };

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    const bullet = line.match(/^[-*]\s+(.*)$/);
    if (bullet) {
      flushParagraph();
      bullets.push(bullet[1]);
    } else if (line === "") {
      flushBullets();
      flushParagraph();
    } else {
      flushBullets();
      paragraph.push(line);
    }
  }
  flushBullets();
  flushParagraph();

  return <div className="message-text">{blocks}</div>;
}
