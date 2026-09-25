/** `pinecall sessions [call]`: the calls this gateway has run, and what one of them came to. */

import { parseArgs } from "node:util";

import type { Cost, SessionLine } from "@pinecall/protocol";

import { CannotRun } from "./cannot-run.js";
import { theDoor } from "./env.js";
import type { Group } from "./groups.js";
import { asked, type Door } from "./testing/gateway.js";
import { agentOfThisDirectory, notASlug } from "./load.js";
import { BROKEN, HELD } from "./testing/score.js";
import { standingOf } from "./the-call.js";
import { refusal } from "./whoami.js";

const USAGE = "usage: pinecall sessions [list|show] [call] [--agent <slug>] [--limit <n>] [--json]";

// `list` and `show` are both optional words: what this verb does is decided by whether a call id
// was typed, not by a sub-verb. They are taken because a person types them and because the tree
// itself does — `supervise`'s refusal says "`pinecall sessions show <call>` reads it", and
// `sessions show <call>` read `show` as the call id and answered "no call show on this gateway".
const NOT_A_CALL: readonly string[] = ["list", "show"];

// The two entries a finished call ends with, and the only two this verb reads. Asking the log for
// them by name is what keeps `show` one request on almost every call: the door filters at the sink.
const THE_ENDING = "call.summary,call.score";

// A page of the log is 500 entries and the two this verb wants are the last two written, so a call
// long enough to need a second page is a long call and not a broken one. Six pages is three
// thousand entries — an hour of talking — and past that the sentence says what was not found.
const PAGES = 6;

// How much of a judge's own words a line of the score carries. The whole of them is in the log,
// and `--json` is the door to it; this is a person reading a call over somebody's shoulder.
const ROOM = 96;

export const group: Group = {
  purpose: "list | show a call's log, with what it cost and how it was judged",
  usage: `${USAGE}

  With nothing after it: every call this agent has run, newest first — when it came in, how long
  it lasted, why it ended, what it cost and the one line the agent left as its outcome.

  With a call id: that call whole — the same facts, and the SCORE, one line per judge that ran
  over it with the question it answered and its own reasoning when it did not hold.

  The judging is ring 4's, at hang-up, in the gateway. This verb reads it back; it runs nothing.`,
  run,
};

/** What the verb can be told besides the argv: where to print, and which environment. Tests only. */
export interface Running {
  out?: NodeJS.WritableStream;
  err?: NodeJS.WritableStream;
  env?: NodeJS.ProcessEnv;
}

export async function run(argv: string[], how: Running = {}): Promise<number> {
  const out = how.out ?? process.stdout;
  const err = how.err ?? process.stderr;
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { agent: { type: "string" }, limit: { type: "string" }, json: { type: "boolean", default: false } },
  });
  const door = await theDoor(how.env ?? process.env, err);
  if (door === undefined) return 2;
  const call = positionals.find((word) => !NOT_A_CALL.includes(word));
  try {
    const lines = call === undefined ? await listed(door, values, err) : await shown(door, call, values.json === true);
    if (lines === null) return 2;
    out.write(`${lines.join("\n")}\n`);
    return 0;
  } catch (refused) {
    // A call nobody wrote is a command that cannot run, and the dispatcher gives it the 2 that
    // says so; everything else here is the gateway refusing what was asked, which is a 1.
    if (refused instanceof CannotRun) throw refused;
    err.write(`${refusal(refused)}\n`);
    return 1;
  }
}

// ── every call ──────────────────────────────────────────────────────────────────

async function listed(
  door: Door,
  values: { agent?: string | undefined; limit?: string | undefined; json?: boolean | undefined },
  err: NodeJS.WritableStream,
): Promise<string[] | null> {
  const aFile = notASlug(values.agent);
  if (aFile !== undefined) {
    err.write(`${aFile}\n`);
    return null;
  }
  const agent = values.agent ?? (await agentOfThisDirectory());
  if (agent === null || agent === undefined) {
    err.write(`${USAGE}\n  name the agent, or run this beside an agent file\n`);
    return null;
  }
  const limit = values.limit === undefined ? "" : `&limit=${encodeURIComponent(values.limit)}`;
  const { calls } = await asked<{ calls: SessionLine[] }>(
    door,
    `/v1/agents/${encodeURIComponent(agent)}/sessions?${limit.slice(1)}`,
  );
  if (values.json === true) return [JSON.stringify(calls)];
  if (calls.length === 0) return [`${agent} has run no calls`];
  return [`${agent} · ${calls.length} call${calls.length === 1 ? "" : "s"}`, "", ...calls.map(lineOf)];
}

/** One call as a row of the list: what it was, how long, why it ended, what it cost, what came of it. */
export function lineOf(one: SessionLine): string {
  const held = one.live === true ? "●" : " ";
  const doors = `${one.channel ?? "—"} ${one.direction ?? "—"}`.padEnd(15);
  const ending = one.live === true ? "live" : (one.end_reason ?? one.status ?? "—");
  return `${held} ${one.call.padEnd(38)} ${doors} ${lasted(one).padStart(7)}  ${ending.padEnd(20)} ${money(one.cost).padStart(8)}  ${onOneLine(one.outcome)}`.trimEnd();
}

// ── one call ────────────────────────────────────────────────────────────────────

