/** `pinecall simulate --persona x`: a model plays the caller, and the call is judged at hang-up. */

import { parseArgs } from "node:util";

import type { CallScore } from "@pinecall/protocol";
import type { CamelEvent } from "../client/index.js";
import { Pinecall } from "../client/index.js";
import WebSocket from "ws";

import { mount } from "../runtime/connect.js";
import { chatUrl } from "./chat.js";
import { theDoor } from "./env.js";
import type { Group } from "./groups.js";
import { load, mountOptions } from "./load.js";
import { NO_PERSONAS, personaNamed, type Persona } from "./testing/caller.js";
import { type Door, entriesOf, type Entry, type Persona as Calling, type Spoken, theNextLine } from "./testing/gateway.js";
import { latencyLine, mediansOf } from "./testing/latency.js";
import { linesOfScore } from "./testing/score.js";
import { aCallId, aVoiceCall, DEGRADED, type Degraded, watching } from "./testing/voice.js";
import { lineFor, metricsLine } from "./view.js";

export const group: Group = {
  purpose: "a model plays one persona against the agent, live, and the call is scored at hang-up",
  run,
};

const USAGE =
  "usage: pinecall simulate --persona <name> [--judge] [--turns n] [--voice]\n" +
  "       [--background-noise <dB under the caller>] [--packet-loss <percent>] [--agent agent.ts]\n";

// The speakers need the room, and the only door into a room from this machine is the console's
// Talk screen, which is a browser page and not a terminal.
const NO_LISTEN = "--listen puts the call on your speakers: it needs a room — `pinecall ui` has one\n";

// A spoiled line is a property of audio: there is nothing to mix into a written turn, and a flag
// that quietly did nothing would be a run reporting a noisy line it never had.
const ONLY_ON_A_LINE = "--background-noise and --packet-loss are about audio: add --voice\n";

/**
 * How many turns a caller improvises when nobody said. Six is the length of the walkthrough the
 * examples are written against, and long enough for a booking to reach its confirmation.
 */
export const TURNS = 6;

// How long a written call is left quiet before the caller says the next thing. The app answers
// `call.started` with a render and a tool may run after the reply, so a turn is over when nothing
// has been written for a moment — the same silence the gateway's own runner waits for.
const SETTLE_MS = 400;

// And how long one turn may take before the simulation gives up on it. A tenant's tool that awaits
// something for ever must not leave a person watching a prompt that never returns.
const A_TURN_MAY_TAKE_MS = 30_000;

// The log seals on `call.score`, which is written after the caller has gone — so it is read back
// rather than heard, and this is how long the judges are given before the terminal gives up.
const JUDGING_MAY_TAKE_MS = 60_000;
const TERMINAL_ENTRY = "call.score";

const NOT_SEALED = `no ${TERMINAL_ENTRY} within ${JUDGING_MAY_TAKE_MS / 1000}s: read the call with \`pinecall sessions show\``;

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
      agent: { type: "string" },
    },
  });
  if (values.listen === true) {
    process.stderr.write(NO_LISTEN);
    return 2;
  }
  if (values.persona === undefined) {
    process.stderr.write(USAGE);
    return 2;
  }
  const degraded = degradedBy(values["background-noise"], values["packet-loss"]);
  if (values.voice !== true && degraded !== undefined) {
    process.stderr.write(ONLY_ON_A_LINE);
    return 2;
  }
  const persona = await personaNamed(values.persona);
  if (persona === undefined) {
    process.stderr.write(`no persona called ${values.persona}: ${NO_PERSONAS}\n`);
    return 2;
  }
  const said = await aSimulation(persona, {
    agentFile: values.agent,
    judge: values.judge === true,
    voice: values.voice === true,
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
// are told apart on the screen, where a verdict belongs — docs/decisions/scoring.md.
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
  degraded?: Degraded | undefined;
  turns: number;
  out: NodeJS.WritableStream;
}

/**
 * The class is mounted in THIS process, as `chat` and `test` mount it, and a model in the runtime
 * plays the caller: this terminal holds the persona and the transcript, the gateway holds the
 * provider keys. Every turn is improvised from the goal, the style and the persona's own facts,
 * and with `judge` the `call.score` the log seals on is read back and printed.
 */
export async function aSimulation(persona: Persona, how: Simulation): Promise<Simulated | undefined> {
  const door = theDoor();
  if (door === undefined) return undefined;
  const loaded = await load(how.agentFile);
  const url = door.url;
  const pc = new Pinecall({ url, apiKey: door.apiKey });
  // A written call names this app in its own socket URL, so the terminal takes nothing it did not
  // open. A spoken one arrives through the worker, which names no app (worker/entry.py:82) — so a
  // `--voice` run has to be willing to serve the call the runtime opens for it, which is exactly
  // the posture `pinecall run` has, and the gateway refuses the job otherwise.
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
      : await inWriting(chatUrl(url, mounted.slug, mounted.agent.app), door.apiKey, door, persona, how);
    return { call, ...(await theEnding(door, call, how)) };
  } finally {
    pc.close();
  }
}

