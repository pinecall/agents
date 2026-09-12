/** The conversation itself: interim grey, final solid, the agent filling word by word, the marks between. */

import { useEffect, useRef, type ReactNode } from "react";

import { words, type Line, type Mark, type Said } from "./transcript";

// The column says who: the person at this machine is YOU, in the accent; the agent is the agent.
const WHO: Record<Said["speaker"], string> = { user: "you", agent: "agent" };

/** Every line so far, scrolled to the last one. Nothing here animates on a timer. */
export function Transcript({ lines, empty }: { lines: Line[]; empty: string }): ReactNode {
  const stream = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const box = stream.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [lines]);

  if (lines.length === 0) {
    return (
      <div className="stream stream-empty" ref={stream}>
        <p className="stream-hint fixed">{empty}</p>
      </div>
    );
  }
  return (
    <div className="stream" ref={stream}>
      {lines.map((line) => (line.kind === "said" ? <SaidLine key={line.id} line={line} /> : <MarkLine key={line.id} mark={line} />))}
    </div>
  );
}

// A word fades in once, when it arrives — which is when it is spoken. Keyed by position on
// purpose: a word already on screen keeps its key and does not re-animate.
function SaidLine({ line }: { line: Said }): ReactNode {
  const classes = ["said", `said-${line.speaker}`, line.final ? "" : "said-interim"].filter(Boolean).join(" ");
  return (
    <article className={classes}>
      <div className="said-who fixed">{WHO[line.speaker]}</div>
      <p className="said-text">
        {words(line.text).map((word, at) => (
          <span className="said-word" key={at}>
            {word}
          </span>
        ))}
        {!line.final && <span className="said-cursor" aria-hidden />}
      </p>
    </article>
  );
}

function MarkLine({ mark }: { mark: Mark }): ReactNode {
  return <p className={`said-mark said-mark-${mark.tone} fixed`}>{mark.text}</p>;
}
