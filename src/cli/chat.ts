/** `pinecall chat [agent]`: this directory's agent in this process, or a written call at one already held. */

import { createInterface } from "node:readline";
import { parseArgs } from "node:util";

import type { CamelEvent } from "../client/index.js";
import { signed } from "../client/signed.js";
import WebSocket from "ws";

import { mount } from "../runtime/connect.js";
import { pinecallFor } from "./client-for.js";
import { theDoor, type Open } from "./env.js";
import type { Group } from "./groups.js";
import { load, mountOptions, notASlug } from "./load.js";
import { AGENT_FLAG, oneHome } from "./home.js";
import { BROKE, CALLER, lineFor } from "./view.js";
import { firstState } from "./prompt.js";

const PROMPT = `${CALLER} `;

export const group: Group = {
  purpose: "the app in this terminal's own process, and a prompt against it",
  usage: `usage: pinecall chat [agent] [--agent <name>] [--file agent.tsx] [--prod] [--as <contact>]
                     [--state file [--case n]] [--events]

  With nothing after it: the agent of this directory, mounted in THIS process, and a written
  caller against it. The tools run here, so a breakpoint in a @tool is reachable.

  With an agent's slug: a written call at the agent somebody is already holding — your own
  \`pinecall start\` in another terminal, or a colleague's. Nothing is mounted here, so --state,
  which opens a call in a class this process built, is refused.

  --agent <name>  which agent of a project of several, by its file's name or its slug
  --file <path>   which class to mount, by its path
  --prod          production's agent, if your org lets you act there; the sandbox otherwise
  --as <contact>  who is calling: the id memory files this call under (a phone number, a customer id)
  --state file    the state the call opens in — the same goldens file \`pinecall prompt\` reads
  --case n        which case of that file, when it holds several
  --events        one JSON line per log entry instead of the lines, for a pipe`,
  run,
};

// --state is applied through mount's `opening` seam, which only exists in a class THIS process
// built. Reaching an agent somebody else is holding, there is no such seam and no honest place to
// put the state, so it is refused rather than silently dropped.
const NOT_YOURS_TO_OPEN =
  "--state opens a call in a class this process mounted, and `pinecall chat <agent>` mounts none:"
  + " drop the slug to chat the agent of this directory.";

/**
 * One process, both sides: the app socket registers the agent, and `WS /v1/chat?agent=<slug>` is
 * the caller. Typing goes out as `{ text }`; everything that comes back is the call's own log,
 * printed as it lands. The tools run in this process, so a breakpoint in a @tool is reachable.
 *
 * This is `rails console`: it works with no `pinecall start` up and it works with three of them,
 * because the caller socket names THIS process's app id and the gateway serves the call from it.
 *
 * Named an agent instead, it mounts nothing and is only the caller's side: a written call at
 * whatever is holding that slug — your own `start` in the other terminal, or a colleague's. The
 * positional is a SLUG and `--file` is the file, because `--agent` meaning one thing in three
 * verbs and the other in six was a flag nobody could read.
 */
