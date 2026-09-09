/** A synthetic caller: who is on the phone, what they want, and the words they use to get it. */

import { readdir } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { useTypeScript } from "../load.js";

/**
 * One persona, written by the tenant in `test/personas/<name>.ts` and default-exported.
 *
 * A persona is not a script: `goal` and `style` are what the model playing the caller is told it
 * is, and `facts` is everything that caller knows about themselves and may state. The model
 * improvises every turn from those three — see docs/decisions/simulate.md.
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

/** Where the tenant's personas live: one file per caller, beside the goldens they are run with. */
export const PERSONAS = "test/personas";

/** What to say when there are none: the directory, and that a persona is one file in it. */
export const NO_PERSONAS = `no personas at ${PERSONAS}: one file per caller, default-exporting one`;

/** Every persona in that directory, in the order `ls` prints them. */
export async function personasIn(folder: string = PERSONAS): Promise<Persona[]> {
  const names = await readdir(resolve(folder)).catch(() => []);
  const files = names.filter((name) => extname(name) === ".ts").sort();
  return await Promise.all(files.map((name) => personaOf(join(resolve(folder), name))));
}

/** One persona by the name of its file, or undefined when nobody wrote that caller. */
export async function personaNamed(
  wanted: string,
  folder: string = PERSONAS,
): Promise<Persona | undefined> {
  return (await personasIn(folder)).find((persona) => persona.name === wanted);
}

/** One file's persona. The file's own name is the caller's, so a directory listing is the roster. */
async function personaOf(file: string): Promise<Persona> {
  await useTypeScript();
  const module_ = (await import(pathToFileURL(file).href)) as { default?: unknown };
  const written = module_.default;
  if (typeof written !== "object" || written === null) {
    throw new Error(`${file} has no default-exported persona`);
  }
  return { ...(written as Persona), name: basename(file, extname(file)) };
}
