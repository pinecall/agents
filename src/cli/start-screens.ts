/** `pinecall start` output modes: plain log, JSON lines, and the full-screen view. */

import type { CamelEvent, Pinecall } from "../client/index.js";
import { drainLine } from "../serve/leaving.js";
import { absorb, draw, screenFor, type Screen } from "./view.js";

// Repaint at most 10 times a second; per-event redraws flicker.
const FRAME_MS = 100;

const CLEAR = "\x1b[2J\x1b[3J\x1b[H";
const KEYS = "keys: p pause · c clear · e events · s prompt · q quit";

/** Subscribe to an agent's events; returns an unsubscribe function. */
export type Listen = (listener: (event: CamelEvent) => void) => () => void;


// --events: one JSON line per event and nothing else on stdout, for piping into jq.
export async function stream(pc: Pinecall, listen: Listen): Promise<number> {
  listen((event) => process.stdout.write(`${JSON.stringify(event)}\n`));
  await pc.connect();
  await held(pc);
  return 0;
}

/** One agent in the plain log: its events, its `connected` line, and lines printed after it. */
export interface Plain {
  slug: string;
  heard: Listen;
  connected: string;
  after: () => Promise<string[]>;
}

// Default mode: append-only lines without cursor movement, for process managers and `docker logs`.
// With several agents each line is prefixed with the slug.
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
  // Print `connected` only after connect() succeeds, so a refusal stays the last line.
  await pc.connect();
  for (const agent of agents) process.stdout.write(`${prefix(agent.slug)}${agent.connected}\n`);
  for (const agent of agents) {
    for (const said of await agent.after()) process.stdout.write(`${prefix(agent.slug)}${said}\n`);
  }
  await held(pc);
  return 0;
}

// Lines an event added to the screen, so the plain log appends only those.
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

/** The full-screen terminal view, repainted at most ten times a second. */
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

  // Start the timer only after connect(): if connect throws, the interval would never be cleared
  // and would keep the process alive, repainting over the error.
  await pc.connect();
  const timer = setInterval(paint, FRAME_MS);
  paint();
  let why: string | undefined;
  await new Promise<void>((done) => {
    // Raw mode turns ^C into a key; SIGTERM still arrives as a signal.
    void signalled().then(() => {
      stop();
      done();
    });
    const stop = onKey((key) => {
      if (key === "q" || key === "\u0003") {
        stop();
        done();
        return;
      }
      if (key === "p") paused = !paused;
      if (key === "c") screen = screenFor(watching.slug, watching.url);
      if (key === "e") raw = !raw;
      // s toggles the current prompt, as --show-prompt prints it.
      if (key === "s") prompt = prompt === undefined ? watching.prompt() : undefined;
      dirty = true;
    });
    pc.onStopped((said) => {
      why = said;
      stop();
      done();
    });
  });
  clearInterval(timer);
  process.stdout.write(CLEAR);
  if (why !== undefined) process.stderr.write(`${why}\n`);
  else await drained(pc);
  return 0;
}

/** The agent the full-screen view shows, and how to render its prompt. */
export interface Watching {
  slug: string;
  url: string;
  prompt(): string;
}

// Raw mode for single keypresses; without a TTY there are no keys but the view still draws.
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

// Wait until stopped remotely (`pinecall agent stop` or the console: exit without reconnecting) or
// signalled (drain live calls first; a second signal exits at once).
async function held(pc: Pinecall): Promise<void> {
  const stopped = new Promise<"stopped">((done) => {
    pc.onStopped((why) => {
      process.stderr.write(`${why}\n`);
      done("stopped");
    });
  });
  if ((await Promise.race([stopped, signalled()])) === "stopped") return;
  await Promise.race([drained(pc), signalled()]);
}

/** Resolve on the first SIGINT or SIGTERM. */
export function signalled(): Promise<"signalled"> {
  return new Promise((done) => {
    const heard = (): void => {
      process.off("SIGINT", heard);
      process.off("SIGTERM", heard);
      done("signalled");
    };
    process.once("SIGINT", heard);
    process.once("SIGTERM", heard);
  });
}

// stderr, so `--events` stdout stays pure JSON lines.
async function drained(pc: Pinecall): Promise<void> {
  process.stderr.write(drainLine(await pc.drain()) + "\n");
}
