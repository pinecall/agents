/** ~/.pinecall/config.json: the gateways this machine knows, by name, and which one is in hand. */

import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { normalised, pinecallHome, readCredentials } from "./credentials.js";

// The directory is a person's and the file holds keys: 0700 and 0600, as the old two were.
const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;

const CONFIG = "config.json";

/** The two worlds of an org, as a profile names them. */
export type World = "sandbox" | "production";

/** The same person's key in each world of one org, as the login minted them. */
export type Keys = Partial<Record<World, string>>;

/** One org on one gateway: where it is, the keys that open it, and which world is in hand. */
export interface Profile {
  url: string;
  /** The key every verb uses: the one of the world `env` names. */
  key: string;
  /** Both worlds' keys, so moving between them is `pinecall use` and never a second login. */
  keys?: Keys;
  /** The org the key belongs to, as `whoami` last said it. A label, never a check. */
  org?: string;
  /** The world it opens, likewise: printed, never trusted over what the gateway says. */
  env?: string;
  /** The phone this person calls FROM, so a ring in the sandbox reaches their own agent. */
  calling?: string;
}

/** The file: every profile by name, the one a verb uses when nobody names another, and the gateway this machine was pointed at. */
export interface Config {
  active?: string;
  /** Where `pinecall login` goes when nobody names a URL: `pinecall gateway <url>` writes it. */
  gateway?: string;
  profiles: Record<string, Profile>;
}

/**
 * Every profile this machine has, and which is active.
 *
 * There were four files and three variables answering two questions — which gateway, and which
 * key — with a precedence nobody was ever told. This is the one file. The one it replaces is
 * read ONCE, here, and written into it: `~/.pinecall/credentials`, which `pinecall login` kept a
 * row per gateway in. It is not deleted — v1's CLI still reads it on this same machine — and it is
 * not read again once this file exists. The third source, `~/.pinecall/dev`, went with the dev key
 * that wrote it: a local gateway runs the same Postgres and the same issued keys a box does.
 */
