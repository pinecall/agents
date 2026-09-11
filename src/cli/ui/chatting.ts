/** The console's own door to a written call: the class of this directory, talked to from the page. */

import WebSocket from "ws";

import type { CamelEvent } from "../../client/index.js";
import { Pinecall } from "../../client/index.js";

import { mount } from "../../runtime/connect.js";
import { chatUrl } from "../chat.js";
import { load, mountOptions } from "../load.js";
import type { Door } from "../testing/gateway.js";
import { lineFor } from "../view.js";
import { anObject, aString, someWords } from "./asked.js";
import { Refusal } from "./refusal.js";

// How long the gateway is given to answer the socket with the call's first entry. A chat opens on
// a class already mounted here, so this is the register and the first render, never a model.
const A_CALL_OPENS_WITHIN_MS = 20_000;

// The console may be opened on any agent the gateway holds, but a written call needs the CLASS —
// mounted in this process, as `pinecall chat` mounts it — and the class is the one in the
// directory `pinecall ui` was typed in.
const NOT_THIS_DIRECTORY = (asked: string, here: string | null): string =>
  here === null
    ? `no agent class in this directory: run \`pinecall ui\` where ${asked}'s agent.tsx is`
    : `this console runs in ${here}'s directory: to chat with ${asked}, run \`pinecall ui\` there`;

const NO_CALL = "the gateway took the socket but wrote no entry: nothing to read";
const NOT_OPEN = (call: string): string => `${call} is not a chat this console opened`;

/** What the page asks for when it opens one: which agent, and who is calling when anybody is. */
export interface Wanted {
  agent: string;
  /** The contact the call is filed under, so an agent with memory can be made to remember. */
  as?: string | undefined;
}

/** What the door answers about itself: the class this console can chat with, if there is one. */
export interface Roster {
  agent: string | null;
}

/** What the server needs from the chat door, and nothing of how it holds a socket. */
export interface Chatting {
  roster(): Promise<Roster>;
  start(asked: unknown): Promise<{ call: string }>;
  say(asked: unknown): Promise<{ call: string }>;
  end(asked: unknown): Promise<{ call: string }>;
  /** Every socket this console opened, closed with the command. */
  close(): Promise<void>;
}

/** One written call open in this process: where it is, how to say the next thing, how to end it. */
export interface Line {
  call: string;
  say(text: string): void;
  end(): void;
}

/** Where a line comes from: this process's own mount by default, a test's own in a test. */
export interface Lines {
  open(contact: string | undefined): Promise<Line>;
  close(): Promise<void>;
}

/**
 * One `Chatting` for the life of a `pinecall ui`. The class is mounted here once, on the first
 * call the page opens, exactly as `pinecall chat` mounts it — so a breakpoint in a @tool is
 * reachable from the terminal that typed `ui` — and every turn typed in the browser goes down that
 * same socket. The page reads the call off the log like any other; nothing here keeps a transcript.
 */
export function chattingFrom(
  door: Door,
  agent: string | null,
  out: NodeJS.WritableStream,
  lines: Lines = linesFromThisProcess(door, out),
): Chatting {
  const open = new Map<string, Line>();
  return {
    async roster(): Promise<Roster> {
      return { agent };
    },

    async start(asked: unknown): Promise<{ call: string }> {
      const wanted = parsed(asked);
      if (wanted.agent !== agent) throw new Refusal(409, NOT_THIS_DIRECTORY(wanted.agent, agent));
      const line = await lines.open(wanted.as);
      open.set(line.call, line);
      return { call: line.call };
    },

    async say(asked: unknown): Promise<{ call: string }> {
      // The whole body is read before the call is looked up, so a turn with no words is refused
      // as a body and not as a call nobody here holds: the page is told which of the two it is.
      const given = anObject(asked, "a turn");
      const call = aString(given, "call");
      const text = aString(given, "text");
      const line = held(open, call);
      line.say(text);
      return { call: line.call };
    },

    async end(asked: unknown): Promise<{ call: string }> {
      const line = held(open, aString(anObject(asked, "a hangup"), "call"));
      line.end();
      open.delete(line.call);
      return { call: line.call };
    },

    async close(): Promise<void> {
      for (const line of open.values()) line.end();
      open.clear();
      await lines.close();
    },
  };
}

