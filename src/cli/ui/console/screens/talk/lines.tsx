/** The conversation itself: interim grey, final solid, the agent filling word by word, the marks between. */

import { useEffect, useRef, type ReactNode } from "react";

import { words, type Line, type Mark, type Said } from "./transcript";

// The column says who: the person at this machine is YOU; the agent is the agent.
const WHO: Record<Said["speaker"], string> = { user: "you", agent: "agent" };

/** Every line so far, in a card, scrolled to the last one. Nothing here animates on a timer. */
export function Transcript({ lines }: { lines: Line[] }): ReactNode {
  const stream = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const box = stream.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [lines]);

  return (
    <div className="ui-card">
      <div className="ui-card-head">
        <span className="ui-card-title">This call</span>
        <span className="ui-card-meta">as the room says it</span>
      </div>
      <div className="talk-lines" ref={stream}>
        {lines.map((line) => (line.kind === "said" ? <SaidLine key={line.id} line={line} /> : <MarkLine key={line.id} mark={line} />))}
      </div>
    </div>
  );
}

// A word fades in once, when it arrives — which is when it is spoken. Keyed by position on
// purpose: a word already on screen keeps its key and does not re-animate.
function SaidLine({ line }: { line: Said }): ReactNode {
  return (
    <div className={line.final ? "talk-said" : "talk-said talk-said-interim"}>
      <span className={line.speaker === "agent" ? "talk-who talk-who-agent" : "talk-who"}>{WHO[line.speaker]}</span>
      <p className="talk-said-text">
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
