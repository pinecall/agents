/** `this.call`: the one call this instance is serving — its line, its room, its turns, its verbs. */

import type { Call as HookCall } from "../agent/lifecycle.js";
import { History } from "./history.js";
import { ParticipantHandle, Room, type Commander, type ParticipantKind } from "./room.js";

/** How long a say or a reply waits for the turn it lands as before it gives up saying so. */
const ACK_MS = 30_000;

/** What the call world needs to know about the line, beyond what the room's entries tell it. */
export interface CallLine extends HookCall {
  today?: string;
}

/**
 * One live call, as the class holds it. Everything on it was reduced from entries the runtime
 * already receives, and every verb is one command on the wire — there is no LiveKit here and no
 * escape hatch to it: a need the room cannot express is a new command with a name.
 */
export class CallWorld implements HookCall {
  readonly id: string;
  readonly contact: string;
  readonly from?: string;
  readonly channel?: string;
  readonly room: Room;
  readonly history = new History();

  // Who is waiting for the agent's next turn. say and reply both settle on it, because turn.agent
  // is the only acknowledgement the wire has for either: the command frame itself is fire and
  // forget, and the gateway answers commands with the entries they land as.
  #speaking: ((spoken: boolean) => void)[] = [];
  /** The event being dispatched right now, so a write inside onEvent can name its cause. */
  cause: { name: string; seq: number } | null = null;
  #events = 0;

  constructor(
    line: CallLine,
    private readonly out: Commander,
    private readonly ackMs = ACK_MS,
  ) {
    this.id = line.id;
    this.contact = line.contact;
    if (line.from !== undefined) this.from = line.from;
    if (line.channel !== undefined) this.channel = line.channel;
    this.room = new Room(out);
  }

  /** The next outside fact's place in this call's own stream of them; the wire's seq is not on it. */
  numbered(): number {
    return (this.#events += 1);
  }

  /** One participant, and what may be done to them: `call.participant(id).mute()`. */
  participant(identity: string): ParticipantHandle {
    return new ParticipantHandle(identity, this.out);
  }

  /** Push a payload to a browser in the room. The log keeps its size, never the payload. */
  send(topic: string, data: Record<string, unknown>, options: { to?: string } = {}): void {
    this.out("room.send", options.to === undefined ? { topic, data } : { topic, data, to: options.to });
  }

  /** Say this, word for word. Resolves true when the turn it lands as arrived, false on the wait. */
  say(text: string, options: { allowInterruptions?: boolean } = {}): Promise<boolean> {
    this.out("agent.say", { text, ...options });
    return this.#spoken();
  }

  /** Make the model speak, guided by words the caller never hears. Resolves like `say`. */
  reply(instructions: string, options: { allowInterruptions?: boolean } = {}): Promise<boolean> {
    this.out("agent.reply", { instructions, ...options });
    return this.#spoken();
  }

  /** Invite somebody into the room: the room's own verb, reachable from the call for symmetry. */
  invite(to: string, options: { kind: "sip" | "participant" }): void {
    this.room.invite(to, options);
  }

  /** One entry of this call's, folded into the room and the history. Unknown types are ignored. */
  take(type: string, data: Record<string, unknown>, at: number): void {
    switch (type) {
      case "participant.joined":
        return this.room.joined(
          {
            identity: String(data["identity"]),
            kind: data["kind"] as ParticipantKind,
            ...(typeof data["name"] === "string" ? { name: data["name"] } : {}),
          },
          at,
        );
      case "participant.left":
        return this.room.left(String(data["identity"]));
      case "participant.speaking":
        return this.room.speaking(String(data["identity"]), data["speaking"] === true);
      case "turn.user":
        return this.history.took({ who: "user", text: String(data["text"] ?? ""), speechId: String(data["speech_id"] ?? data["speechId"] ?? ""), interrupted: false, at });
      case "turn.agent":
        this.history.took({ who: "agent", text: String(data["text"] ?? ""), speechId: String(data["speech_id"] ?? data["speechId"] ?? ""), interrupted: data["interrupted"] === true, at });
        return this.#settle(true);
      default:
        return;
    }
  }

  #spoken(): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      this.#speaking.push(resolve);
      // A line that hung up mid-sentence must not leave a tool awaiting forever, and a hang-up is
      // not an error the tool can do anything about: the wait answers false and the call goes on.
      setTimeout(() => {
        this.#speaking = this.#speaking.filter((waiting) => waiting !== resolve);
        resolve(false);
      }, this.ackMs).unref?.();
    });
  }

  #settle(spoken: boolean): void {
    const waiting = this.#speaking;
    this.#speaking = [];
    for (const resolve of waiting) resolve(spoken);
  }
}
