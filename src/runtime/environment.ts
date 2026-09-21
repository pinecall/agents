/** The fields a class may no longer declare — the world's — refused at load with the verb that sets each. */

// A class declares the contract: its tools, its state, its `render()`, its language, its doors.
// What it runs on is the world's — per world, per corner, versioned, set by the org without a
// deploy — and a class that still carries one of those fields is told where it went, at load,
// before a prompt is printed or a gateway is knocked at. Same rule as the docs glob before it:
// the refusal names the verb, so nobody goes looking.
export const THE_WORLDS: Readonly<Record<string, string>> = {
  voice: "pinecall agent set --voice <name>",
  llm: "pinecall agent set --llm <vendor/model>",
  stt: "pinecall agent set --stt <vendor>",
  greeting: "pinecall agent set --greeting '…' (or --reply '…')",
  hangup: "pinecall agent set --hangup '…'",
  says: "pinecall lexicon add <word> --say '…'",
  hears: "pinecall lexicon hear <word> …",
  memory: "pinecall memory policy --remember '…' --forget '…'",
  record: "pinecall agent set --record on|off",
  knowledge: "pinecall agent knowledge edit — what the agent knows by heart is a setting, not a file",
  docs: "pinecall docs push, then pinecall docs attach <base>",
};

/** The sentence a class carrying a field of the world's is refused with. */
export function movedToTheWorld(field: string): string {
  return `\`${field}\` is the world's now, not the class's: ${THE_WORLDS[field]} — remove it from the class`;
}

/** Refuse the first field of the world's this instance still carries. Nothing is read off it. */
export function refuseTheEnvironment(probe: object): void {
  for (const field of Object.keys(THE_WORLDS)) {
    if (Object.hasOwn(probe, field)) throw new Error(movedToTheWorld(field));
  }
}
