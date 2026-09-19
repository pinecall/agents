/** What `pinecall start` prints while it holds the agents: the plain log, the JSON pipe, and the full-screen view. */

import type { CamelEvent, Pinecall } from "../client/index.js";
import { absorb, draw, screenFor, type Screen } from "./view.js";

// Ten frames a second. The terminal view is a person watching a conversation, and a person cannot read
// faster than that; redrawing on every entry would repaint the whole screen several times inside
// one turn and make the transcript flicker while somebody is trying to read it.
const FRAME_MS = 100;

const CLEAR = "\x1b[2J\x1b[3J\x1b[H";
const KEYS = "keys: p pause · c clear · e events · s prompt · q quit";

/** What `run` knows about the agent it just registered: everything the one line names. */
export type Listen = (listener: (event: CamelEvent) => void) => () => void;


// --events is the view for a program: one JSON line per entry, nothing else on stdout, so a
// `pinecall start --events | jq` is a first-class way to watch a call.
export async function stream(pc: Pinecall, listen: Listen): Promise<number> {
  listen((event) => process.stdout.write(`${JSON.stringify(event)}\n`));
  await pc.connect();
  await forever();
  return 0;
}

/** One agent as the plain log prints it: its events, its connected line, and what follows it. */
export interface Plain {
  slug: string;
  heard: Listen;
  connected: string;
  after: () => Promise<string[]>;
}

// The default: the same lines the view would have grown, appended, with nothing that moves
// the cursor. It is what a process manager captures and what `docker logs` shows. With several
// agents every line says whose it is.
export async function plain(pc: Pinecall, agents: Plain[], url: string): Promise<number> {
  const width = Math.max(...agents.map((agent) => agent.slug.length));
  const prefix = (slug: string): string => (agents.length > 1 ? `${slug.padEnd(width)} │ ` : "");
  for (const agent of agents) {
    let screen = screenFor(agent.slug, url);
    agent.heard((event) => {
      const before = screen;
      screen = absorb(screen, event);
      for (const line of newLines(before, screen)) process.stdout.write(`${prefix(agent.slug)}${line}\n`);
    });
  }
  // After the socket is up and not before it: the line says the gateway took this agent, and a
  // gateway that refused it must leave its own refusal as the last thing on the screen.
  await pc.connect();
  for (const agent of agents) process.stdout.write(`${prefix(agent.slug)}${agent.connected}\n`);
  for (const agent of agents) {
    for (const said of await agent.after()) process.stdout.write(`${prefix(agent.slug)}${said}\n`);
  }
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
export async function live(pc: Pinecall, listen: Listen, watching: Watching): Promise<number> {
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
export interface Watching {
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
export function forever(): Promise<void> {
  return new Promise<void>((done) => {
    process.once("SIGINT", () => done());
    process.once("SIGTERM", () => done());
  });
}
