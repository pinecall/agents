/** `pinecall runs drift`: each judge's held-rate over two windows of call.score, and the delta. */

import type { CallScore, SessionLine } from "@pinecall/protocol";

import { entriesOf, theSessions, type Door } from "../testing/gateway.js";
import { theScoreIn } from "./candidate.js";

/** How many of an agent's newest calls drift reads. 200 is the sessions door's own ceiling. */
export const A_WINDOW_OF_CALLS = 200;

/** How many points a judge may drop before the night fails. Written 10 or -10, it is the drop. */
export const THRESHOLD = 10;

/** How many broken calls a drift names. Three: enough to see a pattern, short enough to read. */
const NAMED = 3;

/** One finished call and what the judges said about it: the pair every count here is made of. */
export interface Judged {
  call: string;
  /** When the call ended, unix seconds. It is what puts a call in one window or the other. */
  at: number;
  score: CallScore | null;
}

/** One judge's standing in one window: how many verdicts settled, and how many of them held. */
export interface Rate {
  held: number;
  settled: number;
  percent: number;
}

/** One judge across the two windows: where it stood, where it stands, and the points between. */
export interface JudgeDrift {
  judge: string;
  before: Rate | null;
  now: Rate | null;
  /** Points, now minus before. Null when either window settled nothing: silence is not a delta. */
  delta: number | null;
}

/** One broken verdict, as a reader opens the log at it: the call, the judge, the seqs, the why. */
export interface Broke {
  call: string;
  judge: string;
  seqs: number[];
  reason: string;
}

/** The whole reading: a row per judge, what nobody judged, and the newest calls that broke. */
export interface Drift {
  judges: JudgeDrift[];
  notJudged: { now: number; before: number };
  broke: Broke[];
  /** The steepest drop any judge took, or null when nothing could be compared at all. */
  worst: number | null;
}

/** What drift was asked for: whose calls, over which two windows, and how far a judge may fall. */
export interface Asked {
  agent: string;
  window: number;
  baseline: number;
  threshold: number;
  limit: number;
  /** Now, in unix seconds. A parameter so a test can stand at a fixed moment. */
  now: number;
}

/**
 * The verb: read the agent's calls, split them into the two windows, count the verdicts the log
 * already carries, and fail when a judge fell further than the threshold allows.
 */
export async function drifted(door: Door, asked: Asked, out: NodeJS.WritableStream): Promise<number> {
  const sessions = await theSessions(door, asked.agent, asked.limit);
  const now = await judgedIn(door, finishedBetween(sessions, asked.now - asked.window, asked.now));
  const opened = asked.now - asked.baseline;
  const before = await judgedIn(door, finishedBetween(sessions, opened, asked.now - asked.window));
  const drift = driftOf(now, before);
  out.write(`${linesOf(asked, drift).join("\n")}\n`);
  return drift.worst !== null && drift.worst < -Math.abs(asked.threshold) ? 1 : 0;
}

/** The calls that ended inside a window, newest first. A live call has not been judged yet. */
export function finishedBetween(sessions: SessionLine[], from: number, to: number): SessionLine[] {
  const inside = sessions.filter(
    (line) => !line.live && line.ended_at !== null && line.ended_at > from && line.ended_at <= to,
  );
  return inside.sort((one, other) => (other.ended_at ?? 0) - (one.ended_at ?? 0));
}

/**
 * Each judge's held-rate in each window and the points between them. Nothing here is computed that
 * the log does not carry: a held-rate is a count of the verdicts written into `call.score`.
 */
export function driftOf(now: Judged[], before: Judged[]): Drift {
  const [judgedNow, judgedBefore] = [now.filter(wasJudged), before.filter(wasJudged)];
  const judges = [...new Set([...judgedNow, ...judgedBefore].flatMap(namesIn))].sort();
  const rows = judges.map((judge) => rowFor(judge, judgedNow, judgedBefore));
  const deltas = rows.map((row) => row.delta).filter((delta) => delta !== null);
  return {
    judges: rows,
    notJudged: { now: now.length - judgedNow.length, before: before.length - judgedBefore.length },
    broke: brokenIn(judgedNow),
    worst: deltas.length > 0 ? Math.min(...deltas) : null,
  };
}

