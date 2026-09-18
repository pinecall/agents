/** `pinecall config` and `pinecall use`: the gateways this machine knows, and which one is in hand. */

import type { Group } from "./groups.js";
import { activate, activeName, forget, inWorld, readConfig, type Profile, type World } from "./profiles.js";

const USAGE = `usage: pinecall config              the gateways this machine knows
       pinecall config rm <name>    forget one
       pinecall use <org>           the org the next verb goes to
       pinecall use <org> <world>   and the world: sandbox, or production`;

export const group: Group = {
  purpose: "the gateways this machine knows, and which one the next verb goes to",
  usage: `${USAGE}

  One file — ~/.pinecall/config.json — holds them, and \`pinecall login\` writes one per ORG you
  belong to, named after the org, with your key in both of its worlds (\`--as <name>\` and a
  machine's key keep ONE profile, holding the key in hand). Nothing is exported, and there is no
  order of precedence to remember: the profile with the ▸ is the one every verb uses until
  \`pinecall use\` moves it, and \`--profile <name>\` on any one verb sends that command elsewhere.

  It prints no key. What a listing may say about one is that it is there, and its fingerprint is
  the Keys screen's business — not a prefix, not a hint. The org and the world beside each name
  are what the login wrote down from \`whoami\`, kept as a label so this list reads without a
  network; "sandbox (and production)" is a profile holding both worlds' keys.

  \`use <org> <world>\` is a line in this file and never a trip to the gateway; a profile with no
  key for that world is refused, and \`pinecall login\` again keeps both.

  \`config rm\` takes a row out — a gateway that has moved, a key that was revoked — and the ▸ with
  it when it was the active one. It keeps the gateway this machine is pointed at (\`pinecall
  gateway\`), and forgets nothing else: the key itself is stopped from the Keys screen, and a row
  left behind is a key somebody will trust tomorrow and a refusal they will read as the gateway's
  fault.`,
  run,
};

/** What the verb can be told besides the argv. Tests only: where to print, and which home. */
export interface Showing {
  out?: NodeJS.WritableStream;
  err?: NodeJS.WritableStream;
  home?: string;
}

/** `config` with nothing after it prints them all; `use <name>` moves the mark. */
export async function run(argv: string[], how: Showing = {}): Promise<number> {
  const out = how.out ?? process.stdout;
  const err = how.err ?? process.stderr;
  const [named, ...rest] = argv;
  if (named === undefined) return listed(out, how.home);
  if (named === "rm") return dropped(rest[0], out, err, how.home);
  if (rest[0] !== undefined) return moved(named, rest[0], out, err, how.home);
  return chosen(named, out, err, how.home);
}

/** The same verb under the name a person reaches for: `pinecall use box`. */
export async function use(argv: string[], how: Showing = {}): Promise<number> {
  const [named] = argv;
  if (named === undefined) {
    (how.err ?? process.stderr).write(`${USAGE}\n`);
    return 2;
  }
  return await run(argv, how);
}

function listed(out: NodeJS.WritableStream, home: string | undefined): number {
  const config = readConfig(home);
  const names = Object.keys(config.profiles).sort();
  if (names.length === 0) {
    out.write("no gateway yet: `pinecall login`\n");
    return 0;
  }
  const rows = names.map((name) => [
    name === config.active ? `▸ ${name}` : `  ${name}`,
    config.profiles[name]!.url,
    said(config.profiles[name]!),
  ]);
  for (const line of asColumns(rows)) out.write(`${line}\n`);
  return 0;
}

function dropped(
  name: string | undefined,
  out: NodeJS.WritableStream,
  err: NodeJS.WritableStream,
  home: string | undefined,
): number {
  if (name === undefined) {
    err.write(`${USAGE}\n`);
    return 2;
  }
  if (forget(name, home)) {
    out.write(`forgot ${name}\n`);
    return 0;
  }
  return noSuchProfile(name, err, home);
}

function chosen(
  name: string,
  out: NodeJS.WritableStream,
  err: NodeJS.WritableStream,
  home: string | undefined,
): number {
  if (activate(name, home)) {
    out.write(`▸ ${name}\n`);
    return 0;
  }
  return noSuchProfile(name, err, home);
}

// One login keeps both worlds' keys, so this is a line in a file and never a trip to the gateway.
function moved(name: string, world: string, out: NodeJS.WritableStream, err: NodeJS.WritableStream, home: string | undefined): number {
  if (world !== "sandbox" && world !== "production") {
    err.write(`a world is sandbox or production, not ${world}\n`);
    return 2;
  }
  const answer = inWorld(name, world as World, home);
  if (answer === "unknown") return noSuchProfile(name, err, home);
  if (answer === "nokey") {
    err.write(`${name} holds no ${world} key: \`pinecall login\` again keeps both worlds\n`);
    return 2;
  }
  out.write(`▸ ${name} · ${world}\n`);
  if (world === "production") out.write("  you look at production from here; what answers its numbers is the box's own key\n");
  return 0;
}

/** The one refusal both `use` and `rm` give, naming what this machine does know. */
function noSuchProfile(name: string, err: NodeJS.WritableStream, home: string | undefined): number {
  const known = Object.keys(readConfig(home).profiles).sort();
  const has = known.length === 0 ? "none yet: `pinecall login`" : known.join(" · ");
  err.write(`no profile called ${name}: ${has}\n`);
  return 2;
}

/** Whose org and which world, as the gateway last said them. A label, never a check. */
function said(profile: Profile): string {
  const other = profile.env === "production" ? "sandbox" : "production";
  const world = profile.env !== undefined && profile.keys?.[other] !== undefined ? `${profile.env} (and ${other})` : profile.env;
  return [profile.org, world].filter((word) => word !== undefined).join(" · ");
}

/** Every column as wide as its widest value: nothing is cut to make a table line up. */
function asColumns(rows: string[][]): string[] {
  const widths = rows[0]!.map((_, column) => Math.max(...rows.map((row) => (row[column] ?? "").length)));
  return rows.map((row) => row.map((value, column) => (value ?? "").padEnd(widths[column]!)).join("  ").trimEnd());
}

export { activeName };
