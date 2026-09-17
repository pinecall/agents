/** The conversation itself, as bubbles: yours on the right, the agent's filling word by word on the left, the marks between — and the box you write into it with. */

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

import { words, type Line, type Mark, type Said } from "./transcript";

/** Every line so far, in a card, scrolled to the last one. Nothing here animates on a timer. */
export function Transcript({ lines, mode, children }: { lines: Line[]; mode: "talk" | "chat"; children?: ReactNode }): ReactNode {
  const stream = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const box = stream.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [lines]);

  return (
    <div className={mode === "chat" ? "talk-whole" : "ui-card"}>
      {mode === "talk" && (
        <div className="ui-card-head">
          <span className="ui-card-title">This call</span>
          <span className="ui-card-meta">spoken or written, as the room says it</span>
        </div>
      )}
      <div className="talk-lines" ref={stream}>
        {lines.length === 0 && <p className="talk-quiet">Nothing said yet. {mode === "talk" ? "What you say and what you write both land here." : "What you write and the agent's replies land here."}</p>}
        {lines.map((line) => (line.kind === "said" ? <SaidLine key={line.id} line={line} /> : <MarkLine key={line.id} mark={line} />))}
      </div>
      {children}
    </div>
  );
}

// A word fades in once, when it arrives — which is when it is spoken. Keyed by position on
// purpose: a word already on screen keeps its key and does not re-animate.
function SaidLine({ line }: { line: Said }): ReactNode {
  return (
    <div className={line.speaker === "user" ? "talk-said talk-said-you" : "talk-said"}>
      <p className={`talk-bubble${line.speaker === "user" ? " talk-bubble-you" : ""}${!line.final || line.pending === true ? " talk-bubble-unsettled" : ""}`}>
        {words(line.text).map((word, at) => (
          <span className="talk-word" key={at}>
            {word}
          </span>
        ))}
        {!line.final && <span className="talk-cursor" aria-hidden />}
      </p>
    </div>
  );
}

function MarkLine({ mark }: { mark: Mark }): ReactNode {
  return <p className={`talk-mark talk-mark-${mark.tone}`}>{mark.text}</p>;
}

/**
 * The box under the conversation: what is typed here goes into the SAME call the microphone is on,
 * so a person speaks or writes as it suits them — a number, an address, a name nobody can spell out loud.
 */
export function Composer({ open, mode, onWrite }: { open: boolean; mode: "talk" | "chat"; onWrite: (text: string) => Promise<void> }): ReactNode {
  const [text, setText] = useState("");

  const send = (event: FormEvent): void => {
    event.preventDefault();
    const said = text.trim();
    if (said === "" || !open) return;
    setText("");
    void onWrite(said);
  };

  return (
    <form className="talk-composer" onSubmit={send}>
      <input
        className="talk-write"
        value={text}
        disabled={!open}
        placeholder={open ? (mode === "talk" ? "Write to the agent — or just speak" : "Write to the agent") : (mode === "talk" ? "Press Call first — then speak or write" : "Press Chat first — then write")}
        onChange={(event) => setText(event.target.value)}
      />
      <button type="submit" className="talk-send" disabled={!open || text.trim() === ""}>
        Send
      </button>
    </form>
  );
}