function held(open: Map<string, Line>, call: string): Line {
  const line = open.get(call);
  if (line === undefined) throw new Refusal(404, NOT_OPEN(call));
  return line;
}

function parsed(asked: unknown): Wanted {
  const given = anObject(asked, "a chat");
  return { agent: aString(given, "agent"), as: someWords(given, "as") };
}

/**
 * The class of this directory, mounted once and held for the life of the console, and one socket
 * per call opened against it. `takesUnclaimed: false` is what keeps this a console and not a
 * server: a real phone call must not ring in a browser tab because somebody left `ui` open.
 */
export function linesFromThisProcess(door: Door, out: NodeJS.WritableStream): Lines {
  let mounting: Promise<{ pc: Pinecall; url: string }> | undefined;
  const mounted = async (): Promise<{ pc: Pinecall; url: string }> => {
    const loaded = await load();
    const pc = new Pinecall({ url: door.url, apiKey: door.apiKey });
    const app = mount(loaded.ctor, { ...mountOptions(loaded, pc), takesUnclaimed: false });
    await pc.connect();
    // The app's id exists only after the register the connect awaited, and naming it is what sends
    // the call to THIS process rather than to whichever `pinecall run` registered last.
    return { pc, url: chatUrl(door.url, app.slug, app.agent.app) };
  };
  return {
    async open(contact: string | undefined): Promise<Line> {
      const { url } = await (mounting ??= mounted());
      const address = new URL(url);
      if (contact !== undefined) address.searchParams.set("contact", contact);
      return await aLine(address.toString(), door.apiKey, out);
    },
    async close(): Promise<void> {
      const held = mounting;
      mounting = undefined;
      if (held !== undefined) (await held).pc.close();
    },
  };
}

// One chat socket, answered as soon as the call has an id. Everything that comes back is printed
// in the terminal that typed `ui`, the way `pinecall chat` prints it, and read by the page off the
// log — so the two views of the call are one log and not two transcripts.
async function aLine(url: string, apiKey: string, out: NodeJS.WritableStream): Promise<Line> {
  const socket = new WebSocket(url, { headers: { authorization: `Bearer ${apiKey}` } });
  const line: Line = {
    call: "",
    say: (text: string) => socket.send(JSON.stringify({ text })),
    end: () => socket.close(),
  };
  return await new Promise<Line>((answer, refuse) => {
    const giveUp = setTimeout(() => refuse(new Refusal(502, NO_CALL)), A_CALL_OPENS_WITHIN_MS);
    socket.on("message", (frame: Buffer) => {
      const entry = JSON.parse(frame.toString()) as { type?: string; call?: unknown; data?: Record<string, unknown> };
      if (line.call === "" && typeof entry.call === "string") {
        line.call = entry.call;
        clearTimeout(giveUp);
        answer(line);
      }
      const said = lineFor({ ...entry, data: entry.data ?? {} } as CamelEvent);
      if (said !== null) out.write(`${said.mark} ${said.text}\n`);
    });
    // A close that carries a reason is the gateway saying why it will not take this call — an
    // agent nobody is serving, a key this org does not have — and the page is told that sentence.
    socket.on("close", (_code: number, why: Buffer) => {
      clearTimeout(giveUp);
      if (line.call === "") refuse(new Refusal(502, why.toString() === "" ? NO_CALL : why.toString()));
    });
    socket.on("error", (failed: Error) => {
      clearTimeout(giveUp);
      if (line.call === "") refuse(new Refusal(502, failed.message));
    });
  });
}
