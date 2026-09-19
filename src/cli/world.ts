/** Which world a verb works in: the sandbox, or production when `--prod` names it for one command. */

import type { World } from "../client/signed.js";
import type { Open } from "./env.js";
import { refusal, whoIs, type Who } from "./whoami.js";

/** The world a laptop is in: what is being written, held per person, nobody's customers calling. */
export const SANDBOX: World = "sandbox";

/** The world the org's customers reach. A person acts there while their org lets them. */
export const PRODUCTION: World = "production";

// Read once per invocation, off argv, before any group sees it — so every verb goes where the
// command said without each of them parsing the flag. The one piece of process-wide state this
// CLI keeps, and it is reset on every parse.
let production = false;

/**
 * Take `--prod` out of an invocation's argv, and remember it.
 *
 * Returns what is left, so the group sees only its own flags. `--prod` belongs to no group: it says
 * which world THIS command runs in, and the gateway lets it through only while the person's row
 * opens production. Nothing is kept: the next command is in the sandbox again.
 */
export function withoutTheWorldFlag(argv: readonly string[]): string[] {
  production = argv.includes("--prod");
  return argv.filter((word) => word !== "--prod");
}

/** Production when this invocation said `--prod`; otherwise nothing is named and it is the sandbox. */
export function theChosenWorld(): World | undefined {
  return production ? PRODUCTION : undefined;
}

/** What the gateway says this key is, in the world this command asked for. */
export async function standing(door: Open): Promise<Who> {
  return await whoIs(door);
}

/** When the gateway will not say who this key is: guessing is the bug this replaces. */
export function cannotTell(verb: string, failed: unknown): string {
  return `\`pinecall ${verb}\` will not guess who this key is: ${refusal(failed)}`;
}
