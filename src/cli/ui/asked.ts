/** What a body the page sent must be, read by hand: the CLI carries no schema library (test/the-imports.test.ts). */

import { Refusal } from "./refusal.js";

/** The body as an object, or the refusal that says a door takes one. */
export function anObject(asked: unknown, what: string): Record<string, unknown> {
  if (typeof asked !== "object" || asked === null || Array.isArray(asked)) {
    throw new Refusal(422, `${what} is asked for with a JSON object`);
  }
  return asked as Record<string, unknown>;
}

/** A field that must be there and must say something. */
export function aString(given: Record<string, unknown>, name: string): string {
  const value = given[name];
  if (typeof value !== "string" || value === "") throw new Refusal(422, `${name} is a name, and it was missing`);
  return value;
}

/** A field that may be left out, and is words when it is there. */
export function someWords(given: Record<string, unknown>, name: string): string | undefined {
  const value = given[name];
  if (value === undefined || value === "") return undefined;
  if (typeof value !== "string") throw new Refusal(422, `${name} is words`);
  return value;
}

/** A flag: true, false, or left out, which is false. */
export function aFlag(given: Record<string, unknown>, name: string): boolean {
  const value = given[name];
  if (value !== undefined && typeof value !== "boolean") throw new Refusal(422, `${name} is true or false`);
  return value === true;
}

/** A number inside the range the door takes, said in the refusal so the page can be fixed. */
export function aNumber(given: Record<string, unknown>, name: string, least: number, most: number): number {
  const value = given[name];
  if (typeof value !== "number" || !Number.isFinite(value) || value < least || value > most) {
    throw new Refusal(422, `${name} is a number between ${least} and ${most}`);
  }
  return value;
}

/** The same number, when the field may be left out entirely. */
export function maybeNumber(
  given: Record<string, unknown>,
  name: string,
  least: number,
  most: number,
): number | undefined {
  return given[name] === undefined ? undefined : aNumber(given, name, least, most);
}

/** A list of at least one name: which goldens to run, which bases to push. */
export function names(given: Record<string, unknown>, name: string): string[] {
  const value = given[name];
  if (!Array.isArray(value) || value.length === 0 || !value.every((one) => typeof one === "string")) {
    throw new Refusal(422, `${name} is a list of at least one name`);
  }
  return value as string[];
}
