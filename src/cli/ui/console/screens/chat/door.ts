/** The console's own doors to a written call: which class is here, one opened, one turn, one hangup. */

import { z } from "zod";

import { post, read, type Credentials } from "../../lib/api";

/** The class this console can chat with: the one in the directory `pinecall ui` runs in. */
const RosterSchema = z.object({ agent: z.string().nullable() });
export type Roster = z.infer<typeof RosterSchema>;

const CallSchema = z.object({ call: z.string() });

/** Which class the terminal that serves this page has mounted, if any. */
export async function readChatRoster(credentials: Credentials): Promise<Roster> {
  return RosterSchema.parse(await read(credentials, "/ui/chat"));
}

/** Open a written call against it. `as` files the call under a contact, so memory has a name. */
export async function startChat(credentials: Credentials, agent: string, as: string): Promise<string> {
  return CallSchema.parse(await post(credentials, "/ui/chat", { agent, ...(as === "" ? {} : { as }) })).call;
}

/** One turn, down the socket the terminal is holding. The answer arrives on the call's log. */
export async function sayInChat(credentials: Credentials, call: string, text: string): Promise<void> {
  CallSchema.parse(await post(credentials, "/ui/chat/say", { call, text }));
}

/** Hang up: closing the socket is what seals the log and runs the judges. */
export async function endChat(credentials: Credentials, call: string): Promise<void> {
  CallSchema.parse(await post(credentials, "/ui/chat/end", { call }));
}
