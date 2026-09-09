/** The call seq by seq: one row per entry, every metric field one click under the turn it timed. */

import type { Turn } from "@pinecall/protocol";
import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router";

import { headline } from "../../lib/metrics";
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
    <div className="table-wrap">
      <div className="panel-head">
        <span className="badge">seq · t · type · payload</span>
        <button className="button" type="button" onClick={() => setAll(!all)}>
          {all ? "hide the fields" : "show every field"}
        </button>
      </div>
      <table className="timeline fixed">
        <tbody>
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
        </tbody>
      </table>
    </div>
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
  return (
    <>
      <tr
        id={anchorOf(line.entry.seq)}
        className={rowClass(fields, cited)}
        onClick={fields ? onToggle : undefined}
      >
        <td className="mark">{line.mark}</td>
        <td className="number seq">{line.entry.seq}</td>
        <td className="number soft">{line.since}</td>
        <td className="type">{line.entry.type}</td>
        <td className="payload">
          {line.payload}
          {turn !== undefined && <Chips turn={turn} />}
          {fields && <span className="soft"> {open ? "▾" : "▸"} </span>}
        </td>
      </tr>
      {open &&
        line.fields.map((field) => (
          <tr key={field.name} className="field">
            <td />
            <td />
            <td />
            <td className="field-name">{field.name}</td>
            <td className="field-value">{field.value}</td>
          </tr>
        ))}
    </>
  );
}

// The row a verdict cites is marked where it stands: the reader arrived here for that one line.
function rowClass(fields: boolean, cited: boolean): string {
  return ["row", fields ? "row-opens" : "", cited ? "row-cited" : ""].filter(Boolean).join(" ");
}

function Chips({ turn }: { turn: Turn }): ReactNode {
  return (
    <span className="chips">
      {headline(turn).map((reading) => (
        <span key={reading.field} className="chip">
          <span className="chip-key">{reading.field}</span>
          <span className="chip-val">{reading.value}</span>
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
