/** The one line `pinecall run` prints when the socket is up: who registered, where, and as whom. */

import type { RouteInput } from "../client/index.js";

export interface Connected {
  slug: string;
  url: string;
  tools: number;
  doors: string[];
  /** Whose org took it, and which of the two worlds. Absent when the gateway would not say. */
  org?: string;
  env?: string;
  /** Which profile's key opened the door. Said because it is the thing that decides the two
   * above, and because it used to be decided by whatever was exported in the shell. */
  source?: string;
}

/**
 * The one line `pinecall run` prints when the socket is up.
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
  if (agent.doors.length > 0) said.push(`doors ${agent.doors.join(", ")}`);
  return said.join(" · ");
}

/** Each door the class declared, as the line names it: the channel, and its number when it has one. */
export function doorsOf(routes: RouteInput[] | undefined): string[] {
  return (routes ?? []).map((route) =>
    route.number === null || route.number === undefined ? route.channel : `${route.channel} ${route.number}`,
  );
}
