/** `pinecall run [agent.tsx]`: the app registered and answering — the process you deploy. */

import { parseArgs } from "node:util";

import { Pinecall, type CamelEvent, type RouteInput } from "../client/index.js";

import { showPrompt } from "../views/render.js";
import { mount, type Mounted } from "../runtime/connect.js";
import type { Agent as AgentClass } from "../agent/agent.js";
import { showMachine } from "./machine.js";
import { theDoor } from "./env.js";
import type { Group } from "./groups.js";
import { callsFrom, describing, theLine } from "./line.js";
import { connectedLine, doorsOf, whereThisLanded } from "./connected.js";
import { callingFrom } from "./profiles.js";
import { instanceFor, load, mountOptions } from "./load.js";
import { asked, Refused, type Door } from "./testing/gateway.js";
import { chattingFrom, type Chatting } from "./ui/chatting.js";
import { devHandler, ownVerbs } from "./ui/doors.js";
import { driftingFrom } from "./ui/drifting.js";
import { knowingFrom } from "./ui/knowing.js";
import { promotingFrom } from "./ui/promoting.js";
import { rememberingFrom } from "./ui/remembering.js";
import { reproducingFrom } from "./ui/reproducing.js";
import { simulatingFrom } from "./ui/simulating.js";
import { testingFrom } from "./ui/testing.js";
import { absorb, draw, screenFor, type Screen } from "./view.js";

// Ten frames a second. The terminal view is a person watching a conversation, and a person cannot read
// faster than that; redrawing on every entry would repaint the whole screen several times inside
// one turn and make the transcript flicker while somebody is trying to read it.
const FRAME_MS = 100;

const CLEAR = "[2J[3J[H";
const KEYS = "keys: p pause · c clear · e events · s prompt · q quit";

