/** `pinecall line`: whose terminal a call at this agent's number rings in, and the claim that takes it. */

import type { TheLine } from "@pinecall/protocol";

import { writeCalling } from "./credentials.js";
import { theDoor } from "./env.js";
import type { Group } from "./groups.js";
import { load } from "./load.js";
import { slugOf } from "../runtime/connect.js";
import { asked, type Door } from "./testing/gateway.js";

const USAGE = "usage: pinecall line [from <+number> | forget | claim | release] [agent.tsx]";

// A number exists once in a world, so it rings in one place. In production that place is the box
// and there is nothing to decide; in development an org shares ONE number and three developers
// may be running the same agent, so which terminal it rings in is claimed out loud. Alone nobody
// claims anything — the first `pinecall run` takes it. See the runtime's docs/protocol/gateway-api.md.
export const group: Group = {
  purpose: "whose terminal the development number rings in",
  usage: `${USAGE}

  With nothing after it: who is answering this agent's number right now, and who else is running
  it and could take it.

  \`from <+number>\` is the one you want. Say which phone is YOURS, once, and every call you make
  to a development number reaches your own agent — no claim, no coordination, and three of you
  testing at the same time. It is remembered for this gateway and re-sent by every
  \`pinecall run\`. \`forget\` undoes it.

  \`claim\` and \`release\` are the fallback, for a call from a number nobody said was theirs — a
  customer, a colleague's phone. The first terminal to hold the agent has it; alone, you never
  need either word.

  The agent is the one in this directory, so nothing has to be named.`,
  run,
};

const VERBS = new Set(["from", "forget", "claim", "release"]);

export async function run(argv: string[], out: NodeJS.WritableStream = process.stdout): Promise<number> {
  const [verb, ...rest] = VERBS.has(argv[0] ?? "") ? argv : ["show", ...argv];
  const door = theDoor();
  if (door === undefined) return 2;

  // `from` and `forget` are about the PERSON and not about one agent, so neither loads a class:
  // a phone is yours in whatever directory you are standing in.
  if (verb === "from") {
    const number = rest[0];
    if (number === undefined) {
      process.stderr.write(`${USAGE}\n`);
      return 2;
    }
    const said = await callsFrom(door, number);
    writeCalling(door.url, number);
    out.write(`${calling(said.calling)}\n`);
    return 0;
  }
  if (verb === "forget") {
    const said = await forgetCallsFrom(door);
    writeCalling(door.url, undefined);
    out.write(`${forgotten(said.forgot)}\n`);
    return 0;
  }

  const slug = slugOf((await load(rest[0])).ctor);
  const said =
    verb === "claim"
      ? await claimed(door, slug)
      : verb === "release"
        ? await released(door, slug)
        : await theLine(door, slug);
  out.write(`${describing(said)}\n`);
  return 0;
}

/** Say which phone is yours: every call it makes reaches your own agent, in whatever you hold. */
export async function callsFrom(door: Door, number: string): Promise<{ calling: string[] }> {
  return await asked<{ calling: string[] }>(door, FROM, { method: "PUT", body: { number } });
}

/** Stop answering your own calls: they fall back to whoever holds the line. */
export async function forgetCallsFrom(door: Door): Promise<{ forgot: string[] }> {
  return await asked<{ forgot: string[] }>(door, FROM, { method: "DELETE" });
}

/** What the terminal says back once a number is yours. */
export function calling(numbers: string[]): string {
  return numbers.length === 1
    ? `calls from ${numbers[0]} reach this terminal`
    : `calls from ${numbers.join(", ")} reach this terminal`;
}

/** And when they stop. A `forget` that forgot nothing says so rather than looking like it worked. */
export function forgotten(numbers: string[]): string {
  return numbers.length === 0
    ? "no number was reaching this terminal"
    : `calls from ${numbers.join(", ")} no longer reach this terminal`;
}

/** Who is answering this agent's ringing doors right now. */
export async function theLine(door: Door, slug: string): Promise<TheLine> {
  return await asked<TheLine>(door, path(slug));
}

/** Take it for this terminal, whoever had it. */
export async function claimed(door: Door, slug: string): Promise<TheLine> {
  return await asked<TheLine>(door, path(slug), { method: "POST" });
}

/** Give it up: whoever else is still running the agent picks it up. */
export async function released(door: Door, slug: string): Promise<TheLine> {
  return await asked<TheLine>(door, path(slug), { method: "DELETE" });
}

function path(slug: string): string {
  return `/v1/agents/${encodeURIComponent(slug)}/line`;
}

// A phone is a PERSON's and not an agent's, so this door sits above the agents: say it once and
// it works on every agent you hold.
const FROM = "/v1/line/from";

/**
 * The line as a person reads it: where the ring lands, and the move that changes it.
 *
 * It never prints a member id. A person recognises a colleague by their email and nothing else,
 * and a corner nobody is named in — the org's own key, CI's — is said as what it is rather than
 * as a null.
 */
export function describing(said: TheLine): string {
  if (!said.held) return `nobody is answering ${said.agent}: start \`pinecall run\``;
  // Yours by number beats yours by line, and is said first: it is the one that needs no upkeep.
  const mine = said.calling.length > 0 ? `your calls from ${said.calling.join(", ")}` : undefined;
  if (said.yours) {
    const also = [mine, whoElse(said)].filter((part) => part !== undefined);
    return ["rings in this terminal", ...also].join(" · ");
  }
  const theirs = `rings in ${whose(said)}`;
  if (mine !== undefined) return `${theirs}, but not ${mine}`;
  return `${theirs} · \`pinecall line from <+your-number>\` routes yours, or \`claim\` takes it`;
}

/** Whose terminal it rings in, for somebody reading a sentence about a colleague. */
function whose(said: TheLine): string {
  const name = said.holding?.name;
  return name === null || name === undefined ? "the terminal running the org's own key" : name;
}

/** Who else is running this agent and could take it, or nothing when nobody is. */
function whoElse(said: TheLine): string | undefined {
  const names = said.waiting.map((one) => one.name ?? "the org's own key");
  return names.length === 0 ? undefined : `also running: ${names.join(", ")}`;
}
