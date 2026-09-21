/** `pinecall console [agent]`: the box's console in a browser, signed in as this project's key. */

import { parseArgs } from "node:util";

import { openInABrowser } from "./browser.js";
import { theDoor } from "./env.js";
import type { Group } from "./groups.js";
import { aLoginCode, consoleFor, consoleUrl, ITS_OWN_NAME, whyNoConsole } from "./start-console.js";
import type { Who } from "./whoami.js";
import { cannotTell, standing } from "./world.js";

export const group: Group = {
  purpose: "the box's console in a browser, signed in: the sandbox's, or production's with --prod",
  usage: `usage: pinecall console [agent] [--prod] [--no-open]

  Opens the console of the box this project is linked to, signed in as the key in its .env. The
  key itself never travels: the gateway mints a one-use code for it, good for five minutes, and
  the page spends the code for a key of that browser's own.

  Without --prod it is the SANDBOX's console — the world your \`pinecall start\` registers in, with
  your own copies, their calls, chat, evals, knowledge and memory. With --prod it is production's,
  if your org lets you act there. They are two names of one box and a person signs in to each.

  With no agent it opens the org's floor; name one and it opens that agent's screens.

  --no-open    print the URL and do not open a browser`,
  run,
};

/** What the verb can be told besides argv: where to print, and how a browser is opened. Tests only. */
export interface Opening {
  out?: NodeJS.WritableStream;
  err?: NodeJS.WritableStream;
  env?: NodeJS.ProcessEnv;
  open?: (url: string) => void;
}

export async function run(argv: string[], opening: Opening = {}): Promise<number> {
  const out = opening.out ?? process.stdout;
  const err = opening.err ?? process.stderr;
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { "no-open": { type: "boolean", default: false } },
  });
  const door = theDoor(opening.env ?? process.env, err);
  if (door === undefined) return 2;
  // Which world this key is in is the gateway's answer and never a guess here: `--prod` asks for
  // production and the gateway refuses it unless the person's row opens it.
  let who: Who;
  try {
    who = await standing(door);
  } catch (failed) {
    err.write(`${cannotTell("console", failed)}\n`);
    return 2;
  }
  const where = consoleFor(door.url, who.env);
  if (where === undefined) {
    err.write(`${ITS_OWN_NAME}\n`);
    return 2;
  }
  let code: string;
  try {
    code = await aLoginCode(door);
  } catch (refused) {
    err.write(`${whyNoConsole(refused)}\n`);
    return 1;
  }
  const url = consoleUrl(where, positionals[0], code);
  out.write(`console  ${url}   (opens within five minutes, once)\n`);
  if (values["no-open"] !== true) (opening.open ?? openInABrowser)(url);
  return 0;
}
