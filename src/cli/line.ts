/** `pinecall line`: whose terminal a call at this agent's number rings in, and the claim that takes it. */

import type { TheLine } from "@pinecall/protocol";

import { theDoor } from "./env.js";
import type { Group } from "./groups.js";
import { load } from "./load.js";
import { slugOf } from "../runtime/connect.js";
import { asked, type Door } from "./testing/gateway.js";

const USAGE = "usage: pinecall line [claim | release] [agent.tsx]";

// A number exists once in a world, so it rings in one place. In production that place is the box
// and there is nothing to decide; in development an org shares ONE number and three developers
// may be running the same agent, so which terminal it rings in is claimed out loud. Alone nobody
// claims anything — the first `pinecall run` takes it. See the runtime's docs/protocol/gateway-api.md.
export const group: Group = {
  purpose: "whose terminal the development number rings in",
  usage: `${USAGE}

  With nothing after it: who is answering this agent's number right now, and who else is running
  it and could take it. \`claim\` takes the line for this terminal; \`release\` gives it up, and
  whoever else is still running the agent picks it up.

  The agent is the one in this directory, so nothing has to be named. You only ever need this
  when somebody else is running the same agent: the first terminal to hold it answers its ring.`,
  run,
};

export async function run(argv: string[]): Promise<number> {
  const [verb, ...rest] = argv[0] === "claim" || argv[0] === "release" ? argv : ["show", ...argv];
  const door = theDoor();
  if (door === undefined) return 2;
  const slug = slugOf((await load(rest[0])).ctor);
  const said =
    verb === "claim"
      ? await claimed(door, slug)
      : verb === "release"
        ? await released(door, slug)
        : await theLine(door, slug);
  process.stdout.write(`${describing(said)}\n`);
  return 0;
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

/**
 * The line as a person reads it: where the ring lands, and the move that changes it.
 *
 * It never prints a member id. A person recognises a colleague by their email and nothing else,
 * and a corner nobody is named in — the org's own key, CI's — is said as what it is rather than
 * as a null.
 */
export function describing(said: TheLine): string {
  if (!said.held) return `nobody is answering ${said.agent}: start \`pinecall run\``;
  if (said.yours) {
    const others = whoElse(said);
    return others === undefined ? "rings in this terminal" : `rings in this terminal · ${others}`;
  }
  return `rings in ${whose(said)} · \`pinecall line claim\` takes it`;
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
