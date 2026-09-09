/** `pinecall run [agent.ts]`: the app registered and answering — the process you deploy. */

import { parseArgs } from "node:util";

import { Pinecall, type CamelEvent, type RouteInput } from "../client/index.js";

import { showPrompt } from "../views/render.js";
import { mount, type Mounted } from "../runtime/connect.js";
import type { Agent as AgentClass } from "../agent/agent.js";
import { showMachine } from "./machine.js";
import { theDoor } from "./env.js";
import type { Group } from "./groups.js";
import { load, mountOptions } from "./load.js";
import { absorb, draw, screenFor, type Screen } from "./view.js";

// Ten frames a second. The terminal view is a person watching a conversation, and a person cannot read
// faster than that; redrawing on every entry would repaint the whole screen several times inside
// one turn and make the transcript flicker while somebody is trying to read it.
const FRAME_MS = 100;

const CLEAR = "[2J[3J[H";
const KEYS = "keys: p pause · c clear · e events · s prompt · q quit";

export const group: Group = {
  purpose: "the app and its doors: the process you deploy",
  usage: `usage: pinecall run [agent.ts] [--ui] [--events] [--show-prompt]

  With nothing after it: the agent registered on the gateway, one line per log entry on stdout,
  no port bound and no page served: the gateway is an API and nothing here answers a browser.

  --show-prompt  the prompt a fresh instance would produce, then exit. No key, no gateway
  --events       one JSON line per log entry instead of the lines, for a pipe
  --ui           the full-screen terminal view; keys: p pause · c clear · e events · s prompt · q quit`,
  run,
};

/**
 * Load the agent, mount it, connect, and stay up until the process is signalled.
 *
 * This is the verb that goes under pm2 and into a container, and it is the same process in
 * development and in production: it runs the agent, binds no port and serves no page. What a
 * person looks at is `--ui` in this terminal, or the log over the gateway's API.
 * See docs/decisions/tenant-cli.md.
 */
export async function run(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      "show-prompt": { type: "boolean", default: false },
      events: { type: "boolean", default: false },
      ui: { type: "boolean", default: false },
    },
  });
  const loaded = await load(positionals[0]);
  // What the `s` key and --show-prompt both print: the prompt the model would read, and under it
  // the stage this instance is in with the tools that stage shows.
  const promptPage = (agent: AgentClass): string => `${showPrompt(agent, loaded.views)}\n\n${showMachine(agent)}`;

  // --show-prompt never connects: it is the question "what would the model read at the start of a
  // call", and answering it must not need a gateway, a key or a network.
  if (values["show-prompt"] === true) {
    process.stdout.write(`${promptPage(new loaded.ctor())}\n`);
    return 0;
  }

  const door = theDoor();
  if (door === undefined) return 2;
  const url = door.url;
  const pc = new Pinecall({ url, apiKey: door.apiKey });
  // Whoever opens the app socket closes it. Left open it keeps this process alive after the
  // signal has been read — a plain `kill` on `pinecall run` did nothing until this landed —
  // and the gateway holds the slug until it shuts.
  try {
    const mounted = mount(loaded.ctor, mountOptions(loaded, pc));
    // --events is a pipe into another program: it prints nothing but its JSON.
    if (values.events === true) return await stream(pc, mounted.agent.onAny.bind(mounted.agent));

    if (values.ui !== true) {
      const line = connectedLine({
        slug: mounted.slug,
        url,
        tools: mounted.options.tools?.length ?? 0,
        doors: doorsOf(mounted.options.routes),
      });
      return await plain(pc, mounted.agent.onAny.bind(mounted.agent), mounted.slug, url, line);
    }

    // Which call the `s` key renders: the newest one, so the prompt on screen is the prompt of the
    // conversation on screen. With no call up it is a fresh instance — the same page --show-prompt gives.
    let newest: string | undefined;
    mounted.agent.onAny((_event, call) => {
      if (call !== null) newest = call.id;
    });
    const watching: Watching = {
      slug: mounted.slug,
      url,
      prompt: () => promptPage(instanceOf(mounted, newest) ?? new loaded.ctor()),
    };
    return await live(pc, mounted.agent.onAny.bind(mounted.agent), watching);
  } finally {
    pc.close();
  }
}

/** What `run` knows about the agent it just registered: everything the one line names. */
export interface Connected {
  slug: string;
  url: string;
  tools: number;
  doors: string[];
}

/**
 * The one line `pinecall run` prints when the socket is up.
 *
 * Three things a person needs and nothing this process had to invent: who registered, which
 * gateway took it, and what the class declared. It names no page: the gateway serves none. An
 * agent that declared no door prints no `doors` at all rather than an empty one.
 */
export function connectedLine(agent: Connected): string {
  const said = [
    agent.slug,
    `connected to ${agent.url}`,
    `tools ${agent.tools}`,
  ];
  if (agent.doors.length > 0) said.push(`doors ${agent.doors.join(", ")}`);
  return said.join(" · ");
}

