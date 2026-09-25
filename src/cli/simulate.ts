/** `pinecall simulate --persona x`: a model plays the caller, and the call is judged at hang-up. */

import { parseArgs } from "node:util";

import type { CallScore } from "@pinecall/protocol";
import type { CamelEvent } from "../client/index.js";
import { signed } from "../client/signed.js";
import WebSocket from "ws";

import { mount } from "../runtime/connect.js";
import { chatUrl } from "./chat.js";
import { pinecallFor } from "./client-for.js";
import { theDoor } from "./env.js";
import type { Group } from "./groups.js";
import { anEarIn, type Ear } from "./listening.js";
import { load, mountOptions, slugOfAgentFile } from "./load.js";
import { AGENT_FLAG, oneHome } from "./home.js";
import { NOBODY, personaNamed, type Persona } from "./testing/personas.js";
import { type Door, entriesOf, type Entry, type Persona as Calling, type Spoken, theNextLine } from "./testing/gateway.js";
import { latencyLine, mediansOf } from "./testing/latency.js";
import { linesOfScore } from "./testing/score.js";
import { aCallId, aVoiceCall, DEGRADED, type Degraded, watching } from "./testing/voice.js";
import { after, Heard, SETTLE_MS } from "./testing/heard.js";

const USAGE =
  "usage: pinecall simulate --persona <name> [--judge] [--turns n] [--voice] [--listen]\n" +
  "       [--background-noise <dB under the caller>] [--packet-loss <percent>] [--agent <name>] [--file agent.tsx]\n";

export const group: Group = {
  purpose: "a model plays one persona against the agent, live, and the call is scored at hang-up",
  usage: `${USAGE}
  A model in the gateway plays the caller: every turn improvised from the persona's goal, its
  style and its own facts — there is no script. This terminal holds the class and the transcript;
  the gateway holds the provider keys. The call lands in the log like any other.

  --persona <name>    one of the org's personas, by name: pinecall personas lists them
  --judge             read back the call.score the log seals on, and print every judge
  --turns n           how many turns the caller improvises before hanging up (default 15)
  --voice             a real line: a room, and the caller in a person's voice, not the agent's
  --listen            the call on this machine's speakers while it happens; turns --voice on
  --background-noise  dB under the caller: a television behind them. Spoken runs only
  --packet-loss       percent of the caller's packets that never arrive. Spoken runs only
  --agent <name>      which agent of a project of several plays the other half
  --file agent.tsx    which class to mount, when the directory holds more than one`,
  run,
};

// Hearing a call means a call with audio in it, so the flag turns the line on rather than refusing
// a person who asked to listen to a written one. Said out loud, because it changes what is run.
const LISTEN_IS_A_LINE = "--listen is a call with audio in it: --voice is on";

// A spoiled line is a property of audio: there is nothing to mix into a written turn, and a flag
// that quietly did nothing would be a run reporting a noisy line it never had.
export const ONLY_ON_A_LINE = "--background-noise and --packet-loss are about audio: add --voice";

/**
 * How many turns a caller improvises when nobody said.
 *
 * Fifteen, because six was the length of a walkthrough and not of a call: a booking that settles
 * an address, takes the property, the size, the condition, a day and a window, and then confirms,
 * is past six turns before it has begun — and a simulation that hangs up there tests the opening
 * of every agent and the end of none.
 */
export const TURNS = 15;

// The log seals on `call.score`, which is written after the caller has gone — so it is read back
// rather than heard, and this is how long the judges are given before the terminal gives up.
const JUDGING_MAY_TAKE_MS = 60_000;
const TERMINAL_ENTRY = "call.score";

// `sessions` is a group of the runtime's CLI, not of this one: pointing a person at `pinecall
// sessions show` sends them to a stub that prints "not built yet" and nothing else.
const notSealed = (call: string): string =>
  `no ${TERMINAL_ENTRY} within ${JUDGING_MAY_TAKE_MS / 1000}s: read the call with ` +
  `\`pinecall sessions ${call}\`, or the console → Sessions`;

/** What one simulated call left behind: where to read it, and what the judges made of it. */
export interface Simulated {
  call: string;
  score?: CallScore | undefined;
}

export async function run(argv: string[], out: NodeJS.WritableStream = process.stdout): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      persona: { type: "string" },
      judge: { type: "boolean", default: false },
      listen: { type: "boolean", default: false },
      voice: { type: "boolean", default: false },
      "background-noise": { type: "string" },
      "packet-loss": { type: "string" },
      turns: { type: "string" },
      file: { type: "string" },
      ...AGENT_FLAG,
    },
  });
  const listen = values.listen === true;
  const voice = values.voice === true || listen;
  if (listen && values.voice !== true) out.write(`${LISTEN_IS_A_LINE}\n`);
  if (values.persona === undefined) {
    process.stderr.write(USAGE);
    return 2;
  }
  const degraded = degradedBy(values["background-noise"], values["packet-loss"]);
  if (!voice && degraded !== undefined) {
    process.stderr.write(`${ONLY_ON_A_LINE}\n`);
    return 2;
  }
  const home = await oneHome("simulate", values.file, values.agent);
  const door = await theDoor();
  if (door === undefined) return 2;
  const agent = await slugOfAgentFile(home.file);
  const persona = await personaNamed(door, values.persona);
  if (persona === undefined) {
    process.stderr.write(`${NOBODY(values.persona)}\n`);
    return 2;
  }
  const said = await aSimulation(persona, {
    door,
    agentFile: home.file,
    judge: values.judge === true,
    voice,
    listen,
    ...(degraded === undefined ? {} : { degraded }),
    turns: values.turns === undefined ? TURNS : Number(values.turns),
    out,
  });
  return exitCodeOf(said);
}