export function readConfig(home: string = pinecallHome()): Config {
  return parsedConfig(home) ?? migrated(home);
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

// What `--profile <name>` said, for this one invocation. It is read out of argv once, by the
// dispatcher, before any group sees its flags — twenty verbs each parsing the same flag is twenty
// places for it to be missing from. Set once at startup and never again: a parsed argument that
// happens to live in a module, not state anything changes while a verb runs.
let chosen: string | undefined;
let production = false;

/**
 * Take `--profile <name>` and `--prod` out of an invocation's argv, and remember them.
 *
 * Returns what is left, so the group sees only its own flags. `--profile=<name>` too, because
 * both spellings are what a person types and only one of them working is a footgun.
 */
export function withoutTheProfileFlag(argv: readonly string[]): string[] {
  const rest: string[] = [];
  production = false;
  for (let at = 0; at < argv.length; at += 1) {
    const word = argv[at]!;
    if (word === "--prod") {
      production = true;
    } else if (word === "--profile") {
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

/** Production when this invocation said `--prod`: one command looks there, and nothing is kept. */
export function theChosenWorld(): World | undefined {
  return production ? "production" : undefined;
}

/** The profile this invocation named, when it named one. */
export function theChosenProfile(): string | undefined {
  return chosen;
}

/** The org a project says it belongs to, and the package.json that says it. */
export interface ProjectOrg {
  org: string;
  file: string;
}

/**
 * The org the nearest package.json names under `"pinecall": { "org": "<slug>" }`, walking up from
 * `from`. A package.json that names none is passed over, so a package inside a project still
 * belongs to the project's org.
 *
 * Four checkouts of four orgs used to share ONE active profile: a person moved between them with
 * `pinecall use`, and the day they forgot, a verb ran in the org of the last project they were in.
 * The project saying its org is what makes the directory the answer.
 */
export function projectOrg(from: string = process.cwd()): ProjectOrg | undefined {
  for (let dir = from; ; dir = dirname(dir)) {
    const file = join(dir, "package.json");
    if (existsSync(file)) {
      const org = orgIn(file);
      if (org !== undefined) return { org, file };
    }
    if (dirname(dir) === dir) return undefined;
  }
}

function orgIn(file: string): string | undefined {
  try {
    const said = JSON.parse(readFileSync(file, "utf8")) as { pinecall?: { org?: unknown } };
    const org = said.pinecall?.org;
    return typeof org === "string" && org !== "" ? org : undefined;
  } catch {
    return undefined;
  }
}

/** Which profile a verb runs on, and the project that decided it when one did. */
export interface Choice {
  name: string | undefined;
  project?: ProjectOrg;
}

/**
 * The profile `--profile` named; else the one of the org this project names, and none at all when
 * this machine holds no profile of it — never the active one, which is another org's; else the
 * active one. Among several profiles of that org (one per gateway), the one named after it: the
 * login names the first by its bare slug.
 */
export function choose(named: string | undefined, config: Config, from: string = process.cwd()): Choice {
  if (named !== undefined) return { name: named };
  const project = projectOrg(from);
  if (project === undefined) return { name: config.active };
  const theirs = Object.keys(config.profiles).filter((name) => config.profiles[name]!.org === project.org || name === project.org);
  const name = theirs.includes(project.org) ? project.org : theirs.sort()[0];
  return { name, project };
}

/** The profile a verb runs on: the one named, the project's org's, or the active one, or nothing at all. */
export function profileFor(named: string | undefined, home: string = pinecallHome(), from: string = process.cwd()): Profile | undefined {
  const config = readConfig(home);
  const { name } = choose(named, config, from);
  return name === undefined ? undefined : config.profiles[name];
}

/** The gateway this machine was pointed at, or nothing — and then it is the cloud's. */
export function chosenGateway(home: string = pinecallHome()): string | undefined {
  return readConfig(home).gateway;
}

/** Point this machine at a gateway, so `pinecall login` and every verb with no key go there. */
export function chooseGateway(url: string, home: string = pinecallHome()): void {
  writeConfig({ ...readConfig(home), gateway: url }, home);
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

/**
 * Move a profile to one of its worlds, with the key the login already minted for it.
 *
 * A person holds a key in each world of an org, and used to hold only the sandbox one: looking at
 * production from a terminal meant a second profile nobody knew how to make.
 */
export function inWorld(name: string, world: World, home: string = pinecallHome()): "moved" | "unknown" | "nokey" {
  const config = readConfig(home);
  const profile = config.profiles[name];
  if (profile === undefined) return "unknown";
  const key = profile.keys?.[world];
  if (key === undefined) return "nokey";
  config.profiles[name] = { ...profile, key, env: world };
  config.active = name;
  writeConfig(config, home);
  return "moved";
}

/** A name for an org's profile: its slug, and the gateway's host beside it when another gateway took the slug. */
export function nameForOrg(slug: string, url: string, config: Config): string {
  const held = config.profiles[slug];
  if (held === undefined || normalised(held.url) === normalised(url)) return slug;
  return `${slug}@${new URL(url).host}`;
}

/**
 * Forget a gateway. False when there is no such name, so a typo is never silence.
 *
 * A profile is a key in a file, and a key that opens nothing is worse than none: somebody will
 * trust it tomorrow and read the refusal as the gateway's fault. This is the only way to take one
 * out, and it takes the active mark with it rather than leaving it pointing at a row that is gone.
 */
export function forget(name: string, home: string = pinecallHome()): boolean {
  const config = readConfig(home);
  if (config.profiles[name] === undefined) return false;
  const { [name]: _gone, ...left } = config.profiles;
  const active = config.active === name ? undefined : config.active;
  // The gateway this machine is pointed at is not a profile's: it stays.
  writeConfig({ ...(active === undefined ? {} : { active }), ...(config.gateway === undefined ? {} : { gateway: config.gateway }), profiles: left }, home);
  return true;
}

/** The phone this person calls FROM at the gateway in hand, so a ring reaches their own agent. */
export function callingFrom(home: string = pinecallHome()): string | undefined {
  return profileFor(theChosenProfile(), home)?.calling;
}

/** Say which phone is yours here, or take it back. False when there is no profile to write it on. */
export function callsFrom(number: string | undefined, home: string = pinecallHome()): boolean {
  const config = readConfig(home);
  const { name } = choose(theChosenProfile(), config);
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
  if (typeof read["gateway"] === "string") config.gateway = read["gateway"];
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
