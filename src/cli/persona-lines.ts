/** How `pinecall personas` says a caller: the roster as a table, one caller whole, and its facts. */

import type { Persona } from "./testing/personas.js";

// A caller with no facts of their own is not broken — they are somebody who will invent nothing,
// which is what the model playing them is told. `show` says so rather than printing an empty block.
const NO_FACTS = "(no facts: this caller may state nothing about themselves)";

// Unset is not empty: the runtime picks the model and a voice the agent does not have, which is
// what every caller was before a row could say otherwise. `show` says whose choice it is.
const THE_RUNTIMES = "the runtime's";

// Neither half written is a caller nobody judges — the `persona` judge only runs on a rule.
const NO_RULE = "(no rule: no `persona` judge runs on this caller's calls)";

const FACT_SHAPE = "a fact is what=said: --fact 'their phone=305 555 0101'";

/** `--fact 'their phone=305 555 0101'`, repeated: what this caller knows about themselves. */
export function theFacts(said: string[]): Record<string, string> {
  const facts: Record<string, string> = {};
  for (const one of said) {
    const at = one.indexOf("=");
    if (at <= 0) throw new Error(FACT_SHAPE);
    facts[one.slice(0, at).trim()] = one.slice(at + 1).trim();
  }
  return facts;
}

/** The lines `show` prints: the caller, how they talk and are played, their rule, their facts. */
export function linesOf(persona: Persona): string[] {
  const facts = Object.entries(persona.facts);
  const rule = [
    ...(persona.accepts_when === "" ? [] : [`  accepts when: ${persona.accepts_when}`]),
    ...(persona.declines_when === "" ? [] : [`  declines when: ${persona.declines_when}`]),
  ];
  return [
    `${persona.name} · ${persona.goal}`,
    ...(persona.about === "" ? [] : [`  ${persona.about}`]),
    `  ${persona.style}`,
    `  played by ${persona.llm ?? THE_RUNTIMES} · read by ${persona.tts ?? THE_RUNTIMES} · voice ${persona.voice ?? THE_RUNTIMES}`,
    ...(rule.length === 0 ? [`  ${NO_RULE}`] : rule),
    ...(facts.length === 0 ? [`  ${NO_FACTS}`] : facts.map(([what, said]) => `  ${what}: ${said}`)),
  ];
}

// The columns are as wide as what is IN them. They used to be 12 and 46, so `office-manager`
// (14) pushed its own row two characters right and the table stopped being a table — the same
// mistake `pinecall agent` had and fixed by measuring (cli/agent-lines.ts).
export function asATable(personas: Persona[]): string[] {
  const name = Math.max(...personas.map((one) => one.name.length));
  const style = Math.max(...personas.map((one) => one.style.length));
  return personas.map((one) => `${one.name.padEnd(name)}  ${one.style.padEnd(style)}  ${one.goal}`);
}
