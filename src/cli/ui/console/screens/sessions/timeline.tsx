/** The call seq by seq: one row per entry, every metric field one click under the turn it timed. */

import type { Turn } from "@pinecall/protocol";
import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router";

import { headline } from "../../lib/metrics";
import { Button, Card, CardHead } from "../../ui";
import type { Line } from "./transcript";

// A turn is written twice — as the entry that carried it and as the turn the reducer kept — and
// the two meet on the speech, one per role. The chips are the reducer's turn (lib/metrics.ts names
// them and nothing else may); the field lines under the row are the entry's own, digit for digit.
const ROLES: Record<string, string> = { "turn.user": "user", "turn.agent": "agent" };

// A verdict is read by the seqs it cites, so every row of the log is addressable: `#seq-93` on this
// URL is the entry `call.score` names its evidence with, and the Evals screen links straight to it.
// The rows are not on the page when the browser tries to honour the fragment — the log arrives one
// fetch later — so the screen scrolls to it once they are.
const AT_SEQ = /^#seq-(\d+)$/;

export function Timeline({ lines, turns }: { lines: Line[]; turns: Turn[] }): ReactNode {
  const [opened, setOpened] = useState<ReadonlySet<number>>(new Set());
  const [all, setAll] = useState(false);
  const spoken = bySpeech(turns);
  const cited = seqNamedBy(useLocation().hash);
  const drawn = lines.length;

  useEffect(() => {
    if (cited !== null && drawn > 0) {
      document.getElementById(anchorOf(cited))?.scrollIntoView({ block: "center" });
    }
  }, [cited, drawn]);

  const toggle = (seq: number): void =>
    setOpened((held) => {
      const next = new Set(held);
      if (!next.delete(seq)) {
        next.add(seq);
      }
      return next;
    });

  return (
    <Card>
      <CardHead
        title="The log"
        meta={`${lines.length} entries, append-only, numbered by seq`}
        action={
          <span className="session-log-action">
            <Button size="sm" onClick={() => setAll(!all)}>
              {all ? "Hide the fields" : "Show every field"}
            </Button>
          </span>
        }
      />
      <div className="session-log">
        {lines.map((line) => (
          <Row
            key={line.entry.seq}
            line={line}
            turn={spoken.get(keyOf(line.entry.type, line.entry.data))}
            open={all || opened.has(line.entry.seq)}
            cited={line.entry.seq === cited}
            onToggle={() => toggle(line.entry.seq)}
          />
        ))}
      </div>
    </Card>
  );
}

/** The seq the URL's fragment names, or null when it names nothing this screen understands. */
function seqNamedBy(hash: string): number | null {
  const digits = AT_SEQ.exec(hash)?.[1];
  return digits === undefined ? null : Number(digits);
}

/** The id one row of the log answers to, and the fragment a verdict links with. */
function anchorOf(seq: number): string {
  return `seq-${seq}`;
}

// ── one entry ───────────────────────────────────────────────────────────────────

function Row({
  line,
  turn,
  open,
  cited,
  onToggle,
}: {
  line: Line;
  turn: Turn | undefined;
  open: boolean;
  cited: boolean;
  onToggle: () => void;
}): ReactNode {
  const fields = line.fields.length > 0;
  const classes = ["session-entry", `session-entry-${familyOf(line.entry.type)}`];
  if (fields) classes.push("session-entry-opens");
  if (cited) classes.push("session-entry-cited");
  return (
    <div id={anchorOf(line.entry.seq)} className={classes.join(" ")} onClick={fields ? onToggle : undefined}>
      <span className="session-entry-seq">{line.entry.seq}</span>
      <span className="session-entry-since">{line.since}</span>
      <span className="session-entry-type">
        {line.mark !== "" && <span className="session-entry-mark">{line.mark} </span>}
        {line.entry.type}
      </span>
      <span className="session-entry-payload">
        {line.payload}
        {fields && <span className="session-entry-caret"> {open ? "▾" : "▸"}</span>}
        {turn !== undefined && <Chips turn={turn} />}
        {open && (
          <span className="session-fields">
            {line.fields.map((field) => (
              <span key={field.name} className="session-field">
                <span className="session-field-name">{field.name}</span>
                <span className="session-field-value">{field.value}</span>
              </span>
            ))}
          </span>
        )}
      </span>
    </div>
  );
}

// The tint a row wears, by what kind of fact it is: what was said, what changed, what a tool did.
function familyOf(type: string): string {
  if (type.startsWith("turn.")) return "turn";
  if (type.startsWith("state.")) return "state";
  if (type.startsWith("tool.") || type.startsWith("confirm.")) return "tool";
  if (type.startsWith("call.")) return "call";
  return "quiet";
}

function Chips({ turn }: { turn: Turn }): ReactNode {
  return (
    <span className="session-chips">
      {headline(turn).map((reading) => (
        <span key={reading.field} className="session-chip">
          {reading.field} <b>{reading.value}</b>
        </span>
      ))}
    </span>
  );
}

function bySpeech(turns: Turn[]): Map<string, Turn> {
  return new Map(turns.map((turn) => [`${turn.role}:${turn.speech_id}`, turn]));
}

function keyOf(type: string, data: Record<string, unknown>): string {
  const speech = data["speech_id"];
  return `${ROLES[type] ?? ""}:${typeof speech === "string" ? speech : ""}`;
}
