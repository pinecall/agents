/** `pinecall knowledge push | list | drop`: the base the agent answers from, pushed by name to the gateway. */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { parseArgs } from "node:util";

import type { KnowledgeFile, KnowledgeList, KnowledgePushed } from "@pinecall/protocol";

import { slugOf } from "../runtime/connect.js";
import { theDoor } from "./env.js";
import type { Group } from "./groups.js";
import { DEFAULT_AGENT, load } from "./load.js";
import { asked, type Door } from "./testing/gateway.js";
import { refusal } from "./whoami.js";

const USAGE = `usage: pinecall knowledge push [dir] [--base <name>] [--agent agent.ts]
       pinecall knowledge list
       pinecall knowledge drop <base>`;

// Where a tenant keeps what is retrieved per turn, beside the agent file: the layout every
// example has, and the one `docs = "<base>"` on the class was pushed from.
const DEFAULT_DIR = "knowledge/docs";

export const group: Group = {
  purpose: "push | list | drop the knowledge base the agent answers from",
  usage: `${USAGE}

  push reads every *.md under the directory (./knowledge/docs beside the agent file when none
  is named) and sends the folder whole to PUT /v1/knowledge/<base>: the base is replaced, never
  merged. The base is the agent's slug unless --base says otherwise, and the class names it with
  \`docs = "<base>"\`. list prints every base this org has pushed; drop removes one.`,
  run,
};

/** What the verb can be told besides the argv: where to print, and which environment. Tests only. */
export interface Pushing {
  out?: NodeJS.WritableStream;
  err?: NodeJS.WritableStream;
  env?: NodeJS.ProcessEnv;
}

/** Read the sub-verb and do it: the folder to the gateway, the list off it, or one base gone. */
export async function run(argv: string[], how: Pushing = {}): Promise<number> {
  const out = how.out ?? process.stdout;
  const err = how.err ?? process.stderr;
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { base: { type: "string" }, agent: { type: "string", default: DEFAULT_AGENT } },
  });
  const [verb, ...rest] = positionals;
  const door = theDoor(how.env ?? process.env, err);
  if (door === undefined) return 2;
  try {
    if (verb === "push") return await push(door, rest[0], values.base, values.agent, out, err);
    if (verb === "list") return await list(door, out);
    if (verb === "drop" && rest[0] !== undefined) return await drop(door, rest[0], out);
  } catch (refused) {
    // The gateway's own sentence, as it was said: "this gateway keeps no knowledge: it runs on
    // a dev key" names the fix, and nothing here knows better.
    err.write(`${refusal(refused)}\n`);
    return 1;
  }
  err.write(`${USAGE}\n`);
  return 2;
}

// The folder as of now, whole. The directory and the base default to what the agent file says —
// `./knowledge/docs` beside it and its slug — and the class is loaded only when one of the two is
// missing, so a push that names both costs no TypeScript loader.
async function push(
  door: Door,
  dir: string | undefined,
  base: string | undefined,
  agent: string,
  out: NodeJS.WritableStream,
  err: NodeJS.WritableStream,
): Promise<number> {
  const loaded = dir === undefined || base === undefined ? await load(agent) : undefined;
  const directory = resolve(dir ?? join(dirname(loaded!.file), DEFAULT_DIR));
  const name = base ?? slugOf(loaded!.ctor);
  if (!existsSync(directory) || !statSync(directory).isDirectory()) {
    err.write(`no knowledge directory at ${directory}\n`);
    return 2;
  }
  const files = markdownUnder(directory);
  if (files.length === 0) {
    err.write(`no *.md under ${directory}: nothing to push\n`);
    return 2;
  }
  const pushed = await asked<KnowledgePushed>(door, `/v1/knowledge/${encodeURIComponent(name)}`, {
    method: "PUT",
    body: { files },
  });
  out.write(`${pushedLine(pushed, files.length)}\n`);
  return 0;
}

async function list(door: Door, out: NodeJS.WritableStream): Promise<number> {
  const answered = await asked<KnowledgeList>(door, "/v1/knowledge");
  if (answered.bases.length === 0) {
    out.write(`no knowledge base pushed yet: pinecall knowledge push ./knowledge/docs --base <slug>\n`);
    return 0;
  }
  for (const base of answered.bases) {
    out.write(`${base.base} · ${base.chunks} chunks · pushed ${dayAndTime(base.pushed_at)}\n`);
  }
  return 0;
}

async function drop(door: Door, base: string, out: NodeJS.WritableStream): Promise<number> {
  await asked(door, `/v1/knowledge/${encodeURIComponent(base)}`, { method: "DELETE" });
  out.write(`dropped ${base}\n`);
  return 0;
}

/** The one line a push prints: the base, what was sent, what it became, and how long it took. */
export function pushedLine(pushed: KnowledgePushed, files: number): string {
  return `${pushed.base} · ${files} files · ${pushed.chunks} chunks · ${Math.round(pushed.took_ms)} ms`;
}

/** Every *.md under a directory, its subdirectories included, as the wire carries a file: its path relative to the directory, and its text. */
export function markdownUnder(directory: string): KnowledgeFile[] {
  const found: KnowledgeFile[] = [];
  for (const entry of readdirSync(directory, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const path = join(entry.parentPath, entry.name);
    found.push({ path: relative(directory, path).split(sep).join("/"), text: readFileSync(path, "utf8") });
  }
  return found.sort((one, other) => (one.path < other.path ? -1 : 1));
}

/** Unix seconds as a person reads them: the day and the minute, in UTC, no fractions. */
export function dayAndTime(seconds: number): string {
  return new Date(seconds * 1000).toISOString().slice(0, 16).replace("T", " ");
}
