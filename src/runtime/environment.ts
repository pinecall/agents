/** What a class declares of its environment: `@voice`, `@llm`, `@stt` and its static fields. */

import { DeclarationRefused } from "../agent/tools.js";
import type { AgentOptions } from "../client/agent.js";

/** The settings a class may declare. Whatever it declares wins over the agent's settings. */
export const ENVIRONMENT = [
  "language",
  "voice",
  "llm",
  "stt",
  "greeting",
  "hangup",
  "turn",
  "says",
  "hears",
  "knowledge",
  "docs",
  "memory",
  "record",
] as const;

type Environment = Pick<AgentOptions, (typeof ENVIRONMENT)[number]>;

const DECORATED: Readonly<Record<string, string>> = {
  voice: "@voice('<vendor>', '<voice id>')",
  llm: "@llm('<vendor>/<model>')",
  stt: "@stt('<vendor>/<model>')",
};

/** The error message for an environment field declared on the instance. */
export function declaredOnTheInstance(field: string): string {
  const way = DECORATED[field] ?? `static ${field} = …`;
  return `\`${field}\` is the class's, not a call's state: declare it as ${way}`;
}

/** The environment the class declares, as the declaration sends it. */
export function environmentOf(ctor: Function): Environment {
  const declared = ctor as unknown as Record<string, unknown>;
  const environment: Record<string, unknown> = {};
  for (const field of ENVIRONMENT) {
    if (declared[field] !== undefined) environment[field] = declared[field];
  }
  return environment as Environment;
}

/** Throw on the first environment field the instance declares, where it would be the call's state. */
export function refuseTheEnvironment(probe: object): void {
  for (const field of ENVIRONMENT) {
    if (Object.hasOwn(probe, field)) throw new DeclarationRefused(declaredOnTheInstance(field));
  }
}