export async function run(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      state: { type: "string" },
      case: { type: "string" },
      as: { type: "string" },
      file: { type: "string" },
      ...AGENT_FLAG,
      events: { type: "boolean", default: false },
    },
  });
  const reach = positionals[0];
  const aFile = notASlug(reach);
  if (aFile !== undefined) {
    process.stderr.write(`${aFile}\n`);
    return 2;
  }
  if (reach !== undefined && values.state !== undefined) {
    process.stderr.write(`${NOT_YOURS_TO_OPEN}\n`);
    return 2;
  }
  const door = await theDoor();
  if (door === undefined) return 2;
  const url = door.url;
  if (reach !== undefined) {
    return await talk(() => chatUrl(url, reach, undefined, values.as), door, values.events === true);
  }
  const loaded = await load((await oneHome("chat", values.file, values.agent)).file);
  const pc = pinecallFor(door);
  // takesUnclaimed: false is the other half of the `?app=` below. Holding the agent is what makes
  // this a console; taking a call nobody named would make it a server, and a real phone call would
  // ring in this terminal. See the runtime's docs/decisions/dispatch.md: the registry is its.
  // --state is the same file `pinecall prompt` reads, and it is applied where a call's opening
  // state belongs: through mount's `opening` seam, after the class's own onCall and before the
  // first render, so the model reads one view built from the whole state rather than one per field.
  const preload = values.state === undefined ? undefined : firstState(values.state, values.case);
  const mounted = mount(loaded.ctor, {
    ...mountOptions(loaded, pc),
    takesUnclaimed: false,
    opening: () => preload,
  });

  // The app socket is this process's last handle: left open it keeps node alive after the last
  // turn, and a `pinecall chat` nobody can kill is a process still holding this agent — one of
  // several the gateway now allows, and one more than anybody wanted.
  try {
    await pc.connect();
    // The id exists only after the register the connect awaited, which is why it is read here
    // and not where the agent was mounted.
    const address = (): string => chatUrl(url, mounted.slug, mounted.agent.app, values.as);
    return await talk(address, door, values.events === true);
  } finally {
    pc.close();
  }
}

/** The chat socket's address off the gateway's HTTP one: the scheme flips, the path is fixed. */
export function chatUrl(base: string, agent: string, app?: string, contact?: string, persona?: string): string {
  const url = new URL(base);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = `${url.pathname.replace(/\/$/, "")}/v1/chat`;
  url.searchParams.set("agent", agent);
  // Which process serves the call this socket opens. Without it the gateway picks the newest
  // socket holding the agent, which in a terminal with a `run` running is the other one.
  if (app !== undefined) url.searchParams.set("app", app);
  // A number names its caller; a web visitor is nobody until somebody says who they are, and
  // `--as` is this terminal saying it: memory files the call under that id, so an agent that
  // declares `memory` can be made to remember somebody from here. It is encoded on the way out,
  // because a `+34600123456` written raw into a query string arrives at the gateway as a space.
  if (contact !== undefined) url.searchParams.set("contact", contact);
  // Who is being PLAYED on this call, when a simulation opened it: the gateway writes the name
  // into `call.started`, which is the only place the fact lives and what the Personas screen reads
  // a caller's runs back from. A call without it is a call nobody can attribute afterwards.
  if (persona !== undefined) url.searchParams.set("persona", persona);
  return url.toString();
}

