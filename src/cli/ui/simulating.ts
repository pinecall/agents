/** The console's own door to a simulated caller: this directory's personas, and one call started from the page. */

import { aSimulation, degradedBy, ONLY_ON_A_LINE, TURNS } from "../simulate.js";
import { NO_PERSONAS, personasIn, type Persona } from "../testing/caller.js";
import type { Door } from "../testing/gateway.js";
import { Refused } from "./refused.js";

/** What the page asks for: the caller, the line, and how far to go. */
export interface Wanted {
  agent: string;
  persona: string;
  voice: boolean;
  judge: boolean;
  turns: number;
  /** dB under the caller. Only on a spoken line. */
  background_noise?: number | undefined;
  /** Percent of packets lost, as a person types it. Only on a spoken line. */
  packet_loss?: number | undefined;
}

// The most turns the page may ask for: a persona that never hangs up would otherwise hold the
// class, and the terminal that typed `ui`, for as long as the model keeps talking.
const MOST_TURNS = 30;

/** A persona as the page lists it: enough to pick one, and nothing the model is told. */
export interface Listed {
  name: string;
  goal: string;
  style: string;
}

/** What the door answers: the class this console can simulate against, and its callers. */
export interface Roster {
  agent: string | null;
  personas: Listed[];
}

// The console may be opened on any agent the gateway holds, but a simulation needs the CLASS —
// mounted in this process, as `pinecall simulate` mounts it — and the class is the one in the
// directory `pinecall ui` was typed in. Another agent's page gets the sentence, not a call.
const NOT_THIS_DIRECTORY = (asked: string, here: string | null): string =>
  here === null
    ? `no agent class in this directory: run \`pinecall ui\` where ${asked}'s agent.tsx is`
    : `this console runs in ${here}'s directory: to simulate ${asked}, run \`pinecall ui\` there`;

const NO_CALL = "the simulation ended before a call opened";

/** What the server needs from the simulation, and nothing of how it prints. */
export interface Simulating {
  roster(): Promise<Roster>;
  start(wanted: unknown): Promise<{ call: string }>;
}

/** The pieces a simulation is built from, named so a test can hand in its own. */
export interface Pieces {
  personas: () => Promise<Persona[]>;
  simulate: typeof aSimulation;
}

/**
 * One `Simulating` for the life of a `pinecall ui`: the door it was opened with, the class of the
 * directory it runs in, and where the simulation's own lines go — the terminal that typed `ui`,
 * exactly as `pinecall simulate` prints them. The call itself is watched from the page, off the
 * log, like any other call; nothing here keeps a second transcript.
 */
export function simulatingFrom(
  door: Door,
  agent: string | null,
  out: NodeJS.WritableStream,
  pieces: Pieces = { personas: () => personasIn(), simulate: aSimulation },
): Simulating {
  return {
    async roster(): Promise<Roster> {
      const personas = await pieces.personas();
      return { agent, personas: personas.map(({ name, goal, style }) => ({ name, goal, style })) };
    },

    async start(asked: unknown): Promise<{ call: string }> {
      const wanted = parsed(asked);
      if (wanted.agent !== agent) throw new Refused(409, NOT_THIS_DIRECTORY(wanted.agent, agent));
      const degraded = degradedBy(
        wanted.background_noise === undefined ? undefined : String(wanted.background_noise),
        wanted.packet_loss === undefined ? undefined : String(wanted.packet_loss),
      );
      if (!wanted.voice && degraded !== undefined) throw new Refused(422, ONLY_ON_A_LINE);
      const persona = (await pieces.personas()).find((one) => one.name === wanted.persona);
      if (persona === undefined) {
        throw new Refused(404, `no persona called ${wanted.persona}: ${NO_PERSONAS}`);
      }
      return await opened(persona, wanted, degraded, door, out, pieces.simulate);
    },
  };
}

// The call is answered the moment it has an id and the simulation keeps going on its own: the
// page navigates to the call and reads the log; this process prints the turns and, with `judge`,
// the verdict, as the terminal verb does. A simulation that ends before any call opened is a
// refusal with whatever it said, never a page waiting on a call that does not exist.
async function opened(
  persona: Persona,
  wanted: Wanted,
  degraded: ReturnType<typeof degradedBy>,
  door: Door,
  out: NodeJS.WritableStream,
  simulate: typeof aSimulation,
): Promise<{ call: string }> {
  return await new Promise<{ call: string }>((answer, refuse) => {
    let answered = false;
    const running = simulate(persona, {
      door,
      judge: wanted.judge,
      voice: wanted.voice,
      ...(degraded === undefined ? {} : { degraded }),
      turns: wanted.turns,
      out,
      opened: (call) => {
        answered = true;
        answer({ call });
      },
    });
    running.then(
      () => {
        if (!answered) refuse(new Refused(502, NO_CALL));
      },
      (failed: unknown) => {
        const why = failed instanceof Error ? failed.message : String(failed);
        out.write(`simulation failed: ${why}\n`);
        if (!answered) refuse(new Refused(502, why));
      },
    );
  });
}

// Read by hand and not by a schema library: the CLI carries none (test/the-imports.test.ts), and
// the shape is six fields the page itself wrote a moment ago.
function parsed(asked: unknown): Wanted {
  if (typeof asked !== "object" || asked === null) throw new Refused(422, "a simulation is asked for with a JSON object");
  const given = asked as Record<string, unknown>;
  const agent = aString(given, "agent");
  const persona = aString(given, "persona");
  const voice = aFlag(given, "voice");
  const judge = aFlag(given, "judge");
  const turns = given["turns"] === undefined ? TURNS : aNumber(given, "turns", 1, MOST_TURNS);
  const noise = given["background_noise"] === undefined ? undefined : aNumber(given, "background_noise", 0, 120);
  const loss = given["packet_loss"] === undefined ? undefined : aNumber(given, "packet_loss", 0, 100);
  return { agent, persona, voice, judge, turns, background_noise: noise, packet_loss: loss };
}

function aString(given: Record<string, unknown>, name: string): string {
  const value = given[name];
  if (typeof value !== "string" || value === "") throw new Refused(422, `${name} is a name, and it was missing`);
  return value;
}

function aFlag(given: Record<string, unknown>, name: string): boolean {
  const value = given[name];
  if (value !== undefined && typeof value !== "boolean") throw new Refused(422, `${name} is true or false`);
  return value === true;
}

function aNumber(given: Record<string, unknown>, name: string, least: number, most: number): number {
  const value = given[name];
  if (typeof value !== "number" || !Number.isFinite(value) || value < least || value > most) {
    throw new Refused(422, `${name} is a number between ${least} and ${most}`);
  }
  return value;
}
