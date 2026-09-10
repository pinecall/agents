/** What memory recalled about this caller, as the words a class's `render()` may ask about. */

import type { Camel, MemoryOps } from "@pinecall/protocol";

/**
 * Every word one `memory.ops` entry puts in front of the model: each fact's own sentence, and the
 * word the class remembered it by. Only a `recall` counts — a `remember` at hang-up is what this
 * call taught memory, not what memory told this call — so `remembers()` never answers with a fact
 * the caller has not been told back.
 */
export function wordsRecalled(entry: Camel<MemoryOps>): string[] {
  return entry.ops
    .filter((op) => op.op === "recall")
    .flatMap((op) => op.facts.flatMap((fact) => [fact.text, fact.category ?? ""]));
}
