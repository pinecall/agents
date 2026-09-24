/** What `pinecall start` prints while it holds the agents: the plain log, the JSON pipe, and the full-screen view. */

import type { CamelEvent, Drained, Pinecall } from "../client/index.js";
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
  await held(pc);
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
  await held(pc);
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
  let why: string | undefined;
  await new Promise<void>((done) => {
    // Raw mode swallows ^C as a key, so a SIGTERM from a process manager is the one signal left.
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
      // s shows the prompt the model would read right now, and the stage that decided its tools:
      // the live instance when a call is up, and a fresh one otherwise, as --show-prompt prints.
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

// `start` ends on a signal, or when a member of the org stops the app from `pinecall agent stop` or
// the console: then it says who, and exits instead of dialling back. A signal is a deploy, or a
// person at the terminal, and neither is a reason to cut a call: the process drains first — its live
// calls go to another process or wait for the next — and a second signal leaves at once.
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

// The verb ends when the process is signalled, not when a promise settles: it registers an
// agent and then has nothing left to do but stay reachable.
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

// On stderr, so `--events` keeps stdout to JSON lines: what a deploy's log says of the calls it left.
async function drained(pc: Pinecall): Promise<void> {
  process.stderr.write(drainLine(await pc.drain()) + "\n");
}

/** The one line a drain prints: where the live calls went, and what became of the tools running. */
export function drainLine(done: Drained): string {
  const calls = done.handed + done.parked;
  if (calls === 0 && done.tools === 0) return "draining · no live calls";
  const parts = ["draining"];
  if (done.handed > 0) parts.push(`${plural(done.handed, "live call")} handed over`);
  if (done.parked > 0) parts.push(`${plural(done.parked, "live call")} kept for the next process`);
  if (done.finished > 0) parts.push(`${plural(done.finished, "tool")} finished`);
  if (done.tools > done.finished) parts.push(`${plural(done.tools - done.finished, "tool")} cut`);
  return parts.join(" · ");
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}
