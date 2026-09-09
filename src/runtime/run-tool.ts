/** Running one tool call: the args are checked, the method runs, and the result is cut to a preview. */

import type { ToolDeclaration } from "../agent/tools.js";

/**
 * A tool that did not run, or ran and failed, said in words a model may read. The SDK turns a
 * rejection into a tool.result carrying `error`, which is the only way the model hears about it.
 */
export class ToolFailed extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolFailed";
  }
}

interface Parameters {
  properties?: Record<string, { type?: string }>;
  required?: string[];
}

// The model fills a JSON object; the method takes positional arguments. The schema's property
// order is the signature's order — parametersOf writes it from the parsed parameter list — so the
// object becomes the argument list by walking the same keys.
function orderOf(parameters: Parameters): string[] {
  return Object.keys(parameters.properties ?? {});
}

function typeOf(value: unknown): string {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  return typeof value;
}

// Only the shapes the schema can actually state are checked: a required name that is missing, and
// a value whose JSON type is not the declared one. Anything deeper — a Slot's own fields — is the
// app's to check, because the framework never saw the type behind the alias.
function complaintsAbout(parameters: Parameters, args: Record<string, unknown>): string[] {
  const properties = parameters.properties ?? {};
  const complaints: string[] = [];
  for (const name of parameters.required ?? []) {
    if (args[name] === undefined) complaints.push(`${name} is required`);
  }
  for (const [name, schema] of Object.entries(properties)) {
    const value = args[name];
    const wanted = schema.type;
    if (value === undefined || wanted === undefined) continue;
    if (typeOf(value) !== wanted) {
      complaints.push(`${name} must be a ${wanted}, not a ${typeOf(value)}`);
    }
  }
  return complaints;
}

/** What the model sent, checked against the tool's own schema; empty means it may run. */
export function validate(declaration: ToolDeclaration, args: Record<string, unknown>): string[] {
  return complaintsAbout(declaration.spec.parameters as Parameters, args ?? {});
}

/** The model's object as the method's argument list, in the signature's own order. */
export function argumentsFor(
  declaration: ToolDeclaration,
  args: Record<string, unknown>,
): unknown[] {
  return orderOf(declaration.spec.parameters as Parameters).map((name) => args?.[name]);
}

/**
 * What the model sees of a result. `preview: 2` means the model reads two rows and the state field
 * keeps every one of them, so the agent can offer a third without asking the agenda again.
 */
export function preview(declaration: ToolDeclaration, result: unknown): unknown {
  const rows = declaration.options.preview;
  if (rows === undefined || !Array.isArray(result) || result.length <= rows) return result;
  return result.slice(0, rows);
}

/**
 * Run one tool call against a live agent: check, call, cut.
 *
 * The method is reached through the instance and not through `declaration.method`, because the
 * decorator's wrapper is what gives every `this.slot = …` inside it the tool's name as its author.
 */
export async function runTool(
  agent: object,
  declaration: ToolDeclaration,
  args: Record<string, unknown>,
): Promise<unknown> {
  const complaints = validate(declaration, args);
  if (complaints.length > 0) {
    throw new ToolFailed(`${declaration.name}: ${complaints.join("; ")}`);
  }
  const method = (agent as Record<string, unknown>)[declaration.name];
  if (typeof method !== "function") {
    throw new ToolFailed(`${declaration.name}: this agent has no such method any more`);
  }
  const result: unknown = await (method as (...rest: unknown[]) => unknown).apply(
    agent,
    argumentsFor(declaration, args),
  );
  return preview(declaration, result);
}
