/** What memory recalled and what retrieval found for a turn: the two rows a lookup leaves between the turns. */

import type { DocsSources, MemoryOps } from "@pinecall/protocol";
import type { ReactNode } from "react";

import { factLines, memoryLine, sourceLines, sourcesLine } from "../../lib/lookups";
import { LogRow } from "./log-row";

/** The contact's facts memory put in front of the model, and how long finding them took. */
export function MemoryRow({ ops, seq }: { ops: MemoryOps; seq: number }): ReactNode {
  return <LookupRow kind="memory" said={memoryLine(ops)} lines={factLines(ops)} seq={seq} />;
}

/** The chunks retrieval put in front of the model, and how long finding them took. */
export function SourcesRow({ sources, seq }: { sources: DocsSources; seq: number }): ReactNode {
  return <LookupRow kind="sources" said={sourcesLine(sources)} lines={sourceLines(sources)} seq={seq} />;
}

// One shape for both: the sentence on the line, and what was found one click under it.
function LookupRow({ kind, said, lines, seq }: { kind: string; said: string; lines: string[]; seq: number }): ReactNode {
  return (
    <LogRow seq={seq} kind={kind} tone="lookup" said={said}>
      <ul className="lv-list">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </LogRow>
  );
}