async function shown(door: Door, call: string, asJson: boolean): Promise<string[]> {
  // Asked before the log is read: the events door answers an empty page for a call nobody ever
  // opened, so a typed id used to print a summary of nothing and leave with a zero.
  const standing = await standingOf(door, call);
  const ending = await theEndingOf(door, call);
  if (asJson) return [JSON.stringify(ending)];
  const summary = ending["call.summary"];
  const score = ending["call.score"];
  const lines = [call, ""];
  // A call still running has written no summary and no score, and "not judged" is the wrong
  // reason for that: nothing has been judged because nothing has ended.
  if (standing.live) lines.push("  live      this call is still running — `pinecall supervise` is the desk for it", "");
  if (summary !== undefined) {
    lines.push(`  outcome   ${String(summary["outcome"] ?? "—")}`);
    lines.push(`  ended     ${String(summary["reason"] ?? "—")} · ${seconds(Number(summary["duration_s"] ?? 0))} · ${String(summary["turns"] ?? 0)} turns`);
    lines.push(`  cost      ${money(summary["cost"] as Cost | null | undefined)}`);
  }
  lines.push(...scoreLines(score));
  return lines;
}

/** The score as a person reads it: the verdict, then one line per judge, the broken ones with why. */
export function scoreLines(score: Record<string, unknown> | undefined): string[] {
  if (score === undefined) return ["  score     not judged: this call carries no call.score"];
  const why = score["not_judged"];
  if (typeof why === "string" && why !== "") return [`  score     not judged: ${why}`];
  const judges = (score["judges"] ?? []) as { name: string; verdict: string; criteria: string; reason: string }[];
  const held = score["passed"] === true;
  const asked = Number(score["judge_calls"] ?? 0);
  const cost = score["judge_cost_eur"];
  const paid = typeof cost === "number" ? ` · €${cost.toFixed(4)}` : "";
  const lines = [
    `  score     ${held ? HELD : BROKEN} ${held ? "every judge held" : "a judge answered broken"} · ${judges.length} judges · ${asked} model call${asked === 1 ? "" : "s"}${paid}`,
    "",
  ];
  const width = Math.max(0, ...judges.map((one) => one.name.length));
  for (const judge of judges) {
    const mark = judge.verdict === "held" ? HELD : BROKEN;
    // Folded, because a judge may hang anything on `criteria` and one of ours hangs the whole
    // evidence there: a screen of a knowledge base is not a line of a score.
    lines.push(`  ${mark} ${judge.name.padEnd(width)}  ${onOneLine(judge.criteria, ROOM)}`);
    // The reasoning is the half a person acts on, and only a judge that did not hold has one worth
    // reading: a policy writes the evidence it found, a model writes the sentence it answered with.
    if (judge.verdict !== "held") lines.push(`    ${" ".repeat(width)}  ${onOneLine(judge.reason, ROOM)}`);
  }
  return lines;
}

/**
 * The two entries a finished call ends with, by name. The door filters at the sink but pages from
 * the start, so a long call takes a page or two to reach its own ending — bounded, and said out
 * loud when the bound is hit rather than paging a log of any length.
 */
async function theEndingOf(door: Door, call: string): Promise<Record<string, Record<string, unknown>>> {
  const found: Record<string, Record<string, unknown>> = {};
  let after = 0;
  for (let page = 0; page < PAGES; page += 1) {
    // A finished call whose cursor has reached the end answers 204 with no body at all, which is
    // how this loop learns it is done — the door says "nothing more" rather than an empty page.
    const read = await asked<Page | null>(
      door,
      `/v1/calls/${encodeURIComponent(call)}/events?types=${THE_ENDING}&after=${after}`,
    );
    if (read === null || read.entries === undefined) break;
    for (const entry of read.entries) found[entry.type] = entry.data;
    if (read.next === null || read.next === undefined || read.next <= after) break;
    after = read.next;
  }
  return found;
}

/** One page of the log as this verb reads it. */
interface Page {
  entries: { seq: number; type: string; data: Record<string, unknown> }[];
  next?: number | null;
}

// ── the small stuff a row is made of ────────────────────────────────────────────

// An outcome is a sentence a model wrote, and a model writes paragraphs: a row of a list is one
// row, so the breaks fold and a long one is cut where a terminal would have wrapped it anyway.
export function onOneLine(said: string | null | undefined, width = 90): string {
  const folded = (said ?? "").replace(/\s+/g, " ").trim();
  return folded.length <= width ? folded : `${folded.slice(0, width - 1)}…`;
}

function lasted(one: SessionLine): string {
  if (one.started_at === null || one.started_at === undefined) return "—";
  const until = one.ended_at ?? Date.now() / 1000;
  return seconds(until - one.started_at);
}

/** Seconds as a person says them: `2m 14s`, and under a minute just the seconds. */
export function seconds(total: number): string {
  const whole = Math.max(0, Math.round(total));
  const minutes = Math.floor(whole / 60);
  return minutes === 0 ? `${whole}s` : `${minutes}m ${String(whole % 60).padStart(2, "0")}s`;
}

/** What a call cost, in the currency the log priced it in. A call nobody priced says so with a dash. */
export function money(cost: Cost | null | undefined): string {
  const total = cost?.eur;
  return typeof total === "number" ? `€${total.toFixed(4)}` : "—";
}
