/** Which console this page is — the gateway's or this machine's — and the one table of what each has. */

import type { World } from "./session-key";

// One bundle, two consoles. HOSTED is the gateway's own page: production, and only production —
// what customers reach, watched by the people who run it. LOCAL is `pinecall serve` on a
// developer's machine: the sandbox, their own copies, the workshop. The sidecar marks the page it
// serves (src/cli/serve/server.ts); a page nobody marked is the gateway's.
export type Mode = "local" | "hosted";

const MARK = 'meta[name="pinecall-console"]';

/** Read once, when the page loads: a page does not change which console it is. */
export const MODE: Mode = typeof document !== "undefined" && document.querySelector(MARK)?.getAttribute("content") === "local" ? "local" : "hosted";

/** The gateway's own address: this page's origin when the gateway serves it, else what the sidecar said. */
export function gatewayOrigin(): string {
  const said = document.querySelector('meta[name="pinecall-gateway"]')?.getAttribute("content");
  return (said ?? window.location.origin).replace(/\/$/, "");
}

/** The world a console looks at. It is not a choice: the mode IS the world. */
export const WORLD_OF: Record<Mode, World> = { hosted: "production", local: "sandbox" };

/** One screen: where it is, what the rail calls it, and which console has it. */
export interface Screen {
  /** The key the scopes table gates it by (lib/scopes.ts). */
  key: string;
  path: string;
  name: string;
  in: readonly Mode[];
}

const BOTH = ["hosted", "local"] as const;
const HOSTED = ["hosted"] as const;
const LOCAL = ["local"] as const;

// THE table. The rail draws it and the router routes it, so a screen a console does not have is
// neither linked nor reachable by typing its path. A redesign moves rows here and nothing else:
// no screen asks which mode it is in to decide whether it exists.
//
// The org's screens. Running the org — numbers, keys, vendors, people, the bill — is production's
// business and lives on the gateway. A developer's machine has the floor of their own sandbox, and
// how to reach their copy by phone.
export const ORG_SCREENS: readonly Screen[] = [
  { key: "agents", path: "", name: "Overview", in: BOTH },
  { key: "live", path: "live", name: "Live", in: BOTH },
  { key: "sessions", path: "sessions", name: "Sessions", in: BOTH },
  { key: "numbers", path: "numbers", name: "Numbers", in: HOSTED },
  { key: "phone", path: "phone", name: "Phone testing", in: LOCAL },
  { key: "keys", path: "keys", name: "Keys", in: HOSTED },
  { key: "providers", path: "providers", name: "Providers", in: HOSTED },
  { key: "team", path: "team", name: "Team", in: HOSTED },
  { key: "usage", path: "usage", name: "Usage", in: HOSTED },
];

// An agent's screens. Talk first: it is the screen a person opens an agent for. Chat is a written
// call to the class in a developer's own directory, so it is the workshop's.
export const AGENT_SCREENS: readonly Screen[] = [
  { key: "talk", path: "talk", name: "Talk", in: BOTH },
  { key: "chat", path: "chat", name: "Chat", in: LOCAL },
  { key: "calls", path: "calls", name: "Calls", in: BOTH },
  { key: "sessions", path: "sessions", name: "Sessions", in: BOTH },
  { key: "pipeline", path: "pipeline", name: "Pipeline", in: BOTH },
  { key: "knowledge", path: "knowledge", name: "Knowledge", in: BOTH },
  { key: "memory", path: "memory", name: "Memory", in: BOTH },
  { key: "evals", path: "evals", name: "Evals", in: BOTH },
  { key: "widget", path: "widget", name: "Widget", in: BOTH },
];

/** The rows of a table this console has, in the table's order. */
export function screensOf(table: readonly Screen[], mode: Mode = MODE): Screen[] {
  return table.filter((screen) => screen.in.includes(mode));
}

/** Whether this console has that screen, by its key. */
export function has(table: readonly Screen[], key: string, mode: Mode = MODE): boolean {
  return table.some((screen) => screen.key === key && screen.in.includes(mode));
}
