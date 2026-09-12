/** ~/.pinecall: the keys this machine keeps — the gateways it logged in to, and the local one. */

import { chmodSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir, userInfo } from "node:os";
import { join } from "node:path";

// The directory is a person's, not a machine's: 0700 so another account on the same box cannot
// list it, and 0600 on every file so it cannot read one whose name it guessed.
const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;
// Every bit outside the owner's. A file that has one of them is readable by somebody else, and a
// key somebody else can read is not a key we are willing to send anywhere.
const OTHERS = 0o077;

const CREDENTIALS = "credentials";
const DEV = "dev";

/** The directory both files live in: ~/.pinecall, or the one PINECALL_HOME names instead. */
export function pinecallHome(env: NodeJS.ProcessEnv = process.env): string {
  return env["PINECALL_HOME"] ?? join(homedir(), ".pinecall");
}

/** One gateway this machine has logged in to: the key, the org it opened, and when it was kept. */
export interface GatewayEntry {
  api_key: string;
  org: string;
  logged_in_at: string;
  /** The phone this person calls FROM, so a ring in development reaches their own agent rather
   * than whoever holds the line. Said once with `pinecall line from`, and re-sent by every
   * `pinecall run` — the gateway keeps it beside its live table, not in a row. */
  calling?: string;
}

/**
 * The credentials file as it is on disk.
 *
 * `api_key` is v1's own field — one key, no URL — and it is still read by the v1 CLI on this same
 * machine. Nothing here writes over it: a login adds a row under `gateways` and leaves the rest of
 * the file exactly as it found it.
 */
export interface Credentials {
  api_key?: string;
  gateways: Record<string, GatewayEntry>;
}

/** What a local `pinecall-runtime gateway` on a dev key left behind: where it is and its key. */
export interface DevGateway {
  url: string;
  key: string;
}

/** The whole file. A missing one, an unreadable one and a broken one are all an empty table. */
export function readCredentials(home: string = pinecallHome()): Credentials {
  const read = parsed(join(home, CREDENTIALS));
  if (read === undefined) return { gateways: {} };
  const gateways = read["gateways"];
  const kept: Credentials = { gateways: isTable(gateways) ? (gateways as Record<string, GatewayEntry>) : {} };
  if (typeof read["api_key"] === "string") kept.api_key = read["api_key"];
  return kept;
}

/** One gateway's row, by the URL as `normalised` writes it. Nothing logged in is nothing here. */
export function gatewayFor(url: string, home: string = pinecallHome()): GatewayEntry | undefined {
  return readCredentials(home).gateways[normalised(url)];
}

/**
 * The one gateway this person logged in to, when there is exactly one.
 *
 * `pinecall login <url>` once, then `pinecall run` with nothing exported: a person with a single
 * gateway should not have to say its name every time. Two gateways is a choice, and a choice is
 * PINECALL_URL's to make — this answers nothing then, rather than guessing between them.
 */
export function theOnlyGateway(home: string = pinecallHome()): string | undefined {
  const urls = Object.keys(readCredentials(home).gateways);
  return urls.length === 1 ? urls[0] : undefined;
}

/** Keep one gateway's key, the rest of the file untouched, and the file readable by nobody else. */
export function writeGateway(
  url: string,
  entry: Omit<GatewayEntry, "logged_in_at">,
  home: string = pinecallHome(),
): void {
  const kept = readCredentials(home);
  kept.gateways[normalised(url)] = { ...entry, logged_in_at: new Date().toISOString() };
  mkdirSync(home, { recursive: true, mode: DIRECTORY_MODE });
  const path = join(home, CREDENTIALS);
  writeFileSync(path, `${JSON.stringify(kept, null, 2)}\n`, { mode: FILE_MODE });
  // writeFileSync's mode applies only when it creates the file, so a file that was already there
  // keeps whatever mode it had — including one an editor widened.
  chmodSync(path, FILE_MODE);
}

/**
 * Remember which phone this person calls from, on the row for this gateway.
 *
 * A row only, never a login: `line from` is said by somebody already logged in, and rewriting the
 * key here would be a second place that decides what the key is. Nothing happens for a gateway
 * with no row — you cannot say which phone is yours at a gateway you have not signed in to.
 */
export function writeCalling(url: string, calling: string | undefined, home: string = pinecallHome()): boolean {
  const kept = readCredentials(home);
  const row = kept.gateways[normalised(url)];
  if (row === undefined) return false;
  kept.gateways[normalised(url)] = { ...row, ...(calling === undefined ? {} : { calling }) };
  if (calling === undefined) delete kept.gateways[normalised(url)]?.calling;
  mkdirSync(home, { recursive: true, mode: DIRECTORY_MODE });
  const path = join(home, CREDENTIALS);
  writeFileSync(path, `${JSON.stringify(kept, null, 2)}\n`, { mode: FILE_MODE });
  chmodSync(path, FILE_MODE);
  return true;
}

/**
 * The local gateway's own file, or nothing.
 *
 * A dev key opens a gateway that has no database and honours that one key, so this file is how a
 * terminal finds it without anybody exporting anything. It is trusted only when this account owns
 * it and nobody else can read it — otherwise it is ignored in silence, because a key another
 * account could have written is not a key, it is an invitation.
 */
export function devGateway(home: string = pinecallHome()): DevGateway | undefined {
  const path = join(home, DEV);
  if (!ours(path)) return undefined;
  const read = parsed(path);
  if (read === undefined) return undefined;
  const url = read["url"];
  const key = read["key"];
  return typeof url === "string" && typeof key === "string" ? { url, key } : undefined;
}

/** The URL as a key in the table: lowercase scheme and host, and no trailing slash. */
export function normalised(url: string): string {
  try {
    const parsedUrl = new URL(url);
    return `${parsedUrl.origin}${parsedUrl.pathname}`.replace(/\/+$/, "");
  } catch {
    return url.replace(/\/+$/, "");
  }
}

// One JSON object off disk, or nothing: a file that is not there, cannot be read or does not parse
// are the same answer to every caller here, and none of them is worth an exception.
function parsed(path: string): Record<string, unknown> | undefined {
  try {
    const read: unknown = JSON.parse(readFileSync(path, "utf8"));
    return isTable(read) ? (read as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

// Owned by this account and readable by nobody else.
function ours(path: string): boolean {
  try {
    const about = statSync(path);
    return about.uid === userInfo().uid && (about.mode & OTHERS) === 0;
  } catch {
    return false;
  }
}

function isTable(value: unknown): boolean {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