/** Each door the class declared, as the line names it: the channel, and its number when it has one. */
export function doorsOf(routes: RouteInput[] | undefined): string[] {
  return (routes ?? []).map((route) =>
    route.number === null || route.number === undefined ? route.channel : `${route.channel} ${route.number}`,
  );
}

type Listen = (listener: (event: CamelEvent) => void) => () => void;

function instanceOf(mounted: Mounted, call: string | undefined): AgentClass | undefined {
  return call === undefined ? undefined : mounted.instanceOf(call);
}

// --events is the view for a program: one JSON line per entry, nothing else on stdout, so a
// `pinecall run --events | jq` is a first-class way to watch a call.
async function stream(pc: Pinecall, listen: Listen): Promise<number> {
  listen((event) => process.stdout.write(`${JSON.stringify(event)}\n`));
  await pc.connect();
  await forever();
  return 0;
}

// The default: the same lines the view would have grown, appended, with nothing that moves
// the cursor. It is what a process manager captures and what `docker logs` shows.
async function plain(pc: Pinecall, listen: Listen, slug: string, url: string, connected: string): Promise<number> {
  let screen = screenFor(slug, url);
  listen((event) => {
    const before = screen;
    screen = absorb(screen, event);
    for (const line of newLines(before, screen)) process.stdout.write(`${line}\n`);
  });
  // After the socket is up and not before it: the line says the gateway took this agent, and a
  // gateway that refused it must leave its own refusal as the last thing on the screen.
  await pc.connect();
  process.stdout.write(`${connected}\n`);
  await forever();
  return 0;
}

// What one event added, so the plain log prints the line the view would have grown and not the
// whole view again. Only the two panels a person follows in a log grow line by line.
function newLines(before: Screen, after: Screen): string[] {
  const lines: string[] = [];
  for (const line of after.transcript.slice(before.transcript.length)) lines.push(`${line.mark} ${line.text}`);
  for (const line of after.tools.slice(before.tools.length)) lines.push(`${line.mark} ${line.text}`);
  for (const metric of after.metrics.slice(before.metrics.length)) lines.push(`metrics  ${metric}`);
  if (after.changed !== before.changed && after.changed.length > 0) {
    lines.push(`state    ${after.changed.join(", ")}`);
  }
  return lines;
}

/** The full-screen terminal view: absorb every event, and repaint at most ten times a second. */
async function live(pc: Pinecall, listen: Listen, watching: Watching): Promise<number> {
  let screen = screenFor(watching.slug, watching.url);
  let paused = false;
  let raw = false;
  let dirty = true;
  let prompt: string | undefined;

  const paint = (): void => {
    if (paused || !dirty) return;
    dirty = false;
    const rows = process.stdout.rows ?? 40;
    const columns = process.stdout.columns ?? 100;
    const page = prompt ?? draw(screen, rows - 3, columns, raw);
    process.stdout.write(`${CLEAR}${page}\n\n${KEYS}\n`);
  };

  listen((event) => {
    screen = absorb(screen, event);
    dirty = true;
  });

  // The repaint starts only once the socket is up. Started before it, a refused connection leaves
  // it running: nothing reaches the clearInterval below, the timer holds the process open, and it
  // wipes the screen ten times a second over the one line that says what went wrong.
  await pc.connect();
  const timer = setInterval(paint, FRAME_MS);
  paint();
  await new Promise<void>((done) => {
    const stop = onKey((key) => {
      if (key === "q" || key === "\u0003") {
        stop();
        done();
        return;
      }
      if (key === "p") paused = !paused;
      if (key === "c") screen = screenFor(watching.slug, watching.url);
      if (key === "e") raw = !raw;
      // s shows the prompt the model would read right now, and the stage that decided its tools:
      // the live instance when a call is up, and a fresh one otherwise, as --show-prompt prints.
      if (key === "s") prompt = prompt === undefined ? watching.prompt() : undefined;
      dirty = true;
    });
  });
  clearInterval(timer);
  process.stdout.write(CLEAR);
  return 0;
}

/** What the view needs beyond the events: who it is watching, and how to ask for the prompt. */
interface Watching {
  slug: string;
  url: string;
  prompt(): string;
}

// Raw mode is how a single keypress arrives without an enter; a terminal that has no tty (a pipe,
// CI) simply never sends one, and the view still draws.
function onKey(handle: (key: string) => void): () => void {
  const input = process.stdin;
  if (!input.isTTY) return () => undefined;
  input.setRawMode(true);
  input.resume();
  input.setEncoding("utf8");
  const listener = (chunk: string): void => handle(chunk);
  input.on("data", listener);
  return () => {
    input.off("data", listener);
    input.setRawMode(false);
    input.pause();
  };
}

// The verb ends when the process is signalled, not when a promise settles: it registers an
// agent and then has nothing left to do but stay reachable.
function forever(): Promise<void> {
  return new Promise<void>((done) => {
    process.once("SIGINT", () => done());
    process.once("SIGTERM", () => done());
  });
}
