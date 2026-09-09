/** A payload written the way `pinecall-runtime sessions show` writes it: Python's compact JSON. */

import { EVENT_SCHEMAS, isEventType } from "@pinecall/protocol";
import { z } from "zod";

/** The parts of JSON Schema this file walks. The generator emits more; none of the rest is read. */
export interface Shape {
  type?: string;
  properties?: Record<string, Shape>;
  items?: Shape;
  oneOf?: Shape[];
  const?: unknown;
}

// zod is the console's only description of the wire, and z.toJSONSchema is the public way to ask
// it what a field is. One shape per type per call, built where the call is read: a table kept at
// module level would be state shared by every call this process serves.
/** The declared shape of each event type named, so a payload is written against its own schema. */
export function shapesFor(types: Iterable<string>): Map<string, Shape> {
  const shapes = new Map<string, Shape>();
  for (const type of types) {
    if (!shapes.has(type) && isEventType(type)) {
      shapes.set(type, z.toJSONSchema(EVENT_SCHEMAS[type], { io: "input" }) as Shape);
    }
  }
  return shapes;
}

/** One value as the CLI prints it: no space to waste, the accents intact, the numbers as Python. */
export function compact(value: unknown, shape?: Shape): string {
  if (value === null || value === undefined) {
    return "null";
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    return asPython(value, shape);
  }
  if (Array.isArray(value)) {
    return `[${value.map((one) => compact(one, shape?.items)).join(",")}]`;
  }
  return braced(value as Record<string, unknown>, shape);
}

/** A string as itself, everything else as JSON: 0.48 reads as a number and "es" as a word. */
export function said(value: unknown, shape?: Shape): string {
  return typeof value === "string" ? value : compact(value, shape);
}

// ── how a value is written ──────────────────────────────────────────────────────

function braced(value: Record<string, unknown>, shape?: Shape): string {
  const declared = branch(value, shape)?.properties;
  const pairs = Object.entries(value).map(
    ([name, held]) => `${JSON.stringify(name)}:${compact(held, declared?.[name])}`,
  );
  return `{${pairs.join(",")}}`;
}

// A discriminated union reaches JSON Schema as oneOf, and the branch is the one whose constants the
// value already agrees with: `"type": "llm_usage"` on a usage row, and nothing else to match on.
function branch(value: Record<string, unknown>, shape?: Shape): Shape | undefined {
  if (shape?.oneOf === undefined) {
    return shape;
  }
  return shape.oneOf.find((option) =>
    Object.entries(option.properties ?? {}).every(
      ([name, field]) => field.const === undefined || field.const === value[name],
    ),
  );
}

// JSON carries one number type and Python has two, so 0.0 arrives here as 0 and would print as
// `0`. The schema is what still knows which fields are floats: a declared float keeps its trailing
// .0 and takes an exponent below 1e-4, which is Python's repr, and every other number is written
// as it stands. docs/decisions/console.md says where the two can still disagree.
function asPython(value: number, shape?: Shape): string {
  if (shape?.type !== "number" || !Number.isFinite(value)) {
    return String(value);
  }
  const magnitude = Math.abs(value);
  if (value !== 0 && (magnitude < 1e-4 || magnitude >= 1e16)) {
    return exponential(value);
  }
  return Number.isInteger(value) ? `${value}.0` : String(value);
}

// JavaScript writes 1e-6 and Python writes 1e-06: the same value, and the exponent always signed
// and two digits wide.
function exponential(value: number): string {
  const [mantissa = "", exponent = ""] = value.toExponential().split("e");
  const sign = exponent.startsWith("-") ? "-" : "+";
  return `${mantissa}e${sign}${exponent.replace(/^[+-]/, "").padStart(2, "0")}`;
}
