/** `pinecall run [agent.tsx]`: the app registered and answering — the process you deploy. */

import { parseArgs } from "node:util";

import { Pinecall, type RouteInput } from "../client/index.js";

import { showPrompt } from "../views/render.js";
import { mount, slugOf, type Mounted } from "../runtime/connect.js";
import type { Agent as AgentClass } from "../agent/agent.js";
import { showMachine } from "./machine.js";
import { theDoor } from "./env.js";
import type { Group } from "./groups.js";
import { callsFrom, describing, theLine } from "./line.js";
import { connectedLine, doorsOf } from "./connected.js";
import { cannotTell, ENV_FLAG, notThisWorld, PRODUCTION, standing } from "./world.js";
import { orgOf, type Who } from "./whoami.js";
import { callingFrom } from "./profiles.js";
import { agentFilesOfTheProject, instanceFor, load, mountOptions } from "./load.js";
import { AGENT_FLAG, homesFor } from "./home.js";
import { goldensOf } from "./testing/goldens.js";
import type { Door } from "./testing/gateway.js";
import { chattingFrom, linesFromThisProcess, type Chatting } from "./ui/chatting.js";
import { devHandler, ownVerbs } from "./ui/doors.js";
import { driftingFrom } from "./ui/drifting.js";
import { hereOf, knowingFrom } from "./ui/knowing.js";
import { promotingFrom } from "./ui/promoting.js";
import { rememberingFrom, rememberingPiecesFor } from "./ui/remembering.js";
import { reproducingFrom } from "./ui/reproducing.js";
import { simulatingFrom, simulatingPiecesFor } from "./ui/simulating.js";
import { testingFrom, testingPiecesFor } from "./ui/testing.js";
import { live, plain, stream, type Plain, type Watching } from "./run-screens.js";
import { consoleLine, HOSTED, NOWHERE, whyNoConsole } from "./run-console.js";
import { NoSidecar, openOrReuse, theOneUp, type Sidecar } from "./serve/sidecar.js";

export const group: Group = {
  purpose: "the app and its doors: the process you deploy",
  usage: `usage: pinecall run [agent.tsx] [--agent <name>] [--env production] [--serve] [--ui] [--events] [--show-prompt]

  With nothing after it: the agent registered on the gateway, one line per log entry on stdout,
  no port bound and no page served. It answers the console for this directory — in the sandbox
  that console is \`pinecall serve\`, on this machine; in production it is the gateway's own.

  At the root of a project of several agents — agents/<name>.tsx — every agent at once, on one
  socket, each line prefixed by its slug; --agent <name> (or its slug) runs one of them.

  --env <world>  say which world you believe this key opens, and be refused if it opens the
                 other. Nothing said is the sandbox; a deployment types --env production
  --serve        also serve the sandbox's console on http://localhost:4100, or point at the one
                 already up: \`pinecall run\` and \`pinecall serve\` in one terminal
  --show-prompt  the prompt a fresh instance would produce, then exit. No key, no gateway
  --events       one JSON line per log entry instead of the lines, for a pipe
  --ui           the full-screen terminal view; keys: p pause · c clear · e events · s prompt · q quit`,
  run,
};

/**
 * Load the agent, mount it, connect, and stay up until the process is signalled.
 *
 * This is the verb that goes under pm2 and into a container, and it is the same process in
 * the sandbox and in production: it runs the agent, binds no port and serves no page. What a
 * person looks at is `--ui` in this terminal, or a console: the gateway's own for production, and
 * `pinecall serve` on this machine for the sandbox — which `--serve` opens beside this process.
 * See docs/decisions/tenant-cli.md.
 */
