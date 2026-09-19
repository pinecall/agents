/** The chat verbs, asked of the `pinecall start` in the agent's directory: the class there, a call, a turn, a hangup. */

import { z } from "zod";

import type { Credentials } from "../../../shared/api";
import { dev } from "../../lib/dev";

/** The class that process can chat with: the one in the directory `pinecall start` was typed in. */
const RosterSchema = z.object({ agent: z.string().nullable(), states: z.array(z.string()) });
export type Roster = z.infer<typeof RosterSchema>;

const CallSchema = z.object({ call: z.string() });

/** Which class the process holding this agent has mounted, if any. */
export async function readChatRoster(credentials: Credentials, agent: string): Promise<Roster> {
  return RosterSchema.parse(await dev(credentials, agent, "chat.roster"));
}

/**
 * Open a written call against it. `as` files the call under a contact, so memory has a name, and
 * `golden` opens the conversation in that golden's state — `pinecall chat --state`, by name.
 */
export async function startChat(
  credentials: Credentials,
  agent: string,
  as: string,
  golden: string,
): Promise<string> {
  const body = { agent, ...(as === "" ? {} : { as }), ...(golden === "" ? {} : { golden }) };
  return CallSchema.parse(await dev(credentials, agent, "chat.start", body)).call;
}

/** One turn, down the socket that process is holding. The answer arrives on the call's log. */
export async function sayInChat(credentials: Credentials, agent: string, call: string, text: string): Promise<void> {
  CallSchema.parse(await dev(credentials, agent, "chat.say", { call, text }));
}

/** Hang up: closing the socket is what seals the log and runs the judges. */
export async function endChat(credentials: Credentials, agent: string, call: string): Promise<void> {
  CallSchema.parse(await dev(credentials, agent, "chat.end", { call }));
}