/** How the line is to be spoiled, when it is: a level in dB, and a share of packets lost. */
export function degradedBy(noise: string | undefined, loss: string | undefined): Degraded | undefined {
  if (noise === undefined && loss === undefined) return undefined;
  return {
    interferer_db: noise === undefined || noise === "" ? DEGRADED.interferer_db : Number(noise),
    packet_loss: loss === undefined || loss === "" ? DEGRADED.packet_loss : Number(loss) / 100,
  };
}

// A call nobody could open is a failure of this command; a call a judge answered `broken` about is
// a failure of the agent. A call NOBODY judged is neither — and it does not exit zero either,
// because an exit code is a gate and "nobody looked at this" must not open one. The three states
// are told apart on the screen, where a verdict belongs — the runtime's docs/decisions/scoring.md.
export function exitCodeOf(said: Simulated | undefined): number {
  if (said === undefined) return 2;
  if (said.score === undefined) return 0;
  return said.score.passed === true ? 0 : 1;
}

/** What a simulation needs beyond the persona: which class, how far to go, and where to print. */
export interface Simulation {
  agentFile?: string | undefined;
  judge: boolean;
  voice: boolean;
  /** Put the call on this machine's speakers while it happens. Only on a spoken line. */
  listen?: boolean | undefined;
  degraded?: Degraded | undefined;
  turns: number;
  out: NodeJS.WritableStream;
  /** The gateway to run against. Absent, the one this terminal's environment names. */
  door?: Door | undefined;
  /** Told the call's id the moment it is known, so whoever started this can go and watch it. */
  opened?: ((call: string) => void) | undefined;
}

/**
 * The class is mounted in THIS process, as `chat` and `test` mount it, and a model in the runtime
 * plays the caller: this terminal holds the persona and the transcript, the gateway holds the
 * provider keys. Every turn is improvised from the goal, the style and the persona's own facts,
 * and with `judge` the `call.score` the log seals on is read back and printed.
 */
export async function aSimulation(persona: Persona, how: Simulation): Promise<Simulated | undefined> {
  const door = how.door ?? (await theDoor());
  if (door === undefined) return undefined;
  const loaded = await load(how.agentFile);
  const url = door.url;
  const pc = pinecallFor(door);
  // A written call names this app in its own socket URL, so the terminal takes nothing it did not
  // open. A spoken one arrives through the worker, which names no app (worker/entry.py:82) — so a
  // `--voice` run has to be willing to serve the call the runtime opens for it, which is exactly
  // the posture `pinecall start` has, and the gateway refuses the job otherwise.
  const mounted = mount(loaded.ctor, {
    ...mountOptions(loaded, pc),
    takesUnclaimed: how.voice,
    opening: () => persona.state,
  });
  how.out.write(`${persona.name} · ${persona.goal}\n`);
  try {
    await pc.connect();
    const call = how.voice
      ? await outLoud(door, mounted.slug, persona, how)
      : await inWriting(chatUrl(url, mounted.slug, mounted.agent.app, undefined, persona.name), door, persona, how);
    return { call, ...(await theEnding(door, call, how)) };
  } finally {
    pc.close();
  }
}

// The written door: one socket, the improvised lines down it one at a time, the log up it as it
// happens. Closing the socket is the hangup, and the hangup is what writes the score.
async function inWriting(
  socketUrl: string,
  door: Door,
  persona: Persona,
  how: Simulation,
): Promise<string> {
  const socket = new WebSocket(socketUrl, { headers: signed(door.apiKey, door.world) });
  const heard = new Heard(how.out, how.opened);
  socket.on("message", (frame: Buffer) => heard.absorb(JSON.parse(frame.toString()) as Entry));
  await once(socket, "open");
  await heard.quiet();
  for (let turn = 0; turn < how.turns; turn += 1) {
    // Somebody hung the call up — the console's Stop, the app, the agent. The line the model is
    // about to improvise would go down a socket that is already sealed, so the caller stops with
    // the call, exactly as the spoken one does off the same entry (runtime api/evals/voice.py).
    if (heard.over) break;
    const next = await theNextLine(door, {
      persona: callingAs(persona),
      heard: heard.said,
      turns_left: how.turns - turn,
    });
    if (next.say === "" || heard.over) break;
    const before = heard.agentTurns;
    socket.send(JSON.stringify({ text: next.say }));
    await heard.answered(before);
    if (next.hangup) break;
  }
  socket.close();
  how.out.write(`  ${heard.call ?? "no call"} · ${heard.agentTurns} agent turn(s)\n`);
  return heard.call ?? "";
}