export async function run(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      "show-prompt": { type: "boolean", default: false },
      events: { type: "boolean", default: false },
      ui: { type: "boolean", default: false },
      serve: { type: "boolean", default: false },
      ...AGENT_FLAG,
      ...ENV_FLAG,
    },
  });
  // One class, or — at the root of a project of several — every agents/*.tsx, or the one named.
  const homes = await homesFor(positionals[0], values.agent);
  const loaded = await Promise.all(homes.map(async (home) => ({ home, loaded: await load(home.file) })));
  // What the `s` key and --show-prompt both print: the prompt the model would read, and under it
  // the stage this instance is in with the tools that stage shows.
  const promptPage = (agent: AgentClass): string => `${showPrompt(agent)}\n\n${showMachine(agent)}`;

  // --show-prompt never connects: it is the question "what would the model read at the start of a
  // call", and answering it must not need a gateway, a key or a network.
  if (values["show-prompt"] === true) {
    for (const one of loaded) {
      if (loaded.length > 1) process.stdout.write(`── ${slugOf(one.loaded.ctor)} ──\n`);
      process.stdout.write(`${promptPage(instanceFor(one.loaded))}\n`);
    }
    return 0;
  }
  if (values.ui === true && loaded.length > 1) {
    const names = homes.map((home) => `--agent ${home.name}`).join(" or ");
    process.stderr.write(`the full-screen view watches one agent and this project has ${loaded.length}: add ${names}\n`);
    return 2;
  }

  const door = theDoor();
  if (door === undefined) return 2;
  // Before the socket and not after it. This used to be asked once the agent was already
  // registered, which makes a line REPORTING where it landed rather than a say in it: the world a
  // key opens is the one thing this verb must not be wrong about, and it is the same one request
  // either way. See docs/decisions/tenant-cli.md.
  let who: Who;
  try {
    who = await standing(door);
  } catch (failed) {
    process.stderr.write(`${cannotTell("run", failed)}\n`);
    return 2;
  }
  const elsewhere = notThisWorld("run", who, values.env);
  if (elsewhere !== undefined) {
    process.stderr.write(`${elsewhere}\n`);
    return 2;
  }
  // The sandbox's console is this machine's: opened here when asked, else the one already up is
  // named, else the line says which verb opens it. Production's is the gateway's own page.
  let sidecar: Sidecar | undefined;
  let local: string | undefined;
  if (who.env === PRODUCTION) {
    if (values.serve === true) {
      process.stderr.write(`--serve is the sandbox's console, and this key opens ${PRODUCTION}: production is watched at ${door.url}\n`);
      return 2;
    }
  } else if (values.serve === true) {
    try {
      sidecar = await openOrReuse(door, who);
      local = sidecar.url;
    } catch (failed) {
      if (!(failed instanceof NoSidecar)) throw failed;
      process.stderr.write(`${failed.message}\n`);
      return 2;
    }
  } else {
    local = await theOneUp(door, who);
  }
  const url = door.url;
  // One socket for every agent of the project: the gateway takes several slugs on one app socket,
  // and every call is routed to the class it names.
  const pc = new Pinecall({ url, apiKey: door.apiKey });
  // Whoever opens the app socket closes it. Left open it keeps this process alive after the
  // signal has been read — a plain `kill` on `pinecall run` did nothing until this landed —
  // and the gateway holds the slug until it shuts.
  // What a console may ask of THIS process through the gateway, because the answer is a file of
  // the agent's home or the class in it: a written call, the personas and a simulation, the goldens
  // and a suite, the knowledge folder, the memory goldens, a candidate, drift, a reproduction.
  // The lines they print land here, in the terminal that typed `run`, as the verbs would print
  // them. Registered before connect, so the first dev.request finds a handler.
  const chattings: Chatting[] = [];
  try {
    const all = loaded.map(({ home, loaded: one }) => {
      const mounted = mount(one.ctor, mountOptions(one, pc));
      const project = homes.length > 1 || agentFilesOfTheProject().length > 0;
      const chatting = project
        ? chattingFrom(door, mounted.slug, process.stdout, linesFromThisProcess(door, process.stdout, home.file), () => goldensOf(home.goldens))
        : chattingFrom(door, mounted.slug, process.stdout);
      chattings.push(chatting);
      mounted.agent.onDev(
        devHandler(
          ownVerbs({
            simulating: project
              ? simulatingFrom(door, mounted.slug, process.stdout, simulatingPiecesFor(home))
              : simulatingFrom(door, mounted.slug, process.stdout),
            testing: project
              ? testingFrom(door, mounted.slug, process.stdout, testingPiecesFor(home))
              : testingFrom(door, mounted.slug, process.stdout),
            chatting,
            knowing: project ? knowingFrom(door, mounted.slug, hereOf(home, mounted.slug)) : knowingFrom(door, mounted.slug),
            remembering: project
              ? rememberingFrom(door, mounted.slug, rememberingPiecesFor(home, mounted.slug))
              : rememberingFrom(door, mounted.slug),
            promoting: promotingFrom(door, mounted.slug, process.stdout),
            drifting: driftingFrom(door),
            reproducing: reproducingFrom(),
          }),
        ),
      );
      return { mounted, loaded: one };
    });
    const listens = all.map(({ mounted }) => mounted.agent.onAny.bind(mounted.agent));
    // --events is a pipe into another program: it prints nothing but its JSON.
    if (values.events === true) return await stream(pc, (listener) => {
      const stops = listens.map((listen) => listen(listener));
      return () => stops.forEach((stop) => stop());
    });

    if (values.ui !== true) {
      const agents: Plain[] = all.map(({ mounted }) => ({
        slug: mounted.slug,
        heard: mounted.agent.onAny.bind(mounted.agent),
        connected: connectedLine({
          slug: mounted.slug,
          url,
          tools: mounted.options.tools?.length ?? 0,
          doors: doorsOf(mounted.options.routes),
          org: orgOf(who),
          env: who.env,
          source: door.source,
        }),
        after: () => onceUp(door, mounted.slug, rings(mounted.options.routes), who.env === PRODUCTION ? HOSTED : (local ?? NOWHERE)),
      }));
      return await plain(pc, agents, url);
    }

    const { mounted, loaded: one } = all[0]!;
    // Which call the `s` key renders: the newest one, so the prompt on screen is the prompt of the
    // conversation on screen. With no call up it is a fresh instance — the same page --show-prompt gives.
    let newest: string | undefined;
    mounted.agent.onAny((_event, call) => {
      if (call !== null) newest = call.id;
    });
    const watching: Watching = {
      slug: mounted.slug,
      url,
      prompt: () => promptPage(instanceOf(mounted, newest) ?? instanceFor(one)),
    };
    return await live(pc, mounted.agent.onAny.bind(mounted.agent), watching);
  } finally {
    for (const chatting of chattings) await chatting.close();
    pc.close();
    await sidecar?.close();
  }
}