// Every line typed is one turn; every frame received is one entry, printed as it lands. The key
// travels as the upgrade's Authorization header, never in the URL, which is the only thing the
// chat door accepts and the reason this socket is `ws` and not the runtime's global WebSocket.
//
// A written call runs in the gateway, and a gateway that restarts drops this socket without a
// word — never the call, whose log is whole. So a close that is neither this terminal leaving nor
// the call ending is the gateway going away: the socket is dialled again naming the call
// (`?call=`), and the conversation goes on where it was. `address` is asked again each time,
// because the app socket this process holds came back with a new id.
export function talk(
  address: () => string,
  door: Open,
  events: boolean,
  input: NodeJS.ReadableStream = process.stdin,
): Promise<number> {
  const lines = createInterface({ input, output: process.stdout, prompt: PROMPT });
  // An entry can land after the keyboard is gone — a piped stdin ends the moment it is read, and
  // the agent's greeting arrives after that — and readline throws on a prompt it has closed.
  let typing = true;
  let call: string | null = null;
  let over = false;
  let socket: WebSocket | null = null;
  let back = 0;
  // The keyboard waits for the socket: `ws` throws on a send while the upgrade is still in flight
  // rather than queueing it. Paused, a line typed early stays in the stream and arrives as the
  // first turn the moment the socket is up, which is what a person who typed it meant.
  lines.pause();
  return new Promise<number>((done) => {
    const dial = (): void => {
      const url = call === null ? address() : withCall(address(), call);
      const opened = new WebSocket(url, { headers: signed(door.apiKey, door.world) });
      socket = opened;
      opened.on("open", () => {
        if (!typing) return;
        lines.resume();
        lines.prompt();
      });
      opened.on("message", (frame: Buffer) => {
        const entry = JSON.parse(frame.toString()) as { call?: string | null; type?: string };
        // The call answered: it is back, and only now is the patience for the next drop whole again.
        // An open alone proves nothing — the door accepts, then may refuse a call it cannot take up.
        if (back > 0) process.stderr.write("\rthe gateway is back: the call goes on\n");
        back = 0;
        if (typeof entry.call === "string") call = entry.call;
        if (entry.type === "call.score") over = true;
        // --events is the wire itself, one JSON entry per line, exactly what `run --events` prints:
        // the same word means the same thing in both verbs, and it is what a person reaches for
        // when what is wrong is the stream and not the conversation.
        const line = events ? frame.toString() : lineOf(frame.toString());
        if (line === null) return;
        // The prompt is rewritten after every entry: one may land while the caller is typing.
        process.stdout.write(`\r${line}\n`);
        if (typing) lines.prompt();
      });
      // An error is followed by a close, and the close decides.
      opened.on("error", () => undefined);
      opened.on("close", (_code: number, reason: Buffer) => {
        const why = reason.toString();
        if (!typing || over) {
          lines.close();
          done(0);
          return;
        }
        lines.pause();
        // A reason is the gateway saying why it will not take this call. Before any call it is
        // the answer; on a way back it may be the app socket not re-registered yet, so it is
        // asked again until the patience runs out.
        const coming = call !== null && back < BACK_TRIES;
        if (!coming) {
          lines.close();
          if (why !== "") process.stderr.write(`\r${why}\n`);
          done(why === "" ? 0 : 1);
          return;
        }
        if (back === 0) process.stderr.write("\rthe gateway went away — the call is kept, reconnecting…\n");
        back += 1;
        setTimeout(dial, waitBack(back));
      });
    };
    lines.on("line", (line) => {
      if (line.trim() !== "" && socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ text: line.trim() }));
      lines.prompt();
    });
    lines.on("close", () => {
      typing = false;
      socket?.close();
    });
    dial();
  });
}

// A gateway restarting is seconds; this is the patience for it, about a minute in all.
export const BACK_TRIES = 15;
const BACK_FIRST_MS = 500;
const BACK_CAP_MS = 5_000;

/** How long to wait before the `back`-th try at a chat socket the gateway dropped. */
export function waitBack(back: number): number {
  return Math.min(BACK_FIRST_MS * 2 ** (back - 1), BACK_CAP_MS);
}

/** The chat address, naming the call a caller is coming back to. */
function withCall(address: string, call: string): string {
  const url = new URL(address);
  url.searchParams.set("call", call);
  return url.toString();
}

// One entry off the socket, printed the way the live view draws it — cli/view.ts owns the four
// marks and the shortening. An entry it has no line for is machinery, and machinery is not the
// conversation: a state change, a re-render, a metric is printed by nobody here and read whole
// under --events. An error is the exception, because a tool that threw is the thing a person most
// needs to see, and it is shown in its own words rather than as the bare type.
// `turn.user` is the one entry of the conversation with no line: readline echoed those words at
// the `‹ ` prompt as they were typed, and printing the frame too puts the caller's own sentence on
// screen twice. `run`'s view is watching somebody else's call and still draws it, so this
// rule is chat's.
export function lineOf(frame: string): string | null {
  const entry = JSON.parse(frame) as { type?: string; data?: Record<string, unknown> };
  if (entry.type === "turn.user") return null;
  if (entry.type === "error") return `${BROKE} ${String(entry.data?.message)}`;
  const line = lineFor({ ...entry, data: entry.data ?? {} } as CamelEvent);
  return line === null ? null : `${line.mark} ${line.text}`;
}
