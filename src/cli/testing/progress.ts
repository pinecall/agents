/** What `pinecall test` draws while the runtime works: the header, a line per golden, a bar, in place. */

import { oneRun, theRuns, type Cell, type Door, type EvalRun } from "./gateway.js";
import { DECLARED, reportOf } from "./matrix.js";

// How often the run's row is read while it is going: a local gateway answers in a millisecond.
const EVERY_MS = 500;

/** What this terminal knows before the gateway has a row: whose run, its size, and its names. */
export interface Watched {
  agent: string;
  goldens: number;
  /** The models as a person says them: the class's own word, or the ones named on the command line. */
  models: string[];
  /** The word the runner's `declared` column is printed as — the same word `matrix.ts` is handed. */
  declaredAs: string;
}

const OPEN = "○";
const READING = "reading…";
const BAR_WIDTH = 20;
const FILLED = "█";
const EMPTY = "░";
// How much of a call id the live line shows: enough to tell two apart, and the whole of it is on
// the report the moment the golden breaks, and on `runs show` always.
const A_CALL_SHOWN = 12;

/**
 * The run, followed until the POST that started it answers. The runner rewrites the run's row as
 * it goes — the call before its first turn, the cell the moment it is judged — so this reads that
 * row every half second and draws it; the answer to the POST is the run that is returned. On a
 * stream that is not a terminal only the header is written, and under `--json` nothing at all, so
 * a CI log never fills with redraws and a JSON reader never meets a line that is not JSON.
 *
 * `sharing` is every other stream that reaches the same terminal, hooked for as long as the block
 * is live; a test hands a fake stream and an empty list, so the real process is never touched.
 */
export async function followed(
  door: Door,
  watched: Watched,
  pending: Promise<EvalRun>,
  out: NodeJS.WritableStream,
  asJson: boolean,
  sharing: NodeJS.WritableStream[] = out === process.stdout ? [process.stderr] : [],
): Promise<EvalRun> {
  const knocked = Date.now();
  const live = !asJson && isTerminal(out);
  const total = watched.goldens * Math.max(watched.models.length, 1);
  let settled = false;
  const answered = pending.finally(() => (settled = true));
  let id: string | undefined;
  const bottom = new Bottom(out);
  if (live) bottom.own(sharing);
  try {
    while (!settled) {
      await Promise.race([answered.catch(() => undefined), sleep(EVERY_MS)]);
      if (settled) break;
      if (id === undefined) {
        id = await inFlight(door, watched.agent);
        if (id !== undefined && !asJson) out.write(`${header(watched, id)}\n`);
      }
      if (id === undefined || !live) continue;
      const soFar = await oneRun(door, id);
      bottom.draw([...settledLines(soFar, watched), ...readingLines(soFar), bar(soFar, total, knocked)]);
    }
    bottom.erase();
    return await settledRun(door, answered, id);
  } finally {
    bottom.giveBack();
  }
}

// A spoken suite is minutes of real calls, and the POST that started it is one request held open
// the whole time: node's fetch gives up on a response that has not begun in five, and a run of
// ten spoken goldens crosses that. The run itself is fine — the gateway is still driving it and
// writing its row — so a connection that died is not a run that died. The row is the answer.
async function settledRun(door: Door, answered: Promise<EvalRun>, id: string | undefined): Promise<EvalRun> {
  try {
    return await answered;
  } catch (lost) {
    if (id === undefined) throw lost;
    return await untilItStops(door, id);
  }
}

/** Poll one run's row until it is no longer running, and answer with it however it ended. */
async function untilItStops(door: Door, id: string): Promise<EvalRun> {
  for (;;) {
    const run = await oneRun(door, id);
    if (run.status !== "running") return run;
    await sleep(EVERY_MS);
  }
}

/** The first line, the moment the run has an id: whose suite, how big, under which model, which run. */
export function header(watched: Watched, id: string): string {
  const counted = `${watched.goldens} golden${watched.goldens === 1 ? "" : "s"}`;
  return `${watched.agent} · ${counted} · ${watched.models.join(" · ")} · ${id}`;
}

// The run that has the gateway right now, by the door that lists them: the runner admits one run
// at a time and writes its row before the first call, so the newest running row is this one.
export async function inFlight(door: Door, agent: string): Promise<string | undefined> {
  const newest = (await theRuns(door, 1, agent))[0];
  return newest?.status === "running" ? newest.id : undefined;
}

