/** The tool registry: what a class declares, what the wire is sent, and what the state shows now. */

import { z } from "zod";
import type { ToolSpec } from "@pinecall/protocol";
import { classDoc, docsVersion, methodDoc, methodParams, type ParamDoc } from "./docstrings.js";
import type { StageOf } from "./stages.js";
import { snapshot, type Snapshot } from "./state.js";

// One tool exactly as the gateway receives it: the generator owns that shape, so we import it
// instead of keeping a copy that can drift. Field names are the wire's (snake_case).
export type { ToolSpec };

// read looks at the world; write changes it and can be undone; irreversible changes it for good,
// so the platform asks the caller first. The three words are the wire's, not ours.
export type SideEffect = NonNullable<ToolSpec["side_effect"]>;

/**
 * Everything `@tool({...})` accepts, and nothing else. `T` is the class the decorator was written
 * on — TypeScript infers it from the prototype the decorator is handed, so `when` gets the real
 * state and `s.identified` is a boolean instead of `s["identified"]` being unknown.
 */
export interface ToolOptions<T = unknown> {
  /** Visibility, and the only one there is: a question asked of the state, on every change. */
  when?: (state: Snapshot<T>) => boolean;
  /**
   * Visible while the state is in one of these stages — sugar the decorator lowers to the `when`
   * above. The names are typed against the class's own `stage` field, so a misspelling is a
   * compile error; with a `when` beside it, the tool is there where both hold.
   */
  stage?: StageOf<T> | StageOf<T>[];
  /** The receipt the agent reads AFTER the tool ran, `{{result.when}}` filled from what it returned. */
  confirm?: string;
  /** How many rows of a list result the model sees; the field itself keeps them all. */
  preview?: number;
  /** Parameter names that carry personal data, masked in the log by declaration. */
  pii?: string[];
  /** How long the platform waits for this method, in seconds. */
  timeout?: number;
  /** An explicit schema, when the signature's types are not enough. Optional, never required. */
  params?: z.ZodObject;
}

// The registry keeps tools from every class at once, so the class each `when` was written against
// is erased on the way in: the framework only ever calls it with the erased snapshot it just took.
export type ErasedToolOptions = ToolOptions<any>;

/** One declared tool: the wire's half, the halves the wire never sees, and the method itself. */
export interface ToolDeclaration {
  name: string;
  options: ErasedToolOptions;
  method: (...args: unknown[]) => unknown;
  owner: Function;
  spec: ToolSpec;
}

/** A declaration the platform would refuse before the app's method ever ran. */
export class DeclarationRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeclarationRefused";
  }
}

interface Declared {
  name: string;
  options: ErasedToolOptions;
  method: (...args: unknown[]) => unknown;
}

// Keyed by the prototype the decorator was handed, so a tool is declared once per class and not
// once per instance. The chain is walked at read time, so a subclass inherits its parent's tools.
const registries = new WeakMap<object, Map<string, Declared>>();
const specs = new WeakMap<object, Map<string, { spec: ToolSpec; version: number }>>();

const A_NAME_A_MODEL_CAN_CALL = /^[A-Za-z][A-Za-z0-9_]*$/;

/** Record one decorated method against the class that declared it. */
export function register(prototype: object, declared: Declared): void {
  if (!A_NAME_A_MODEL_CAN_CALL.test(declared.name)) {
    throw new DeclarationRefused(`a tool name is one word a model can call, not ${declared.name}`);
  }
  let registry = registries.get(prototype);
  if (!registry) {
    registry = new Map();
    registries.set(prototype, registry);
  }
  registry.set(declared.name, declared);
}

// string, number and boolean are the three a model fills directly. A shape the source could resolve
// — a Slot, a Patient — arrives already expanded in `param.schema`; this maps what is left, the
// types a scraped class body still gives as bare text, and an open object is the honest answer.
function schemaOf(type: string | undefined): Record<string, unknown> {
  const name = (type ?? "").split(" ").join("");
  if (name.includes("=>")) return { description: "callback" };
  if (name.endsWith("[]")) return { type: "array", items: schemaOf(name.slice(0, -2)) };
  if (name === "string" || name === "number" || name === "boolean") return { type: name };
  return { type: "object", additionalProperties: true };
}

