/** A tool the model called: its name and arguments, and what the app answered, one click away. */

import type { ToolRun } from "@pinecall/protocol";
import type { ReactNode } from "react";

import { seconds } from "../../lib/metrics";
import { LogRow } from "./log-row";
import { Readings } from "./readings";

/** One tool row. Running until the result lands; then what came back, or what went wrong. */
export function ToolRow({ run, seq }: { run: ToolRun; seq: number }): ReactNode {
  const rows = [
    { field: "arguments", value: JSON.stringify(run.arguments, null, 2), unit: null },
    ...(there(run.output) ? [{ field: "output", value: JSON.stringify(run.output, null, 2), unit: null }] : []),
    ...(there(run.error) ? [{ field: "error", value: run.error, unit: null }] : []),
    ...(there(run.duration_s) ? [{ field: "duration_s", value: seconds(run.duration_s), unit: null }] : []),
  ];
  return (
    <LogRow
      seq={seq}
      kind="tool"
      tone="tool"
      said={
        <span className="fixed">
          {run.name}({argumentsOf(run)})
        </span>
      }
      meta={[<span className={run.status === "failed" ? "log-failed" : ""}>{outcomeOf(run)}</span>]}
    >
      <Readings rows={rows} />
    </LogRow>
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
