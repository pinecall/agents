/** `pinecall chat [agent]`: chat with this directory's agent in-process, or with a running one. */

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

// --state needs mount's `opening` seam, which a remote agent does not have; refuse, don't drop.
const NOT_YOURS_TO_OPEN =
  "--state opens a call in a class this process mounted, and `pinecall chat <agent>` mounts none:"
  + " drop the slug to chat the agent of this directory.";

/**
 * Without a slug: mount this directory's agent in this process and open `WS /v1/chat` as the
 * caller, naming this process's app id so the call is served here (tools run locally). With a
 * slug: mount nothing and chat with whichever process holds that agent.
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
  // takesUnclaimed: false, or a real phone call could be routed to this terminal.
  // --state goes through `opening`: after onCall, before the first render.
  const preload = values.state === undefined ? undefined : firstState(values.state, values.case);
  const mounted = mount(loaded.ctor, {
    ...mountOptions(loaded, pc),
    takesUnclaimed: false,
    opening: () => preload,
  });

  // Close the app socket on exit, or it keeps node alive and the agent registered.
  try {
    await pc.connect();
    // The app id exists only after connect() has registered.
    const address = (): string => chatUrl(url, mounted.slug, mounted.agent.app, values.as);
    return await talk(address, door, values.events === true);
  } finally {
    pc.close();
  }
}

/** The `/v1/chat` WebSocket URL for a gateway base URL. */
export function chatUrl(base: string, agent: string, app?: string, contact?: string, persona?: string): string {
  const url = new URL(base);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = `${url.pathname.replace(/\/$/, "")}/v1/chat`;
  url.searchParams.set("agent", agent);
  // Pin the serving process; otherwise the gateway picks the newest socket holding the agent.
  if (app !== undefined) url.searchParams.set("app", app);
  // The contact memory files the call under. searchParams encodes it: a raw `+` would arrive as a space.
  if (contact !== undefined) url.searchParams.set("contact", contact);
  // The simulated persona; the gateway records it on `call.started` for attribution.
  if (persona !== undefined) url.searchParams.set("persona", persona);
  return url.toString();
}

// Each typed line is one turn; each frame is one log entry. The key goes in the Authorization
// header (the global WebSocket cannot set headers, hence `ws`). An unexpected close is a gateway
// restart: redial with `?call=` to resume; `address()` is re-read since the app id may change.
export function talk(
  address: () => string,
  door: Open,
  events: boolean,
  input: NodeJS.ReadableStream = process.stdin,
): Promise<number> {
  const lines = createInterface({ input, output: process.stdout, prompt: PROMPT });
  // Entries can arrive after stdin closed (piped input), and readline throws on a closed prompt.
  let typing = true;
  let call: string | null = null;
  let over = false;
  let socket: WebSocket | null = null;
  let back = 0;
  // `ws` throws on send before open, so input stays paused until the socket is up.
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
        // Reset retries on the first message, not on open: the door may accept and then refuse.
        if (back > 0) process.stderr.write("\rthe gateway is back: the call goes on\n");
        back = 0;
        if (typeof entry.call === "string") call = entry.call;
        if (entry.type === "call.score") over = true;
        // --events prints raw JSON entries, as `run --events` does.
        const line = events ? frame.toString() : lineOf(frame.toString());
        if (line === null) return;
        // Redraw the prompt: an entry may land mid-typing.
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
        // A close reason is a refusal. While reconnecting it may just mean the app socket has not
        // re-registered yet, so keep retrying until BACK_TRIES.
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

// Reconnect budget: about a minute in total, enough for a gateway restart.
export const BACK_TRIES = 15;
const BACK_FIRST_MS = 500;
const BACK_CAP_MS = 5_000;

/** Exponential backoff before the `back`-th reconnect attempt. */
export function waitBack(back: number): number {
  return Math.min(BACK_FIRST_MS * 2 ** (back - 1), BACK_CAP_MS);
}

/** The chat URL with `call` set, to resume that call. */
function withCall(address: string, call: string): string {
  const url = new URL(address);
  url.searchParams.set("call", call);
  return url.toString();
}

// Format one entry as cli/view.ts does; null for entries with no line (see --events).
// Errors are always shown. `turn.user` is skipped because readline already echoed it.
export function lineOf(frame: string): string | null {
  const entry = JSON.parse(frame) as { type?: string; data?: Record<string, unknown> };
  if (entry.type === "turn.user") return null;
  if (entry.type === "error") return `${BROKE} ${String(entry.data?.message)}`;
  const line = lineFor({ ...entry, data: entry.data ?? {} } as CamelEvent);
  return line === null ? null : `${line.mark} ${line.text}`;
}
