/** `pinecall personas list | show <n> | try <n>`: the synthetic callers this app is tested with. */

import { parseArgs } from "node:util";

import type { Group } from "./groups.js";
import { aSimulation, TURNS } from "./simulate.js";
import { NO_PERSONAS, personaNamed, personasIn, type Persona } from "./testing/caller.js";

const USAGE = "usage: pinecall personas list | show <name> | try <name> [--file agent.tsx]\n";

export const group: Group = {
  purpose: "list | show | try the synthetic callers in test/personas",
  usage: `${USAGE}
  A persona is a caller a model plays: a goal, a style, the facts they may state about
  themselves, and the state the call opens in. One file per caller under test/personas,
  default-exporting one.

  list            every caller of this directory, with the goal each one pursues
  show <name>     that caller whole, facts and all
  try <name>      one improvised line from them, through the gateway's caller door — the same
                  door \`pinecall simulate\` asks for every turn. Needs a key
  --file <path>   which class to read the personas beside, when there is more than one`,
  run,
};

// A caller with no facts of their own is not broken — they are somebody who will invent nothing,
// which is what the model playing them is told. `show` says so rather than printing an empty block.
const NO_FACTS = "(no facts: this caller may state nothing about themselves)";

export async function run(argv: string[], out: NodeJS.WritableStream = process.stdout): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { file: { type: "string" }, json: { type: "boolean", default: false } },
  });
  const [verb, name] = positionals;
  if (verb === "list") return await listed(values.json === true, out);
  if (verb === "show" && name !== undefined) return await shown(name, values.json === true, out);
  // `try` runs the caller against the class, because reading a persona tells you who they are and
  // only a call tells you how they land. It is `simulate` without the judge — one implementation.
  if (verb === "try" && name !== undefined) return await tried(name, values.file, out);
  process.stderr.write(USAGE);
  return 2;
}

/** One line per caller: the name a verb takes, and the goal it is written to pursue. */
async function listed(asJson: boolean, out: NodeJS.WritableStream): Promise<number> {
  const personas = await personasIn();
  if (personas.length === 0) {
    process.stderr.write(`${NO_PERSONAS}\n`);
    return 2;
  }
  if (asJson) out.write(`${JSON.stringify({ personas })}\n`);
  else out.write(`${personas.map(oneLine).join("\n")}\n`);
  return 0;
}

/** One caller whole: how they talk, and every fact about themselves they are allowed to state. */
async function shown(name: string, asJson: boolean, out: NodeJS.WritableStream): Promise<number> {
  const persona = await personaNamed(name);
  if (persona === undefined) {
    process.stderr.write(`no persona called ${name}: ${NO_PERSONAS}\n`);
    return 2;
  }
  if (asJson) out.write(`${JSON.stringify(persona)}\n`);
  else out.write(`${linesOf(persona).join("\n")}\n`);
  return 0;
}

/** The lines `show` prints: the caller, the goal, the style, and every fact they may state. */
function linesOf(persona: Persona): string[] {
  const facts = Object.entries(persona.facts ?? {});
  return [
    `${persona.name} · ${persona.goal}`,
    `  ${persona.style}`,
    ...(facts.length === 0 ? [`  ${NO_FACTS}`] : facts.map(([name, value]) => `  ${name}: ${String(value)}`)),
  ];
}

async function tried(
  name: string,
  agentFile: string | undefined,
  out: NodeJS.WritableStream,
): Promise<number> {
  const persona = await personaNamed(name);
  if (persona === undefined) {
    process.stderr.write(`no persona called ${name}: ${NO_PERSONAS}\n`);
    return 2;
  }
  const said = await aSimulation(persona, {
    agentFile,
    judge: false,
    voice: false,
    turns: TURNS,
    out,
  });
  return said === undefined ? 2 : 0;
}

function oneLine(persona: Persona): string {
  return `${persona.name.padEnd(12)}  ${persona.style.padEnd(46)}  ${persona.goal}`;
}
