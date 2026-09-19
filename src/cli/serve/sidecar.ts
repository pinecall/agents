/** One sandbox console per machine: open it, or find the one already up and use that. */

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { Door } from "../testing/gateway.js";
import { orgOf, type Who } from "../whoami.js";
import { ABOUT, DEFAULT_PORT, LocalConsole, type About } from "./server.js";

// A checkout runs everything else from its sources; the console is the one thing that has to be
// bundled first, because a browser reads no TypeScript. The sentence names the command.
export const NOT_BUILT = "the console is not built: run scripts/build once, then pinecall serve";

// How many ports past the first are tried when a stranger holds it. A person with five things on
// 4100–4104 has said something about their machine, and is told which flag answers it.
const TRIES = 5;

// A sidecar answers this at once or is not one: the probe must never hold `pinecall start` back.
const PROBE_MS = 400;

/** A sidecar in hand: where it is, whether this process opened it, and how to let go of it. */
export interface Sidecar {
  url: string;
  /** False when another `pinecall serve` was already up and this one is only pointing at it. */
  ours: boolean;
  close(): Promise<void>;
}

/** The port could not be had, or the console was never built: a sentence for the person, not a stack. */
export class NoSidecar extends Error {
  override readonly name = "NoSidecar";
}

// The console is a browser program inside this package: vite writes its build to
// dist/cli/ui/console, which is what `files` publishes. From the compiled verb that is a sibling
// of this directory's parent; from the source under a loader it is the same path in dist.
/** Where the built console is, or undefined in a tree that never built one. */
export function consoleFiles(): string | undefined {
  const compiled = fileURLToPath(new URL("../ui/console/", import.meta.url));
  const source = fileURLToPath(new URL("../ui/console/main.tsx", import.meta.url));
  const found = existsSync(source) ? fileURLToPath(new URL("../../../dist/cli/ui/console/", import.meta.url)) : compiled;
  return existsSync(`${found}index.html`) ? found : undefined;
}

/** What is serving on that port, when it is a sidecar of ours; undefined for a stranger or nothing. */
export async function aliveAt(port: number = DEFAULT_PORT): Promise<About | undefined> {
  try {
    const answer = await fetch(`http://127.0.0.1:${port}${ABOUT}`, { signal: AbortSignal.timeout(PROBE_MS) });
    const said = (await answer.json()) as Partial<About>;
    return answer.ok && said.pinecall === "serve" ? (said as About) : undefined;
  } catch {
    return undefined;
  }
}

/** The sidecar already up on that port for this very gateway and org, as a URL; else undefined. */
export async function theOneUp(door: Door, who: Who, port: number = DEFAULT_PORT): Promise<string | undefined> {
  const alive = await aliveAt(port);
  return alive !== undefined && sameAs(alive, door, who) ? `http://localhost:${port}` : undefined;
}

/**
 * The console for this door: the sidecar already serving it, or a new one.
 *
 * A port in use is one of three things. A sidecar for this same gateway and org is THE console,
 * and is used as it is — two projects on one laptop share one page. A sidecar for another gateway
 * or org, or somebody else's program, is not ours to look through, so the next port is tried.
 */
export async function openOrReuse(door: Door, who: Who, port: number = DEFAULT_PORT): Promise<Sidecar> {
  const files = consoleFiles();
  if (files === undefined) throw new NoSidecar(NOT_BUILT);
  const about = { gateway: door.url, org: orgOf(who), env: who.env };
  for (let trying = port; trying < port + TRIES; trying += 1) {
    try {
      const opened = await LocalConsole.open(door, files, about, trying);
      return { url: opened.url, ours: true, close: () => opened.close() };
    } catch (failed) {
      if ((failed as NodeJS.ErrnoException).code !== "EADDRINUSE") throw failed;
      const up = await theOneUp(door, who, trying);
      if (up !== undefined) return { url: up, ours: false, close: async () => undefined };
    }
  }
  throw new NoSidecar(`ports ${port}–${port + TRIES - 1} are all taken by something else: name a free one with --port`);
}

function sameAs(alive: About, door: Door, who: Who): boolean {
  return alive.gateway === door.url && alive.org === orgOf(who) && alive.env === who.env;
}
