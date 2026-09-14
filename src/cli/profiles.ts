/** ~/.pinecall/config.json: the gateways this machine knows, by name, and which one is in hand. */

import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { devGateway, normalised, pinecallHome, readCredentials } from "./credentials.js";

// The directory is a person's and the file holds keys: 0700 and 0600, as the old two were.
const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;

const CONFIG = "config.json";

/** One gateway this machine can reach: where it is, what opens it, and whose org that key names. */
export interface Profile {
  url: string;
  key: string;
  /** The org the key belongs to, as `whoami` last said it. A label, never a check. */
  org?: string;
  /** The world it opens, likewise: printed, never trusted over what the gateway says. */
  env?: string;
  /** The phone this person calls FROM, so a ring in the sandbox reaches their own agent. */
  calling?: string;
}

/** The file: every profile by name, and the one a verb uses when nobody names another. */
export interface Config {
  active?: string;
  profiles: Record<string, Profile>;
}

/**
 * Every profile this machine has, and which is active.
 *
 * There were four files and three variables answering two questions — which gateway, and which
 * key — with a precedence nobody was ever told. This is the one file. The two it replaces are
 * read ONCE, here, and written into it: `~/.pinecall/credentials`, which `pinecall login` kept a
 * row per gateway in, and `~/.pinecall/dev`, which a local gateway on a dev key left behind.
 * Neither is deleted — v1's CLI still reads the first on this same machine — and neither is read
 * again once this file exists.
 */
export function readConfig(home: string = pinecallHome()): Config {
  const config = parsedConfig(home) ?? migrated(home);
  return withTheLocalGateway(config, home);
}

/**
 * `~/.pinecall/credentials`, folded in once and written down, the first time there is no config.
 *
 * A one-time thing on purpose: after this, `config.json` is the file, and the old one is left on
 * disk untouched because v1's CLI on this same machine still reads it.
 */
function migrated(home: string): Config {
  const config: Config = { profiles: {} };
  for (const [url, row] of Object.entries(readCredentials(home).gateways)) {
    config.profiles[nameFor(url, config)] = {
      url,
      key: row.api_key,
      ...(row.org === undefined ? {} : { org: row.org }),
      ...(row.calling === undefined ? {} : { calling: row.calling }),
    };
  }
  const [only, ...rest] = Object.keys(config.profiles);
  // One gateway is not a choice: a person who logged in to exactly one should never name it.
  if (only !== undefined && rest.length === 0) config.active = only;
  if (only !== undefined) writeConfig(config, home);
  return config;
}

/**
 * The local gateway's own file, as a profile called `local`, read EVERY time and written never.
 *
 * It is not a row somebody kept: a `pinecall-runtime gateway` on a dev key writes it at every
 * start, with whichever port it opened on, and takes it away when it stops. Folding it in once
 * would pin a gateway that has since moved or gone. It is the only live source left, and it goes
 * with the dev key itself.
 */
function withTheLocalGateway(config: Config, home: string): Config {
  const dev = devGateway(home);
  if (dev === undefined) return config;
  // Under the profile that already points there when one does — refreshing its key, because the
  // gateway's own file is the newer word about which key it honours — and under a fresh name when
  // none does. It must never take a name another gateway answers to: writing `local` on top of a
  // loopback profile somebody logged in to on another port silently repoints where a verb goes,
  // which is the one thing `nameFor` exists to stop.
  const name = nameOfGateway(dev.url, config) ?? nameFor(dev.url, config);
  const already = config.profiles[name];
  const here: Profile = already === undefined ? { url: dev.url, key: dev.key } : { ...already, key: dev.key };
  return { ...config, profiles: { ...config.profiles, [name]: here }, active: config.active ?? name };
}

// What `--profile <name>` said, for this one invocation. It is read out of argv once, by the
// dispatcher, before any group sees its flags — twenty verbs each parsing the same flag is twenty
// places for it to be missing from. Set once at startup and never again: a parsed argument that
// happens to live in a module, not state anything changes while a verb runs.
let chosen: string | undefined;

/**
 * Take `--profile <name>` out of an invocation's argv, and remember it.
 *
 * Returns what is left, so the group sees only its own flags. `--profile=<name>` too, because
 * both spellings are what a person types and only one of them working is a footgun.
 */
export function withoutTheProfileFlag(argv: readonly string[]): string[] {
  const rest: string[] = [];
  for (let at = 0; at < argv.length; at += 1) {
    const word = argv[at]!;
    if (word === "--profile") {
      chosen = argv[at + 1];
      at += 1;
    } else if (word.startsWith("--profile=")) {
      chosen = word.slice("--profile=".length);
    } else {
      rest.push(word);
    }
  }
  return rest;
}