/** The JSON Schema a model must satisfy, from an explicit zod object or from the signature. */
export function parametersOf(params: ParamDoc[], explicit?: z.ZodObject): Record<string, unknown> {
  if (explicit) return z.toJSONSchema(explicit) as Record<string, unknown>;
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const param of params) {
    const schema = param.schema ?? schemaOf(param.type);
    properties[param.name] = schema;
    // A callback is the app's own plumbing: the model cannot write one, so it is never asked for.
    if (!param.optional && schema["description"] !== "callback") required.push(param.name);
  }
  return { type: "object", properties, required, additionalProperties: false };
}

/** Build the wire spec for one declared tool, refusing what the gateway would refuse. */
function specFor(ctor: Function, declared: Declared): ToolSpec {
  const description = methodDoc(ctor, declared.name);
  if (!description) {
    throw new DeclarationRefused(
      `tool ${declared.name}: without a docstring no model can choose it; ` +
        `write a /** one line */ above the method`,
    );
  }
  const options = declared.options;
  const parameters = parametersOf(methodParams(ctor, declared.name), options.params);
  const properties = (parameters["properties"] ?? {}) as Record<string, unknown>;
  const unknownPii = (options.pii ?? []).filter((field) => !(field in properties));
  if (unknownPii.length > 0) {
    throw new DeclarationRefused(
      `tool ${declared.name}: pii names parameters the tool has; unknown: ${unknownPii.join(", ")}`,
    );
  }
  // A read-back is what makes a tool irreversible: the platform reads it, hears the yes, then runs.
  const spec: ToolSpec = {
    name: declared.name,
    description,
    parameters,
    side_effect: options.confirm ? "irreversible" : "read",
  };
  if (options.confirm !== undefined) spec.confirm = options.confirm;
  if (options.pii !== undefined) spec.pii = [...options.pii];
  if (options.timeout !== undefined) spec.timeout_s = options.timeout;
  return spec;
}

function cachedSpec(ctor: Function, prototype: object, declared: Declared): ToolSpec {
  let byName = specs.get(prototype);
  if (!byName) {
    byName = new Map();
    specs.set(prototype, byName);
  }
  const known = byName.get(declared.name);
  if (known && known.version === docsVersion()) return known.spec;
  const spec = specFor(ctor, declared);
  byName.set(declared.name, { spec, version: docsVersion() });
  return spec;
}

// A `stage` is a question about the class's own `stage` field, so a class that declares none would
// hide every staged tool for the whole call. The compiler says so first; this is the same sentence
// for a class written in JavaScript, and it is read at mount, before a model ever sees the list.
function refuseAStageWithNoField(agent: object, ctor: Function, name: string): void {
  if ("stage" in agent) return;
  throw new DeclarationRefused(
    `tool ${name}: stage names a value of this agent's own stage field, and ${ctor.name} ` +
      `declares none; add \`stage: Stages<"…"> = "…"\` to the class, or ask when(state) instead`,
  );
}

/** Every tool this agent declares, its own class's first, then the ones it inherits. */
export function toolsOf(agent: object): ToolDeclaration[] {
  const ctor = (agent as { constructor: Function }).constructor;
  const declarations: ToolDeclaration[] = [];
  const seen = new Set<string>();
  for (
    let prototype: object | null = Object.getPrototypeOf(agent);
    prototype && prototype !== Object.prototype;
    prototype = Object.getPrototypeOf(prototype)
  ) {
    for (const declared of registries.get(prototype)?.values() ?? []) {
      if (seen.has(declared.name)) continue;
      seen.add(declared.name);
      if (declared.options.stage !== undefined) refuseAStageWithNoField(agent, ctor, declared.name);
      declarations.push({
        name: declared.name,
        options: declared.options,
        method: declared.method,
        owner: (prototype as { constructor: Function }).constructor,
        spec: cachedSpec(ctor, prototype, declared),
      });
    }
  }
  return declarations;
}

/** One declared tool by the name the model calls. */
export function toolNamed(agent: object, name: string): ToolDeclaration | undefined {
  return toolsOf(agent).find((declared) => declared.name === name);
}

/** The tools the state shows right now: `when` is asked of a snapshot, never of a stage. */
export function visibleToolsOf(agent: object): ToolDeclaration[] {
  const state = snapshot(agent);
  return toolsOf(agent).filter((declared) => declared.options.when?.(state) ?? true);
}

/** The specs a model may call right now — the list the runtime puts in the request. */
export function visibleTools(agent: object): ToolSpec[] {
  return visibleToolsOf(agent).map((declared) => declared.spec);
}

/** The docstring of the agent's own class, as the model reads it above everything else. */
export function docOf(agent: object): string | undefined {
  return classDoc((agent as { constructor: Function }).constructor);
}
