/** `pinecall numbers list | import | move | drop`: which number reaches which agent, in which world. */

import { parseArgs } from "node:util";

import { theDoor } from "./env.js";
import type { Group } from "./groups.js";
import { asked, type Door } from "./testing/gateway.js";
import { refusal } from "./whoami.js";

const USAGE = `usage: pinecall numbers list
       pinecall numbers import <+34…> --agent <slug> [--channel phone|whatsapp] [--dry-run]
       pinecall numbers move <+34…> --env <production|sandbox>
       pinecall numbers drop <+34…>`;

const NUMBERS = "/v1/numbers";

// A door the org answers at, and which table put it there: an operator typed it, or the class
// declared it in its `routes`. Only the first is a row, and only a row can be moved or dropped.
const AN_OPERATORS = "operator";

/** One door as the listing answers it: the route itself, and which table it came from. */
interface Door_ {
  route: { number: string | null; channel: string; agent: string; env: string; managed: boolean };
  source: string;
}

/** What the move answers: where the number is now, whether anything was written, and from where. */
interface Moved {
  route: { number: string | null; env: string; agent: string };
  moved: boolean;
  from?: string;
  said?: string;
}

export const group: Group = {
  purpose: "list | import | move | drop the numbers the org answers at",
  usage: `${USAGE}

  A number exists once in a world and reaches one agent. \`list\` shows the key's world only,
  because that is the world this key works in; \`move\` is the one verb that crosses, and it is
  what makes a staging run cost nothing — point the org's real number at the sandbox for an
  afternoon, try the new agent on it, and move it back. The carrier is untouched either way: a
  call arrives at this box whichever world answers it.

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
  const door = theDoor(how.env ?? process.env, err);
  // 2, like every other verb with no key: this command cannot run, and retrying changes nothing.
  if (door === undefined) return 2;
  try {
    // `list` takes no flag of its own, and a parser that reads none is how it says so: a word
    // starting with `-` was taken and ignored, which reads as a filter that was applied.
    if (verb === "list") {
      parseArgs({ args: argv.slice(1), options: {} });
      return await list(door, out);
    }
    if (verb === "import") return await brought(argv.slice(1), door, out, err);
    if (verb === "move") return await moved(argv.slice(1), door, out, err);
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

/** One door as a person reads it: the number, whose it is, where, and who put it there. */
export function aLine(one: Door_): string {
  const said = [one.route.number ?? "—", one.route.channel, `→ ${one.route.agent}`, one.route.env];
  if (one.source !== AN_OPERATORS) said.push(`declared by the app`);
  else if (one.route.managed) said.push("bought here");
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

/**
 * The one verb that crosses the two worlds.
 *
 * An org buys ONE number, so a team that wants to try a new agent on the real line has nowhere to
 * try it: a second number is a second bill, and a third world would be a third of everything. The
 * row says which world answers, and this moves the row. Moving it back is the same verb.
 */
async function moved(
  argv: string[],
  door: Door,
  out: NodeJS.WritableStream,
  err: NodeJS.WritableStream,
): Promise<number> {
  const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, options: { env: { type: "string" } } });
  const number = positionals[0];
  if (number === undefined || values.env === undefined) {
    err.write(`${USAGE}\n  a number and the --env it should answer in\n`);
    return 2;
  }
  const answer = await asked<Moved>(door, `${NUMBERS}/${encodeURIComponent(number)}/env`, {
    method: "PUT",
    body: { env: values.env },
  });
  if (!answer.moved) {
    out.write(`${answer.said ?? `${number} is already in ${answer.route.env}`}\n`);
    return 0;
  }
  out.write(`${number} · ${answer.from} → ${answer.route.env} · → ${answer.route.agent}\n`);
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
