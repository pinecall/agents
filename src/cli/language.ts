/** Which language an agent is written in, and the command that starts its serve entry. */

import { existsSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { cannotRun } from "./cannot-run.js";
import type { Door } from "./testing/gateway.js";

/** Accepted agent file names, in lookup order; the first that exists in a folder wins. */
export const AGENT_FILES = ["agent.tsx", "agent.ts", "agent.rb", "agent.py"] as const;

/** A language an agent may be written in. */
export type Language = "typescript" | "ruby" | "python";

/** The serve entry's two verbs. */
export type Verb = "start" | "prompt";

// `serve/index.ts` in a checkout, `serve/index.js` in dist: follows this module's own extension.
const SERVE = fileURLToPath(new URL(`../serve/index${extname(fileURLToPath(import.meta.url))}`, import.meta.url));

const NO_PYTHON = "a Python agent is not served by this CLI yet";

const RUBY_INSPECTS_NOTHING = "--inspect attaches a Node debugger, and a Ruby agent runs no Node";

/** What one serve entry is started with: the command, and the environment it reads its door from. */
export interface Started {
  command: string[];
  env: Record<string, string | undefined>;
}

/** How a start is asked for beyond its verb's own flags. */
export interface Starting {
  /** The project root: a Ruby project's Gemfile is looked for there. */
  root: string;
  /** Node's `--inspect…` flags, passed on to a TypeScript entry as they were typed. */
  inspect?: string[];
}

/** The language of an agent file, by its name. */
export function languageOf(file: string): Language {
  const name = basename(file);
  if (name === "agent.rb") return "ruby";
  if (name === "agent.py") return "python";
  return "typescript";
}

/**
 * The serve entry of the file's language, for one verb, with the door in its environment and
 * never in its argv: an argv is read by every process on the machine.
 */
export function startedWith(door: Door | undefined, file: string, verb: Verb, args: string[], how: Starting): Started {
  return { command: commandFor(languageOf(file), verb, args, how), env: envFor(door) };
}

/** One agent of the project, as the serve entry is told about it. */
export interface AgentOfTheProject {
  file: string;
  /** Its folder's name: the slug it registers as. */
  name: string;
  root: string;
}

/**
 * The serve entry holding one agent, its lines on stdout: a console's process, which takes no call
 * it did not open, unless the calls it serves arrive naming no app (a spoken one, from a worker).
 */
export function servingOne(door: Door, agent: AgentOfTheProject, how: { console: boolean; inspect?: string[] }): Started {
  const args = ["--file", agent.file, "--slug", agent.name, ...(how.console ? ["--console"] : []), "--events"];
  return startedWith(door, agent.file, "start", args, { root: agent.root, ...(how.inspect === undefined ? {} : { inspect: how.inspect }) });
}

/** The command that runs a verb of a language's serve entry. */
export function commandFor(language: Language, verb: Verb, args: string[], how: Starting): string[] {
  const inspect = how.inspect ?? [];
  if (language === "python") throw cannotRun(NO_PYTHON);
  if (language === "ruby") {
    if (inspect.length > 0) throw cannotRun(RUBY_INSPECTS_NOTHING);
    const ruby = ["ruby", "-r", "pinecall", "-e", "exit Pinecall::Serve.main(ARGV)", "--", verb, ...args];
    return existsSync(join(how.root, "Gemfile")) ? ["bundle", "exec", ...ruby] : ruby;
  }
  return [process.execPath, ...inspect, ...theLoaderFor(SERVE), SERVE, verb, ...args];
}

/** Node flags to run a TypeScript entry from a checkout: tsx; none for a built one. */
export function theLoaderFor(entry: string): string[] {
  return extname(entry) === ".ts" ? ["--import", "tsx"] : [];
}

// An offline verb is given no door, and the entry reads none.
function envFor(door: Door | undefined): Record<string, string | undefined> {
  if (door === undefined) return { ...process.env };
  return { ...process.env, PINECALL_URL: door.url, PINECALL_KEY: door.apiKey, PINECALL_ENV: door.world };
}

/** Node's `--inspect`, `--inspect=host:port`, `--inspect-brk[=…]` taken out of a verb's argv as typed. */
export function inspectOf(argv: string[]): { inspect: string[]; rest: string[] } {
  const asked = (flag: string): boolean => /^--inspect(-brk)?(=.+)?$/.test(flag);
  return { inspect: argv.filter(asked), rest: argv.filter((flag) => !asked(flag)) };
}
