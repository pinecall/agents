/** `static events`: the outside facts this class accepts, and from whom. */

/** Where an outside fact came from: the tenant's backend, or a participant's browser. */
export type EventSource = "app" | "participant";

/** One event the class accepts. `from` is who may send it; nobody else ever reaches the hook. */
export interface EventDecl {
  from: EventSource[];
}

/** The class's declaration, as the tenant writes it: `{ "cart.changed": { from: ["app"] } }`. */
export type EventDeclarations = Record<string, EventDecl>;

/** One declaration in the shape AgentConfig.events carries it. */
export interface EventSpec {
  name: string;
  from: EventSource[];
}

/** What arrived with an event: who sent it, which participant if any, and its place in the log. */
export interface EventMeta {
  source: EventSource;
  identity?: string;
  seq: number;
}

/**
 * Every event this class declares, parents first — a subclass adding one keeps the parent's, and
 * redeclaring a name replaces it whole rather than merging two lists of senders.
 */
export function eventsOf(ctor: Function): EventSpec[] {
  const merged = new Map<string, EventSource[]>();
  const chain: Function[] = [];
  for (let step: Function | null = ctor; typeof step === "function"; step = Object.getPrototypeOf(step) as Function | null) {
    chain.unshift(step);
  }
  for (const step of chain) {
    const own = Object.getOwnPropertyDescriptor(step, "events")?.value as EventDeclarations | undefined;
    for (const [name, decl] of Object.entries(own ?? {})) merged.set(name, [...decl.from]);
  }
  return [...merged].map(([name, from]) => ({ name, from }));
}

/**
 * Whether this class accepts `name` from `source`. The gateway asks the same question before the
 * event touches the log; the runtime asks it again because a log can be replayed and a hook that
 * runs on an undeclared name is a hook the tenant never agreed to.
 */
export function accepts(ctor: Function, name: string, source: EventSource): boolean {
  const declared = eventsOf(ctor).find((spec) => spec.name === name);
  return declared !== undefined && declared.from.includes(source);
}
