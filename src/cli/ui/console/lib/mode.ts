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

/** Where a screen sits in the sidebar: the org's floor, or the org's settings. An agent's screens are its tabs. */
export type Group = "gateway" | "settings" | "box";

/** The sidebar's icons, by name (ui/icon.tsx). */
export type ScreenIcon = "home" | "grid" | "activity" | "list" | "chart" | "phone" | "key" | "plug" | "users" | "building" | "server" | "route" | "sliders" | "check";

/** One screen: where it is, what the sidebar calls it, which group it sits in, and which console has it. */
export interface Screen {
  /** The key the scopes table gates it by (lib/scopes.ts). */
  key: string;
  path: string;
  name: string;
  in: readonly Mode[];
  group?: Group;
  icon?: ScreenIcon;
  /** The box's own: drawn and routed only for a person the box made an operator. */
  operator?: true;
}

const BOTH = ["hosted", "local"] as const;
const HOSTED = ["hosted"] as const;
const LOCAL = ["local"] as const;

// THE table. The sidebar draws it and the router routes it, so a screen a console does not have is
// neither linked nor reachable by typing its path. A redesign moves rows here and nothing else:
// no screen asks which mode it is in to decide whether it exists.
//
// The org's screens. Running the org — numbers, keys, vendors, people, the bill — is production's
// business and lives on the gateway. A developer's machine has the floor of their own sandbox, and
// how to reach their copy by phone.
export const ORG_SCREENS: readonly Screen[] = [
  { key: "home", path: "", name: "Home", in: BOTH, group: "gateway", icon: "home" },
  { key: "agents", path: "overview", name: "Overview", in: BOTH, group: "gateway", icon: "grid" },
  { key: "live", path: "live", name: "Live", in: BOTH, group: "gateway", icon: "activity" },
  { key: "sessions", path: "sessions", name: "Sessions", in: BOTH, group: "gateway", icon: "list" },
  { key: "org-evals", path: "evals", name: "Evals", in: BOTH, group: "gateway", icon: "check" },
  { key: "org-memory", path: "memory", name: "Memory", in: BOTH, group: "gateway", icon: "memory" },
  { key: "usage", path: "usage", name: "Usage", in: HOSTED, group: "gateway", icon: "chart" },
  { key: "numbers", path: "numbers", name: "Numbers", in: HOSTED, group: "settings", icon: "phone" },
  { key: "phone", path: "phone", name: "Phone testing", in: LOCAL, group: "settings", icon: "phone" },
  { key: "keys", path: "keys", name: "Keys", in: HOSTED, group: "settings", icon: "key" },
  { key: "providers", path: "providers", name: "Providers", in: HOSTED, group: "settings", icon: "plug" },
  { key: "team", path: "team", name: "Team", in: HOSTED, group: "settings", icon: "users" },
];

// The BOX's screens: every tenant, the fleet under them, the doors, the bill of all of them, and
// what the box itself is set to. They are not an org's — an org's admin never sees them — so they
// are a table of their own, each row marked: only a person the box made an operator is shown one.
export const BOX_SCREENS: readonly Screen[] = [
  { key: "box-orgs", path: "box/orgs", name: "Organizations", in: HOSTED, group: "box", icon: "building", operator: true },
  { key: "box-fleet", path: "box/fleet", name: "Fleet", in: HOSTED, group: "box", icon: "server", operator: true },
  { key: "box-routes", path: "box/routes", name: "Routes", in: HOSTED, group: "box", icon: "route", operator: true },
  { key: "box-usage", path: "box/usage", name: "Box usage", in: HOSTED, group: "box", icon: "chart", operator: true },
  { key: "box-settings", path: "box/settings", name: "Box settings", in: HOSTED, group: "box", icon: "sliders", operator: true },
];

// An agent's screens, its tabs. Talk and Chat are the two ways into the gateway's room — the
// microphone, or writing — and they are two tabs because they are two ways of working, not one
// screen with a switch. Dev chat is a written call to the class in a developer's own directory,
// mounted in their terminal, so it is the workshop's.
export const AGENT_SCREENS: readonly Screen[] = [
  { key: "talk", path: "talk", name: "Talk", in: BOTH },
  { key: "chat", path: "chat", name: "Chat", in: BOTH },
  { key: "devchat", path: "dev-chat", name: "Dev chat", in: LOCAL },
  { key: "calls", path: "calls", name: "Calls", in: BOTH },
  { key: "sessions", path: "sessions", name: "Sessions", in: BOTH },
  { key: "pipeline", path: "pipeline", name: "Pipeline", in: BOTH },
  { key: "knowledge", path: "knowledge", name: "Knowledge", in: BOTH },
  { key: "memory", path: "memory", name: "Memory", in: BOTH },
  { key: "evals", path: "evals", name: "Evals", in: BOTH },
  { key: "widget", path: "widget", name: "Widget", in: BOTH },
];

/** The rows of a table this console has, in the table's order; an operator's rows only for an operator. */
export function screensOf(table: readonly Screen[], mode: Mode = MODE, operator = false): Screen[] {
  return table.filter((screen) => screen.in.includes(mode) && (operator || screen.operator !== true));
}

/** Whether this console has that screen, by its key. */
export function has(table: readonly Screen[], key: string, mode: Mode = MODE): boolean {
  return table.some((screen) => screen.key === key && screen.in.includes(mode));
}
