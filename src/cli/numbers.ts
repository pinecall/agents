/** `pinecall numbers list | import | drop`: which number reaches which agent, at this instance. */

import { parseArgs } from "node:util";

import { theDoor } from "./env.js";
import type { Group } from "./groups.js";
import { asked, type Door } from "./testing/gateway.js";
import { refusal } from "./whoami.js";

const USAGE = `usage: pinecall numbers list
       pinecall numbers import <+34…> --agent <slug> [--channel phone|whatsapp] [--dry-run]
       pinecall numbers drop <+34…>`;

const NUMBERS = "/v1/numbers";

// Every door is a row somebody typed. A class declares none, so there is no second table to tell
// this one from, and every door listed here can be dropped and pointed at another agent.
/** One door as the listing answers it. */
interface Door_ {
  route: { number: string | null; channel: string; agent: string; env: string; managed: boolean };
}

export const group: Group = {
  purpose: "list | import | drop the numbers the org answers at",
  usage: `${USAGE}

  A number is one instance's and reaches one agent: it is imported where it answers, and
  \`list\` shows this instance's — the sandbox's, or production's with --prod. Nothing moves a
  number between the two.

  \`import\` takes a number the org's carrier account already owns and points it here: the
  carrier's trunk, the SFU's trunk, the route — \`--dry-run\` prints those steps and writes
  nothing. \`drop\` forgets the route and takes the number off the SFU trunk; the carrier account
  keeps it, so nobody is un-bought by a typo.`,
  run,
};

/** What the verb can be told besides the argv: where to print, and which environment. */
export interface Numbering {
  out?: NodeJS.WritableStream;
  err?: NodeJS.WritableStream;
  env?: NodeJS.ProcessEnv;
}

export async function run(argv: string[], how: Numbering = {}): Promise<number> {
  const out = how.out ?? process.stdout;
  const err = how.err ?? process.stderr;
  const verb = argv[0] ?? "list";
  const door = await theDoor(how.env ?? process.env, err);
  // 2, like every other verb with no key: this command cannot run, and retrying changes nothing.
  if (door === undefined) return 2;
  // `list` takes no flag of its own, and a parser that reads none is how it says so: a word
  // starting with `-` was taken and ignored, which reads as a filter that was applied. It is read
  // OUTSIDE the catch below, so the flag lands as the dispatcher's own sentence and exit 2.
  if (verb === "list") parseArgs({ args: argv.slice(1), options: {} });
  try {
    if (verb === "list") return await list(door, out);
    if (verb === "import") return await brought(argv.slice(1), door, out, err);
    if (verb === "drop") return await dropped(argv[1], door, out, err);
  } catch (refused) {
    err.write(`${refusal(refused)}\n`);
    return 1;
  }
  err.write(`${USAGE}\n`);
  return 2;
}

/** Every door the org answers at in this key's world, one line each. */
async function list(door: Door, out: NodeJS.WritableStream): Promise<number> {
  const doors = await asked<Door_[]>(door, NUMBERS);
  if (doors.length === 0) {
    out.write("no number answers in this world: `pinecall numbers import <+34…> --agent <slug>`\n");
    return 0;
  }
  for (const one of doors) out.write(`${aLine(one)}\n`);
  return 0;
}

/** One door as a person reads it: the number, whose it is, where, and whether the box bought it. */
export function aLine(one: Door_): string {
  const said = [one.route.number ?? "—", one.route.channel, `→ ${one.route.agent}`, one.route.env];
  if (one.route.managed) said.push("bought here");
  return said.join(" · ");
}

/** A number the carrier already owns, pointed at this box and at one agent. */
async function brought(
  argv: string[],
  door: Door,
  out: NodeJS.WritableStream,
  err: NodeJS.WritableStream,
): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { agent: { type: "string" }, channel: { type: "string" }, "dry-run": { type: "boolean", default: false } },
  });
  const number = positionals[0];
  if (number === undefined || values.agent === undefined) {
    err.write(`${USAGE}\n  a number and the --agent that answers it\n`);
    return 2;
  }
  const body: Record<string, unknown> = { number, agent: values.agent };
  if (values.channel !== undefined) body["channel"] = values.channel;
  const path = values["dry-run"] === true ? `${NUMBERS}?dry_run=true` : NUMBERS;
  const done = await asked<{ steps: string[]; dry_run: boolean }>(door, path, { method: "POST", body });
  for (const step of done.steps) out.write(`  ${step}\n`);
  if (done.dry_run) out.write("  nothing written: drop --dry-run to do it\n");
  return 0;
}

/** The route gone and the number off this org's SFU trunk. The carrier account keeps the number. */
async function dropped(
  number: string | undefined,
  door: Door,
  out: NodeJS.WritableStream,
  err: NodeJS.WritableStream,
): Promise<number> {
  if (number === undefined) {
    err.write(`${USAGE}\n  which number to forget\n`);
    return 2;
  }
  await asked(door, `${NUMBERS}/${encodeURIComponent(number)}`, { method: "DELETE" });
  out.write(`${number} answers nothing here now. Your carrier still owns it.\n`);
  return 0;
}
