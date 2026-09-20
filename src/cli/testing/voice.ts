/** The spoken door of a simulation: the call is held in the runtime, and watched from here. */

import { randomBytes } from "node:crypto";

import type { Door, Entry, Persona } from "./gateway.js";
import { asked, entriesOf } from "./gateway.js";

/** How the caller's line is spoiled on purpose. Absent from a run means a clean line. */
export interface Degraded {
  /** How many dB under the caller's own voice the interferer sits. */
  interferer_db: number;
  /** The share of the caller's packets that never arrive, 0 to 1. */
  packet_loss: number;
}

// A television behind the caller, at the level the five calls that measured this were run from:
// 15 dB under them was already enough for two of its sentences to become `turn.user`. The
// measurement is in the runtime's docs/decisions/voice-bridge.md.
export const DEGRADED: Degraded = { interferer_db: 15, packet_loss: 0 };

/** What the runtime says about a spoken call once it is over: what was said, and on what line. */
export interface Called {
  call: string;
  turns: number;
  line: string;
}

/** A call id, minted here: a room's name IS the call, so the terminal can watch its log at once. */
export function aCallId(): string {
  return `call_${randomBytes(12).toString("hex")}`;
}

/**
 * One spoken call, held in the runtime because everything it needs is there — the LiveKit pair
 * that signs the caller's seat, the provider key the persona is played with, and the vendor that
 * gives it a voice. This side mints the id and watches the log; nothing here opens an audio device.
 */
export async function aVoiceCall(
  door: Door,
  wanted: { call: string; agent: string; persona: Persona; turns: number; degraded?: Degraded },
): Promise<Called> {
  return await asked<Called>(door, "/v1/evals/voice", {
    method: "POST",
    body: {
      call: wanted.call,
      agent: wanted.agent,
      persona: wanted.persona,
      turns: wanted.turns,
      ...(wanted.degraded ?? {}),
    },
  });
}

/**
 * The call's log as it is written, polled from a cursor: the terminal prints both sides of a
 * spoken call while it happens, and every entry it prints is the log's own — never a second copy
 * this process kept. It stops when `over` settles, which is when the runtime hung the call up.
 */
export async function watching(
  door: Door,
  call: string,
  over: Promise<unknown>,
  absorb: (entry: Entry) => void,
  every = 400,
): Promise<void> {
  let running = true;
  // The refusal is answered for by whoever awaited the call itself; here it is only the end of it.
  void over.catch(() => undefined).finally(() => (running = false));
  let cursor = 0;
  const whatIsNew = async (): Promise<void> => {
    for (const entry of await entriesOf(door, call, { after: cursor })) {
      cursor = entry.seq;
      absorb(entry);
    }
  };
  while (running) {
    await whatIsNew();
    await new Promise((wake) => setTimeout(wake, every));
  }
  // One last pass: the closing turns land between two polls, and a transcript that stops a line
  // short of the hangup is worse than no transcript at all.
  await whatIsNew();
}
