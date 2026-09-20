/** The personas a project still keeps as files: read once, by `pinecall personas push`, and never again. */

import { readdir, stat } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { useTypeScript } from "../load.js";

/**
 * One persona as a project wrote it: `test/<agent>/personas/<name>.ts`, default-exporting an object.
 *
 * A caller is the gateway's now (`pinecall personas`, the console's Personas), beside the agent's
 * settings — the same cut the voice and the lexicon took. These files are what a project wrote
 * before that, and this module exists to send them there once: `pinecall personas push`.
 */
export interface Persona {
  name: string;
  /** What this caller is after, in one line. */
  goal: string;
  /** How they talk: hurried, switching into English mid-sentence, hard of hearing. */
  style: string;
  /** Their name, their phone, the appointment they are calling about: what they may never invent. */
  facts?: Record<string, unknown>;
  /** The state the call starts in, when this caller is somebody the business already knows. */
  state?: Record<string, unknown>;
}

/** Every persona in that directory, in the order `ls` prints them. */
export async function personasIn(folder: string): Promise<Persona[]> {
  const names = await readdir(resolve(folder)).catch(() => []);
  const files = names.filter((name) => extname(name) === ".ts").sort();
  return await Promise.all(files.map((name) => personaOf(join(resolve(folder), name))));
}

/** One file's persona. The file's own name is the caller's, so a directory listing is the roster. */
async function personaOf(file: string): Promise<Persona> {
  await useTypeScript();
  // Keyed by when the file last changed, so a push after an edit reads the edit and not the copy
  // this process imported before.
  const module_ = (await import(`${pathToFileURL(file).href}?v=${(await stat(file)).mtimeMs}`)) as { default?: unknown };
  const written = module_.default;
  if (typeof written !== "object" || written === null) {
    throw new Error(`${file} has no default-exported persona`);
  }
  return { ...(written as Persona), name: basename(file, extname(file)) };
}
