/** `@state({ visibility })`: who may see a field, declared once on the class and sent at mount. */

/** Who may see a field of the state. The wire's three words, from protocol/schema/defs.json. */
export type Visibility = "public" | "tenant" | "pii";

/** Everything `@state({...})` accepts. Visibility is the only question the wire asks today. */
export interface StateOptions {
  visibility: Visibility;
}

/** One field's declaration, in the shape AgentConfig.state_fields carries it. */
export interface StateFieldSpec {
  name: string;
  visibility: Visibility;
}

// Keyed by prototype, like the tool registry: a legacy decorator runs once per class at
// definition time, so a subclass inherits its parent's declarations by walking the chain.
const declared = new WeakMap<object, Map<string, Visibility>>();

/**
 * Declare who may see this field. A field with no `@state` is `tenant`, which is also the wire's
 * default, so the framework never sends a declaration the tenant did not write.
 */
export function state(options: StateOptions) {
  return function decorate(prototype: object, name: string): void {
    let own = declared.get(prototype);
    if (own === undefined) {
      own = new Map<string, Visibility>();
      declared.set(prototype, own);
    }
    own.set(name, options.visibility);
  };
}

/**
 * Every field declaration this class carries, parents first: the `@state` decorators up the
 * prototype chain, and then `static visibility = { field: "public" }` for a class that would
 * rather write a map than a decorator. The map wins, because it is written last and closest.
 */
export function visibilityOf(ctor: Function): StateFieldSpec[] {
  const merged = new Map<string, Visibility>();
  const chain: object[] = [];
  for (
    let prototype: object | null = (ctor as { prototype?: object }).prototype ?? null;
    prototype !== null && prototype !== Object.prototype;
    prototype = Object.getPrototypeOf(prototype) as object | null
  ) {
    chain.unshift(prototype);
  }
  for (const prototype of chain) {
    for (const [field, visibility] of declared.get(prototype) ?? []) merged.set(field, visibility);
  }
  const map = (ctor as { visibility?: Record<string, Visibility> }).visibility;
  for (const [field, visibility] of Object.entries(map ?? {})) merged.set(field, visibility);
  return [...merged].map(([name, visibility]) => ({ name, visibility }));
}
