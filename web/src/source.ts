// What a call looks like from where the browser reads it: the projection it folds, and where it comes from.

import type { Entry, State } from "@pinecall/protocol";

/**
 * The call as a participant may see it: the public projection of docs/protocol/projections.md,
 * field by field. Everything the platform keeps from a guest is absent from the type, not null.
 */
export type PublicState = Pick<
  State,
  "seq" | "status" | "user_state" | "agent_state" | "live" | "turns" | "app_state" | "room" | "confirms" | "transfer" | "held" | "events"
>;

/** The call as it stands when a reader arrives: the state projected, and the seq it was folded to. */
export interface Snapshot {
  state: Partial<PublicState>;
  last_seq: number;
}

/** What a source tells the subscription that opened it. Nothing here knows React. */
export interface SourceReader {
  /** The call whole, from the platform: what a reader starts from, or is reset to. */
  onSnapshot(snapshot: Snapshot): void;
  /** One entry, in whatever order the wire delivered it. The fold puts it in seq order. */
  onEntry(entry: Entry): void;
  /** Nothing more will come this way: the log sealed, or the room let go. */
  onClosed(): void;
  /** A frame the protocol refused, or a request the wire could not carry. The stream goes on. */
  onRefused(why: string): void;
}

/**
 * Where a call's log comes from: livekit's DataChannel inside the room, the gateway's SSE door
 * outside it, or a test's script. One is opened per call, however many hooks read it.
 */
export interface CallSource {
  /** Start delivering to the reader. Returns what stops it. */
  open(reader: SourceReader): () => void;
  /** Send the entries after that seq again: the reader saw a gap it cannot close alone. */
  replay(after: number): void;
}
