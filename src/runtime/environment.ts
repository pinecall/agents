/** Environment fields a class may not declare, each with the CLI verb that sets it instead. */

// These are per-world settings changed without a deploy. The class is refused at load, and the
// error names the verb that replaces the field.
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

/** The error message for a class that declares an environment field. */
export function movedToTheWorld(field: string): string {
  return `\`${field}\` is the world's now, not the class's: ${THE_WORLDS[field]} — remove it from the class`;
}

/** Throw on the first environment field the instance declares. */
export function refuseTheEnvironment(probe: object): void {
  for (const field of Object.keys(THE_WORLDS)) {
    if (Object.hasOwn(probe, field)) throw new Error(movedToTheWorld(field));
  }
}
