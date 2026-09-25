/** ~/.pinecall/session.json: this machine signed in to a gateway, as a person — and what the sandbox's door was found to be. */

import { createHash } from "node:crypto";
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

/** One gateway this machine knows: the person's key there, the phone they call from, its sandbox. */
export interface Signed {
  /** The key `pinecall login` left for this machine, when it signed in HERE: what `link` mints from. */
  key?: string;
  /**
   * The phone this person calls FROM, so a ring in the sandbox reaches their own agent rather than
   * whoever holds the line. Said once with `pinecall line from`, and re-sent by every `pinecall
   * start` — the gateway keeps it beside its live table, not in a row.
   */
  calling?: string;
  /**
   * On production's entry: where its sandbox answers — the `elsewhere` of its /.well-known/pinecall,
   * null when it names none and is the only instance
   * — and when that was read (ms since the epoch), so a verb does not ask again for a day.
   */
  elsewhere?: { url: string | null; read_at: number };
  /**
   * On the sandbox's entry: the keys this machine was minted HERE, one per production key it
   * spent a code of — by that key's fingerprint, never the key — because two projects linked to
   * two orgs hold two production keys, and each is somebody else in the sandbox.
   */
  minted?: Record<string, string>;
}

/**
 * What the file holds. A project's key is its `.env` (`pinecall link`), and this is never read for
 * one: it is the machine's own sign-in, kept so `link` can mint a key for another org, or another
 * project, without the browser again — one row per gateway, and the last one signed in to. The
 * sandbox's door is kept here too, because it is DERIVED from the project's key and never written
 * into a project: where production says its sandbox is, and the key minted there from it.
 */
export interface Session {
  gateways: Record<string, Signed>;
  last?: string;
}

/** How a key is named in the file where it is not the key: its sha256, hex. */
function fingerprint(key: string): string {
  return createHash("sha256").update(key).digest("hex");
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
  const key = at === undefined ? undefined : session.gateways[at]?.key;
  return at === undefined || key === undefined ? undefined : { url: at, key };
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

/** Where production's sandbox answers (null: nowhere), as last read, while it was read less than `fresh` ms ago. */
export function sandboxOf(production: string, fresh: number, now: number, home: string = pinecallHome()): string | null | undefined {
  const kept = readSession(home).gateways[production]?.elsewhere;
  return kept === undefined || now - kept.read_at >= fresh ? undefined : kept.url;
}

/** Keep where production's sandbox answers and when it was read — or forget it, so the next verb asks again. */
export function keepSandbox(production: string, elsewhere: Signed["elsewhere"], home: string = pinecallHome()): void {
  const session = readSession(home);
  const { elsewhere: _was, ...rest } = session.gateways[production] ?? {};
  session.gateways[production] = elsewhere === undefined ? rest : { ...rest, elsewhere };
  writeSession(session, home);
}

/** The key this machine was minted at the sandbox for the person that production key names. */
export function mintedFor(sandbox: string, production: string, home: string = pinecallHome()): string | undefined {
  return readSession(home).gateways[sandbox]?.minted?.[fingerprint(production)];
}

/** Keep, or forget, the sandbox's key minted from that production key. */
export function keepMinted(sandbox: string, production: string, key: string | undefined, home: string = pinecallHome()): void {
  const session = readSession(home);
  const signed = session.gateways[sandbox] ?? {};
  const { [fingerprint(production)]: _was, ...others } = signed.minted ?? {};
  session.gateways[sandbox] = { ...signed, minted: key === undefined ? others : { ...others, [fingerprint(production)]: key } };
  writeSession(session, home);
}

function writeSession(session: Session, home: string): void {
  mkdirSync(home, { recursive: true, mode: DIRECTORY_MODE });
  const file = join(home, SESSION);
  writeFileSync(file, `${JSON.stringify(session, null, 2)}\n`, { mode: FILE_MODE });
  // writeFileSync's mode applies only to a file it creates: one that was there keeps its own.
  chmodSync(file, FILE_MODE);
}
