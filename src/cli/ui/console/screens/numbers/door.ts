/** The Numbers screen's one door: the org's doors in the key's world, each with its source. */

import { z } from "zod";

import { read, type Credentials } from "../../lib/api";

// The runtime's `Answering`: the domain's Route, and which of the two tables put it there.
const AnsweringSchema = z.object({
  route: z.object({
    org: z.string(),
    agent: z.string(),
    channel: z.enum(["phone", "web", "whatsapp"]),
    number: z.string().nullable(),
    label: z.string().nullable(),
    env: z.enum(["production", "development"]),
  }),
  source: z.enum(["operator", "app"]),
});
export type Answering = z.infer<typeof AnsweringSchema>;

/** Every door the org answers in this world, in the order the worker is given them. */
export async function readNumbers(credentials: Credentials): Promise<Answering[]> {
  return z.array(AnsweringSchema).parse(await read(credentials, "/v1/numbers"));
}
