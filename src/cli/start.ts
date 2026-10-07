/** `pinecall start [agent.tsx]`: register the agents and serve their calls; the process you deploy. */

import { parseArgs } from "node:util";


import { showPrompt } from "../views/render.js";
import { mount, slugOf, type Mounted } from "../runtime/connect.js";
import type { Agent as AgentClass } from "../agent/agent.js";
import { showMachine } from "../serve/machine.js";
import { theDoor } from "./env.js";
import type { Group } from "./groups.js";
import { callsFrom, describing, doorsOfTheOrg, theLine, type Door_ } from "./line.js";
import { connectedLine, doorsOf } from "./connected.js";
import { cannotTell, PRODUCTION, standing } from "./world.js";
import { orgOf, type Who } from "./whoami.js";
import { callingFrom } from "./signed-in.js";
import { pinecallFor } from "./client-for.js";
import { load, mountOptions } from "./load.js";
import { instanceFor } from "../serve/load.js";
import { AGENT_FLAG, homesFor } from "./home.js";
import { goldensOf } from "./testing/goldens.js";
import type { Door } from "./testing/gateway.js";
import { chattingFrom, linesThrough, type Chatting } from "./ui/chatting.js";
import type { Served } from "./serving.js";
import { devHandler, ownVerbs } from "./ui/doors.js";
import { driftingFrom } from "./ui/drifting.js";
import { hereOf, knowingFrom } from "./ui/knowing.js";
import { viewingFrom } from "../serve/viewing.js";
import { aLostSocket } from "../serve/lines.js";
import { promotingFrom } from "./ui/promoting.js";
import { rememberingFrom, rememberingPiecesFor } from "./ui/remembering.js";
import { reproducingFrom } from "./ui/reproducing.js";
import { simulatingFrom, simulatingPiecesFor } from "./ui/simulating.js";
import { testingFrom, testingPiecesFor } from "./ui/testing.js";
import { live, plain, stream, type Plain, type Watching } from "./start-screens.js";
import { consoleLine, whyNoConsole } from "./start-console.js";

export const group: Group = {
  purpose: "the app and its doors: the process you deploy",
  usage: `usage: pinecall start [agent.tsx] [--agent <name>] [--prod] [--ui] [--events] [--show-prompt]

  With nothing after it: the agent registered on the gateway, one line per log entry on stdout,
  no port bound and no page served. Without --prod it registers in the sandbox and answers the
  sandbox's console, at the gateway under /sandbox; with --prod, in production and its console.

  At the root of a project of several agents — agents/<name>.tsx — every agent at once, on one
  socket, each line prefixed by its slug; --agent <name> (or its slug) runs one of them.

  --prod         production: the agent your org's customers reach. A server's token was made
                 for it; a person's key opens it while their org lets them act there
  --show-prompt  the prompt a fresh instance would produce, then exit. No key, no gateway
  --events       one JSON line per log entry instead of the lines, for a pipe
  --ui           the full-screen terminal view; keys: p pause · c clear · e events · s prompt · q quit`,
  run,
};

/**
 * Load the agent, mount it, connect, and stay up until signalled. Same process in sandbox and
 * production; binds no port and serves no page.
 */
