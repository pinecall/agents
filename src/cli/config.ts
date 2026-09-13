/** `pinecall config` and `pinecall use`: the gateways this machine knows, and which one is in hand. */

import type { Group } from "./groups.js";
import { activate, activeName, readConfig, type Profile } from "./profiles.js";

const USAGE = `usage: pinecall config           the gateways this machine knows
       pinecall use <profile>    the one the next verb goes to`;

export const group: Group = {
  purpose: "the gateways this machine knows, and which one the next verb goes to",
  usage: `${USAGE}

  One file — ~/.pinecall/config.json — holds them, and \`pinecall login\` writes one per gateway
  you sign in to. Nothing is exported, and there is no order of precedence to remember: the
  profile with the ▸ is the one every verb uses until \`pinecall use\` moves it.

  It prints no key. What a listing may say about one is that it is there, and its fingerprint is
  the Keys screen's business — not a prefix, not a hint. The org and the world beside each name
  are what \`whoami\` last said, kept as a label so this list reads without a network.`,
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
  const [named] = argv;
  if (named === undefined) return listed(out, how.home);
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
    out.write("no gateway yet: `pinecall login <url>`\n");
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
  const known = Object.keys(readConfig(home).profiles).sort();
  const has = known.length === 0 ? "none yet: `pinecall login <url>`" : known.join(" · ");
  err.write(`no profile called ${name}: ${has}\n`);
  return 2;
}

/** Whose org and which world, as the gateway last said them. A label, never a check. */
function said(profile: Profile): string {
  return [profile.org, profile.env].filter((word) => word !== undefined).join(" · ");
}

/** Every column as wide as its widest value: nothing is cut to make a table line up. */
function asColumns(rows: string[][]): string[] {
  const widths = rows[0]!.map((_, column) => Math.max(...rows.map((row) => (row[column] ?? "").length)));
  return rows.map((row) => row.map((value, column) => (value ?? "").padEnd(widths[column]!)).join("  ").trimEnd());
}

export { activeName };
