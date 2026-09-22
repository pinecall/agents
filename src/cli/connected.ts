/** The one line `pinecall start` prints when the socket is up: who registered, where, and as whom. */

import type { Door_ } from "./line.js";

export interface Connected {
  slug: string;
  url: string;
  tools: number;
  /** Whose org took it, and which of the two worlds. Absent when the gateway would not say. */
  org?: string;
  env?: string;
  /** Where the key that opened the door was read — the environment, or the project's .env. Said
   * because it decides the two above, and because it used to be whatever the shell exported. */
  source?: string;
}

/**
 * The one line `pinecall start` prints when the socket is up.
 *
 * It used to say the gateway and nothing else, and that cost an afternoon: a key exported in the
 * shell wins over the one `pinecall login` just kept, so an agent could register into another org
 * and another world with this line reading exactly the same. Where you are IS the key you hold,
 * so the line says which key, whose org, and which world — the same four things `whoami` says.
 *
 * Three things a person needs and nothing this process had to invent: who registered, which
 * gateway took it, and what the class declared. It names no page: the gateway serves none. An
 * agent that declared no door prints no `doors` at all rather than an empty one.
 */
export function connectedLine(agent: Connected): string {
  const said = [agent.slug];
  if (agent.org !== undefined) said.push(agent.org);
  if (agent.env !== undefined) said.push(agent.env);
  said.push(`connected to ${agent.url}`);
  if (agent.source !== undefined) said.push(`key from ${agent.source}`);
  said.push(`tools ${agent.tools}`);
  return said.join(" · ");
}

// Said after the socket is up, because it is the ORG's answer and not the class's: a class
// declares no doors, and what this agent answers at is a row somebody typed. An agent with no row
// answers on the web, which every agent does, and the line says so rather than saying nothing.
/** The doors line: every door of this agent, as a person reads them. */
export function doorsOf(slug: string, doors: Door_[]): string {
  const its = doors.filter((one) => one.agent === slug);
  const said = its.map((one) => (one.number === null ? one.channel : `${one.channel} ${one.number}`));
  return `doors    ${["web", ...said].join(" · ")}`;
}
