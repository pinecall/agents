/** Load this project's agent class into this process, for the verbs that still mount it here. */

import { basename, dirname } from "node:path";

import { cannotRun } from "./cannot-run.js";
import { theAgentHere } from "./home.js";
import { type MountOptions } from "../runtime/connect.js";
import { CannotServe, loadAgent, type Loaded } from "../serve/load.js";

/** Load the agent file named, or this directory's one. A file that cannot be served cannot run. */
export async function load(file?: string): Promise<Loaded> {
  try {
    return await loadAgent(file ?? theAgentHere());
  } catch (failed) {
    throw failed instanceof CannotServe ? cannotRun(failed.message) : failed;
  }
}

/** Build `mount` options for a loaded agent, served as its folder's name. */
export function mountOptions(loaded: Loaded, pc: MountOptions["pc"]): MountOptions {
  return { pc, source: loaded.source, file: loaded.file, slug: basename(dirname(loaded.file)) };
}
