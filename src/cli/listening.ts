/** `--listen`: one live call on this machine's speakers, from the terminal that opened it. */

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";

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
// track is published at that rate (runtime evals/speech.py) — so the mixer and the player agree
// on one number rather than each guessing.
const SAMPLE_RATE = 48_000;
const CHANNELS = 1;

// The seat is minted off the call's snapshot, which the gateway writes when the room opens. A
// simulation asks for its ear the moment it has an id, which is before the worker has joined, so
// the door is knocked at until it answers rather than once.
const A_ROOM_OPENS_WITHIN_MS = 30_000;
const A_KNOCK_EVERY_MS = 500;

/** The players this machine might have, in the order they are tried, each with its raw-audio flags. */
const PLAYERS: { name: string; args: string[] }[] = [
  { name: "ffplay", args: ["-hide_banner", "-loglevel", "error", "-nodisp", "-autoexit", "-f", "s16le", "-ar", String(SAMPLE_RATE), "-ac", String(CHANNELS), "-i", "-"] },
  { name: "play", args: ["-q", "-t", "raw", "-r", String(SAMPLE_RATE), "-e", "signed", "-b", "16", "-c", String(CHANNELS), "-"] },
  { name: "aplay", args: ["-q", "-f", "S16_LE", "-r", String(SAMPLE_RATE), "-c", String(CHANNELS), "-"] },
  { name: "pw-play", args: [`--format=s16`, `--rate=${SAMPLE_RATE}`, `--channels=${CHANNELS}`, "-"] },
];

/** What to say when this machine has no way to play raw audio, and what installs one. */
export const NO_PLAYER =
  `no player on this machine: --listen writes ${SAMPLE_RATE} Hz mono to one of ` +
  `${PLAYERS.map((one) => one.name).join(", ")} — install ffmpeg, sox or alsa-utils`;

/** What to say when the room library is not installed: it is optional, and this is what wants it. */
export const NO_ROOM_LIBRARY =
  "--listen joins the call's room from this terminal and needs @livekit/rtc-node, which is an " +
  "optional dependency: install it (pnpm add @livekit/rtc-node) and listen again";

/**
 * A hidden, silent seat in one live call, with both tracks mixed onto this machine's speakers.
 * It is the same seat the console's listen button takes — `POST /v1/calls/{call}/listen`, scope
 * `observe` — and the caller is never told anybody joined. Nothing is recorded here: the runtime
 * writes the recording, and this is only the ear.
 */
export async function anEarIn(door: Door, call: string, out: NodeJS.WritableStream): Promise<Ear> {
  const player = aPlayer();
  if (player === null) throw new Error(NO_PLAYER);
  const room = await theRoomLibrary();
  const seat = await aSeatIn(door, call);
  const joined = new room.Room();
  const mixer = new room.AudioMixer(SAMPLE_RATE, CHANNELS);
  // Both sides of the call are one stream: the caller's track and the agent's, mixed, so the
  // speakers hear the conversation and not whichever track arrived first.
  joined.on(room.RoomEvent.TrackSubscribed, (track) => {
    if (track.kind === room.TrackKind.KIND_AUDIO) {
      mixer.addStream(new room.AudioStream(track, SAMPLE_RATE, CHANNELS));
    }
  });
  await joined.connect(seat.server_url, seat.participant_token, { autoSubscribe: true, dynacast: false });
  out.write(`  listening as ${seat.identity} · ${player.spawnfile}\n`);
  const playing = pour(mixer, player);
  return {
    identity: seat.identity,
    async leave(): Promise<void> {
      await mixer.aclose();
      await joined.disconnect();
      await playing;
      player.stdin?.end();
    },
  };
}

// The mixed frames, straight to the player's stdin as they are made. A frame is int16 samples,
// which is exactly what every one of the four players is being told to expect.
async function pour(mixer: AsyncIterable<{ data: Int16Array }>, player: ChildProcess): Promise<void> {
  for await (const frame of mixer) {
    if (player.stdin === null || player.stdin.destroyed) return;
    player.stdin.write(Buffer.from(frame.data.buffer, frame.data.byteOffset, frame.data.byteLength));
  }
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

/** The first player this machine has on its PATH, started and waiting for samples. */
function aPlayer(): ChildProcess | null {
  for (const { name, args } of PLAYERS) {
    if (!onThePath(name)) continue;
    return spawn(name, args, { stdio: ["pipe", "ignore", "ignore"] });
  }
  return null;
}

/** Is this program on this shell's PATH? Asked without starting anything to find out. */
function onThePath(name: string): boolean {
  return (process.env["PATH"] ?? "").split(delimiter).some((where) => where !== "" && existsSync(join(where, name)));
}

/**
 * The room, in Node. It is an optional dependency because it is a native build of some weight and
 * every verb but this one talks to the gateway over HTTP: a tenant who never listens from their
 * terminal should not pay for it, and one who does is told the line that installs it.
 *
 * Its logger fixes its own level the first time the module is loaded — debug unless NODE_ENV says
 * production (its dist/log.cjs) — writes to the file descriptor rather than to `process.stdout`,
 * and is exported nowhere, so there is no turning it down afterwards. Three hundred lines of FFI
 * chatter over the transcript is not a call anybody can read, so the variable is set for the
 * length of that one import and put back exactly as it was, before any tenant code runs again.
 */
async function theRoomLibrary(): Promise<typeof import("@livekit/rtc-node")> {
  const before = process.env["NODE_ENV"];
  process.env["NODE_ENV"] = before ?? "production";
  try {
    return await import("@livekit/rtc-node");
  } catch {
    throw new Error(NO_ROOM_LIBRARY);
  } finally {
    if (before === undefined) delete process.env["NODE_ENV"];
  }
}
