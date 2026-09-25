/** `this.call`: the one call this instance is serving — its line, its room, its turns, its verbs. */

import type { Call as HookCall } from "../agent/lifecycle.js";
import { History } from "./history.js";
import { ParticipantHandle, Room, type Commander, type ParticipantKind } from "./room.js";

/** How long a say or a reply waits for the turn it lands as before it gives up saying so. */
const ACK_MS = 30_000;

/** How long a transfer waits for its outcome: the far end may ring for 25s before it fails. */
const TRANSFER_MS = 90_000;

/** The slack an ask for a person keeps on top of its own wait, for the entry to make its way back. */
const A_MOMENT_MS = 15_000;

/** What a verb answers when nothing came back at all: the gateway, not the far end, went quiet. */
const NO_ANSWER = "the runtime never said how it went";

/** What a verb still waiting is answered with when the call ends under it. */
const THE_CALL_ENDED = "the call ended before it was answered";

/** Which of the two transfers happened: the caller sent on, or the far end dialled in to them. */
export type TransferMode = "cold" | "warm";

/** Who took a line when somebody did, as their token named them. */
export interface Supervisor {
  id: string;
  name?: string;
}

/** What a transfer came to. `ok: false` means nobody moved and the caller is still on the line. */
export interface Transferred {
  to: string;
  mode: TransferMode | null;
  ok: boolean;
  error?: string;
}

/** What an ask for a person came to: who took the line, or why nobody did. */
export interface Attended {
  ok: boolean;
  by: Supervisor | null;
  error?: string;
}

/** One chunk a search found, as the model reads it: where it came from, and its text. */
export interface Found {
  path: string;
  heading: string | null;
  text: string;
}

/** What runs a search for this call: the gateway, through the client that holds the call. */
export type Searching = (query: string, k?: number) => Promise<Found[]>;

/** A search asked of a call nobody is serving through a gateway: a prompt printed offline, a test. */
export const NO_GATEWAY_TO_SEARCH = "this call cannot search: no gateway is serving it";

/** What the call world needs to know about the line, beyond what the room's entries tell it. */
export interface CallLine extends HookCall {
  today?: string;
  claimed?: string | null;
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
  /** The day this call opened, `YYYY-MM-DD`. What a prompt — and an agenda — means by today. */
  readonly today?: string;
  /** The code a page showed that this call claimed, or null: the caller is also on the site. */
  claimed: string | null = null;
  readonly room: Room;
  readonly history = new History();

  // Who is waiting for the agent's next turn. say and reply both settle on it, because turn.agent
  // is the only acknowledgement the wire has for either: the command frame itself is fire and
  // forget, and the gateway answers commands with the entries they land as.
  #speaking: ((spoken: boolean) => void)[] = [];
  // The same, for the two verbs the log answers later: a transfer and an ask for a person.
  #transfers: ((transferred: Transferred) => void)[] = [];
  #asks: ((attended: Attended) => void)[] = [];
  /** The event being dispatched right now, so a write inside onEvent can name its cause. */
  cause: { name: string; seq: number } | null = null;
  #events = 0;