// What is only true once the socket is up: the console's URL, and — when the agent answers at a
// number — whose terminal that number rings in. Both are asked of the gateway, and neither is
// worth failing the run over: a gateway that refuses says so on its own line and the app runs on.
async function onceUp(door: Door, slug: string, rings: boolean, where: string): Promise<string[]> {
  const said = [await consoleLine(door, slug, where)];
  // The gateway keeps whose phone is whose beside its live table and not in a row, because it is
  // only meaningful next to a socket. So every connect says it again — for every agent, and not
  // only one that declares a number: a production number is the box's route and no class declares
  // it, yet a developer's own phone dialling it reaches their copy (the runtime's rings-for door).
  // A restarted gateway learns it here rather than sending the person's test call to production.
  await sayWhoCallsFromHere(door);
  if (rings) said.push(await lineLine(door, slug));
  return said;
}

/** Re-send the phone `pinecall line from` remembered for this gateway. Silent: it is upkeep. */
async function sayWhoCallsFromHere(door: Door): Promise<void> {
  const kept = callingFrom();
  if (kept === undefined) return;
  try {
    await callsFrom(door, kept);
  } catch {
    // A gateway too old for the door, or a key that opens no `app` here: neither is worth a line
    // in front of a person who did not ask for one. `pinecall line` says the truth when they do.
  }
}

/** Whether this agent answers at a number at all: with no number there is no ring to land. */
export function rings(routes: RouteInput[] | undefined): boolean {
  return (routes ?? []).some((route) => route.number !== null && route.number !== undefined);
}

// A number exists once in a world: in production the box answers it, and in the sandbox the org
// shares one and it rings where it was claimed. Printed here because the moment a second
// developer starts is the moment they need to know they did NOT take the calls.
async function lineLine(door: Door, slug: string): Promise<string> {
  try {
    return `line     ${describing(await theLine(door, slug))}`;
  } catch (refused) {
    return `line     not available: ${whyNoConsole(refused)}`;
  }
}

function instanceOf(mounted: Mounted, call: string | undefined): AgentClass | undefined {
  return call === undefined ? undefined : mounted.instanceOf(call);
}