// The spoken door: a room, the agent dispatched into it, and the caller in a voice of its own on a
// line that may be spoiled on purpose. The whole call is held in the runtime, where the LiveKit
// pair and the vendor keys are; this side mints the id and watches the log while it happens.
async function outLoud(
  door: Door,
  slug: string,
  persona: Persona,
  how: Simulation,
): Promise<string> {
  const call = aCallId();
  // Told the id only once the call's log has an entry: the gateway accepted the call and the room
  // is being built. Told at once, a call the gateway refused — a key without `evals`, no worker —
  // left the console waiting on a room that was never going to open (2026-09-19, production).
  const heard = new Heard(how.out);
  let told = false;
  // The ear is taken before the call is asked for: the seat is minted off the room, which opens a
  // moment later, and joining late is joining after the greeting — the one turn worth hearing.
  const ear = how.listen === true ? listening(door, call, how.out) : null;
  const held = aVoiceCall(door, {
    call,
    agent: slug,
    persona: callingAs(persona),
    turns: how.turns,
    ...(how.degraded === undefined ? {} : { degraded: how.degraded }),
  });
  await watching(door, call, held, (entry) => {
    if (!told) {
      told = true;
      how.opened?.(call);
    }
    heard.absorb(entry);
  });
  const called = await held;
  await (await ear)?.leave();
  how.out.write(`  ${call} · ${called.turns} caller turn(s) · ${heard.agentTurns} agent turn(s) · ${called.line}\n`);
  return call;
}

// An ear that could not be taken is a line printed and a call that still happens: a machine with
// no player, or without the optional room library, must not lose the simulation over it.
async function listening(door: Door, call: string, out: NodeJS.WritableStream): Promise<Ear | null> {
  try {
    return await anEarIn(door, call, out);
  } catch (failed) {
    out.write(`  not listening: ${failed instanceof Error ? failed.message : String(failed)}\n`);
    return null;
  }
}

/**
 * The persona as the runtime's two doors take it: three declarations and no script — and every
 * field it set of the five that say how it is played and when it accepts the call. A field that is
 * not forwarded here never reaches the gateway, which plays and judges what it is sent.
 */
export function callingAs(persona: Persona): Calling {
  const set = (value: string | null | undefined): value is string => value !== undefined && value !== null && value !== "";
  return {
    name: persona.name,
    goal: persona.goal,
    style: persona.style,
    ...(persona.facts === undefined ? {} : { facts: persona.facts }),
    ...(set(persona.llm) ? { llm: persona.llm } : {}),
    ...(set(persona.tts) ? { tts: persona.tts } : {}),
    ...(set(persona.voice) ? { voice: persona.voice } : {}),
    ...(set(persona.accepts_when) ? { accepts_when: persona.accepts_when } : {}),
    ...(set(persona.declines_when) ? { declines_when: persona.declines_when } : {}),
  };
}

// What is read back off the call's own log once the caller has gone: the latencies livekit
// measured for every turn, and — when somebody asked for it — the `call.score` the log seals on.
// Nothing here computes a metric the log does not already carry.
async function theEnding(
  door: Door,
  call: string,
  how: Simulation,
): Promise<{ score?: CallScore | undefined }> {
  if (call === "") return {};
  const measured = latencyLine(mediansOf(await entriesOf(door, call)));
  how.out.write(`  ${measured === "" ? "no metrics on this call" : measured}\n`);
  return { score: how.judge ? await theScore(door, call, how.out) : undefined };
}

// The judges take as long as they take; nothing here hurries them, and a call that never sealed
// says so instead of printing a verdict nobody wrote.
async function theScore(
  door: Door,
  call: string,
  out: NodeJS.WritableStream,
): Promise<CallScore | undefined> {
  const deadline = Date.now() + JUDGING_MAY_TAKE_MS;
  while (Date.now() < deadline) {
    const sealed = await sealing(door, call);
    if (sealed !== undefined) {
      out.write(`${linesOfScore(sealed).join("\n")}\n`);
      return sealed;
    }
    await after(SETTLE_MS);
  }
  out.write(`${notSealed(call)}\n`);
  return undefined;
}

/** The entry the log seals on, when it is there yet. A log still being written has none. */
async function sealing(door: Door, call: string): Promise<CallScore | undefined> {
  const sealed = (await entriesOf(door, call)).find((entry) => entry.type === TERMINAL_ENTRY);
  return sealed === undefined ? undefined : (sealed.data as unknown as CallScore);
}


function once(socket: WebSocket, event: string): Promise<void> {
  return new Promise((done, failed) => {
    socket.on(event, () => done());
    socket.on("error", failed);
  });
}