/** The reading as a person gets it: the two windows on top, a row per judge, then what broke. */
export function linesOf(asked: Asked, drift: Drift): string[] {
  const width = Math.max(1, ...drift.judges.map((row) => row.judge.length));
  const lines = [
    `${asked.agent}  drift  the last ${secondsAs(asked.window)} against the ${secondsAs(asked.baseline)} before it`,
    ...drift.judges.map((row) => rowAs(row, width)),
    `  ${drift.notJudged.now} not judged in the window, ${drift.notJudged.before} in the baseline`,
  ];
  if (drift.broke.length > 0) {
    lines.push(`  the ${drift.broke.length} most recent broken call(s):`);
    for (const broke of drift.broke) {
      lines.push(`    ${broke.call}  ${broke.judge}  seq ${broke.seqs.join(", ")}  ${broke.reason}`);
    }
  }
  return lines;
}

/** Each call's `call.score`, read one narrow page at a time from the end of its own log. */
async function judgedIn(door: Door, sessions: SessionLine[]): Promise<Judged[]> {
  const judged: Judged[] = [];
  for (const line of sessions) {
    // The terminal entry is the last seq the log reached, so a cursor one below it reads the
    // verdict and nothing else — a drift over two hundred calls is two hundred one-entry pages.
    const entries = await entriesOf(door, line.call, {
      after: Math.max(0, line.last_seq - 1),
      types: ["call.score"],
      limit: 4,
    });
    judged.push({ call: line.call, at: line.ended_at ?? 0, score: theScoreIn(entries) });
  }
  return judged;
}

// `passed` absent means nobody answered, which is a third thing and not a failure
// (the runtime's docs/decisions/scoring.md). Such a call is counted apart and is in neither
// window's arithmetic.
function wasJudged(judged: Judged): boolean {
  return judged.score !== null && judged.score.passed !== null && judged.score.passed !== undefined;
}

function namesIn(judged: Judged): string[] {
  return (judged.score?.judges ?? []).map((judgment) => judgment.name);
}

function rowFor(judge: string, now: Judged[], before: Judged[]): JudgeDrift {
  const [held, was] = [rateOf(judge, now), rateOf(judge, before)];
  const delta = held !== null && was !== null ? held.percent - was.percent : null;
  return { judge, before: was, now: held, delta };
}

// Held over settled: a `deferred` or a `skipped` verdict is a question nobody answered, and
// counting it as a failure would read as a judge that looked and disliked what it saw.
function rateOf(judge: string, judged: Judged[]): Rate | null {
  const verdicts = judged
    .flatMap((one) => one.score?.judges ?? [])
    .filter((judgment) => judgment.name === judge)
    .map((judgment) => judgment.verdict);
  const settled = verdicts.filter((verdict) => verdict === "held" || verdict === "broken").length;
  if (settled === 0) return null;
  const held = verdicts.filter((verdict) => verdict === "held").length;
  return { held, settled, percent: (held / settled) * 100 };
}

// Newest first, because a regression is read from the last call backwards; the calls arrive in
// that order already, so this only cuts the list at three.
function brokenIn(judged: Judged[]): Broke[] {
  const broke: Broke[] = [];
  for (const one of judged) {
    const faults = (one.score?.judges ?? []).filter((judgment) => judgment.verdict === "broken");
    if (faults.length === 0) continue;
    if (broke.some((named) => named.call === one.call)) continue;
    for (const fault of faults) {
      broke.push({ call: one.call, judge: fault.name, seqs: fault.evidence.seqs, reason: fault.reason });
    }
    if (new Set(broke.map((named) => named.call)).size >= NAMED) break;
  }
  return broke;
}

function rowAs(row: JudgeDrift, width: number): string {
  const delta = row.delta === null ? "     —" : `${row.delta >= 0 ? "+" : ""}${row.delta.toFixed(1)}`;
  return `  ${row.judge.padEnd(width)}  ${percentAs(row.before)} → ${percentAs(row.now)}  ${delta.padStart(6)} points  ${countsAs(row)}`;
}

function percentAs(rate: Rate | null): string {
  return (rate === null ? "—" : `${rate.percent.toFixed(1)}%`).padStart(6);
}

function countsAs(row: JudgeDrift): string {
  const said = (rate: Rate | null): string => (rate === null ? "nothing" : `${rate.held}/${rate.settled}`);
  return `(${said(row.now)} held, was ${said(row.before)})`;
}

/** A window as a person writes one: `90m`, `24h`, `7d`. Null when it is not one of those. */
export function secondsOf(said: string): number | null {
  const written = /^(\d+)([smhd])$/.exec(said);
  if (written === null) return null;
  const sizes: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  return Number(written[1]) * (sizes[written[2] ?? "s"] ?? 1);
}

// The window as it was typed, for the header. Whole days and hours read better than 604800 s.
function secondsAs(seconds: number): string {
  for (const [unit, size] of [["d", 86400], ["h", 3600], ["m", 60]] as const) {
    if (seconds % size === 0) return `${seconds / size}${unit}`;
  }
  return `${seconds}s`;
}
