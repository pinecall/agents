/** The console's own door to the goldens: this directory's, listed, and a run of the chosen ones started from the page. */

import { Pinecall } from "../../client/index.js";

import { load } from "../load.js";
import { inFlight } from "../testing/progress.js";
import type { Door, Wanted as RunWanted } from "../testing/gateway.js";
import { goldensIn, type Golden } from "../testing/goldens.js";
import { mountedForASuite, ranSuite } from "../testing/suite.js";
import { aFlag, anObject, aString, maybeNumber, names } from "./asked.js";
import { Refused } from "./refused.js";

/** What the page asks for: which goldens, and on what line. */
export interface Wanted {
  agent: string;
  goldens: string[];
  voice: boolean;
  /** dB under the caller. Only on a spoken line. */
  background_noise?: number | undefined;
  /** The share of packets lost, 0 to 1, as `pinecall test --packet-loss` takes it. Only spoken. */
  packet_loss?: number | undefined;
}

/** A golden as the page lists it: the name to tick, what the caller says, what is expected. */
export interface Listed {
  name: string;
  input: string[];
  expect: Record<string, unknown>;
}

/** What the door answers: the class this console can run against, and its goldens. */
export interface Roster {
  agent: string | null;
  goldens: Listed[];
}

/** What the server needs from a suite, and nothing of how it prints. */
export interface Testing {
  roster(): Promise<Roster>;
  start(wanted: unknown): Promise<{ run: string }>;
}

/** The pieces a run is built from, named so a test can hand in its own. */
export interface Pieces {
  goldens: () => Promise<Golden[]>;
  /** Runs the chosen goldens through the class of this directory; answers the run's exit code. */
  suite: (door: Door, goldens: Golden[], line: Partial<RunWanted>, out: NodeJS.WritableStream) => Promise<number>;
  /** The id of the run the gateway is driving for this agent right now, when there is one. */
  running: (door: Door, agent: string) => Promise<string | undefined>;
}

// How long the page may wait for the gateway to write the run's row before it is told nothing
// opened. The runner writes the row before the first call, so this is the class mounting.
const A_RUN_OPENS_WITHIN_MS = 20_000;
const A_LOOK_EVERY_MS = 250;

const NOT_THIS_DIRECTORY = (asked: string, here: string | null): string =>
  here === null
    ? `no agent class in this directory: run \`pinecall ui\` where ${asked}'s agent.tsx is`
    : `this console runs in ${here}'s directory: to run ${asked}'s goldens, run \`pinecall ui\` there`;

const ONLY_ON_A_LINE = "background noise and packet loss are about audio: a spoken run";
const NO_RUN = "the suite ended before the gateway opened a run";

/**
 * One `Testing` for the life of a `pinecall ui`: the door it was opened with, the class of the
 * directory it runs in, and where the report goes — the terminal that typed `ui`, exactly as
 * `pinecall test` prints it. The run itself is read from the page off `GET /v1/evals/runs`, like
 * any other run; the reproductions are written where the verb writes them.
 */
export function testingFrom(
  door: Door,
  agent: string | null,
  out: NodeJS.WritableStream,
  pieces: Pieces = { goldens: () => goldensIn([]), suite: inThisProcess, running: inFlight },
): Testing {
  return {
    async roster(): Promise<Roster> {
      const goldens = await pieces.goldens();
      return {
        agent,
        goldens: goldens.map(({ name, input, expect }) => ({ name, input, expect: { ...(expect ?? {}) } })),
      };
    },

    async start(asked: unknown): Promise<{ run: string }> {
      const wanted = parsed(asked);
      if (wanted.agent !== agent) throw new Refused(409, NOT_THIS_DIRECTORY(wanted.agent, agent));
      const spoiled = wanted.background_noise !== undefined || wanted.packet_loss !== undefined;
      if (!wanted.voice && spoiled) throw new Refused(422, ONLY_ON_A_LINE);
      const chosen = (await pieces.goldens()).filter((golden) => wanted.goldens.includes(golden.name));
      const missing = wanted.goldens.filter((name) => !chosen.some((golden) => golden.name === name));
      if (missing.length > 0) throw new Refused(404, `no golden called ${missing.join(", ")}`);
      return await opened(agent, chosen, aLine(wanted), door, out, pieces);
    },
  };
}

// Only the fields a spoken run adds travel: a written run must not carry a `voice: false` that
// reads as a decision somebody made. The same rule `pinecall test` keeps.
function aLine(wanted: Wanted): Partial<RunWanted> {
  if (!wanted.voice) return {};
  return {
    voice: true,
    ...(wanted.background_noise === undefined ? {} : { interferer_db: wanted.background_noise }),
    ...(wanted.packet_loss === undefined ? {} : { packet_loss: wanted.packet_loss }),
  };
}

// The suite runs on in this process and the page is answered with the run's id as soon as the
// gateway has written its row, which `pinecall test` reads off the same door for its header. A
// suite that ends first — refused, or no call opened — is the refusal, with what it said.
async function opened(
  agent: string,
  goldens: Golden[],
  line: Partial<RunWanted>,
  door: Door,
  out: NodeJS.WritableStream,
  pieces: Pieces,
): Promise<{ run: string }> {
  let settled = false;
  const suite = pieces.suite(door, goldens, line, out).then(
    () => (settled = true),
    (failed: unknown) => {
      settled = true;
      out.write(`suite failed: ${failed instanceof Error ? failed.message : String(failed)}\n`);
    },
  );
  const deadline = Date.now() + A_RUN_OPENS_WITHIN_MS;
  while (!settled && Date.now() < deadline) {
    const id = await pieces.running(door, agent);
    if (id !== undefined) return { run: id };
    await Promise.race([suite, new Promise((wake) => setTimeout(wake, A_LOOK_EVERY_MS))]);
  }
  throw new Refused(502, NO_RUN);
}

/** The chosen goldens through the class of this directory, mounted here for the length of the run. */
async function inThisProcess(
  door: Door,
  goldens: Golden[],
  line: Partial<RunWanted>,
  out: NodeJS.WritableStream,
): Promise<number> {
  const loaded = await load();
  const pc = new Pinecall({ url: door.url, apiKey: door.apiKey });
  const held = mountedForASuite(loaded, pc);
  try {
    await pc.connect();
    return await ranSuite({ door, loaded, held, goldens, models: [], line, out, json: false });
  } finally {
    pc.close();
  }
}

// Read with the shared readers of ui/asked.ts: every door of this process reads a body the same way.
function parsed(asked: unknown): Wanted {
  const given = anObject(asked, "a run");
  return {
    agent: aString(given, "agent"),
    goldens: names(given, "goldens"),
    voice: aFlag(given, "voice"),
    background_noise: maybeNumber(given, "background_noise", 0, 120),
    packet_loss: maybeNumber(given, "packet_loss", 0, 1),
  };
}
