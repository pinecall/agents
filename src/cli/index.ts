#!/usr/bin/env node
/** `pinecall <group> [args]`: the tenant's CLI. One module per group, one purpose line each. */

import { CannotRun } from "./cannot-run.js";
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { helpFor, PLANNED, plannedGroup, type Group } from "./groups.js";
import { inTheWorld, withoutTheWorldFlag } from "./world.js";

// The order this table is written is the order the help prints: link, start and chat first,
// because they are what a person types on the first day, and the planned groups after, in the
// design's order. start is rails server and chat is rails console — see docs/decisions/tenant-cli.md.
const BUILT = ["link", "start", "console", "chat", "prompt", "test", "simulate", "eval", "sessions", "runs", "agent", "lexicon", "pipeline", "line", "numbers", "personas", "docs", "memory", "remember", "supervise", "providers", "voices", "callbacks", "login", "whoami"] as const;

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
  // `--prod` belongs to no group: it says which world this one command runs in, and every group
  // would otherwise have to parse it. Out of argv here, before anybody sees it.
  const { argv: named, world } = withoutTheWorldFlag(argv);
  const [name, ...rest] = named;
  if (name === undefined || name === "--help" || name === "-h" || name === "help") {
    out.write(usage());
    return name === undefined ? 2 : 0;
  }
  const group = await groupFor(name, out);
  if (group === undefined) {
    err.write(`pinecall: no such group: ${name}\n\n${usage()}`);
    return 2;
  }
  // `--prod` on a verb that talks to nobody was taken and ignored, which reads as production
  // having been asked for. A verb that reaches no gateway says so instead.
  if (world !== undefined && group.offline === true) {
    err.write(`pinecall: ${name} reaches no gateway, so --prod names nothing it could ask\n`);
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
    return await inTheWorld(world, async () => await group.run(rest));
  } catch (failed) {
    err.write(`pinecall: ${saidBy(failed, name)}\n`);
    // 2 is "this command cannot run": a name nobody wrote, a project of several agents with none
    // named, a golden with no such case. Retrying it changes nothing, and a script reads the
    // difference. Everything else is 1: something was measured and did not hold, or the gateway
    // refused what was asked.
    return failed instanceof CannotRun || isAnUnknownFlag(failed) ? 2 : 1;
  }
}

// A built group is imported only when it is asked for: `pinecall prompt` must not pay for the
// websocket client that `start` needs, and a stub must not pay for anything at all.
export async function groupFor(name: string, out: NodeJS.WritableStream = process.stdout): Promise<Group | undefined> {
  if (name === "link") return (await import("./linking.js")).group;
  if (name === "start") return (await import("./start.js")).group;
  if (name === "console") return (await import("./console.js")).group;
  if (name === "chat") return (await import("./chat.js")).group;
  if (name === "prompt") return (await import("./prompt.js")).group;
  if (name === "test") return (await import("./test.js")).group;
  if (name === "simulate") return (await import("./simulate.js")).group;
  if (name === "eval") return (await import("./eval.js")).group;
  if (name === "runs") return (await import("./runs/index.js")).group;
  if (name === "agent") return (await import("./agent.js")).group;
  if (name === "lexicon") return (await import("./lexicon.js")).group;
  if (name === "pipeline") return (await import("./pipeline.js")).group;
  if (name === "line") return (await import("./line.js")).group;
  if (name === "personas") return (await import("./personas.js")).group;
  if (name === "docs") return (await import("./docs.js")).group;
  if (name === "memory") return (await import("./memory.js")).group;
  if (name === "remember") return (await import("./remember.js")).group;
  if (name === "supervise") return (await import("./supervise.js")).group;
  if (name === "sessions") return (await import("./sessions.js")).group;
  if (name === "numbers") return (await import("./numbers.js")).group;
  if (name === "providers") return (await import("./providers.js")).group;
  if (name === "voices") return (await import("./voices.js")).group;
  if (name === "callbacks") return (await import("./callbacks.js")).group;
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
    "  link      this project's folder to one of your orgs: your key, in its .env",
    "  start     the app and its doors: the process you deploy (--prod for production)",
    "  console   the box's console in a browser, signed in: the sandbox's, --prod for production",
    "  chat      the app in this terminal's own process, and a prompt against it",
    "  prompt    the exact prompt a state would produce, offline",
    "  test      ring 1: the goldens, through the app in this terminal's own process",
    "  simulate  one persona calls the agent, live, with the checks resolving as they land",
    "  eval      ring 3: one real call, re-evaluated by the runtime's code checks",
    "  sessions  list | show a call's log, with what it cost and how it was judged",
    "  runs      list | show | diff the suites, promote a call, and watch the drift",
    "  agent     the agent's settings — yours, the team's, production's — set, knowledge, history, rollback",
    "  lexicon   the org's words: how the voice says them and what the ears must know",
    "  pipeline  what the agent hears, decides and speaks with, and the knobs over it",
    "  line      which phone is yours, and whose terminal anybody else's call rings in",
    "  numbers   list | import | move | drop the numbers the org answers at",
    "  personas  list | show | add | edit | rm | try the org's synthetic callers",
    "  docs      the documents the agent searches: push | list | drop | eval | attach",
    "  memory    what memory kept about a contact, forget it, and hold recall to a golden",
    "  remember  the goldens memory.remember is held to: what a call teaches, and what it never keeps",
    "  supervise listen in on a live call: whisper, say, take the line, give it back, end",
    "  providers add | rm | list the provider keys this org brought of its own",
    "  voices    a vendor's voices in a language, and play one here before you choose it",
    "  callbacks the numbers people left when every seat was taken: who to call back",
    "  login     sign this machine in through a browser; `link` asks for it when it is needed",
    "  whoami    which gateway, which org, whether you act in production, and where the key came from",
    "",
    "  --prod on any verb runs it in production, if your org lets you act there.",
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

// What a thrown refusal SAYS. Node's own `parseArgs` throws for a flag nobody wrote, and its
// sentence names `--` and positional arguments — a paragraph about node, where a person wants the
// verb's own usage. Everything else says what it says.
function saidBy(failed: unknown, verb: string): string {
  const said = failed instanceof Error ? failed.message : String(failed);
  if (!isAnUnknownFlag(failed)) return said;
  const named = said.split(".")[0]!.replace("Unknown option", `no such flag for ${verb}:`);
  return `${named} — \`pinecall ${verb} --help\``;
}

// Node's own code for it, so the reading and the exit code agree on what happened.
function isAnUnknownFlag(failed: unknown): boolean {
  return failed instanceof Error && (failed as NodeJS.ErrnoException).code === "ERR_PARSE_ARGS_UNKNOWN_OPTION";
}

// `pinecall runs list | head` closes the pipe after ten lines, and a write into a closed pipe is
// an EPIPE — which node, with nobody listening, prints as a stack trace over the output a person
// was reading. A reader that stopped reading is not an error: the verb is done, and the exit code
// says so. Every other error on stdout is still thrown.
function quietWhenThePipeCloses(stream: NodeJS.WriteStream): void {
  stream.on("error", (failed: NodeJS.ErrnoException) => {
    if (failed.code !== "EPIPE") throw failed;
    process.exit(0);
  });
}

// Only when this file is the process, so a test may import main() without the process exiting.
if (isEntry()) {
  quietWhenThePipeCloses(process.stdout);
  quietWhenThePipeCloses(process.stderr);
  process.exitCode = await main(process.argv.slice(2));
}