// The written door: one socket, the improvised lines down it one at a time, the log up it as it
// happens. Closing the socket is the hangup, and the hangup is what writes the score.
async function inWriting(
  socketUrl: string,
  apiKey: string,
  door: Door,
  persona: Persona,
  how: Simulation,
): Promise<string> {
  const socket = new WebSocket(socketUrl, { headers: { authorization: `Bearer ${apiKey}` } });
  const heard = new Heard(how.out);
  socket.on("message", (frame: Buffer) => heard.absorb(JSON.parse(frame.toString()) as Entry));
  await once(socket, "open");
  await heard.quiet();
  for (let turn = 0; turn < how.turns; turn += 1) {
    const next = await theNextLine(door, {
      persona: callingAs(persona),
      heard: heard.said,
      turns_left: how.turns - turn,
    });
    if (next.say === "") break;
    const before = heard.agentTurns;
    socket.send(JSON.stringify({ text: next.say }));
    await heard.answered(before);
    if (next.hangup) break;
  }
  socket.close();
  how.out.write(`  ${heard.call ?? "no call"} · ${heard.agentTurns} agent turn(s)\n`);
  return heard.call ?? "";
}

// The spoken door: a room, the agent dispatched into it, and the persona's own voice on a line
// that may be spoiled on purpose. The whole call is held in the runtime, where the LiveKit pair
// and the box's speech tool are; this side mints the id and watches the log while it happens.
async function outLoud(
  door: Door,
  slug: string,
  persona: Persona,
  how: Simulation,
): Promise<string> {
  const call = aCallId();
  const heard = new Heard(how.out);
  const held = aVoiceCall(door, {
    call,
    agent: slug,
    persona: callingAs(persona),
    turns: how.turns,
    ...(how.degraded === undefined ? {} : { degraded: how.degraded }),
  });
  await watching(door, call, held, (entry) => heard.absorb(entry));
  const called = await held;
  how.out.write(`  ${call} · ${called.turns} caller turn(s) · ${heard.agentTurns} agent turn(s) · ${called.line}\n`);
  return call;
}

/** The persona as the runtime's two doors take it: three declarations, and no script at all. */
function callingAs(persona: Persona): Calling {
  return {
    name: persona.name,
    goal: persona.goal,
    style: persona.style,
    ...(persona.facts === undefined ? {} : { facts: persona.facts }),
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
  out.write(`${NOT_SEALED}\n`);
  return undefined;
}

/** The entry the log seals on, when it is there yet. A log still being written has none. */
async function sealing(door: Door, call: string): Promise<CallScore | undefined> {
  const sealed = (await entriesOf(door, call)).find((entry) => entry.type === TERMINAL_ENTRY);
  return sealed === undefined ? undefined : (sealed.data as unknown as CallScore);
}

// The call's log as this terminal hears it: printed as it lands, and quiet when the app has
// finished reacting. Everything the simulation knows about where the call is, it knows from here —
// including the transcript the caller model is handed, which is the log's own turns and not a
// second copy this process kept.
class Heard {
  call: string | undefined;
  agentTurns = 0;
  readonly said: Spoken[] = [];
  private last = Date.now();

  constructor(private readonly out: NodeJS.WritableStream) {}

  /** One entry: remembered, and printed when it is a line of the conversation rather than wiring. */
  absorb(entry: Entry): void {
    this.last = Date.now();
    if (typeof entry.call === "string") this.call = entry.call;
    if (entry.type === "turn.agent") this.agentTurns += 1;
    if (entry.type === "turn.user" || entry.type === "turn.agent") {
      this.said.push({
        who: entry.type === "turn.agent" ? "agent" : "caller",
        said: String(entry.data["text"] ?? ""),
      });
    }
    // Both sides are printed off the log and never off what this process sent: on a spoken call
    // the caller's own turn is what the STT heard, which is the line that matters.
    const line = lineFor(entry as unknown as CamelEvent);
    if (line === null) return;
    const metrics = entry.type === "turn.agent"
      ? `  ${metricsLine(entry.data["metrics"] as Record<string, unknown> | undefined)}`
      : "";
    this.out.write(`${line.mark} ${line.text}${metrics}\n`);
  }

  /** Waits until the agent has spoken again, and then until the app has finished reacting. */
  async answered(said: number): Promise<void> {
    const deadline = Date.now() + A_TURN_MAY_TAKE_MS;
    while (this.agentTurns === said && Date.now() < deadline) await after(SETTLE_MS / 4);
    await this.quiet();
  }

  /** Waits until nothing has been written for a moment: the app has answered and re-rendered. */
  async quiet(): Promise<void> {
    const deadline = Date.now() + A_TURN_MAY_TAKE_MS;
    while (Date.now() - this.last < SETTLE_MS && Date.now() < deadline) await after(SETTLE_MS / 4);
  }
}

function after(ms: number): Promise<void> {
  return new Promise((wake) => setTimeout(wake, ms));
}

function once(socket: WebSocket, event: string): Promise<void> {
  return new Promise((done, failed) => {
    socket.on(event, () => done());
    socket.on("error", failed);
  });
}
