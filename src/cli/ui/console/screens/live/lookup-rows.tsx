/** ◎ what memory recalled and ¶ what retrieval found for a turn: the two rows a lookup leaves between the turns. */

import type { DocsSources, MemoryOps } from "@pinecall/protocol";
import type { ReactNode } from "react";

import { factLines, memoryLine, sourceLines, sourcesLine } from "../../lib/lookups";

/** ◎ the contact's facts memory put in front of the model, and how long finding them took. */
export function MemoryRow({ ops, seq }: { ops: MemoryOps; seq: number }): ReactNode {
  return <LookupRow glyph="◎" said={memoryLine(ops)} lines={factLines(ops)} seq={seq} />;
}

/** ¶ the chunks retrieval put in front of the model, and how long finding them took. */
export function SourcesRow({ sources, seq }: { sources: DocsSources; seq: number }): ReactNode {
  return <LookupRow glyph="¶" said={sourcesLine(sources)} lines={sourceLines(sources)} seq={seq} />;
}

// One shape for both: the sentence on the line, and what was found one click under it. The
// classes are the quiet row's, so the two read as what they are — a fold in the log — and not as
// a new kind of thing on screen.
function LookupRow({ glyph, said, lines, seq }: { glyph: string; said: string; lines: string[]; seq: number }): ReactNode {
  return (
    <details className="live-mark live-mark-quiet">
      <summary className="live-mark-line">
        <span className="live-mark-glyph">{glyph}</span>
        <span className="live-mark-said fixed">{said}</span>
        <span className="live-mark-seq fixed">{seq}</span>
      </summary>
      <ul className="live-mark-quiet-list">
        {lines.map((line) => (
          <li className="fixed" key={line}>
            {line}
          </li>
        ))}
      </ul>
    </details>
  );
}
