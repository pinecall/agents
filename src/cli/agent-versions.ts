/** `pinecall agent history | diff | rollback | promote`: the versions a corner kept, and the two hops. */

import type { Promoted, TuningAnswer, TuningBody, TuningDiff, TuningHistory, TuningRow } from "@pinecall/protocol";

import { FIELDS, linesOf, settingsPath, shown, versionLine, type Field } from "./agent-lines.js";
import type { Typed } from "./agent.js";
import { homesFor } from "./home.js";
import { asked, type Door } from "./testing/gateway.js";
import { goldensOf } from "./testing/goldens.js";

/** The four version verbs, dispatched by `pinecall agent`. */
export async function versionsRun(
  door: Door,
  agent: string,
  verb: "history" | "diff" | "rollback" | "promote",
  rest: string[],
  values: Typed,
  out: NodeJS.WritableStream,
  err: NodeJS.WritableStream,
): Promise<number> {
  if (verb === "history") return history(door, agent, values.team === true, out);
  if (verb === "diff") return diff(door, agent, values.against, out, err);
  if (verb === "rollback") return rollback(door, agent, rest[0], values.team === true, out, err);
  return promote(door, agent, values, out, err);
}

async function history(door: Door, agent: string, team: boolean, out: NodeJS.WritableStream): Promise<number> {
  const kept = await asked<TuningHistory>(door, `${settingsPath(agent)}/history?team=${team}`);
  out.write(`${agent} · ${kept.world} · ${kept.holder === "" ? "the org's own corner" : `corner ${kept.holder}`}\n`);
  if (kept.rows.length === 0) {
    out.write("  nothing set yet\n");
    return 0;
  }
  // Each version against the one before it, so a line says what that save changed and not the
  // whole set again; the oldest is against nothing, and reads as what it set.
  kept.rows.forEach((row, at) => {
    const older = kept.rows[at + 1] ?? null;
    out.write(`  ${versionLine(row)}${changes(older?.config ?? {}, row.config, "   ")}\n`);
  });
  return 0;
}

async function diff(door: Door, agent: string, against: string | undefined, out: NodeJS.WritableStream, err: NodeJS.WritableStream): Promise<number> {
  const world = against ?? "production";
  if (world !== "team" && world !== "production") {
    err.write("--against takes team or production\n");
    return 2;
  }
  const said = await asked<TuningDiff>(door, `${settingsPath(agent)}/diff?against=${world}`);
  const ours = said.ours === null ? "nothing set" : `${said.ours.holder === "" ? "team" : "yours"} v${said.ours.version}`;
  const theirs = said.theirs === null ? "nothing set" : `v${said.theirs.version}`;
  out.write(`${agent} · ${ours} vs ${world} ${theirs}\n`);
  if (said.changed.length === 0) {
    out.write("  the same\n");
    return 0;
  }
  out.write(`${changes(said.theirs?.config ?? {}, said.ours?.config ?? {}, "  ", "\n")}\n`);
  return 0;
}

async function rollback(door: Door, agent: string, version: string | undefined, team: boolean, out: NodeJS.WritableStream, err: NodeJS.WritableStream): Promise<number> {
  const wanted = Number(version);
  if (version === undefined || !Number.isInteger(wanted) || wanted < 1) {
    err.write("rollback takes the version to bring back: `pinecall agent history` lists them\n");
    return 2;
  }
  const answer = await asked<TuningAnswer>(door, `${settingsPath(agent)}/rollback`, { method: "POST", body: { version: wanted, team } });
  out.write(`${linesOf(agent, answer).join("\n")}\n`);
  return 0;
}

// Two hops, one verb. To the team: what you set, for every colleague's next call. To production:
// the goldens beside the agent are read here and sent with the ask, because the gateway keeps
// none — it runs them against the app serving your sandbox corner under the team's settings, and
// writes production only when every one holds. `--to production` and never `--prod`: that flag
// takes the production KEY, and this hop is made from the sandbox.
async function promote(door: Door, agent: string, values: Typed, out: NodeJS.WritableStream, err: NodeJS.WritableStream): Promise<number> {
  const to = values.to ?? "team";
  if (to !== "team" && to !== "production") {
    err.write("--to takes team or production\n");
    return 2;
  }
  const body: { to: string; note: string | null; goldens?: unknown[] } = { to, note: values.note ?? null };
  if (to === "production") {
    const [home] = await homesFor(values.file, values.agent);
    const goldens = home === undefined ? [] : await goldensOf(home.goldens);
    if (goldens.length === 0) {
      err.write(`no goldens${home === undefined ? "" : ` at ${home.goldens}`}: promoting to production runs them first, and there is nothing to run\n`);
      return 2;
    }
    body.goldens = goldens;
    out.write(`${agent} · the team's sandbox → production · ${goldens.length} golden${goldens.length === 1 ? "" : "s"} first…\n`);
  }
  const promoted = await asked<Promoted>(door, `${settingsPath(agent)}/promote`, { method: "POST", body });
  const where = promoted.world === "production" ? "production" : "the team's sandbox";
  out.write(`${agent} · ${where} v${promoted.version}${promoted.run === null ? "" : ` · every golden held · eval run ${promoted.run}`}\n`);
  return 0;
}

/** The fields set differently between two configs, each as `field before → after`. */
export function changes(before: TuningBody, after: TuningBody, lead: string, joined = " · "): string {
  const said: string[] = [];
  for (const field of FIELDS) {
    const was = shown(before, field);
    const is = shown(after, field);
    if (was === is) continue;
    said.push(`${field.replace("-", " ")} ${was ?? "—"} → ${is ?? "—"}`);
  }
  return said.length === 0 ? "" : `${lead}${said.join(joined === "\n" ? `\n${lead}` : joined)}`;
}

/** Whether a kept row sets this field at all, for the pages that draw a row. */
export function sets(row: TuningRow, field: Field): boolean {
  return shown(row.config, field) !== undefined;
}
