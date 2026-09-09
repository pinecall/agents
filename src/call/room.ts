/** The room as a value: who is in it, and the four verbs the wire lets the agent use on them. */

import type { Camel, CommandData, CommandType } from "@pinecall/protocol";

/** Who a participant is to the call. The wire's five kinds, from protocol/schema/defs.json. */
export type ParticipantKind = "caller" | "agent" | "supervisor" | "listener" | "sip";

/** One participant, as the room's own facts describe them. */
export interface Participant {
  identity: string;
  kind: ParticipantKind;
  name?: string;
  /** When participant.joined said so, in ms. */
  joinedAt: number;
  /** The room's voice activity for them right now; false until participant.speaking says otherwise. */
  speaking: boolean;
}

/** How a call puts one command on the wire, already bound to the call it belongs to. */
export type Commander = <K extends CommandType>(type: K, data: Camel<CommandData<K>>) => void;

/** One participant, and what may be done to them. Returned by `call.participant(identity)`. */
export class ParticipantHandle {
  constructor(
    readonly identity: string,
    private readonly send: Commander,
  ) {}

  /** Silence them for the rest of the call. There is no unmute: a leg that must speak is invited again. */
  mute(): void {
    this.send("participant.mute", { identity: this.identity });
  }

  /** Put them out of the room. Removing the caller ends the call. */
  remove(): void {
    this.send("participant.remove", { identity: this.identity });
  }
}

/**
 * Who is in the room right now, reduced from the room's own entries — never asked of LiveKit,
 * which the class does not know exists. Reading it is free; the verbs are commands.
 */
export class Room {
  readonly #participants = new Map<string, Participant>();

  constructor(private readonly send: Commander) {}

  /** Everybody in the room, in the order they joined. */
  get participants(): Participant[] {
    return [...this.#participants.values()];
  }

  /** The person the agent is serving, when the room has named one. */
  get caller(): Participant | undefined {
    return this.participants.find((one) => one.kind === "caller");
  }

  /** Whether anybody of this kind is in the room: `has("supervisor")` is the question worth asking. */
  has(kind: ParticipantKind): boolean {
    return this.participants.some((one) => one.kind === kind);
  }

  /** One participant by identity, as the room last saw them. */
  get(identity: string): Participant | undefined {
    return this.#participants.get(identity);
  }

  /** Bring somebody else in: a number as a second SIP leg, or an identity as a seat. */
  invite(to: string, options: { kind: "sip" | "participant" }): void {
    this.send("room.invite", { to, kind: options.kind });
  }

  // ── what the room's entries teach it ────────────────────────────────────────

  /** Somebody joined. Re-joining under the same identity replaces the row rather than doubling it. */
  joined(data: { identity: string; kind: ParticipantKind; name?: string }, at: number): void {
    const one: Participant = { identity: data.identity, kind: data.kind, joinedAt: at, speaking: false };
    if (data.name !== undefined) one.name = data.name;
    this.#participants.set(data.identity, one);
  }

  /** Somebody left; they are gone from the room, and the log still remembers they were here. */
  left(identity: string): void {
    this.#participants.delete(identity);
  }

  /** The room's voice activity for one participant flipped. Unknown identities are ignored. */
  speaking(identity: string, speaking: boolean): void {
    const one = this.#participants.get(identity);
    if (one !== undefined) one.speaking = speaking;
  }
}
