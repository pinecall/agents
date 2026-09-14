/** Which world a verb works in. The KEY decides it; `--env` is how a person says they know which. */

import type { Open } from "./env.js";
import { refusal, whoIs, type Who } from "./whoami.js";

/** The world a laptop is in: what is being written, held per person, nobody's customers calling. */
export const SANDBOX = "sandbox";

/** The world a deployment is in: the org's own, held by a key issued for a machine. */
export const PRODUCTION = "production";

const WORLDS = [PRODUCTION, SANDBOX];

/**
 * The `--env` every registering verb takes, declared once so the flag is spelled in one place.
 *
 * It selects NOTHING. A key opens one world and that is a property of the key, so a flag that
 * chose would be a flag that lies: what this one does is say out loud which world you believe you
 * are in, and refuse when the key disagrees. Sandbox is what a verb assumes when nothing is said,
 * because a laptop is where things are written and a deployment is the deliberate act.
 */
export const ENV_FLAG = { env: { type: "string" as const } };

/** What the gateway says this key is: asked once, and used for both the check and the line. */
export async function standing(door: Open): Promise<Who> {
  return await whoIs(door);
}

/**
 * Why this verb will not run with the key in hand, or undefined when it will.
 *
 * The whole reason this exists: `pinecall run` used to register wherever the key it happened to
 * find pointed, and the line it printed read the same either way — so an agent landed in
 * production, in somebody else's org, and nothing said so until a customer called it.
 */
export function notThisWorld(verb: string, who: Who, said: string | undefined): string | undefined {
  if (said !== undefined && !WORLDS.includes(said)) {
    return `--env takes ${WORLDS.join(" or ")}, not ${JSON.stringify(said)}`;
  }
  const wanted = said ?? SANDBOX;
  if (who.env === wanted) return undefined;
  if (said !== undefined) {
    return (
      `--env ${said} asks for ${said}, and this key opens ${who.env}: a key opens one world and`
      + " no flag changes that.\n"
      + `  \`pinecall use <profile>\` for a key that opens ${said} — \`pinecall config\` lists them.`
    );
  }
  return (
    `this key opens ${who.env}, and \`pinecall ${verb}\` answers in the ${SANDBOX} unless you say so.\n`
    + `  \`pinecall ${verb} --env ${who.env}\` if that is what you meant: it is what a deployment types.\n`
    + "  `pinecall use <profile>` to work on a key of your own — `pinecall config` lists them."
  );
}

/** When the gateway will not say which world the key opens: guessing is the bug this replaces. */
export function cannotTell(verb: string, failed: unknown): string {
  return `\`pinecall ${verb}\` will not guess which world this key opens: ${refusal(failed)}`;
}
