/** `pinecall supervise <call>`: a human at the desk — the transcript as it lands, and the five moves. */

import { createInterface } from "node:readline";

import type { Verb } from "@pinecall/protocol";

import { Pinecall } from "../client/index.js";

import { theDoor } from "./env.js";
import type { Group } from "./groups.js";
import { asked, type Door } from "./testing/gateway.js";
import { standingOf } from "./the-call.js";
import { refusal } from "./whoami.js";

const USAGE = "usage: pinecall supervise <call>";

// The audio is the console's, deliberately: a terminal has no speakers this process may reach, and
// `pinecall simulate --listen` already says the same sentence about the same room. What a terminal
// CAN do is the transcript and the desk, which is what this verb is.
export const ON_THE_SPEAKERS =
  "the audio of a live call is the console, which has a room — `pinecall start` prints its URL; this is the transcript and the desk";

/** What a supervisor may type, one move per line. `q` leaves and the call goes on without them. */
export const MOVES = [
  ["w <text>", "whisper to the agent — the caller never hears it"],
  ["s <text>", "say it to the caller, in the agent's voice, verbatim"],
  ["t", "take the line: the agent stops speaking and you are on it"],
  ["x", "give it back: the agent has the line again"],
  ["e [reason]", "end the call"],
  ["q", "leave the desk; the call goes on"],
] as const;

export const group: Group = {
  purpose: "listen in: whisper, say, takeover, transfer, end",
  usage: `${USAGE}

  The call's transcript as it happens, and one line to move on it:

${MOVES.map(([key, what]) => `    ${key.padEnd(11)} ${what}`).join("\n")}

  Every move lands in the caller's own log as its own \`supervisor.*\` entry with a seq, so what a
  human did to a call is read the same way as what the agent did. ${ON_THE_SPEAKERS}.`,
  run,
};

/** What the verb can be told besides the argv: where to print, and which environment. Tests only. */
export interface Running {
  out?: NodeJS.WritableStream;
  err?: NodeJS.WritableStream;
  env?: NodeJS.ProcessEnv;
}

export async function run(argv: string[], how: Running = {}): Promise<number> {
  const out = how.out ?? process.stdout;
  const err = how.err ?? process.stderr;
  const call = argv.find((word) => !word.startsWith("-"));
  if (call === undefined) {
    err.write(`${USAGE}\n`);
    return 2;
  }
  const door = theDoor(how.env ?? process.env, err);
  if (door === undefined) return 2;
  // A desk is for a call that is happening. Opened on an id nobody wrote, or on one that ended
  // hours ago, it printed a prompt over an empty transcript and waited for moves that could not
  // land — and left with a zero (production, 2026-09-20).
  const standing = await standingOf(door, call);
  if (!standing.live) {
    err.write(`${ALREADY_ENDED(call)}\n`);
    return 2;
  }
  out.write(`${call} · ${ON_THE_SPEAKERS}\n`);
  const pc = new Pinecall({ url: door.url, apiKey: door.apiKey });
  try {
    return await atTheDesk(pc, door, call, out, err);
  } catch (refused) {
    err.write(`${refusal(refused)}\n`);
    return 1;
  }
}

/** A call that is over takes no move: what it was is `sessions show`, and the desk says so. */
export const ALREADY_ENDED = (call: string): string =>
  `${call} has ended, and a desk moves a call that is happening: \`pinecall sessions show ${call}\` reads it`;

/**
 * The two halves at once: the log printing itself, and a keyboard sending verbs. Neither waits for
 * the other — a move typed while the caller is mid-sentence is sent while they finish it.
 */
async function atTheDesk(
  pc: Pinecall,
  door: Door,
  call: string,
  out: NodeJS.WritableStream,
  err: NodeJS.WritableStream,
): Promise<number> {
  const lines = createInterface({ input: process.stdin, output: process.stdout, prompt: "> " });
  let ended = false;
  const watching = (async () => {
    for await (const seen of pc.observe({ call })) {
      // The entry's own data and not the folded event: what a desk prints is what the log wrote.
      const line = lineOf(seen.entry.seq, seen.entry.type, seen.entry.data);
      if (line !== null) out.write(`\r${line}\n`);
      lines.prompt();
      if (seen.entry.type === "call.ended") ended = true;
      if (ended) break;
    }
  })();
  lines.prompt();
  for await (const typed of lines) {
    if (ended) break;
    const move = moveOf(typed.trim());
    if (move === "leave") break;
    if (move === null) {
      err.write(`\rnot a move. ${MOVES.map(([key]) => key.split(" ")[0]).join(" · ")}\n`);
    } else {
      await sent(door, call, move).catch((refused: unknown) => err.write(`\r${refusal(refused)}\n`));
    }
    lines.prompt();
  }
  lines.close();
  await watching.catch(() => undefined);
  return 0;
}

/** One typed line as the verb it names, `leave` for q, and nothing at all for a line nobody meant. */
export function moveOf(typed: string): Verb | "leave" | null {
  const [key, ...rest] = typed.split(" ");
  const said = rest.join(" ").trim();
  if (key === "q") return "leave";
  if (key === "t") return { verb: "takeover" };
  if (key === "x") return { verb: "release" };
  if (key === "e") return { verb: "end", reason: said === "" ? undefined : said };
  if (said === "") return null;
  if (key === "w") return { verb: "whisper", text: said };
  if (key === "s") return { verb: "say", text: said };
  return null;
}

async function sent(door: Door, call: string, verb: Verb): Promise<void> {
  await asked(door, `/v1/calls/${encodeURIComponent(call)}/verbs`, { method: "POST", body: verb });
}

// What a person at a desk reads: both speakers, and every move anybody made on this call. The
// entries a supervisor cannot act on — metrics, prompt changes, state — are not printed, because
// the whole point of the desk is the conversation.
export function lineOf(seq: number, type: string, data: Record<string, unknown>): string | null {
  const at = String(seq).padStart(4, " ");
  if (type === "turn.user") return `${at}  caller  ${String(data["text"] ?? "")}`;
  if (type === "turn.agent") return `${at}  agent   ${String(data["text"] ?? "")}`;
  if (type === "call.ended") return `${at}  ——      ended: ${String(data["reason"] ?? "")}`;
  if (type.startsWith("supervisor.")) {
    const what = type.slice("supervisor.".length);
    const said = data["text"] ?? data["reason"] ?? data["to"] ?? "";
    return `${at}  desk    ${what}${said === "" ? "" : ` ${String(said)}`}`;
  }
  return null;
}
