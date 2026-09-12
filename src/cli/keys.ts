/** `pinecall keys issue | list | revoke`: the API keys this org's machines run on, shown once. */

import { parseArgs } from "node:util";

import { theDoor } from "./env.js";
import type { Group } from "./groups.js";
import { asked, type Door } from "./testing/gateway.js";
import { refusal } from "./whoami.js";

const USAGE = `usage: pinecall keys issue --label "<what it is for>" [--env production|development] [--scope <scope>]…
       pinecall keys list
       pinecall keys revoke <fingerprint>`;

// The doors, on this terminal's own key. An org issues its own: the operator's /v1/ops/orgs door
// is the box's way in and a tenant never holds its key. runtime docs/protocol/gateway-api.md §7.
const KEYS = "/v1/keys";

// The one sentence that matters here. It is printed under every key issued, because the table
// keeps the sha256 and no door, here or anywhere, reads one back.
const PRINTED_ONCE = "copy it now: the gateway keeps the fingerprint, and the key is never shown again";

// What a key with no label is in the listing. The column is still a column.
const NO_LABEL = "—";

const REVOKED = "revoked";
const LIVE = "live";

export const group: Group = {
  purpose: "issue | list | revoke the API keys this org's machines run on",
  usage: `${USAGE}

  A key issued here is a MACHINE's: a server, a CI job, a box. It names nobody — people get
  keys by logging in — and it holds \`app\` in production unless --scope says otherwise, which
  is the shape a deployment has. Your own key does not hold \`app\` in production: a deployed
  agent is held by the process somebody put on a box, not by whoever is logged in.

  So this is the last step before a deploy: issue one, put it in the box's environment as
  PINECALL_API_KEY, and that \`pinecall run\` is the one that answers your numbers.

  issue prints the key once and never again. list prints fingerprints, labels, worlds, whose
  each is and whether it is revoked — never a key. revoke takes a fingerprint as list prints it;
  the row and its history stay, so the calls it wrote stay readable. A key may not issue a scope
  it does not itself open.`,
  run,
};

/** What the verb can be told besides the argv: where to print, and which environment. */
export interface Issuing {
  out?: NodeJS.WritableStream;
  err?: NodeJS.WritableStream;
  env?: NodeJS.ProcessEnv;
}

/** One row of the listing, as the gateway answers it: the fingerprint, and never the key. */
interface Listed {
  fingerprint: string;
  label: string | null;
  env: string;
  scopes: string[];
  subject: string | null;
  name: string | null;
  created_at: string;
  revoked_at: string | null;
}

/** What the issuing door answers: the key, the once, and the row it was written under. */
interface Issued {
  key: string;
  key_id: string;
  label: string | null;
  env: string;
  scopes: string[];
}

/** Read the sub-verb and do it: one key minted, the org's keys listed, or one stopped. */
export async function run(argv: string[], how: Issuing = {}): Promise<number> {
  const out = how.out ?? process.stdout;
  const err = how.err ?? process.stderr;
  const verb = argv[0];
  const door = theDoor(how.env ?? process.env, err);
  if (door === undefined) return 1;
  try {
    if (verb === "issue") return await issue(argv.slice(1), door, out, err);
    if (verb === "list") return await list(door, out);
    if (verb === "revoke") return await revoke(argv[1], door, out, err);
  } catch (refused) {
    err.write(`${refusal(refused)}\n`);
    return 1;
  }
  err.write(`${USAGE}\n`);
  return 2;
}

/** Mint one, print it once, and say what it opens — so the next paste is into the right box. */
async function issue(
  argv: string[],
  door: Door,
  out: NodeJS.WritableStream,
  err: NodeJS.WritableStream,
): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      label: { type: "string" },
      env: { type: "string" },
      scope: { type: "string", multiple: true },
    },
  });
  if (values.label === undefined) {
    err.write(`${USAGE}\n`);
    err.write("missing: --label, because a key you can tell apart is a key you will revoke\n");
    return 2;
  }
  const body: Record<string, unknown> = { label: values.label };
  if (values.env !== undefined) body["env"] = values.env;
  if (values.scope !== undefined) body["scopes"] = values.scope;
  const made = await asked<Issued>(door, KEYS, { method: "POST", body });
  out.write(`${made.key}\n`);
  out.write(`  ${made.env} · ${made.label ?? NO_LABEL} · ${made.scopes.join(" · ")}\n`);
  out.write(`  ${PRINTED_ONCE}\n`);
  return 0;
}

/** Every key of the org, oldest first, as fingerprints — the word `revoke` takes. */
async function list(door: Door, out: NodeJS.WritableStream): Promise<number> {
  const rows = await asked<Listed[]>(door, KEYS);
  if (rows.length === 0) {
    out.write("no key of this org: `pinecall keys issue --label \"…\"` mints the first\n");
    return 0;
  }
  for (const row of rows) out.write(`${aLine(row)}\n`);
  return 0;
}

/** Stop one key. A fingerprint that is not this org's is the 404 a stranger's is. */
async function revoke(
  fingerprint: string | undefined,
  door: Door,
  out: NodeJS.WritableStream,
  err: NodeJS.WritableStream,
): Promise<number> {
  if (fingerprint === undefined) {
    err.write(`${USAGE}\n`);
    return 2;
  }
  await asked(door, `${KEYS}/${encodeURIComponent(fingerprint)}/revoke`, { method: "POST" });
  out.write(`revoked ${fingerprint}\n`);
  return 0;
}

/** One row as a terminal reads it: what it is, where it opens, whose it is, and its standing. */
export function aLine(row: Listed): string {
  const whose = row.name ?? (row.subject === null ? "a machine" : row.subject);
  const standing = row.revoked_at === null ? LIVE : REVOKED;
  return `${row.fingerprint.slice(0, 12)}  ${row.env.padEnd(11)} ${(row.label ?? NO_LABEL).padEnd(20)} ${whose.padEnd(14)} ${standing}`;
}
