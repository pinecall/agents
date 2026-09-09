/** A tool the model called: its name and arguments, and what the app answered, one click away. */

import type { ToolRun } from "@pinecall/protocol";
import type { ReactNode } from "react";

import { seconds } from "../../lib/metrics";

/** One ⚙ row. Running until the result lands; then what came back, or what went wrong. */
export function ToolRow({ run, seq }: { run: ToolRun; seq: number }): ReactNode {
  return (
    <details className={`live-mark live-mark-tool live-mark-tool-${run.status}`}>
      <summary className="live-mark-line">
        <span className="live-mark-glyph">⚙</span>
        <span className="live-mark-said fixed">
          {run.name}({argumentsOf(run)})
        </span>
        <span className="live-mark-outcome">{outcomeOf(run)}</span>
        <span className="live-mark-seq fixed">{seq}</span>
      </summary>
      <dl className="readings">
        <div className="reading">
          <dt className="reading-field fixed">arguments</dt>
          <dd className="reading-value fixed">{JSON.stringify(run.arguments, null, 2)}</dd>
        </div>
        {!there(run.output) ? null : (
          <div className="reading">
            <dt className="reading-field fixed">output</dt>
            <dd className="reading-value fixed">{JSON.stringify(run.output, null, 2)}</dd>
          </div>
        )}
        {!there(run.error) ? null : (
          <div className="reading">
            <dt className="reading-field fixed">error</dt>
            <dd className="reading-value fixed">{run.error}</dd>
          </div>
        )}
        {!there(run.duration_s) ? null : (
          <div className="reading">
            <dt className="reading-field fixed">duration_s</dt>
            <dd className="reading-value fixed">{seconds(run.duration_s)}</dd>
          </div>
        )}
      </dl>
    </details>
  );
}

// A field the schema does not require may arrive absent OR as an explicit null: it is
// `T | None = None` in Python, and pydantic writes that null back whenever a producer set one. The
// generated zod says `.nullish()` for exactly that reason, so a reader tests for both.
function there<T>(value: T): value is NonNullable<T> {
  return value !== undefined && value !== null;
}

// The summary line has room for the shape of the call, not for a nested object: the whole of both
// is in the expander, and this is what tells one call of a tool from the next.
function argumentsOf(run: ToolRun): string {
  return Object.entries(run.arguments)
    .map(([name, value]) => `${name}=${short(value)}`)
    .join(", ");
}

function outcomeOf(run: ToolRun): string {
  if (run.status === "running") {
    return "…";
  }
  return run.error ?? run.summary ?? short(run.output);
}

function short(value: unknown): string {
  const said = typeof value === "string" ? value : JSON.stringify(value);
  return said === undefined ? "" : said.slice(0, 60);
}
