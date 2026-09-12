#!/usr/bin/env node
/** `pinecall <group> [args]`: the tenant's CLI. One module per group, one purpose line each. */

import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { helpFor, PLANNED, plannedGroup, type Group } from "./groups.js";

// The order this table is written is the order the help prints: run and chat first, because
// they are what a person types on the first day, and the planned groups after, in the design's
// order. run is rails server and chat is rails console — see docs/decisions/tenant-cli.md.
const BUILT = ["run", "chat", "prompt", "test", "simulate", "eval", "sessions", "runs", "pipeline", "line", "personas", "knowledge", "memory", "remember", "supervise", "keys", "providers", "callbacks", "signup", "login", "whoami"] as const;

/** Everything `pinecall` answers to, built and planned alike, in the order help prints them. */
export function groupNames(): string[] {
  return [...BUILT, ...Object.keys(PLANNED)];
}

/** The ones that are written: what a person may actually run, and what owes a help page. */
export function builtNames(): string[] {
  return [...BUILT];
}

/**
 * Run one invocation. The group owns its own flags — this file only picks which module reads them,
 * so a new group is one import and one line, never a branch inside a growing parser.
 */
export async function main(
  argv: string[],
  out: NodeJS.WritableStream = process.stdout,
  err: NodeJS.WritableStream = process.stderr,
): Promise<number> {
  const [name, ...rest] = argv;
  if (name === undefined || name === "--help" || name === "-h" || name === "help") {
    out.write(usage());
    return name === undefined ? 2 : 0;
  }
  const group = await groupFor(name, out);
  if (group === undefined) {
    err.write(`pinecall: no such group: ${name}\n\n${usage()}`);
    return 2;
  }
  // A group's flags are the group's own, so its help is too: the dispatcher only knows to ask.
  if (rest[0] === "--help" || rest[0] === "-h") {
    out.write(helpFor(name, group));
    return 0;
  }
  // What a verb throws is an answer, not a crash: a gateway that refused the socket, a key the org
  // does not have, an app file that does not compile. One line with the message, and the exit code
  // says it failed — a node stack trace on stderr tells the person nothing they can act on. The
  // message is read here rather than through the sdk's `asError`, so that importing this file
  // still costs no websocket client: `pinecall prompt` must pay for nothing it does not use.
  try {
    return await group.run(rest);
  } catch (failed) {
    err.write(`pinecall: ${failed instanceof Error ? failed.message : String(failed)}\n`);
    return 1;
  }
}

// A built group is imported only when it is asked for: `pinecall prompt` must not pay for the
// websocket client that `run` needs, and a stub must not pay for anything at all.
export async function groupFor(name: string, out: NodeJS.WritableStream = process.stdout): Promise<Group | undefined> {
  if (name === "run") return (await import("./run.js")).group;
  if (name === "chat") return (await import("./chat.js")).group;
  if (name === "prompt") return (await import("./prompt.js")).group;
  if (name === "test") return (await import("./test.js")).group;
  if (name === "simulate") return (await import("./simulate.js")).group;
  if (name === "eval") return (await import("./eval.js")).group;
  if (name === "runs") return (await import("./runs/index.js")).group;
  if (name === "pipeline") return (await import("./pipeline.js")).group;
  if (name === "line") return (await import("./line.js")).group;
  if (name === "personas") return (await import("./personas.js")).group;
  if (name === "knowledge") return (await import("./knowledge.js")).group;
  if (name === "memory") return (await import("./memory.js")).group;
  if (name === "remember") return (await import("./remember.js")).group;
  if (name === "supervise") return (await import("./supervise.js")).group;
  if (name === "sessions") return (await import("./sessions.js")).group;
  if (name === "keys") return (await import("./keys.js")).group;
  if (name === "providers") return (await import("./providers.js")).group;
  if (name === "callbacks") return (await import("./callbacks.js")).group;
  if (name === "signup") return (await import("./signup.js")).group;
  if (name === "login") return (await import("./login.js")).group;
  if (name === "whoami") return (await import("./whoami.js")).group;
  const planned = PLANNED[name];
  return planned === undefined ? undefined : plannedGroup(name, planned, out);
}

/** The whole CLI on one screen: a CLI this small can show every group rather than one usage line. */
export function usage(): string {
  const lines = [
    "usage: pinecall <group> [args]",
    "",
    "  run       the app and its doors: the process you deploy",
    "  chat      the app in this terminal's own process, and a prompt against it",
    "  ui        the console on 127.0.0.1: talk, calls and logs as they happen, sessions, evals",
    "  prompt    the exact prompt a state would produce, offline",
    "  test      ring 1: the goldens, through the app in this terminal's own process",
    "  simulate  one persona calls the agent, live, with the checks resolving as they land",
    "  eval      ring 3: one real call, re-evaluated by the runtime's code checks",
    "  sessions  list | show a call's log, with what it cost and how it was judged",
    "  runs      list | show | diff the suites, promote a call, and watch the drift",
    "  pipeline  what the agent hears, decides and speaks with, and the knobs over it",
    "  personas  list | show | try the synthetic callers in test/personas",
    "  knowledge push | list | drop the knowledge base the agent answers from",
    "  memory    what memory kept about a contact, forget it, and hold recall to a golden",
    "  remember  the goldens memory.remember is held to: what a call teaches, and what it never keeps",
    "  supervise listen in on a live call: whisper, say, take the line, give it back, end",
    "  keys      issue | list | revoke the API keys this org's machines run on",
    "  providers add | rm | list the provider keys this org brought of its own",
    "  callbacks the numbers people left when every seat was taken: who to call back",
    "  signup    make an org on Pinecall's cloud and keep its first key",
    "  login     sign in to a gateway once; the key is kept in ~/.pinecall/credentials",
    "  whoami    which gateway, which org, which world, and where this terminal's key came from",
    "",
  ];
  for (const [name, purpose] of Object.entries(PLANNED)) {
    lines.push(`  ${name.padEnd(10)}${purpose} — not built yet`);
  }
  return `${lines.join("\n")}\n`;
}

/**
 * Is this file the process? argv[1] is whatever the shell typed — and for `pinecall` that is the
 * bin link a package manager wrote inside node_modules, a symlink into the package, while
 * import.meta.url is the real file it points at. Comparing the two as strings said no, and the CLI
 * exited 0 having done nothing at all. Both sides are resolved before they are compared.
 */
function isEntry(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(entry)).href;
  } catch {
    return false;
  }
}

// Only when this file is the process, so a test may import main() without the process exiting.
if (isEntry()) {
  process.exitCode = await main(process.argv.slice(2));
}
