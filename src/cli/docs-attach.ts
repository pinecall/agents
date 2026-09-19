/** `pinecall docs attach | detach | attached`: which bases an agent reads, per world and corner. */

import type { DocsConfig, KnowledgeUses, TuningAnswer } from "@pinecall/protocol";

import { readSettings, settingsPath, theCornerCalled, theCornerWritten } from "./agent-lines.js";
import { asked, type Door } from "./testing/gateway.js";

/** How the base is attached: how a turn reads it, how many chunks, and under what score. */
export interface Attaching {
  k?: number;
  mode?: DocsConfig["mode"];
  minScore?: number;
}

/** What `attach` and `detach` print: the agent, the base, and the corner's new version. */
const ATTACHED = (agent: string, base: string, answer: TuningAnswer, team: boolean): string =>
  `${agent} · ${base} attached · ${cornerLine(answer, team)}`;
const DETACHED = (agent: string, base: string, answer: TuningAnswer, team: boolean): string =>
  `${agent} · ${base} detached · ${cornerLine(answer, team)}`;
export const NOT_ATTACHED = (agent: string, base: string): string => `${base} is not attached to ${agent}`;

// Attaching is a settings write: the bases an agent reads are one field of its settings
// (`bases`), so this is `pinecall agent set` for that one field — the corner's whole row read
// back and sent again with the version it was read at, the base added or taken out of the list.
/** The base attached to the agent in this corner, as the next version; a base already there is replaced. */
export async function attach(door: Door, agent: string, base: string, how: Attaching, team: boolean, out: NodeJS.WritableStream): Promise<number> {
  const standing = await readSettings(door, agent);
  const row = theCornerWritten(standing, team);
  const kept = (row?.config.bases ?? []).filter((one) => one.base !== base);
  const docs: DocsConfig = { base };
  if (how.k !== undefined) docs.k = how.k;
  if (how.mode !== undefined) docs.mode = how.mode;
  if (how.minScore !== undefined) docs.min_score = how.minScore;
  const answer = await asked<TuningAnswer>(door, settingsPath(agent), {
    method: "PUT",
    body: { config: { ...(row?.config ?? {}), bases: [...kept, docs] }, if_version: row?.version ?? null, note: `attached ${base}`, team },
  });
  out.write(`${ATTACHED(agent, base, answer, team)}\n`);
  return 0;
}

/** The base taken out of the agent's list in this corner, as the next version. */
export async function detach(door: Door, agent: string, base: string, team: boolean, out: NodeJS.WritableStream, err: NodeJS.WritableStream): Promise<number> {
  const standing = await readSettings(door, agent);
  const row = theCornerWritten(standing, team);
  const bases = row?.config.bases ?? [];
  if (!bases.some((one) => one.base === base)) {
    err.write(`${NOT_ATTACHED(agent, base)}\n`);
    return 1;
  }
  const { bases: _was, ...rest } = row!.config;
  const left = bases.filter((one) => one.base !== base);
  const config = left.length === 0 ? rest : { ...rest, bases: left };
  const answer = await asked<TuningAnswer>(door, settingsPath(agent), {
    method: "PUT",
    body: { config, if_version: row!.version, note: `detached ${base}`, team },
  });
  out.write(`${DETACHED(agent, base, answer, team)}\n`);
  return 0;
}

/** Every base any agent of the org reads in the key's world, and which agents read it. */
export async function attached(door: Door, out: NodeJS.WritableStream): Promise<number> {
  const uses = await asked<KnowledgeUses>(door, "/v1/knowledge/attached");
  if (uses.bases.length === 0) {
    out.write("no agent reads a base here: `pinecall docs attach <base>` gives one its base\n");
    return 0;
  }
  for (const one of uses.bases) out.write(`${one.base} · read by ${one.agents.join(", ")}\n`);
  return 0;
}

/** `k`, `mode` and `min-score` as typed, checked: a number that is not one is refused by name. */
export function attachingOf(values: { k?: string; mode?: string; "min-score"?: string }): Attaching {
  const how: Attaching = {};
  if (values.k !== undefined) {
    const k = Number(values.k);
    if (!Number.isInteger(k) || k < 1) throw new Error(`--k takes a whole number of chunks, not ${values.k}`);
    how.k = k;
  }
  if (values.mode !== undefined) {
    if (values.mode !== "retrieved" && values.mode !== "tool") throw new Error(`--mode is retrieved or tool, not ${values.mode}`);
    how.mode = values.mode;
  }
  if (values["min-score"] !== undefined) {
    const score = Number(values["min-score"]);
    if (!Number.isFinite(score) || score < 0) throw new Error(`--min-score takes a score of zero or more, not ${values["min-score"]}`);
    how.minScore = score;
  }
  return how;
}

// The corner the GATEWAY wrote, not the one the flag asked for: a key with no corner of its own
// writes the org's own, and a line that called it "your corner v?" was naming a row that is not
// where the base landed.
function cornerLine(answer: TuningAnswer, team: boolean): string {
  const row = theCornerWritten(answer, team);
  const corner = theCornerCalled(answer, team);
  return row === null ? corner : `${corner} v${row.version}`;
}
