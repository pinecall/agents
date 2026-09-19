/** ~/.pinecall/session.json: this machine signed in to a gateway, as a person — what `link` mints from. */

import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// The directory is a person's, not a machine's: 0700 so another account on the same box cannot
// list it, and 0600 on the file so it cannot read one whose name it guessed.
const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;
const SESSION = "session.json";

/** The directory the session lives in: ~/.pinecall, or the one PINECALL_HOME names instead. */
export function pinecallHome(env: NodeJS.ProcessEnv = process.env): string {
  return env["PINECALL_HOME"] ?? join(homedir(), ".pinecall");
}

/** One gateway this machine is signed in to: the person's key there, and the phone they call from. */
export interface Signed {
  key: string;
  /**
   * The phone this person calls FROM, so a ring in the sandbox reaches their own agent rather than
   * whoever holds the line. Said once with `pinecall line from`, and re-sent by every `pinecall
   * start` — the gateway keeps it beside its live table, not in a row.
   */
  calling?: string;
}

/**
 * What the file holds. A PROJECT never reads it: a project's key is its `.env` (`pinecall link`).
 * This is the machine's own sign-in, kept so `link` can mint a key for another org, or another
 * project, without the browser again — one row per gateway, and the last one signed in to.
 */
export interface Session {
  gateways: Record<string, Signed>;
  last?: string;
}

/** The session as it is on disk, or an empty one on a machine that never signed in. */
export function readSession(home: string = pinecallHome()): Session {
  try {
    const parsed = JSON.parse(readFileSync(join(home, SESSION), "utf8")) as Partial<Session>;
    return { gateways: parsed.gateways ?? {}, ...(parsed.last === undefined ? {} : { last: parsed.last }) };
  } catch {
    return { gateways: {} };
  }
}

/** Keep this machine signed in to that gateway, and make it the one `link` asks first. */
export function signIn(url: string, key: string, home: string = pinecallHome()): void {
  const session = readSession(home);
  const kept = session.gateways[url];
  session.gateways[url] = { ...kept, key };
  session.last = url;
  writeSession(session, home);
}

/** The gateway `link` mints from: the one named, else the last this machine signed in to. */
export function signedIn(url: string | undefined, home: string = pinecallHome()): { url: string; key: string } | undefined {
  const session = readSession(home);
  const at = url ?? session.last;
  const signed = at === undefined ? undefined : session.gateways[at];
  return at === undefined || signed === undefined ? undefined : { url: at, key: signed.key };
}

/** The phone `pinecall line from` said for this gateway, re-sent by every start. */
export function callingFrom(url: string, home: string = pinecallHome()): string | undefined {
  return readSession(home).gateways[url]?.calling;
}

/** Keep, or forget, the phone this person calls this gateway from. A gateway never signed in to keeps nothing. */
export function keepCalling(url: string, number: string | undefined, home: string = pinecallHome()): void {
  const session = readSession(home);
  const signed = session.gateways[url];
  if (signed === undefined) return;
  const { calling: _was, ...rest } = signed;
  session.gateways[url] = number === undefined ? rest : { ...rest, calling: number };
  writeSession(session, home);
}

function writeSession(session: Session, home: string): void {
  mkdirSync(home, { recursive: true, mode: DIRECTORY_MODE });
  const file = join(home, SESSION);
  writeFileSync(file, `${JSON.stringify(session, null, 2)}\n`, { mode: FILE_MODE });
  // writeFileSync's mode applies only to a file it creates: one that was there keeps its own.
  chmodSync(file, FILE_MODE);
}
