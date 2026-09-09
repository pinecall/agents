/** The only file that names a metric: the five headline chips, and a block read field by field. */

import { CollectedMetricsSchema, UNITS, type CollectedMetrics, type Entry, type Turn } from "@pinecall/protocol";
import { z } from "zod";

import { said, type Shape } from "./wire";

/** One measurement ready to draw: livekit's own field name, what was measured, and in what. */
export interface Reading {
  field: string;
  value: string;
  unit: string | null;
}

/** One entry of `metrics.<block>`, whichever block it is. Derived from the protocol, not redeclared. */
export type MetricsBlock = CollectedMetrics[keyof CollectedMetrics][number];

// The five a person looks at first while a call is happening: how long the caller waited for a
// reply, where that time went, and how long we took to believe they had finished speaking. Every
// other field the block carries is one expand away, under its own name. Two lists and not one
// because each is typed against the metrics of its own side of the turn — a user turn has no
// llm_node_ttft — and MEASURES below is what they add up to.
const HEADLINE_USER = ["transcription_delay", "end_of_turn_delay"] as const;
const HEADLINE_AGENT = ["llm_node_ttft", "tts_node_ttfb", "e2e_latency"] as const;

// In the order a turn happens: the caller stops, the words arrive, the turn is called over, the
// model starts, the voice starts, the caller hears it. That order IS the medians order —
// the runtime's log/latencies.py MEASURES is the same five in the same sequence, and the
// CLI's table is read off it. Every reader of a metric name in the console comes here for it.
/** The five latencies the console knows by name, in the order a turn happens. */
export const MEASURES = [...HEADLINE_USER, ...HEADLINE_AGENT] as const;

/** The chips that ride on a turn. A field the session could not measure is absent, not zero. */
export function headline(turn: Turn): Reading[] {
  return headlineValues(turn).map(([field, value]) => ({
    field,
    value: seconds(value),
    unit: null,
  }));
}

// The unit is the schema's own `x-unit`, generated into UNITS by field name — never a table
// copied in here, which would be a second schema going quietly stale.
/** A whole metrics block, one row per field it filled, nested objects flattened by dotted name. */
export function readings(block: MetricsBlock, shape?: Shape): Reading[] {
  return rowsOf(block, "", shape);
}

// z.toJSONSchema is the public way to ask zod what a field is, and CollectedMetrics is where the
// blocks are declared: `llm` is an array of LLMMetrics, so its items ARE the block's shape. Built
// where it is read, never at module level: one process serves many calls at once.
/** The declared shape of each metrics block, by the name CollectedMetrics gives it. */
export function blockShapes(): Map<string, Shape> {
  const collected = z.toJSONSchema(CollectedMetricsSchema, { io: "input" }) as Shape;
  const shapes = new Map<string, Shape>();
  for (const [kind, field] of Object.entries(collected.properties ?? {})) {
    if (field.items !== undefined) {
      shapes.set(kind, field.items);
    }
  }
  return shapes;
}

/** A duration the schema measures in seconds, as a person says it. */
export function seconds(value: number): string {
  // livekit writes -1 for a time it never got to take, such as a reply that produced no token.
  if (value < 0) {
    return "—";
  }
  return value < 1 ? `${Math.round(value * 1000)} ms` : `${value.toFixed(2)} s`;
}

// ── how a value is said ─────────────────────────────────────────────────────────

function rowsOf(source: object, prefix: string, shape?: Shape): Reading[] {
  const found: Reading[] = [];
  for (const [name, value] of Object.entries(source)) {
    const field = prefix + name;
    const declared = shape?.properties?.[name];
    if (value === null || value === undefined) {
      continue;
    }
    if (typeof value === "object" && !Array.isArray(value)) {
      found.push(...rowsOf(value, `${field}.`, declared));
    } else {
      found.push({ field, value: said(value, declared), unit: unitOf(name) });
    }
  }
  return found;
}

// A unit the schema did not declare is no unit: the console never invents one, the same way it
// never invents a metric name.
function unitOf(field: string): string | null {
  return UNITS[field] ?? null;
}

// ── a turn's blocks, and the call so far ────────────────────────────────────────

/** One metrics.<block> entry as a reader sees it: which block it is, and every field it filled. */
export interface Block {
  kind: string;
  readings: Reading[];
}

// llm, tts and eou are the blocks livekit stamps a speech_id on; the others measure the session
// rather than one turn, and they are read whole in the call's own metrics panel.
/** Every block the session joined to this turn, in the order the log carried them. */
export function blocksFor(metrics: CollectedMetrics, speechId: string): Block[] {
  const shapes = blockShapes();
  const joined: Block[] = [];
  for (const [kind, blocks] of Object.entries(metrics)) {
    for (const block of blocks) {
      if (joinsTo(block, speechId)) {
        joined.push({ kind, readings: readings(block, shapes.get(kind)) });
      }
    }
  }
  return joined;
}

// A turn lands as one of two entries, and they are the only ones carrying a metrics block of their
// own — the runtime's log/latencies.py names them for the same reason.
const TURN_TYPES = ["turn.user", "turn.agent"];

/** One measure over one call: its livekit name, the median, the worst turn, and how many carried it. */
export interface Median {
  name: string;
  seconds: number;
  max: number;
  turns: number;
}

// Median and not mean: one interrupted turn moves an average, and what a person is asking is what a
// normal turn felt like. This is latencies.py's rule in TypeScript, down to the even-count average
// — Sessions prints the same digits as `pinecall-runtime sessions show`, so the rule is written
// once for the whole console and both screens read it here.
/** A row per measure some turn carried, in the order a turn happens. Never a zero for a measure nobody took. */
export function medians(entries: Entry[]): Median[] {
  const taken = samples(entries);
  return MEASURES.filter((name) => (taken.get(name) ?? []).length > 0).map((name) => {
    const values = taken.get(name) ?? [];
    return { name, seconds: middle(values), max: Math.max(...values), turns: values.length };
  });
}

function joinsTo(block: MetricsBlock, speechId: string): boolean {
  return "speech_id" in block && block.speech_id === speechId;
}

// The one place the five headline names are read off a turn, whatever the turn's role.
function headlineValues(turn: Turn): [string, number][] {
  const fields = turn.role === "user" ? HEADLINE_USER : HEADLINE_AGENT;
  const measured = turn.metrics as Record<string, unknown>;
  const found: [string, number][] = [];
  for (const field of fields) {
    const value = measured[field];
    if (typeof value === "number") {
      found.push([field, value]);
    }
  }
  return found;
}

/** Every value each measure was given, in turn order. A measure no turn carried has no entry. */
function samples(entries: Entry[]): Map<string, number[]> {
  const found = new Map<string, number[]>(MEASURES.map((name) => [name, []]));
  for (const entry of entries) {
    if (!TURN_TYPES.includes(entry.type)) {
      continue;
    }
    const block = entry.data["metrics"];
    for (const name of MEASURES) {
      const value = (block as Record<string, unknown> | undefined)?.[name];
      if (typeof value === "number") {
        found.get(name)?.push(value);
      }
    }
  }
  return found;
}

// An even count has no middle value, so the two either side of it are averaged — which is what
// Python's statistics.median does, and the CLI prints its answer.
function middle(values: number[]): number {
  const sorted = [...values].sort((first, second) => first - second);
  const half = Math.floor(sorted.length / 2);
  const above = sorted[half] ?? 0;
  return sorted.length % 2 === 1 ? above : ((sorted[half - 1] ?? 0) + above) / 2;
}
