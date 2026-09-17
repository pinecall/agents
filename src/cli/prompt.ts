/** `pinecall prompt [agent.tsx] --state file`: the exact prompt a state would produce, offline. */

import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";

import type { Snapshot } from "../agent/state.js";
import { showPrompt } from "../views/render.js";
import { showMachine } from "./machine.js";
import type { Group } from "./groups.js";
import { instanceFor, load } from "./load.js";
import { AGENT_FLAG, oneHome } from "./home.js";

/** One case of a goldens file: a state to start from, and what the caller then says. */
interface Case {
  state?: Snapshot;
}

export const group: Group = {
  purpose: "the exact prompt a state would produce, offline",
  usage: `usage: pinecall prompt [agent.tsx] --state <file> [--case n] [--agent <name>]

  The three regions of the prompt as the model would receive them — the static prefix, the
  history, the dynamic blocks at the end — and under them the stage and the tools that stage
  shows. No gateway, no key, no call: the class is loaded here and put in the state the file
  describes, so this answers in the time it takes to save the file.

  --agent <name>  which agent of a project of several, by its file's name or its slug
  --state file    a goldens file: an array of cases, each with its own \`state\`, or one object
  --case n        which case of that file, when it holds several (default 0)`,
  run,
};

/**
 * No runtime, no gateway, no key: load the class, put it in the state the goldens describe, and
 * print every block of the prompt under its header, and under them the stage and the tools it shows. This
 * is the verb a person runs while writing a render, and it must answer in the time it takes to save
 * the file.
 */
export async function run(
  argv: string[],
  out: NodeJS.WritableStream = process.stdout,
  err: NodeJS.WritableStream = process.stderr,
): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { state: { type: "string" }, case: { type: "string" }, ...AGENT_FLAG },
  });
  if (values.state === undefined) {
    err.write("pinecall prompt: --state <file> is required\n");
    return 2;
  }
  const loaded = await load((await oneHome("prompt", positionals[0], values.agent)).file);
  const agent = instanceFor(loaded);
  agent.startIn(firstState(values.state, values.case));
  out.write(`${showPrompt(agent)}\n\n${showMachine(agent)}\n`);
  return 0;
}

/**
 * The state of one case of a goldens file — the first, or the one `--case N` names.
 *
 * The file is the design's `test/choose.json`: an array of cases, each with its own `state`. A
 * single object is read as one case too, because a person writing a render by hand should not have
 * to wrap it in brackets to see what it renders.
 */
export function firstState(file: string, which: string | undefined): Snapshot {
  const parsed = JSON.parse(readFileSync(file, "utf8")) as Case | Case[];
  const cases = Array.isArray(parsed) ? parsed : [parsed];
  const index = which === undefined ? 0 : Number(which);
  const chosen = cases[index];
  if (chosen === undefined) throw new Error(`${file} has no case ${index}`);
  return chosen.state ?? {};
}
