/** One row of a call's timeline: the seq, the kind of thing it is, what it says — and more, one click under. */

import type { ReactNode } from "react";

/** The kinds a row can be; the tone is the colour the kind column and the row's ground take. */
export type Tone = "turn" | "tool" | "state" | "confirm" | "event" | "supervisor" | "quiet";

/**
 * The grid every row shares — `34px 92px 1fr` — so the seqs line up down the whole call and a
 * reader's eye finds the kind column before the words. A row with children is a `<details>`: the
 * line is its summary and the children open under it, indented to the words' column.
 */
export function LogRow({
  seq,
  kind,
  tone,
  said,
  meta = [],
  chips = [],
  children,
}: {
  seq: number | undefined;
  kind: string;
  tone: Tone;
  said: ReactNode;
  meta?: ReactNode[];
  chips?: string[];
  children?: ReactNode;
}): ReactNode {
  const line = (
    <>
      <span className="log-seq fixed">{seq}</span>
      <span className="log-kind fixed">{kind}</span>
      <span className="log-text">
        <span className="log-said">{said}</span>
        {(meta.length > 0 || chips.length > 0) && (
          <span className="log-meta fixed">
            {meta.map((one, index) => (
              <span key={index}>{one}</span>
            ))}
            {chips.map((chip) => (
              <span className="log-chip" key={chip}>
                {chip}
              </span>
            ))}
          </span>
        )}
      </span>
    </>
  );
  if (children === undefined || children === null || children === false) {
    return <div className={`log-row log-row-${tone}`}>{line}</div>;
  }
  return (
    <details className={`log-row log-row-${tone}`}>
      <summary className="log-line">{line}</summary>
      <div className="log-more">{children}</div>
    </details>
  );
}
