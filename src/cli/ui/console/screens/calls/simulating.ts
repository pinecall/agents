/** The two simulate verbs, asked of the agent's directory: who can be played, and one call started. */

import { z } from "zod";

import type { Credentials } from "../../../shared/api";
import { dev } from "../../lib/dev";

/** One caller the page can pick: the name a verb takes, what they want, how they talk. */
const ListedSchema = z.object({ name: z.string(), goal: z.string(), style: z.string() });
export type Listed = z.infer<typeof ListedSchema>;

/** The class the process can simulate against — the one in the directory `run` runs in — and its callers. */
const RosterSchema = z.object({ agent: z.string().nullable(), personas: z.array(ListedSchema) });
export type Roster = z.infer<typeof RosterSchema>;

const StartedSchema = z.object({ call: z.string() });

/** What the page asks for. The server refuses what does not fit, in a sentence. */
export interface Wanted {
  agent: string;
  persona: string;
  voice: boolean;
  judge: boolean;
  turns: number;
  background_noise?: number;
  packet_loss?: number;
}

/** The personas of the directory `pinecall run` was typed in, and which class they are for. */
export async function readRoster(credentials: Credentials, agent: string): Promise<Roster> {
  return RosterSchema.parse(await dev(credentials, agent, "simulate.roster"));
}

/** Start one simulated call. Answers the moment the call has an id; the call runs on. */
export async function startSimulation(credentials: Credentials, wanted: Wanted): Promise<string> {
  return StartedSchema.parse(await dev(credentials, wanted.agent, "simulate.start", wanted)).call;
}