export async function run(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      "show-prompt": { type: "boolean", default: false },
      events: { type: "boolean", default: false },
      ui: { type: "boolean", default: false },
      ...AGENT_FLAG,
    },
  });
  // A single file, or every agents/*.tsx at a multi-agent project root (or the one named).
  const homes = await homesFor(positionals[0], values.agent);
  const loaded = await Promise.all(homes.map(async (home) => ({ home, loaded: await load(home.file) })));
  // Printed by the `s` key and --show-prompt: the prompt, then the current stage and its tools.
  const promptPage = (agent: AgentClass): string => `${showPrompt(agent)}\n\n${showMachine(agent)}`;

  // --show-prompt needs no gateway, key or network.
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

  const door = await theDoor();
  if (door === undefined) return 2;
  // Resolve the org before registering anything, so a refusal happens first.
  let who: Who;
  try {
    who = await standing(door);
  } catch (failed) {
    process.stderr.write(`${cannotTell("start", failed)}\n`);
    return 2;
  }
  const url = door.url;
  // One socket for all agents; the gateway routes each call by slug.
  const pc = pinecallFor(door);
  // The client reconnects on its own; print one line per outage, not a stack per attempt.
  let lost = false;
  pc.onErrors((failed) => {
    // Non-socket errors (an unawaited tool throw, a bad frame) are printed in full.
    if (!aLostSocket(failed)) return console.error(failed);
    if (!lost && values.events !== true && values.ui !== true) process.stderr.write(`gateway  ${failed.message} — reconnecting\n`);
    lost = true;
  });
  // The gateway does not persist the developer's phone, so re-send it on every (re)connect; otherwise
  // a restarted gateway routes their test call to production.
  pc.onConnected(() => {
    if (lost && values.events !== true && values.ui !== true) process.stderr.write("gateway  back\n");
    lost = false;
    if (door.world !== PRODUCTION) void sayWhoCallsFromHere(door);
  });
  // Console dev.* requests that need this process's files or class. Registered before connect so
  // the first dev.request finds a handler. The socket is closed in `finally`: left open it keeps
  // the process alive after a signal and the gateway holds the slug.
  const chattings: Chatting[] = [];
  try {
    const all = loaded.map(({ home, loaded: one }) => {
      const mounted = mount(one.ctor, mountOptions(one, pc));
      // The console's verbs reach the agent this process serves, never a second mount of it.
      const served: Served = { slug: mounted.slug, app: () => mounted.agent.app };
      const chatting = chattingFrom(mounted.slug, linesThrough(door, process.stdout, served), () => goldensOf(home.goldens));
      chattings.push(chatting);
      mounted.agent.onDev(
        devHandler(
          ownVerbs({
            simulating: simulatingFrom(door, mounted.slug, process.stdout, simulatingPiecesFor(served)),
            testing: testingFrom(door, mounted.slug, process.stdout, testingPiecesFor(home, served)),
            chatting,
            knowing: knowingFrom(door, mounted.slug, hereOf(home, mounted.slug)),
            remembering: rememberingFrom(door, mounted.slug, rememberingPiecesFor(home)),
            promoting: promotingFrom(door, mounted.slug, process.stdout),
            viewing: viewingFrom(one.ctor, mounted.slug),
            drifting: driftingFrom(door),
            reproducing: reproducingFrom(),
          }),
        ),
      );
      return { mounted, loaded: one };
    });
    const listens = all.map(({ mounted }) => mounted.agent.onAny.bind(mounted.agent));
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
          org: orgOf(who),
          env: who.env,
          source: door.source,
        }),
        after: () => onceUp(door, mounted, process.stdout.isTTY === true),
      }));
      return await plain(pc, agents, url);
    }

    const { mounted, loaded: one } = all[0]!;
    // The `s` key renders the newest call's instance, else a fresh one.
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
  }
}

// Lines printed after connect: console URL, the agent's doors, and its phone line if any. Doors come
// from the org's table, not the class. Failures print a line; the agent keeps running.
async function onceUp(door: Door, mounted: Mounted, terminal: boolean): Promise<string[]> {
  const doors = await theDoors(door);
  const said = [await consoleLine(door, mounted.slug, terminal), doorsOf(mounted.slug, doors)];
  if (doors.some((one) => one.agent === mounted.slug && one.number !== null)) {
    said.push(await lineLine(door, mounted.slug));
  }
  return said;
}


// Best-effort: a failure only omits the `doors` line.
async function theDoors(door: Door): Promise<Door_[]> {
  try {
    return await doorsOfTheOrg(door);
  } catch {
    return [];
  }
}

/** Re-send the phone number saved by `pinecall line from`; failures are silent. */
async function sayWhoCallsFromHere(door: Door): Promise<void> {
  const kept = callingFrom(door.url);
  if (kept === undefined) return;
  try {
    await callsFrom(door, kept);
  } catch {
    // Retried on the next connect; `pinecall line` shows the actual state.
  }
}

// A number rings in one place per world; printed so a second developer sees they did not take it.
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