export const group: Group = {
  purpose: "the app and its doors: the process you deploy",
  usage: `usage: pinecall run [agent.tsx] [--ui] [--events] [--show-prompt]

  With nothing after it: the agent registered on the gateway, one line per log entry on stdout,
  no port bound and no page served: the gateway serves the console, and this prints its URL with a
  one-use code that signs the browser in. It answers that console for this directory.

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
  const promptPage = (agent: AgentClass): string => `${showPrompt(agent)}\n\n${showMachine(agent)}`;

  // --show-prompt never connects: it is the question "what would the model read at the start of a
  // call", and answering it must not need a gateway, a key or a network.
  if (values["show-prompt"] === true) {
    process.stdout.write(`${promptPage(instanceFor(loaded))}\n`);
    return 0;
  }

  const door = theDoor();
  if (door === undefined) return 2;
  const url = door.url;
  const pc = new Pinecall({ url, apiKey: door.apiKey });
  // Whoever opens the app socket closes it. Left open it keeps this process alive after the
  // signal has been read — a plain `kill` on `pinecall run` did nothing until this landed —
  // and the gateway holds the slug until it shuts.
  // What a console may ask of THIS process through the gateway, because the answer is a file of
  // this directory or the class in it: a written call, the personas and a simulation, the goldens
  // and a suite, the knowledge folder, the memory goldens, a candidate, drift, a reproduction.
  // The lines they print land here, in the terminal that typed `run`, as the verbs would print
  // them. Registered before connect, so the first dev.request finds a handler.
  let chatting: Chatting | undefined;
  try {
    const mounted = mount(loaded.ctor, mountOptions(loaded, pc));
    chatting = chattingFrom(door, mounted.slug, process.stdout);
    mounted.agent.onDev(
      devHandler(
        ownVerbs({
          simulating: simulatingFrom(door, mounted.slug, process.stdout),
          testing: testingFrom(door, mounted.slug, process.stdout),
          chatting,
          knowing: knowingFrom(door, mounted.slug),
          remembering: rememberingFrom(door, mounted.slug),
          promoting: promotingFrom(door, mounted.slug, process.stdout),
          drifting: driftingFrom(door),
          reproducing: reproducingFrom(),
        }),
      ),
    );
    // --events is a pipe into another program: it prints nothing but its JSON.
    if (values.events === true) return await stream(pc, mounted.agent.onAny.bind(mounted.agent));

    if (values.ui !== true) {
      const doors = doorsOf(mounted.options.routes);
      const line = connectedLine({
        slug: mounted.slug,
        url,
        tools: mounted.options.tools?.length ?? 0,
        doors,
        ...(await whereThisLanded(door)),
      });
      return await plain(pc, mounted.agent.onAny.bind(mounted.agent), mounted.slug, url, line, () =>
        onceUp(door, mounted.slug, rings(mounted.options.routes)),
      );
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
      prompt: () => promptPage(instanceOf(mounted, newest) ?? instanceFor(loaded)),
    };
    return await live(pc, mounted.agent.onAny.bind(mounted.agent), watching);
  } finally {
    await chatting?.close();
    pc.close();
  }
}

// What a gateway answers for a path no router of its declared.
const NO_SUCH_DOOR = 404;

// The console is the gateway's page at `/a/<agent>`, and it holds a key of its own — never this
// process's. So this process mints a one-use code standing for its key (five minutes, once) and
// prints the URL that carries it; the page spends it for a key of the tab's own. A gateway that
// refuses the code is one line, and the app runs on.
/** Where the console of this agent is, with the code that signs the browser in. */
export function consoleUrl(gateway: string, slug: string, code: string): string {
  return `${gateway.replace(/\/$/, "")}/a/${encodeURIComponent(slug)}?login=${encodeURIComponent(code)}`;
}

// A 404 at this door means the gateway has no such door, which means it is OLDER than this CLI —
// a long-running dev gateway is the usual way to meet it, since nothing restarts one for you. A
// status is not a thing a person can act on, so the sentence says the cause and the fix instead.
const OLDER_GATEWAY =
  "this gateway has no login-code door, so it is older than this CLI. Restart it: it serves the console too, and that will be stale as well.";

/** Why the console line has no URL in it, in words that name the next move. */
export function whyNoConsole(refused: unknown): string {
  if (refused instanceof Refused) {
    return refused.status === NO_SUCH_DOOR ? OLDER_GATEWAY : `the gateway answered ${refused.status}`;
  }
  return refused instanceof Error ? refused.message : String(refused);
}

// What is only true once the socket is up: the console's URL, and — when the agent answers at a
// number — whose terminal that number rings in. Both are asked of the gateway, and neither is
// worth failing the run over: a gateway that refuses says so on its own line and the app runs on.
async function onceUp(door: Door, slug: string, rings: boolean): Promise<string[]> {
  const said = [await consoleLine(door, slug)];
  if (rings) {
    // The gateway keeps whose phone is whose beside its live table and not in a row, because it
    // is only meaningful next to a socket. So every connect says it again: a restarted gateway,
    // or one this terminal has never told, learns it here rather than routing the person's own
    // test call into a colleague's terminal.
    await sayWhoCallsFromHere(door);
    said.push(await lineLine(door, slug));
  }
  return said;
}

/** Re-send the phone `pinecall line from` remembered for this gateway. Silent: it is upkeep. */
async function sayWhoCallsFromHere(door: Door): Promise<void> {
  const kept = callingFrom();
  if (kept === undefined) return;
  try {
    await callsFrom(door, kept);
  } catch {
    // A gateway too old for the door, or a key that opens no `app` here: neither is worth a line
    // in front of a person who did not ask for one. `pinecall line` says the truth when they do.
  }
}

/** Whether this agent answers at a number at all: with no number there is no ring to land. */
export function rings(routes: RouteInput[] | undefined): boolean {
  return (routes ?? []).some((route) => route.number !== null && route.number !== undefined);
}

// A number exists once in a world: in production the box answers it, and in development the org
// shares one and it rings where it was claimed. Printed here because the moment a second
// developer starts is the moment they need to know they did NOT take the calls.
async function lineLine(door: Door, slug: string): Promise<string> {
  try {
    return `line     ${describing(await theLine(door, slug))}`;
  } catch (refused) {
    return `line     not available: ${whyNoConsole(refused)}`;
  }
}

async function consoleLine(door: Door, slug: string): Promise<string> {
  try {
    const minted = await asked<{ code: string }>(door, "/v1/login/codes", { method: "POST", body: {} });
    return `console  ${consoleUrl(door.url, slug, minted.code)}   (opens within five minutes, once)`;
  } catch (refused) {
    return `console  not available: ${whyNoConsole(refused)}`;
  }
}

/** What `run` knows about the agent it just registered: everything the one line names. */
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
async function plain(
  pc: Pinecall,
  listen: Listen,
  slug: string,
  url: string,
  connected: string,
  after: () => Promise<string[]>,
): Promise<number> {
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
  for (const said of await after()) process.stdout.write(`${said}\n`);
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
