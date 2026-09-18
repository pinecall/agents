/** `pinecall gateway [url]`: which gateway this machine talks to, and pointing it at another one. */

import { CLOUD_URL } from "./env.js";
import type { Group } from "./groups.js";
import { chooseGateway, chosenGateway, nameFor, readConfig } from "./profiles.js";

const USAGE = `usage: pinecall gateway              where this machine is pointed
       pinecall gateway <url>        point it at your own box, then \`pinecall login\``;

export const group: Group = {
  purpose: "which gateway this machine talks to, and pointing it at another",
  usage: `${USAGE}

  Every verb goes to ${CLOUD_URL} until this says otherwise, so a person who is on the cloud
  types \`pinecall login\` and nothing else — no URL to remember, no URL to mistype.

  Somebody running their own box says so ONCE, here, and every verb that runs before this machine
  holds a key goes there: the login and the refusal a verb prints when it has no key.
  It is remembered as \`gateway\` in ~/.pinecall/config.json, beside the profiles; \`pinecall gateway\`
  with nothing after it prints which, and \`pinecall config rm\` leaves it alone. An address with
  no scheme is read as https, and only the origin is kept. A URL typed on \`pinecall login <url>\`
  still wins, for that one command.

  Once a login has kept a profile, every verb goes where the ACTIVE profile points — an org you
  are signed in to is a profile, \`pinecall use <org>\` moves between them, and this verb is not
  what you want. This one is for the gateway you have not signed in to yet.`,
  run,
};

/** What the verb can be told besides the argv. Tests only: where to print, and which home. */
export interface Pointing {
  out?: NodeJS.WritableStream;
  err?: NodeJS.WritableStream;
  home?: string;
}

/** With nothing after it, where this machine is pointed; with a URL, point it there. */
export function run(argv: string[], how: Pointing = {}): number {
  const out = how.out ?? process.stdout;
  const err = how.err ?? process.stderr;
  const [named, ...rest] = argv;
  if (rest.length > 0) {
    err.write(`${USAGE}\n`);
    return 2;
  }
  if (named === undefined) return said(out, how.home);
  const url = asAUrl(named);
  if (url === null) {
    err.write(`not a gateway URL: ${named} — it is the address of a box, like https://voz.clinica.com\n`);
    return 2;
  }
  chooseGateway(url, how.home);
  const known = readConfig(how.home).profiles[nameFor(url, readConfig(how.home))] !== undefined;
  out.write(`▸ ${url}\n`);
  out.write(known ? "  signed in already: `pinecall use <org>` moves between them\n" : "  `pinecall login` signs this machine in there\n");
  return 0;
}

// Where the next verb goes, and where that answer came from: a person debugging a refusal reads
// this line first, and a "default" that looks chosen is how an hour goes missing.
function said(out: NodeJS.WritableStream, home: string | undefined): number {
  const chosen = chosenGateway(home);
  out.write(chosen === undefined ? `▸ ${CLOUD_URL}   (the default)\n` : `▸ ${chosen}   (this machine's own)\n`);
  return 0;
}

/** A URL a gateway could live at, or null. An address with no scheme is read as https. */
function asAUrl(said: string): string | null {
  const text = /^[a-z][a-z0-9+.-]*:\/\//i.test(said) ? said : `https://${said}`;
  try {
    const url = new URL(text);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}
