/** The CLI's transcript rule in TypeScript: the mark, the time, the payload, the fields beneath. */

import type { DocsSources, Entry, MemoryOps } from "@pinecall/protocol";

import { factLines, memoryLine, sourceLines, sourcesLine } from "../../lib/lookups";
import { compact, said, shapesFor, type Shape } from "../../lib/wire";

// the runtime's cli/sessions/render.py draws these same four columns and the same field
// lines under them, and the runtime's log/latencies.py names which entries are turns. The
// console prints the SAME numbers off the SAME fields; when the two disagree one of them is wrong.
const TURN_TYPES = ["turn.user", "turn.agent"];
const METRICS_PREFIX = "metrics.";
// What a lookup put in front of the model: the entry sits under the caller's turn it answered, its
// line says how much and how long, and what was found hangs under it like a metric's fields.
const MEMORY = "memory.ops";
const SOURCES = "docs.sources";

// The mark column: → asks, ← answers, ! is the human gate, and everything else keeps the column.
const MARKS: Record<string, string> = { "tool.call": "→", "tool.result": "←" };
const CONFIRM_MARK = "!";

/** One field of a metrics block: livekit's own dotted name, and the value as the CLI writes it. */
export interface Field {
  name: string;
  value: string;
}

/** One entry ready to draw: what the head line says, and the fields that hang under it. */
export interface Line {
  entry: Entry;
  mark: string;
  since: string;
  payload: string;
  fields: Field[];
}

/** Every entry of a call as a line, timed from the first one — the whole of what `show` prints. */
export function transcript(entries: Entry[]): Line[] {
  const shapes = shapesFor(entries.map((entry) => entry.type));
  const origin = entries[0]?.ts ?? 0;
  return entries.map((entry) => lineOf(entry, origin, shapes.get(entry.type)));
}

/** How far into the call an entry is, in seconds with milliseconds, signed so a column lines up. */
export function secondsSince(ts: number, origin: number): string {
  return `+${(ts - origin).toFixed(3)}`;
}

// ── one line ────────────────────────────────────────────────────────────────────

function lineOf(entry: Entry, origin: number, shape: Shape | undefined): Line {
  return {
    entry,
    mark: markOf(entry.type),
    since: secondsSince(entry.ts, origin),
    payload: inlinePayload(entry, shape),
    fields: fieldsOf(entry, shape),
  };
}

function markOf(type: string): string {
  if (type.startsWith("confirm.")) {
    return CONFIRM_MARK;
  }
  return MARKS[type] ?? "";
}

// What the head line still carries: everything the field lines underneath do not print in full.
function inlinePayload(entry: Entry, shape: Shape | undefined): string {
  if (TURN_TYPES.includes(entry.type)) {
    const rest = Object.fromEntries(
      Object.entries(entry.data).filter(([name]) => name !== "metrics"),
    );
    return compact(rest, shape);
  }
  if (entry.type.startsWith(METRICS_PREFIX)) {
    return "";
  }
  if (entry.type === MEMORY) {
    return memoryLine(entry.data as MemoryOps);
  }
  if (entry.type === SOURCES) {
    return sourcesLine(entry.data as DocsSources);
  }
  return compact(entry.data, shape);
}

// A turn's metrics block, or a whole metrics entry, one field per line under livekit's own name.
function fieldsOf(entry: Entry, shape: Shape | undefined): Field[] {
  if (TURN_TYPES.includes(entry.type)) {
    const block = entry.data["metrics"];
    const within = shape?.properties?.["metrics"];
    return isBlock(block) ? flattened(block, METRICS_PREFIX, within) : [];
  }
  if (entry.type.startsWith(METRICS_PREFIX)) {
    return flattened(entry.data, "", shape);
  }
  if (entry.type === MEMORY) {
    return factLines(entry.data as MemoryOps).map((value) => ({ name: "fact", value }));
  }
  if (entry.type === SOURCES) {
    return sourceLines(entry.data as DocsSources).map((value) => ({ name: "source", value }));
  }
  return [];
}

// A nested object becomes `outer.inner`; a list stays one value, its shape being the fact. The
// declared names come first, in the schema's order, then anything the block carried besides — a
// jsonb round trip reshuffles the keys and the reading must not move with them.
function flattened(block: Record<string, unknown>, prefix: string, shape?: Shape): Field[] {
  return rows(block, prefix, shape, inOrder(block, shape));
}

// The names are decided by the caller — declared order at the top, the block's own order inside a
// nested one, which is how render.py reads a `metadata` object.
function rows(
  block: Record<string, unknown>,
  prefix: string,
  shape: Shape | undefined,
  names: string[],
): Field[] {
  const found: Field[] = [];
  for (const name of names) {
    const value = block[name];
    const within = shape?.properties?.[name];
    if (isBlock(value)) {
      found.push(...rows(value, `${prefix}${name}.`, within, Object.keys(value)));
    } else {
      found.push({ name: `${prefix}${name}`, value: said(value, within) });
    }
  }
  return found;
}

function inOrder(block: Record<string, unknown>, shape?: Shape): string[] {
  const declared = Object.keys(shape?.properties ?? {}).filter((name) => name in block);
  return [...declared, ...Object.keys(block).filter((name) => !declared.includes(name))];
}

function isBlock(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