/** The profile this invocation named, when it named one. */
export function theChosenProfile(): string | undefined {
  return chosen;
}

/** The profile a verb runs on: the one named, or the active one, or nothing at all. */
export function profileFor(named: string | undefined, home: string = pinecallHome()): Profile | undefined {
  const config = readConfig(home);
  const name = named ?? config.active;
  return name === undefined ? undefined : config.profiles[name];
}

/** Which profile is in hand, for a line that says where a verb is about to go. */
export function activeName(home: string = pinecallHome()): string | undefined {
  return readConfig(home).active;
}

/** Keep one profile and make it the active one: what `pinecall login` does when it has a key. */
export function writeProfile(name: string, profile: Profile, home: string = pinecallHome()): void {
  const config = readConfig(home);
  config.profiles[name] = profile;
  config.active = name;
  writeConfig(config, home);
}

/** Make a profile that is already there the active one. False when there is no such name. */
export function activate(name: string, home: string = pinecallHome()): boolean {
  const config = readConfig(home);
  if (config.profiles[name] === undefined) return false;
  config.active = name;
  writeConfig(config, home);
  return true;
}

/** The phone this person calls FROM at the gateway in hand, so a ring reaches their own agent. */
export function callingFrom(home: string = pinecallHome()): string | undefined {
  return profileFor(theChosenProfile(), home)?.calling;
}

/** Say which phone is yours here, or take it back. False when there is no profile to write it on. */
export function callsFrom(number: string | undefined, home: string = pinecallHome()): boolean {
  const config = readConfig(home);
  const name = theChosenProfile() ?? config.active;
  if (name === undefined || config.profiles[name] === undefined) return false;
  const { calling: _was, ...rest } = config.profiles[name];
  return amend(name, number === undefined ? rest : { ...rest, calling: number }, home, true);
}

/** Change one field of a profile without touching its key: what `line from` writes. */
export function amend(
  name: string,
  fields: Partial<Profile>,
  home: string = pinecallHome(),
  whole = false,
): boolean {
  const config = readConfig(home);
  const profile = config.profiles[name];
  if (profile === undefined) return false;
  // `whole` is how a field is REMOVED: merging cannot unset one, and `line forget` has to.
  config.profiles[name] = whole ? ({ ...fields } as Profile) : { ...profile, ...fields };
  writeConfig(config, home);
  return true;
}

/**
 * What to call a profile for this gateway: the host's first label, and `local` for a loopback.
 *
 * A name is for a person to type — `pinecall use box` — so it is short and it is theirs to
 * override with `--as`. A second gateway that would take a name already spoken for gets a number,
 * because silently repointing a name is how somebody deploys to the wrong box.
 */
export function nameFor(url: string, config: Config): string {
  const wanted = defaultName(url);
  const taken = (name: string): boolean =>
    config.profiles[name] !== undefined && normalised(config.profiles[name].url) !== normalised(url);
  if (!taken(wanted)) return wanted;
  for (let at = 2; ; at += 1) {
    if (!taken(`${wanted}-${at}`)) return `${wanted}-${at}`;
  }
}

/** Whichever profile points at this gateway, by name, when one does. */
export function nameOfGateway(url: string, config: Config): string | undefined {
  const wanted = normalised(url);
  return Object.keys(config.profiles).find((name) => normalised(config.profiles[name]!.url) === wanted);
}

function defaultName(url: string): string {
  try {
    const host = new URL(url).hostname;
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") return "local";
    return host.split(".")[0] ?? host;
  } catch {
    return "gateway";
  }
}

function parsedConfig(home: string): Config | undefined {
  const read = readJson(home);
  if (read === undefined) return undefined;
  const profiles = read["profiles"];
  if (typeof profiles !== "object" || profiles === null || Array.isArray(profiles)) return undefined;
  const config: Config = { profiles: profiles as Record<string, Profile> };
  if (typeof read["active"] === "string") config.active = read["active"];
  return config;
}

// A missing file, an unreadable one and a broken one are all the same answer: nothing. A config
// nobody can parse must not stop a verb from saying it has no profile — that sentence is the fix.
function readJson(home: string): Record<string, unknown> | undefined {
  try {
    const read: unknown = JSON.parse(readFileSync(join(home, CONFIG), "utf8"));
    return typeof read === "object" && read !== null && !Array.isArray(read)
      ? (read as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

function writeConfig(config: Config, home: string): void {
  mkdirSync(home, { recursive: true, mode: DIRECTORY_MODE });
  const path = join(home, CONFIG);
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, { mode: FILE_MODE });
  // writeFileSync's mode applies only when it creates the file: one already there kept what it
  // had, including a mode an editor widened.
  chmodSync(path, FILE_MODE);
}
