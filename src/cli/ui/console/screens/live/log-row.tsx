/** One row of a call's log: the seq, what kind of thing it is, what it says, a note under — and more, one click under. */

import type { ReactNode } from "react";

/** The kinds a row can be; the tone colours the kind column and the row's ground. */
export type Tone = "turn" | "tool" | "state" | "confirm" | "event" | "supervisor" | "quiet" | "lookup";

/**
 * The row every entry shares: a 26px seq, the kind, and the words taking the rest, wrapping under
 * the kind when the column is narrow. A row with children is a `<details>`: the line is its
 * summary and the children open under it, indented to the words' column.
 */
export function LogRow({
  seq,
  kind,
  tone,
  who,
  said,
  note = [],
  children,
}: {
  seq: number | undefined;
  kind: string;
  tone: Tone;
  who?: "caller" | "agent" | undefined;
  said: ReactNode;
  note?: ReactNode[];
  children?: ReactNode;
}): ReactNode {
  const shown = note.filter((one) => one !== null && one !== undefined && one !== "");
  const line = (
    <>
      <span className="lv-seq">{seq}</span>
      <span className={`lv-kind lv-kind-${tone}`}>{kind}</span>
      <span className={tone === "turn" ? "lv-text lv-text-turn" : tone === "quiet" ? "lv-text lv-text-quiet" : "lv-text"}>
        {who !== undefined && <span className={who === "agent" ? "lv-who lv-who-agent" : "lv-who"}>{who}</span>}
        {said}
        {shown.length > 0 && (
          <span className="lv-note">
            {shown.map((one, index) => (
              <span key={index}>
                {index > 0 && " · "}
                {one}
              </span>
            ))}
          </span>
        )}
      </span>
    </>
  );
  const ground = `lv-row lv-${tone}`;
  if (children === undefined || children === null || children === false) {
    return (
      <div className={ground}>
        <div className="lv-line">{line}</div>
      </div>
    );
  }
  return (
    <details className={ground}>
      <summary className="lv-line">{line}</summary>
      <div className="lv-more">{children}</div>
    </details>
  );
}
