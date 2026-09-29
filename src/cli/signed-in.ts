/** ~/.pinecall/session.json: this machine's sign-in per gateway, and the cached sandbox location and keys. */

import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// Owner-only: other accounts on the machine can neither list the directory nor read the file.
const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;
const SESSION = "session.json";

/** The session directory: `PINECALL_HOME`, else ~/.pinecall. */
export function pinecallHome(env: NodeJS.ProcessEnv = process.env): string {
  return env["PINECALL_HOME"] ?? join(homedir(), ".pinecall");
}

/** What this machine keeps for one gateway. */
export interface Signed {
  /** The key from `pinecall login` on this gateway; `link` mints project keys from it. */
  key?: string;
  /**
   * The person's own phone number (`pinecall line from`), so a sandbox ring from it reaches their
   * agent. Re-sent by every `pinecall start`; the gateway does not persist it.
   */
  calling?: string;
  /**
   * Production only: the sandbox URL from its /.well-known/pinecall `elsewhere` (null when none),
   * and when it was read (epoch ms), cached for a day.
   */
  elsewhere?: { url: string | null; read_at: number };
  /**
   * Sandbox only: keys minted here, indexed by the sha256 of the production key they came from
   * (never the key itself). Projects linked to different orgs each get their own.
   */
  minted?: Record<string, string>;
}

/**
 * The machine's sign-in, one entry per gateway plus the last one used. A project's key lives in its
 * `.env`, never here; this lets `link` mint keys without the browser, and caches sandbox keys that
 * are derived from a project's key and so are never written into the project.
 */
export interface Session {
  gateways: Record<string, Signed>;
  last?: string;
}

/** Hex sha256 of a key, used where the key itself must not be stored. */
function fingerprint(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/** Read the session, or an empty one when there is no file. */
export function readSession(home: string = pinecallHome()): Session {
  try {
    const parsed = JSON.parse(readFileSync(join(home, SESSION), "utf8")) as Partial<Session>;
    return { gateways: parsed.gateways ?? {}, ...(parsed.last === undefined ? {} : { last: parsed.last }) };
  } catch {
    return { gateways: {} };
  }
}

/** Store the key for a gateway and make it the last one used. */
export function signIn(url: string, key: string, home: string = pinecallHome()): void {
  const session = readSession(home);
  const kept = session.gateways[url];
  session.gateways[url] = { ...kept, key };
  session.last = url;
  writeSession(session, home);
}

/** The signed-in gateway and key: the one named, else the last one used. */
export function signedIn(url: string | undefined, home: string = pinecallHome()): { url: string; key: string } | undefined {
  const session = readSession(home);
  const at = url ?? session.last;
  const key = at === undefined ? undefined : session.gateways[at]?.key;
  return at === undefined || key === undefined ? undefined : { url: at, key };
}

/** The phone number set by `pinecall line from` for this gateway. */
export function callingFrom(url: string, home: string = pinecallHome()): string | undefined {
  return readSession(home).gateways[url]?.calling;
}

/** Set or clear the caller phone number; a no-op for a gateway never signed in to. */
export function keepCalling(url: string, number: string | undefined, home: string = pinecallHome()): void {
  const session = readSession(home);
  const signed = session.gateways[url];
  if (signed === undefined) return;
  const { calling: _was, ...rest } = signed;
  session.gateways[url] = number === undefined ? rest : { ...rest, calling: number };
  writeSession(session, home);
}

/** The cached sandbox URL (null: none), or undefined when older than `fresh` ms. */
export function sandboxOf(production: string, fresh: number, now: number, home: string = pinecallHome()): string | null | undefined {
  const kept = readSession(home).gateways[production]?.elsewhere;
  return kept === undefined || now - kept.read_at >= fresh ? undefined : kept.url;
}

/** Cache the sandbox location, or clear it with undefined. */
export function keepSandbox(production: string, elsewhere: Signed["elsewhere"], home: string = pinecallHome()): void {
  const session = readSession(home);
  const { elsewhere: _was, ...rest } = session.gateways[production] ?? {};
  session.gateways[production] = elsewhere === undefined ? rest : { ...rest, elsewhere };
  writeSession(session, home);
}

/** The sandbox key minted from a production key. */
export function mintedFor(sandbox: string, production: string, home: string = pinecallHome()): string | undefined {
  return readSession(home).gateways[sandbox]?.minted?.[fingerprint(production)];
}

/** Store or clear the sandbox key minted from a production key. */
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
  // writeFileSync's mode applies only on create.
  chmodSync(file, FILE_MODE);
}
