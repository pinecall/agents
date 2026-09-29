/** `pinecall prompt [agent.tsx] --state file`: render the prompt for a given state, offline. */

import { parseArgs } from "node:util";

import type { Snapshot } from "../agent/state.js";
import { showPrompt } from "../views/render.js";
import { cannotRun } from "./cannot-run.js";
import { AGENT_FLAG, oneHome } from "./home.js";
import type { Group } from "./groups.js";
import { instanceFor, load } from "./load.js";
import { showMachine } from "./machine.js";
import { readNamedJson } from "./named-file.js";

/** One case of a goldens file; only its starting state is read here. */
interface Case {
  state?: Snapshot;
}

export const group: Group = {
  purpose: "the exact prompt a state would produce, offline",
  offline: true,
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

/** Load the class, apply the case's state, and print the prompt, stage and visible tools. No gateway needed. */
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

/** The state of case `which` (default 0) in a goldens file; a single object counts as one case. */
export function firstState(file: string, which: string | undefined): Snapshot {
  const parsed = readNamedJson<Case | Case[]>("--state", file);
  const cases = Array.isArray(parsed) ? parsed : [parsed];
  const index = which === undefined ? 0 : Number(which);
  const chosen = cases[index];
  if (chosen === undefined) throw cannotRun(`${file} has no case ${index}`);
  return chosen.state ?? {};
}
