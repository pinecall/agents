/** `@state`: which fields are the state, and who may see them. Declared once on the class. */

import { DeclarationRefused } from "./tools.js";

/** Who may see a field of the state. The wire's three words, from protocol/schema/defs.json. */
export type Visibility = "public" | "tenant" | "pii";

/** Everything `@state({...})` accepts: who may see the field, or `pii: true`, which is the same answer. */
export interface StateOptions {
  visibility?: Visibility;
  /** Sugar for `visibility: "pii"` — the one every app writes, spelled the way it is thought about. */
  pii?: boolean;
}

/** One field's declaration, in the shape AgentConfig.state_fields carries it. */
export interface StateFieldSpec {
  name: string;
  visibility: Visibility;
}

// Keyed by prototype, like the tool registry: a legacy decorator runs once per class at
// definition time, so a subclass inherits its parent's declarations by walking the chain. A field
// declared with no visibility maps to undefined: it is state, and the wire is told nothing about
// who may see it, which is the wire's own default.
const declared = new WeakMap<object, Map<string, Visibility | undefined>>();

// The merged declaration of a class, worked out once. Every `@state` of a class runs at definition
// time, before any instance exists, so the answer cannot change after the first read — and the
// Proxy asks this on every assignment.
const merged = new WeakMap<Function, ReadonlySet<string> | null>();

/**
 * Declare a field as the agent's state, and optionally who may see it. Three spellings, one
 * meaning: `@state`, `@state({ pii: true })`, `@state({ visibility: "public" })`.
 *
 * A field with no visibility is `tenant`, which is also the wire's default, so the framework never
 * sends a declaration the tenant did not write.
 */
export function state(prototype: object, name: string): void;
export function state(options?: StateOptions): (prototype: object, name: string) => void;
export function state(
  first?: object | StateOptions,
  name?: string,
): void | ((prototype: object, name: string) => void) {
  // A legacy property decorator is called `(prototype, name)`, a factory with its options or with
  // nothing at all: the second argument is what tells the two apart.
  if (typeof name === "string") return declare(first as object, name, {});
  const options = (first ?? {}) as StateOptions;
  return (prototype, field) => declare(prototype, field, options);
}

/**
 * Every field declaration this class carries, parents first: the `@state` decorators up the
 * prototype chain, and then `static visibility = { field: "public" }` for a class that would
 * rather write a map than a decorator. The map wins, because it is written last and closest.
 */
export function visibilityOf(ctor: Function): StateFieldSpec[] {
  const fields = new Map<string, Visibility | undefined>();
  for (const prototype of chainOf(ctor)) {
    for (const [field, visibility] of declared.get(prototype) ?? []) fields.set(field, visibility);
  }
  const map = (ctor as { visibility?: Record<string, Visibility> }).visibility;
  for (const [field, visibility] of Object.entries(map ?? {})) fields.set(field, visibility);
  return [...fields]
    .filter((entry): entry is [string, Visibility] => entry[1] !== undefined)
    .map(([name, visibility]) => ({ name, visibility }));
}

/**
 * The fields this class said are its state, or null when it decorated none.
 *
 * One rule, and it is the whole feature: a class that decorates NO field has every own field as
 * state, as it always did; a class that decorates ANY field means "these, and nothing else", so an
 * undecorated field on it is the tenant's own scratch space — out of the snapshot, out of the
 * prompt, out of `state.changed`. `static visibility` says who may see a field and never whether it
 * is one: a map is an answer about visibility, not a declaration of the state.
 */
export function declaredStateOf(ctor: Function): ReadonlySet<string> | null {
  const known = merged.get(ctor);
  if (known !== undefined) return known;
  const fields = new Set<string>();
  for (const prototype of chainOf(ctor)) {
    for (const field of (declared.get(prototype) ?? new Map()).keys()) fields.add(field);
  }
  const answer = fields.size === 0 ? null : fields;
  merged.set(ctor, answer);
  return answer;
}

// The prototypes of a class, parents first, so a subclass's own declaration is written last.
function chainOf(ctor: Function): object[] {
  const chain: object[] = [];
  for (
    let prototype: object | null = (ctor as { prototype?: object }).prototype ?? null;
    prototype !== null && prototype !== Object.prototype;
    prototype = Object.getPrototypeOf(prototype) as object | null
  ) {
    chain.unshift(prototype);
  }
  return chain;
}

function declare(prototype: object, name: string, options: StateOptions): void {
  let own = declared.get(prototype);
  if (own === undefined) {
    own = new Map<string, Visibility | undefined>();
    declared.set(prototype, own);
  }
  own.set(name, visibilityIn(options, prototype, name));
}

// `pii: true` is `visibility: "pii"` said the way an app thinks about it. Written together they
// are either the same answer twice or two different ones, and the second is a field whose masking
// depends on which line the reader believes.
function visibilityIn(options: StateOptions, prototype: object, name: string): Visibility | undefined {
  if (options.pii === true && options.visibility !== undefined && options.visibility !== "pii") {
    throw new DeclarationRefused(
      `@state({ pii: true, visibility: ${JSON.stringify(options.visibility)} }) on ` +
        `${(prototype as { constructor: Function }).constructor.name}.${name}: ` +
        `two different answers to one question; write one`,
    );
  }
  if (options.pii === true) return "pii";
  return options.visibility;
}
