/** What a lookup — recall, search — put in front of the model this turn, as both timelines print it. */

import type { DocsSources, MemoryOp, MemoryOps } from "@pinecall/protocol";

/** `recall · 2 facts · 12 ms` — one clause per op when the entry carries several. */
export function memoryLine(data: MemoryOps): string {
  return data.ops.map(opLine).join("; ");
}

/** Every fact an entry's ops touched, one line each, as the model read them. */
export function factLines(data: MemoryOps): string[] {
  return data.ops.flatMap((op) => op.facts.map((fact) => (fact.category ? `${fact.text} (${fact.category})` : fact.text)));
}

/** `3 sources · 41 ms` */
export function sourcesLine(data: DocsSources): string {
  return `${data.sources.length} sources · ${took(data.took_ms)}`;
}

/** Every chunk retrieval put in front of the model, one line each: where it came from, and its score. */
export function sourceLines(data: DocsSources): string[] {
  return data.sources.map((source) => {
    const where = source.heading ? `${source.path} › ${source.heading}` : source.path;
    return `${where} · ${source.score.toFixed(3)}`;
  });
}

function opLine(op: MemoryOp): string {
  return `${op.op} · ${op.facts.length} facts · ${took(op.took_ms)}`;
}

function took(ms: number): string {
  return `${Math.round(ms)} ms`;
}
