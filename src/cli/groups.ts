/** Every group of `pinecall <group>`: what it is for, and whether this tree has written it yet. */

/** What a group module owes the dispatcher: a one-line purpose and something that runs. */
export interface Group {
  purpose: string;
  /** What `pinecall <group> --help` prints under the purpose: the flags this group takes. */
  usage?: string;
  run(argv: string[]): Promise<number> | number;
}

/** The page `pinecall <group> --help` prints: what the group is for, and what it takes. */
export function helpFor(name: string, group: Group): string {
  const said = [`pinecall ${name} — ${group.purpose}`];
  if (group.usage !== undefined) said.push("", group.usage.trimEnd());
  return `${said.join("\n")}\n`;
}

// The design lists every verb of the tenant's CLI. Declaring the whole list here — not only what
// works — is the point: a person who types `pinecall supervise` is told what supervise WILL be
// instead of "unknown command", and this table is the one place that says which half of the CLI
// is still a design. A verb leaves it in the commit that writes it.
/** What each group the design declares is for, for the ones this tree has not written yet. */
export const PLANNED: Record<string, string> = {
  new: "scaffold an app: agent.ts, views, knowledge, lib, test, .env",
  g: "generate a tool, a component, a golden, a persona, a channel",
  sessions: "list | show | tail | replay | score a call's log",
  observe: "the agent log as it happens, with a persistent cursor",
  costs: "what the calls cost, by agent, model or channel",
  supervise: "listen in: whisper, say, takeover, transfer, end",
  call: "the agent dials a number, for real",
  tokens: "mint a browser token for a web call",
  phones: "list | buy | attach the numbers the org owns",
  agents: "list | show the agents this org has registered",
  deploy: "put this app on a box and keep it there",
};

/** The line a planned group prints instead of doing anything: the verb, and what it will be. */
export function notBuiltYet(name: string, purpose: string): string {
  return `${name} is not built yet: ${purpose}`;
}

/** A planned group as a runnable one: it says what it will be and leaves with a zero. */
export function plannedGroup(name: string, purpose: string, out: NodeJS.WritableStream): Group {
  return {
    purpose,
    run() {
      out.write(`${notBuiltYet(name, purpose)}\n`);
      return 0;
    },
  };
}
