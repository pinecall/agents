/** `pinecall chat [agent.ts]`: the agent mounted here and the caller's side open in the same terminal. */

import { createInterface } from "node:readline";
import { parseArgs } from "node:util";

import { Pinecall, type CamelEvent } from "../client/index.js";
import WebSocket from "ws";

import { mount } from "../runtime/connect.js";
import { theDoor } from "./env.js";
import type { Group } from "./groups.js";
import { load, mountOptions } from "./load.js";
import { BROKE, CALLER, lineFor } from "./view.js";
import { firstState } from "./prompt.js";

const PROMPT = `${CALLER} `;

export const group: Group = {
  purpose: "the app in this terminal's own process, and a prompt against it",
  run,
};

/**
 * One process, both sides: the app socket registers the agent, and `WS /v1/chat?agent=<slug>` is
 * the caller. Typing goes out as `{ text }`; everything that comes back is the call's own log,
 * printed as it lands. The tools run in this process, so a breakpoint in a @tool is reachable.
 *
 * This is `rails console`: it works with no `pinecall run` up and it works with three of them,
 * because the caller socket names THIS process's app id and the gateway serves the call from it.
 */
export async function run(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      state: { type: "string" },
      case: { type: "string" },
      events: { type: "boolean", default: false },
    },
  });
  const door = theDoor();
  if (door === undefined) return 2;
  const loaded = await load(positionals[0]);
  const url = door.url;
  const pc = new Pinecall({ url, apiKey: door.apiKey });
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
    return await talk(chatUrl(url, mounted.slug, mounted.agent.app), door.apiKey, values.events === true);
  } finally {
    pc.close();
  }
}

/** The chat socket's address off the gateway's HTTP one: the scheme flips, the path is fixed. */
export function chatUrl(base: string, agent: string, app?: string): string {
  const url = new URL(base);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = `${url.pathname.replace(/\/$/, "")}/v1/chat`;
  url.searchParams.set("agent", agent);
  // Which process serves the call this socket opens. Without it the gateway picks the newest
  // socket holding the agent, which in a terminal with a `run` running is the other one.
  if (app !== undefined) url.searchParams.set("app", app);
  return url.toString();
}

// Every line typed is one turn; every frame received is one entry, printed as it lands. The key
// travels as the upgrade's Authorization header, never in the URL, which is the only thing the
// chat door accepts and the reason this socket is `ws` and not the runtime's global WebSocket.
function talk(url: string, apiKey: string, events: boolean): Promise<number> {
  const socket = new WebSocket(url, { headers: { authorization: `Bearer ${apiKey}` } });
  const lines = createInterface({ input: process.stdin, output: process.stdout, prompt: PROMPT });
  // The keyboard waits for the socket: `ws` throws on a send while the upgrade is still in flight
  // rather than queueing it. Paused, a line typed early stays in the stream and arrives as the
  // first turn the moment the socket is up, which is what a person who typed it meant.
  lines.pause();
  return new Promise<number>((done) => {
    socket.on("open", () => {
      lines.resume();
      lines.prompt();
    });
    socket.on("message", (frame: Buffer) => {
      // --events is the wire itself, one JSON entry per line, exactly what `run --events` prints:
      // the same word means the same thing in both verbs, and it is what a person reaches for when
      // what is wrong is the stream and not the conversation.
      const line = events ? frame.toString() : lineOf(frame.toString());
      if (line === null) return;
      // The prompt is rewritten after every entry: one may land while the caller is still typing.
      process.stdout.write(`\r${line}\n`);
      lines.prompt();
    });
    socket.on("error", (failed: Error) => {
      process.stderr.write(`\rthe gateway refused the chat socket: ${failed.message}\n`);
      lines.close();
      done(1);
    });
    // A close that carries a reason is the gateway saying why it will not take this call — today
    // that is an agent nobody is serving, and the sentence names it. A close with none is the
    // conversation ending, which is how every chat ends and is not worth a line.
    socket.on("close", (_code: number, reason: Buffer) => {
      lines.close();
      const why = reason.toString();
      if (why === "") {
        done(0);
        return;
      }
      process.stderr.write(`\r${why}\n`);
      done(1);
    });
    lines.on("line", (line) => {
      if (line.trim() !== "") socket.send(JSON.stringify({ text: line.trim() }));
      lines.prompt();
    });
    lines.on("close", () => socket.close());
  });
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
