/** The inbox's own doors: the threads the gateway keeps per contact, and a message to a closed thread. Absent until the gateway has them. */

import { VerbSchema } from "@pinecall/protocol";
import { z } from "zod";

import { GatewayError, post, read, type Credentials } from "../../../shared/api";

// GET /v1/agents/{slug}/threads (the console's F6): what the gateway knows about a contact that the
// sessions door does not say — the name a person wrote down, and how much of the thread this reader
// has not read yet. Read loosely: a field the gateway adds later is not a refusal.
const DoorThreadSchema = z.looseObject({
  contact: z.string(),
  name: z.string().nullish(),
  unread: z.number().nullish(),
});
const DoorThreadsSchema = z.looseObject({ threads: z.array(DoorThreadSchema) });
export type DoorThread = z.infer<typeof DoorThreadSchema>;

/** The gateway's threads by contact, or null when this gateway has no such door yet (a 404). */
export async function readDoorThreads(credentials: Credentials, agent: string): Promise<Map<string, DoorThread> | null> {
  try {
    const answered = DoorThreadsSchema.parse(await read(credentials, `/v1/agents/${encodeURIComponent(agent)}/threads`));
    return new Map(answered.threads.map((one) => [one.contact, one]));
  } catch (refused) {
    if (refused instanceof GatewayError && (refused.status === 404 || refused.status === 405)) return null;
    throw refused;
  }
}

/** This reader has seen the thread. */
export async function markRead(credentials: Credentials, agent: string, contact: string): Promise<void> {
  await post(credentials, `/v1/agents/${encodeURIComponent(agent)}/threads/${encodeURIComponent(contact)}/read`, {});
}

/** Write to a closed thread as the agent, within the channel's window. */
export async function writeTo(credentials: Credentials, agent: string, contact: string, text: string): Promise<void> {
  await post(credentials, `/v1/agents/${encodeURIComponent(agent)}/threads/${encodeURIComponent(contact)}/messages`, { text });
}

/** Say a sentence into a live text call as the agent: the supervise desk's own verb. */
export async function sayInto(credentials: Credentials, call: string, text: string): Promise<void> {
  await post(credentials, `/v1/calls/${encodeURIComponent(call)}/verbs`, VerbSchema.parse({ verb: "say", text }));
}
