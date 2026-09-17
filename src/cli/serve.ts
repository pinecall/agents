/** `pinecall serve`: the sandbox's console on this machine, and nothing else. */

import { parseArgs } from "node:util";

import { openInABrowser } from "./browser.js";
import { theDoor } from "./env.js";
import type { Group } from "./groups.js";
import { forever } from "./run-screens.js";
import { DEFAULT_PORT } from "./serve/server.js";
import { NoSidecar, openOrReuse } from "./serve/sidecar.js";
import type { Who } from "./whoami.js";
import { cannotTell, PRODUCTION, standing } from "./world.js";

export const group: Group = {
  purpose: "the sandbox's console on this machine: your copies, your calls, http://localhost:4100",
  usage: `usage: pinecall serve [--port <n>] [--no-open]

  The console for what YOU are running, on http://localhost:${DEFAULT_PORT}: your sandbox copies of the
  agents, their calls as they happen, chat, evals, knowledge, memory, the widget. It mounts no
  agent — \`pinecall run\` does that, and \`pinecall run --serve\` does both in one terminal.

  The gateway's own console shows production and only production. This one is the other half, and
  it asks the same gateway: every request the page makes is forwarded there with this machine's
  sandbox key on it. The key never reaches the browser, so there is nothing to sign in to.

  One per machine. A second \`serve\` for the same gateway and org finds the first and says where
  it is; two projects share one page.

  --port <n>   another port than ${DEFAULT_PORT}
  --no-open    print the URL and do not open a browser`,
  run,
};

/** What the verb can be told besides argv: where to print, and how a browser is opened. Tests only. */
export interface Serving {
  out?: NodeJS.WritableStream;
  err?: NodeJS.WritableStream;
  open?: (url: string) => void;
  until?: () => Promise<void>;
}

/** Why a production key serves nothing here, naming where production IS watched. */
export function notTheSandbox(gateway: string): string {
  return (
    `this key opens ${PRODUCTION}, and production is watched at ${gateway} — \`pinecall serve\` is your sandbox.\n`
    + "  `pinecall use <profile>` for a sandbox key — `pinecall config` lists them."
  );
}

export async function run(argv: string[], serving: Serving = {}): Promise<number> {
  const out = serving.out ?? process.stdout;
  const err = serving.err ?? process.stderr;
  const { values } = parseArgs({
    args: argv,
    options: { port: { type: "string" }, "no-open": { type: "boolean", default: false } },
  });
  const port = values.port === undefined ? DEFAULT_PORT : Number(values.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    err.write(`--port takes a port number, not ${JSON.stringify(values.port)}\n`);
    return 2;
  }
  const door = theDoor(process.env, err);
  if (door === undefined) return 2;
  let who: Who;
  try {
    who = await standing(door);
  } catch (failed) {
    err.write(`${cannotTell("serve", failed)}\n`);
    return 2;
  }
  if (who.env === PRODUCTION) {
    err.write(`${notTheSandbox(door.url)}\n`);
    return 2;
  }
  try {
    const sidecar = await openOrReuse(door, who, port);
    if (!sidecar.ours) {
      out.write(`console  ${sidecar.url}   (already being served on this machine)\n`);
      return 0;
    }
    out.write(`gateway  ${door.url} · key from ${door.source}\n`);
    out.write(`console  ${sidecar.url}   (your sandbox; Ctrl-C closes it)\n`);
    if (values["no-open"] !== true) (serving.open ?? openInABrowser)(sidecar.url);
    await (serving.until ?? forever)();
    await sidecar.close();
    return 0;
  } catch (failed) {
    if (!(failed instanceof NoSidecar)) throw failed;
    err.write(`${failed.message}\n`);
    return 2;
  }
}
