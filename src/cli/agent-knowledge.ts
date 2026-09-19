/** `pinecall agent knowledge [edit]`: what the agent knows by heart, printed, or opened in $EDITOR and kept as the next version. */

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { TuningAnswer, TuningBody, TuningRow } from "@pinecall/protocol";

import { readSettings, settingsPath } from "./agent-lines.js";
import { asked, type Door } from "./testing/gateway.js";

/** What opens the text for a person and hands back what they left: $EDITOR, or a test's answer. */
export type Editor = (text: string) => Promise<string>;

/** Flags the two verbs read off `pinecall agent`'s own table. */
interface Flags {
  team?: boolean | undefined;
  note?: string | undefined;
}

export const NOTHING_KNOWN = (agent: string, corner: string): string =>
  `${agent} knows nothing by heart in ${corner}: \`pinecall agent knowledge edit\` writes it`;
export const NO_EDITOR = "no editor: set $EDITOR (or $VISUAL) to the one that opens Markdown for you";
export const UNCHANGED = "nothing changed: no version written";

/** The corner's text printed, or opened in the editor and kept. */
export async function knowledgeRun(
  door: Door,
  agent: string,
  verb: string | undefined,
  flags: Flags,
  out: NodeJS.WritableStream,
  err: NodeJS.WritableStream,
  editor: Editor = inTheEditor,
): Promise<number> {
  const team = flags.team === true;
  const standing = await readSettings(door, agent);
  const row = team ? standing.team : (standing.yours ?? standing.team);
  const corner = cornerName(standing, team);
  const text = row?.config.knowledge ?? undefined;
  if (verb === undefined) {
    if (text === undefined) {
      out.write(`${NOTHING_KNOWN(agent, corner)}\n`);
      return 0;
    }
    out.write(text.endsWith("\n") ? text : `${text}\n`);
    return 0;
  }
  if (verb !== "edit") {
    err.write("usage: pinecall agent knowledge [edit] [--team] [--note '…']\n");
    return 2;
  }
  const written = await editor(text ?? "");
  if (written === (text ?? "")) {
    out.write(`${UNCHANGED}\n`);
    return 0;
  }
  const own = team ? standing.team : standing.yours;
  const config = kept(own?.config ?? {}, written);
  const answer = await asked<TuningAnswer>(door, settingsPath(agent), {
    method: "PUT",
    body: { config, if_version: own?.version ?? null, note: flags.note ?? "knowledge", team },
  });
  const now = team ? answer.team : answer.yours;
  out.write(`${agent} · knowledge ${written.trim() === "" ? "taken out" : `${written.length.toLocaleString("en-US")} chars`} · ${corner} v${now?.version ?? "?"}\n`);
  return 0;
}

// The whole set travels, as every settings write does: the corner's row with one field changed.
// An empty file takes the field out — there is no blank value, the door refuses one — so what
// the runtime's default is stands for it again.
function kept(config: TuningBody, written: string): TuningBody {
  const { knowledge: _was, ...rest } = config;
  return written.trim() === "" ? rest : { ...rest, knowledge: written };
}

function cornerName(answer: TuningAnswer, team: boolean): string {
  if (answer.world === "production") return "production";
  return team || answer.yours === null ? "the team's corner" : "your corner";
}

/** Whether a corner's row sets the text: the page that draws a row asks. */
export function knows(row: TuningRow | null): boolean {
  return row !== null && typeof row.config.knowledge === "string";
}

// The one way a person writes a page of Markdown from a terminal that is not typing it into a
// flag: their own editor, on a file, the way `git commit` and `crontab -e` do it. The file lives
// a moment in a temp directory of its own and is gone before this returns.
async function inTheEditor(text: string): Promise<string> {
  const editor = process.env["VISUAL"] ?? process.env["EDITOR"];
  if (editor === undefined || editor === "") throw new Error(NO_EDITOR);
  const folder = mkdtempSync(join(tmpdir(), "pinecall-knowledge-"));
  const file = join(folder, "knowledge.md");
  try {
    writeFileSync(file, text);
    // One command line, not a command and an argument: `$EDITOR` is a LINE a person wrote — `code
    // -w`, `emacsclient -nw` — and a shell is what reads it. The path is quoted here because the
    // shell would otherwise split a temp directory with a space in it.
    const opened = spawnSync(`${editor} '${file.replaceAll("'", "'\\''")}'`, { stdio: "inherit", shell: true });
    if (opened.status !== 0) throw new Error(`${editor} exited with ${opened.status}: nothing written`);
    return readFileSync(file, "utf8");
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}
