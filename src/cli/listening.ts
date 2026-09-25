/** `--listen`: one live call on this machine's speakers, from the terminal that opened it. */

import { spawn, type ChildProcess } from "node:child_process";
import { extname } from "node:path";
import type { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

import { aPlayerFor, PLAYERS } from "./players.js";
import { asked, type Door } from "./testing/gateway.js";

/** What a seat in a room is: LiveKit's two fields, and who this terminal is in that room. */
interface Seat {
  server_url: string;
  participant_token: string;
  identity: string;
}

/** One ear in one call, and the way to take it out again. */
export interface Ear {
  /** Who this terminal is in the room, for the line it prints. */
  identity: string;
  leave(): Promise<void>;
}

// The room's own rate and shape. Everything that reaches a room is 48 kHz mono — the caller's
// track is published at that rate (runtime evals/speech.py) — so the ear and the player agree on
// one number rather than each guessing.
const SAMPLE_RATE = 48_000;
const CHANNELS = 1;

// The seat is minted off the call's snapshot, which the gateway writes when the room opens. A
// simulation asks for its ear the moment it has an id, which is before the worker has joined, so
// the door is knocked at until it answers rather than once.
const A_ROOM_OPENS_WITHIN_MS = 30_000;
const A_KNOCK_EVERY_MS = 500;

// How long the ear is given to leave the room on its own before it is made to.
const LEAVING_TAKES_MS = 2_000;

// The ear's PCM comes out of its fd 3, never its stdout: the room library's own logger writes to
// stdout at debug and is exported nowhere, so stdout is the one place the samples could not go.
const PCM = 3;

/** What to say when this machine has no way to play raw audio, and what installs one. */
export const NO_PLAYER =
  `no player on this machine: --listen writes ${SAMPLE_RATE} Hz mono to one of ` +
  `${PLAYERS.filter((one) => one.raw !== null).map((one) => one.name).join(", ")} — install ffmpeg, sox or alsa-utils`;

/** What to say when the room library is not installed: it is optional, and this is what wants it. */
export const NO_ROOM_LIBRARY =
  "--listen joins the call's room from this terminal and needs @livekit/rtc-node, which is an " +
  "optional dependency: install it (pnpm add @livekit/rtc-node) and listen again";

/**
 * A hidden, silent seat in one live call, with both tracks mixed onto this machine's speakers.
 * It is the same seat the console's listen button takes — `POST /v1/calls/{call}/listen`, scope
 * `observe` — and the caller is never told anybody joined. Nothing is recorded here: the runtime
 * writes the recording, and this is only the ear.
 *
 * The room is joined in a process of its own (cli/ear.ts), because the room library is a native
 * build with a logger this process cannot turn down and threads that would hold it open after the
 * call. This side mints the seat, starts the player, and pipes the one into the other.
 */
export async function anEarIn(door: Door, call: string, out: NodeJS.WritableStream): Promise<Ear> {
  const player = aPlayer();
  if (player === null) throw new Error(NO_PLAYER);
  theRoomLibrary();
  const seat = await aSeatIn(door, call);
  const ear = spawn(process.execPath, [...theLoaderFor(EAR), EAR, String(SAMPLE_RATE), String(CHANNELS)], {
    stdio: ["pipe", "ignore", "ignore", "pipe"],
  });
  (ear.stdio[PCM] as Readable).pipe(player.stdin!);
  ear.stdin!.write(`${JSON.stringify({ server_url: seat.server_url, participant_token: seat.participant_token })}\n`);
  out.write(`  listening as ${seat.identity} · ${player.spawnfile}\n`);
  return {
    identity: seat.identity,
    async leave(): Promise<void> {
      // Closing its stdin is how the ear is told to leave; a moment later it is made to.
      ear.stdin!.end();
      await gone(ear);
      player.stdin!.end();
    },
  };
}

/**
 * The seat, knocked for until the room opens. The gateway mints it off the call's snapshot and a
 * simulation asks the moment it has an id — before the worker has joined — so asking once would
 * be asking too early, and joining late is joining after the greeting.
 */
export async function aSeatIn(door: Door, call: string): Promise<Seat> {
  const deadline = Date.now() + A_ROOM_OPENS_WITHIN_MS;
  for (;;) {
    try {
      return await asked<Seat>(door, `/v1/calls/${call}/listen`, { method: "POST", body: {} });
    } catch (refused) {
      if (Date.now() >= deadline) throw refused;
      await new Promise((wake) => setTimeout(wake, A_KNOCK_EVERY_MS));
    }
  }
}

// The ear beside this file, whatever this file is: `ear.ts` under the loader in a checkout, `ear.js`
// in the published dist. Which one is read off this module's own name.
export const EAR = fileURLToPath(new URL(`ear${extname(fileURLToPath(import.meta.url))}`, import.meta.url));

/** How node runs the ear: through tsx when it is TypeScript, and on its own when it is not. */
function theLoaderFor(entry: string): string[] {
  return extname(entry) === ".ts" ? ["--import", "tsx"] : [];
}

/** Whether the ear's one dependency is installed here, asked without loading it. */
function theRoomLibrary(): void {
  try {
    import.meta.resolve("@livekit/rtc-node");
  } catch {
    throw new Error(NO_ROOM_LIBRARY);
  }
}

/** The ear's exit, or the ear killed when it took too long about it. */
function gone(ear: ChildProcess): Promise<void> {
  return new Promise((left) => {
    const kill = setTimeout(() => ear.kill("SIGKILL"), LEAVING_TAKES_MS);
    ear.once("exit", () => {
      clearTimeout(kill);
      left();
    });
  });
}

/** The first player this machine has on its PATH that takes raw samples, started and waiting for them. */
function aPlayer(): ChildProcess | null {
  const player = aPlayerFor("raw");
  if (player === null || player.raw === null) return null;
  return spawn(player.name, player.raw(SAMPLE_RATE, CHANNELS), { stdio: ["pipe", "ignore", "ignore"] });
}
