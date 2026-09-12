/** Which screens a key opens: the rail draws what the key's scopes open and nothing it would be refused. */

// The doors as the gateway groups them (runtime types/key.py), and the screen each one gates.
// A screen the key does not open is not drawn — never a 403 met on a click. The desk is gated
// inside the Calls screen by `supervise`; nothing else here decides what a verb may do.
export const SCOPE_OF: Record<string, string> = {
  talk: "talk",
  chat: "talk",
  calls: "calls",
  sessions: "calls",
  pipeline: "pipeline",
  knowledge: "knowledge",
  memory: "memory",
  evals: "evals",
  agents: "calls",
  live: "calls",
  numbers: "numbers",
  keys: "keys",
  team: "team",
  usage: "usage",
};

/** Whether a key with these scopes opens this screen. A screen nobody gated is open. */
export function opens(scopes: readonly string[], screen: string): boolean {
  const scope = SCOPE_OF[screen];
  return scope === undefined || scopes.includes(scope);
}

/** The sentence a section a key does not open would say, if it were drawn at all. */
export function notOpened(screen: string): string {
  return `this key does not open ${SCOPE_OF[screen] ?? screen}`;
}
