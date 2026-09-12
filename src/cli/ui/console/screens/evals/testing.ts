/** The two goldens verbs, asked of the agent's directory: which ones it has, and a run of the chosen ones. */

import { z } from "zod";

import type { Credentials } from "../../../shared/api";
import { dev } from "../../lib/dev";

/** One golden the page can tick: the name, what the caller says, what is expected of the agent. */
const ListedSchema = z.object({
  name: z.string(),
  input: z.array(z.string()),
  expect: z.record(z.string(), z.unknown()),
});
export type Listed = z.infer<typeof ListedSchema>;

/** The class the process can run against — the one in the directory `run` runs in — and its goldens. */
const RosterSchema = z.object({ agent: z.string().nullable(), goldens: z.array(ListedSchema) });
export type Roster = z.infer<typeof RosterSchema>;

const StartedSchema = z.object({ run: z.string() });

/** What the page asks for. The server refuses what does not fit, in a sentence. */
export interface Wanted {
  agent: string;
  goldens: string[];
  /** `vendor/model`, one per column of the matrix. Empty runs the one the class declared. */
  models?: string[];
  voice: boolean;
  background_noise?: number;
  /** A share, 0 to 1, as the wire takes it. */
  packet_loss?: number;
}

/** The goldens of the directory `pinecall run` was typed in, and which class they are for. */
export async function readGoldens(credentials: Credentials, agent: string): Promise<Roster> {
  return RosterSchema.parse(await dev(credentials, agent, "goldens.roster"));
}

/** Start one run of the chosen goldens. Answers with the run's id once the gateway has opened it. */
export async function startSuite(credentials: Credentials, wanted: Wanted): Promise<string> {
  return StartedSchema.parse(await dev(credentials, wanted.agent, "goldens.run", wanted)).run;
}
