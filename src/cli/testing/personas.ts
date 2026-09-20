/** The org's callers, as the gateway keeps them: read, written and dropped over its own doors. */

import { asked, type Door } from "./gateway.js";

/** One caller the gateway holds: the three declarations, the facts, the state, and who wrote it. */
export interface Persona {
  name: string;
  about: string;
  goal: string;
  style: string;
  facts: Record<string, string>;
  state: Record<string, unknown>;
  author: string;
  set_at: number;
}

/** What a write sends: the caller whole, and the name it had when the write is a rename. */
export interface Written {
  about?: string;
  goal: string;
  style: string;
  facts?: Record<string, string>;
  state?: Record<string, unknown>;
  was?: string;
}

/**
 * What a name nobody wrote reads as, for everybody who looks one up: the terminal's verbs, the
 * console's own door, and the simulation both of them start. Where a caller is written now that it
 * is not a file — the verb, and the screen that writes the same one.
 */
export const NOBODY = (name: string): string =>
  `no persona called ${name}: \`pinecall personas add ${name} --goal '…' --style '…'\`, or the console's Personas`;

// One list an org, and no agent in the path: a caller is a person on the phone, and who they are
// does not depend on which of the org's agents picks up.
const door = (name?: string): string => `/v1/personas${name === undefined ? "" : `/${encodeURIComponent(name)}`}`;

/** Every caller this org wrote, by name. */
export async function personasOf(gateway: Door): Promise<Persona[]> {
  return (await asked<{ personas: Persona[] }>(gateway, door())).personas;
}

/** One caller by name, or undefined when nobody wrote them. */
export async function personaNamed(gateway: Door, name: string): Promise<Persona | undefined> {
  return (await personasOf(gateway)).find((one) => one.name === name);
}

/** The caller written whole — new, replaced, or renamed — and every caller after it. */
export async function writePersona(gateway: Door, name: string, written: Written): Promise<Persona[]> {
  return (await asked<{ personas: Persona[] }>(gateway, door(name), { method: "PUT", body: written })).personas;
}

/** The caller dropped, and every caller after it. */
export async function dropPersona(gateway: Door, name: string): Promise<Persona[]> {
  return (await asked<{ personas: Persona[] }>(gateway, door(name), { method: "DELETE" })).personas;
}
