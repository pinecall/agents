// The public wire as JSON, decoded: the envelope a guest is sent, and the snapshot it starts from.

import { decodeEntry, type Entry } from "@pinecall/protocol";

import type { Snapshot } from "./source.js";

// The public envelope drops `agent` and `call` (projections.md): a guest asked about one call and
// learns nothing of whose fleet answered it. The codec's envelope requires both, so a guest's entry
// is completed with what an empty log holds before anybody asks — the reducer keeps neither.
/** One frame of the public stream as the protocol's entry. A bad shape throws. */
export function publicEntry(raw: unknown): Entry {
  return decodeEntry({ agent: "", call: null, ...asObject(raw) });
}

/** `{state, last_seq}` as the DataChannel and `GET /state` both send it. A bad shape throws. */
export function publicSnapshot(raw: unknown): Snapshot {
  const said = asObject(raw);
  if (typeof said["last_seq"] !== "number" || typeof said["state"] !== "object" || said["state"] === null) {
    throw new Error("a snapshot is {state, last_seq}");
  }
  return { state: said["state"] as Snapshot["state"], last_seq: said["last_seq"] };
}

function asObject(raw: unknown): Record<string, unknown> {
  return typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
}