// Every cell judged so far, drawn as the report will draw it: the report is asked for one cell at
// a time, so a golden's live line and its final line come from the same code and cannot differ.
// With two models the model heads its block, exactly as the report heads it.
function settledLines(run: EvalRun, watched: Watched): string[] {
  const lines: string[] = [];
  let heading: string | undefined;
  for (const cell of run.matrix?.runs ?? []) {
    if (watched.models.length > 1 && cell.model !== heading) {
      heading = cell.model;
      lines.push(`  ${cell.model === DECLARED ? watched.declaredAs : cell.model}`);
    }
    lines.push(...reportOf(narrowed(run, cell), {}, watched.declaredAs).slice(1, -1));
  }
  return lines;
}

// The same run with one cell in its matrix: what `reportOf` prints for it is that golden's lines
// between the header and the footer, and nothing about any other golden.
function narrowed(run: EvalRun, cell: Cell): EvalRun {
  const matrix = run.matrix!;
  const failures = matrix.failures.filter((one) => one.golden === cell.golden && one.model === cell.model);
  return { ...run, matrix: { ...matrix, models: [cell.model], goldens: [cell.golden], runs: [cell], failures } };
}

// A call the row names and no cell answers for yet is the conversation being driven right now.
function readingLines(run: EvalRun): string[] {
  const judged = run.matrix?.runs.length ?? 0;
  return run.calls
    .slice(judged)
    .map((opened) => `  ${OPEN} ${opened.golden}  ${opened.call.slice(0, A_CALL_SHOWN)}…  ${READING}`);
}

function bar(run: EvalRun, total: number, knocked: number): string {
  const judged = run.matrix?.runs.length ?? 0;
  const filled = total === 0 ? BAR_WIDTH : Math.round((judged / total) * BAR_WIDTH);
  const seconds = Math.round((Date.now() - knocked) / 1000);
  return `[${FILLED.repeat(filled)}${EMPTY.repeat(BAR_WIDTH - filled)}] ${judged}/${total} · ${seconds}s`;
}

// What a terminal that has not said its width is taken to be: a pty with no window size reports 0.
const A_TERMINAL_WIDTH = 80;

// A stream's own `write`, borrowed while the block owns the bottom of the terminal and handed back
// after. This is the whole of the method as far as this file is concerned.
type Write = (...args: unknown[]) => boolean;

interface Writes {
  write: Write;
}

/**
 * The bottom of the terminal while the run is going: the block is redrawn over itself by climbing
 * back the rows it drew last time, so anything else writing to the same terminal in between would
 * leave that climb counting rows the block no longer owns and the next redraw would eat the wrong
 * lines. So every stream that reaches this terminal is owned for as long as the block is live: a
 * write from anywhere else takes the block away first and scrolls above it, and the next half
 * second draws the block again underneath, whole.
 */
class Bottom {
  #rows = 0;
  readonly #write: Write;
  readonly #borrowed = new Map<Writes, Write>();

  constructor(private readonly out: NodeJS.WritableStream) {
    this.#write = (out as unknown as Writes).write.bind(out) as Write;
  }

  /** Take over `write` on this stream and every other one that reaches the same terminal. */
  own(sharing: NodeJS.WritableStream[]): void {
    for (const stream of [this.out, ...sharing]) {
      const owned = stream as unknown as Writes;
      if (this.#borrowed.has(owned)) continue;
      const raw = owned.write.bind(stream) as Write;
      this.#borrowed.set(owned, raw);
      owned.write = (...args: unknown[]) => {
        this.erase();
        return raw(...args);
      };
    }
  }

  /** Give every stream its own `write` back, whatever the run did. */
  giveBack(): void {
    for (const [owned, raw] of this.#borrowed) owned.write = raw;
    this.#borrowed.clear();
  }

  /** The block, drawn over the one before it: climb to where it began, clear everything below. */
  draw(lines: string[]): void {
    // A line wider than the terminal takes more than one row, and the climb counts rows, not
    // lines, or the second redraw would land in the middle of the first.
    const columns = (this.out as NodeJS.WriteStream).columns || A_TERMINAL_WIDTH;
    const climb = this.#rows > 0 ? `\x1b[${this.#rows}A` : "";
    this.#write(`${climb}\x1b[0J${lines.map((line) => `${line}\n`).join("")}`);
    this.#rows = lines.reduce((rows, line) => rows + Math.max(1, Math.ceil([...line].length / columns)), 0);
  }

  /** Take the block away and leave the cursor where it began. A block already gone costs nothing. */
  erase(): void {
    if (this.#rows > 0) this.draw([]);
  }
}

function isTerminal(out: NodeJS.WritableStream): boolean {
  return (out as NodeJS.WriteStream).isTTY === true;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
