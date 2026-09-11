/** `pinecall ui [agent]`: the console on 127.0.0.1 for the life of the command, opened in this machine's browser. */

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { slugOf } from "../../runtime/connect.js";
import { doorLine, theDoor } from "../env.js";
import type { Group } from "../groups.js";
import { agentOfThisDirectory, DEFAULT_AGENTS } from "../load.js";
import { headless, openInBrowser } from "./browser.js";
import { LocalConsole } from "./server.js";
import { simulatingFrom } from "./simulating.js";

const USAGE = "usage: pinecall ui [agent]";

// A checkout runs everything else from its sources; the console is the one thing that has to be
// bundled first, because a browser reads no TypeScript. The sentence names the command.
const NOT_BUILT = "the console is not built: run scripts/build once, then pinecall ui";

export const group: Group = {
  purpose: "the console: this gateway's agents, their calls and logs as they happen, evals, and a page to talk",
  usage: `${USAGE}

  Opens the console on this gateway, landing on the agent of this directory — the class in
  ${DEFAULT_AGENTS[0]} — or on the agent named, or on the list of every agent the gateway holds when
  there is neither. The console is served on 127.0.0.1 for as long as the command runs and opened
  in this machine's browser: Talk joins the agent's room with the browser's microphone, Calls
  follows every call as it happens, Sessions reads the finished ones, Evals and Pipeline read
  their doors. Ctrl-C here closes the port with the command.

  The key never reaches the browser: this process signs every request the console makes, under a
  URL only it printed. Runs where a browser is — over ssh or with no display it says so and exits 2.`,
  run: ui,
};

/** What ui can be told besides the argv: where to print, and which browser to open. Tests only. */
export interface Opening {
  out?: NodeJS.WritableStream;
  err?: NodeJS.WritableStream;
  open?: (url: string) => void;
  env?: NodeJS.ProcessEnv;
  files?: string;
}

/** Serve, open, wait, close. The org key is read once and spent only by the server, never printed. */
export async function ui(argv: string[], how: Opening = {}): Promise<number> {
  const out = how.out ?? process.stdout;
  const err = how.err ?? process.stderr;
  const env = how.env ?? process.env;
  if (argv[0]?.startsWith("-")) {
    out.write(`${USAGE}\n`);
    return 2;
  }
  const door = theDoor(env, err);
  if (door === undefined) return 2;
  const why = headless(env);
  if (why !== null) {
    err.write(`ui needs a browser on this machine and ${why}: run it where the screen is\n`);
    return 2;
  }
  const here = await agentOfThisDirectory();
  const agent = argv[0] ?? here;
  const files = how.files ?? consoleFiles();
  if (!existsSync(files)) {
    err.write(`${NOT_BUILT}\n`);
    return 2;
  }
  // A simulation started from the page mounts the class of THIS directory in this process and
  // prints its turns here, exactly as `pinecall simulate` would; the page watches the call's log.
  const served = await LocalConsole.open(door, files, simulatingFrom(door, here, out));
  const at = agent === null ? served.url : served.at(`a/${agent}`);
  // Which gateway and which of the four places the key came from: the one line that answers
  // "why is it talking to that box" before anybody has to grep for an exported name.
  out.write(`${doorLine(door)}\n`);
  out.write(`${agent ?? "console"} · ${door.url} · ${at}\n`);
  (how.open ?? openInBrowser)(at);
  const hungUp = interrupted();
  try {
    await hungUp.happened;
  } finally {
    hungUp.stop();
    await served.close();
  }
  return 0;
}

// Named by the same rule `run` registers it under, read from the same file, so the two verbs never
// The console is a browser program inside this package: its source is src/cli/ui/console and vite
// writes its build to dist/cli/ui/console, which is what `files` publishes. So from the compiled
// verb the page is the sibling directory, and from the source under a loader it is the same path
// in dist — one of the two exists, and a tree where neither does was never built.
// Beside this module sits `console/` twice over: in the published package it is the BUILT console,
// and in a checkout it is the SOURCE, whose index.html points at `main.tsx` — TypeScript, which no
// browser runs, and which served a blank page for as long as the check was `existsSync` alone.
// What tells them apart is that source file, so that is what is asked about.
export function consoleFiles(): string {
  const beside = fileURLToPath(new URL("console/", import.meta.url));
  if (existsSync(beside) && !existsSync(fileURLToPath(new URL("console/main.tsx", import.meta.url)))) {
    return beside;
  }
  return fileURLToPath(new URL("../../../dist/cli/ui/console/", import.meta.url));
}

/** Ctrl-C, as a promise that resolves once, and the handle that unhooks it. */
function interrupted(): { happened: Promise<void>; stop: () => void } {
  let hungUp = (): void => undefined;
  const happened = new Promise<void>((resolve) => {
    hungUp = () => resolve();
    process.once("SIGINT", hungUp);
  });
  return { happened, stop: () => process.off("SIGINT", hungUp) };
}
