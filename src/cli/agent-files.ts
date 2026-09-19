/** `pinecall agent pull | push`: a corner's settings as a file, for whoever keeps them in git and CI. */

import { readFile } from "node:fs/promises";

import type { TuningAnswer, TuningBody } from "@pinecall/protocol";

import { readSettings, settingsPath } from "./agent-lines.js";
import type { Typed } from "./agent.js";
import { asked, type Door } from "./testing/gateway.js";

/** What a pulled file holds: which agent, which corner, at which version, and the config whole. */
interface Pulled {
  agent: string;
  world: string;
  holder: string;
  version: number;
  config: TuningBody;
}

/** The two file verbs, dispatched by `pinecall agent`. */
export async function filesRun(
  door: Door,
  agent: string,
  verb: "pull" | "push",
  rest: string[],
  values: Typed,
  out: NodeJS.WritableStream,
  err: NodeJS.WritableStream,
): Promise<number> {
  if (verb === "pull") return pull(door, agent, values.team === true, out, err);
  return push(door, agent, rest[0], values.team === true, out, err);
}

// The team's corner unless --team is absent AND the key has one of its own with a row: a machine
// key pulls the org's own, which is what a CI job keeps in the repository.
async function pull(door: Door, agent: string, team: boolean, out: NodeJS.WritableStream, err: NodeJS.WritableStream): Promise<number> {
  const answer = await readSettings(door, agent);
  const row = team ? answer.team : (answer.yours ?? answer.team);
  if (row === null) {
    err.write(`nothing set for ${agent} in ${team ? "the team's" : "your"} corner of ${answer.world}\n`);
    return 1;
  }
  const pulled: Pulled = { agent, world: answer.world, holder: row.holder, version: row.version, config: row.config };
  out.write(`${JSON.stringify(pulled, null, 2)}\n`);
  return 0;
}

// A push carries no if_version: CI is applying a file, and what stands is what the file says.
async function push(door: Door, agent: string, file: string | undefined, team: boolean, out: NodeJS.WritableStream, err: NodeJS.WritableStream): Promise<number> {
  if (file === undefined) {
    err.write("push takes the file `pinecall agent pull` wrote\n");
    return 2;
  }
  const read = JSON.parse(await readFile(file, "utf8")) as Partial<Pulled>;
  const config = read.config ?? (read as TuningBody);
  const answer = await asked<TuningAnswer>(door, settingsPath(agent), {
    method: "PUT",
    body: { config, if_version: null, note: `pushed from ${file}`, team },
  });
  const row = team ? answer.team : (answer.yours ?? answer.team);
  out.write(`${agent} · ${answer.world} · ${team ? "the team's corner" : "your corner"} v${row?.version ?? "?"} from ${file}\n`);
  return 0;
}