  constructor(
    line: CallLine,
    private readonly out: Commander,
    private readonly searching: Searching | null = null,
    private readonly ackMs = ACK_MS,
  ) {
    this.id = line.id;
    this.contact = line.contact;
    if (line.from !== undefined) this.from = line.from;
    if (line.channel !== undefined) this.channel = line.channel;
    if (line.today !== undefined) this.today = line.today;
    if (line.claimed !== undefined) this.claimed = line.claimed;
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

  /**
   * The best chunks of the bases this agent reads, for these words. The gateway searches — the
   * bases are the world's, attached to the agent in its settings — and writes what it found on
   * the call's log, so the grounded judge weighs it. `k` is how many; each base's own when unsaid.
   */
  search(query: string, options: { k?: number } = {}): Promise<Found[]> {
    if (this.searching === null) return Promise.reject(new Error(NO_GATEWAY_TO_SEARCH));
    return this.searching(query, options.k);
  }

  /** Invite somebody into the room: the room's own verb, reachable from the call for symmetry. */
  invite(to: string, options: { kind: "sip" | "participant" }): void {
    this.room.invite(to, options);
  }

  // ── handing the call to somebody else ───────────────────────────────────────

  /**
   * Hand the caller to this number. On a phone their own line is sent on and the call ends here;
   * in a browser the number is dialled into this call instead and the agent falls silent once it
   * answers. Say `mode` only to insist on one of the two. Resolves with what really happened:
   * `ok: false` means nobody moved and the caller is still with the agent, waiting to be told.
   */
  transfer(to: string, options: { mode?: TransferMode } = {}): Promise<Transferred> {
    this.out("call.transfer", options.mode === undefined ? { to } : { to, mode: options.mode });
    return this.#answered(this.#transfers, TRANSFER_MS, { to, mode: null, ok: false, error: NO_ANSWER });
  }

  /**
   * Ask for a person without sending the caller anywhere: they wait — on hold in a call, simply
   * unanswered in a thread — until a supervisor takes the line or `waitS` passes with nobody
   * free. `reason` is what the supervisor reads before taking it. The tool that calls this is
   * still running all that time, so give it a `timeout` longer than `waitS`.
   */
  attention(reason: string, options: { waitS: number }): Promise<Attended> {
    this.out("call.attention", { reason, waitS: options.waitS });
    const lapsed: Attended = { ok: false, by: null, error: NO_ANSWER };
    return this.#answered(this.#asks, options.waitS * 1000 + A_MOMENT_MS, lapsed);
  }

  /** The caller waits: they hear the hold melody, and the agent neither speaks nor hears. */
  hold(): void {
    this.out("call.hold", {});
  }

  /** The wait is over: the agent has the caller back. */
  unhold(): void {
    this.out("call.unhold", {});
  }

  /** Touch tones down the line, for an IVR on the far end: `0-9`, `*`, `#`, `,` for a pause. */
  dtmf(digits: string): void {
    this.out("call.dtmf", { digits });
  }

  /**
   * The caller said the code the page on their screen shows: bind this call to it, so the page
   * follows the call. Lands as `call.claimed` on the log, and `claimed` is set when it does; a code
   * nobody issued, one that expired or one another call took is refused with `no_code`.
   */
  claim(code: string): void {
    this.out("call.claim", { code });
  }

  /** The caller wants ringing back. Written into the call's log for your backend to read and dial. */
  callback(number: string, options: { when?: string; note?: string } = {}): void {
    this.out("call.callback", { number, ...options });
  }

  /** End the call. Say the goodbye BEFORE this: nothing said after it is heard. */
  hangup(reason?: string): void {
    this.out("call.hangup", reason === undefined ? {} : { reason });
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
      case "call.claimed":
        this.claimed = String(data["code"]);
        return;
      case "participant.left":
        return this.room.left(String(data["identity"]));
      case "participant.speaking":
        return this.room.speaking(String(data["identity"]), data["speaking"] === true);
      case "turn.user":
        return this.history.took({ who: "user", text: String(data["text"] ?? ""), speechId: String(data["speech_id"] ?? data["speechId"] ?? ""), interrupted: false, at });
      case "turn.agent":
        this.history.took({ who: "agent", text: String(data["text"] ?? ""), speechId: String(data["speech_id"] ?? data["speechId"] ?? ""), interrupted: data["interrupted"] === true, at });
        return this.#settle(true);
      case "call.transferred":
        return settle(this.#transfers, {
          to: String(data["to"] ?? ""),
          mode: (data["mode"] ?? null) as TransferMode | null,
          ok: data["ok"] === true,
          ...(typeof data["error"] === "string" ? { error: data["error"] } : {}),
        });
      case "attention.answered":
        return settle(this.#asks, {
          ok: data["ok"] === true,
          by: (data["by"] ?? null) as Supervisor | null,
          ...(typeof data["error"] === "string" ? { error: data["error"] } : {}),
        });
      // Nobody is waiting for anything any more, and a verb whose answer was still coming is
      // answered by the ending itself rather than left hanging until its own ceiling.
      case "call.ended":
        this.#settle(false);
        settle(this.#transfers, { to: "", mode: null, ok: false, error: THE_CALL_ENDED });
        settle(this.#asks, { ok: false, by: null, error: THE_CALL_ENDED });
        return;
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

  // A verb of the line is answered by an entry of this call's own log, seconds or minutes later.
  // The ceiling is not the answer — the runtime always writes one — it is what keeps a tool from
  // waiting for a gateway that went away mid-call.
  #answered<T>(waiting: ((answer: T) => void)[], ceiling: number, lapsed: T): Promise<T> {
    return new Promise<T>((resolve) => {
      waiting.push(resolve);
      setTimeout(() => {
        const index = waiting.indexOf(resolve);
        if (index >= 0) waiting.splice(index, 1);
        resolve(lapsed);
      }, ceiling).unref?.();
    });
  }
}

function settle<T>(waiting: ((answer: T) => void)[], answer: T): void {
  const resolvers = waiting.splice(0, waiting.length);
  for (const resolve of resolvers) resolve(answer);
}
