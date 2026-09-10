/** Docstrings at runtime: a class's own source, read by oxc's parser for its JSDoc and its parameters. */

import { parseSync } from "oxc-parser";
import type {
  Class,
  ClassElement,
  Comment,
  FormalParameter,
  ParamPattern,
  Statement,
  TSInterfaceDeclaration,
  TSSignature,
  TSType,
  TSTypeAliasDeclaration,
} from "oxc-parser";

// Why source text and not a decorator argument: the design writes the prompt as a JSDoc above the
// method, and a JSDoc is the one place a human already keeps that sentence. The toolchain leaves
// those comments in the transpiled class body, so `Ctor.toString()` is enough for the docs and the
// parameter NAMES; the TS types are gone by then, so a caller that has the real .ts source hands it
// to describe() and gets the types too. That call is the whole interface a build-time transformer
// has to satisfy — see docs/decisions/agent.md.
//
// Why a real parser and not regexes: a signature is a language, and a regex reading one loses the
// moment a type has parens or commas of its own, and can never follow `slot: Slot` to the interface
// that says what a Slot is. Why oxc's and not TypeScript's: the workspace type-checks with
// TypeScript 7, the Go port, which ships no JS parser at all — reaching for one would mean a second
// TypeScript in the tree. oxc is the parser this toolchain already transforms with, it is native,
// it takes a string, and it needs no files on disk and no spawned server.

/** One parameter of a tool method, as the source declares it. */
export interface ParamDoc {
  name: string;
  type?: string;
  optional: boolean;
  /**
   * The JSON Schema only the file could give: an interface or a type literal expanded into its
   * properties. Left unset when the type text says it all — `string`, `number[]`, a callback.
   */
  schema?: Record<string, unknown>;
}

/** What a class says about itself and its methods. */
export interface ClassDocs {
  doc?: string;
  methods: Map<string, { doc?: string; params: ParamDoc[] }>;
}

const registered = new WeakMap<Function, ClassDocs>();
const scraped = new WeakMap<Function, ClassDocs>();

/** The interfaces and aliases the same file declares, by name: how far a type can be followed. */
type Declared = Map<string, TSInterfaceDeclaration | TSTypeAliasDeclaration>;

/** An open object: the honest answer for a type this file cannot see the shape of. */
const ANY_OBJECT = { type: "object", additionalProperties: true } as const;

/** The source and its JSDoc blocks: everything a node needs to answer what is written above it. */
interface Source {
  text: string;
  jsdoc: Comment[];
}

/** Fold a JSDoc's lines into the one sentence a model should read, tags left out. */
function oneLine(value: string): string | undefined {
  const lines: string[] = [];
  for (const raw of value.split("\n")) {
    let line = raw.trim();
    while (line.startsWith("*")) line = line.slice(1).trim();
    // A tag line ends the description: `@param` and friends are not part of the sentence.
    if (line.startsWith("@")) break;
    if (line.length > 0) lines.push(line);
  }
  const flat = lines.join(" ");
  return flat.length > 0 ? flat : undefined;
}

/**
 * The docstring attached to a position: the last JSDoc block that closed above it with nothing but
 * whitespace in between. That gap is the whole definition of "attached" — decorators live inside
 * the node's own span, so a decorated method is still reached by its comment.
 */
function docAt(start: number, source: Source): string | undefined {
  let found: Comment | undefined;
  for (const comment of source.jsdoc) {
    if (comment.end > start) break;
    if (source.text.slice(comment.end, start).trim().length === 0) found = comment;
  }
  return found ? oneLine(found.value) : undefined;
}

/** The type as the source writes it: the span the parser gives, read back out of the text. */
function textOf(node: TSType, source: Source): string {
  return source.text.slice(node.start, node.end);
}

/** A statement as the file declares it, with `export` peeled off so both forms read the same. */
function declarationOf(statement: Statement): Statement {
  if (statement.type === "ExportNamedDeclaration" && statement.declaration) return statement.declaration;
  if (statement.type === "ExportDefaultDeclaration") return statement.declaration as Statement;
  return statement;
}

/** Every interface and type alias the file declares at its top level. */
function declaredTypes(body: Statement[]): Declared {
  const types: Declared = new Map();
  for (const statement of body) {
    const declared = declarationOf(statement);
    if (declared.type === "TSInterfaceDeclaration" || declared.type === "TSTypeAliasDeclaration") {
      types.set(declared.id.name, declared);
    }
  }
  return types;
}

/** The class this source is about, and where its docstring may sit: the `export default` if there is one. */
function theClass(body: Statement[]): { node: Class; start: number } | undefined {
  let first: { node: Class; start: number } | undefined;
  for (const statement of body) {
    const declared = declarationOf(statement);
    if (declared.type !== "ClassDeclaration" && declared.type !== "ClassExpression") continue;
    const found = { node: declared as Class, start: statement.start };
    if (statement.type === "ExportDefaultDeclaration") return found;
    first ??= found;
  }
  return first;
}

/** `undefined` and `null` inside a union: what makes the parameter optional instead of a type. */
function isNothing(node: TSType): boolean {
  return node.type === "TSUndefinedKeyword" || node.type === "TSNullKeyword";
}

/** The JSON Schema of a type the model must fill, following aliases declared in the same file. */
function jsonOf(node: TSType, types: Declared, seen: Set<string>): Record<string, unknown> {
  if (node.type === "TSStringKeyword") return { type: "string" };
  if (node.type === "TSNumberKeyword") return { type: "number" };
  if (node.type === "TSBooleanKeyword") return { type: "boolean" };
  // A callback is the app's own plumbing — the tool takes it, the model never writes one.
  if (node.type === "TSFunctionType") return { description: "callback" };
  if (node.type === "TSArrayType") return { type: "array", items: jsonOf(node.elementType, types, seen) };
  if (node.type === "TSParenthesizedType") return jsonOf(node.typeAnnotation, types, seen);
  if (node.type === "TSTypeLiteral") return objectOf(node.members, types, seen);
  if (node.type === "TSUnionType") return unionOf(node.types, types, seen);
  if (node.type === "TSLiteralType") return literalOf(node);
  if (node.type === "TSTypeReference" && node.typeName.type === "Identifier") {
    return referenceOf(node.typeName.name, types, seen);
  }
  return { ...ANY_OBJECT };
}

/** A type name followed one level into the file that declares it; a name from elsewhere stays a name. */
function referenceOf(name: string, types: Declared, seen: Set<string>): Record<string, unknown> {
  // A type that contains itself would expand forever; the name is what a model gets instead.
  const declared = seen.has(name) ? undefined : types.get(name);
  if (!declared) return { type: "object", description: name };
  const deeper = new Set(seen).add(name);
  if (declared.type === "TSInterfaceDeclaration") return objectOf(declared.body.body, types, deeper);
  return jsonOf(declared.typeAnnotation, types, deeper);
}

/** The members of an interface or an object type, as properties and the ones that are required. */
function objectOf(members: TSSignature[], types: Declared, seen: Set<string>): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const member of members) {
    if (member.type !== "TSPropertySignature" || member.key.type !== "Identifier") continue;
    const type = member.typeAnnotation?.typeAnnotation;
    properties[member.key.name] = type ? jsonOf(type, types, seen) : { ...ANY_OBJECT };
    if (!member.optional) required.push(member.key.name);
  }
  return { type: "object", properties, required, additionalProperties: false };
}

/** The value a literal type carries; a template or an expression carries none. */
function valueOf(node: TSType): unknown {
  if (node.type !== "TSLiteralType") return undefined;
  return "value" in node.literal ? node.literal.value : undefined;
}

/** `'a' | 'b'` is a string a model must choose from; anything wider is just an object. */
function unionOf(members: TSType[], types: Declared, seen: Set<string>): Record<string, unknown> {
  const real = members.filter((one) => !isNothing(one));
  if (real.length === 1 && real[0]) return jsonOf(real[0], types, seen);
  const values = real.map(valueOf).filter((value) => typeof value === "string");
  if (values.length === real.length && real.length > 0) return { type: "string", enum: values };
  return { ...ANY_OBJECT };
}

/** A literal type is its own value's type: `'a'` is a string, `1` a number, `true` a boolean. */
function literalOf(node: TSType): Record<string, unknown> {
  const value = valueOf(node);
  if (typeof value === "string") return { type: "string", enum: [value] };
  if (typeof value === "number") return { type: "number" };
  if (typeof value === "boolean") return { type: "boolean" };
  return { ...ANY_OBJECT };
}

/** A type the text alone already describes: the registry maps those, so no schema is carried. */
function plainType(node: TSType): boolean {
  if (node.type === "TSStringKeyword") return true;
  if (node.type === "TSNumberKeyword") return true;
  if (node.type === "TSBooleanKeyword") return true;
  if (node.type === "TSFunctionType") return true;
  return node.type === "TSArrayType" && plainType(node.elementType);
}

/** One parameter: its name, the type as the source writes it, and whether it may be left out. */
function paramOf(node: ParamPattern, source: Source, types: Declared): ParamDoc | undefined {
  const defaulted = node.type === "AssignmentPattern";
  const binding = (defaulted ? node.left : node) as FormalParameter;
  // A destructured parameter names no field a model could fill, so it is not offered as one.
  if (binding.type !== "Identifier") return undefined;
  let type = binding.typeAnnotation?.typeAnnotation;
  let optional = defaulted || Boolean(binding.optional);
  if (type?.type === "TSUnionType") {
    const real = type.types.filter((one) => !isNothing(one));
    if (real.length < type.types.length) optional = true;
    if (real.length === 1 && real[0]) type = real[0];
  }
  const param: ParamDoc = { name: binding.name, optional };
  if (type) param.type = textOf(type, source);
  if (type && !plainType(type)) param.schema = jsonOf(type, types, new Set());
  return param;
}

/** The parameters a class member declares — a method has its own, a field has a function's or none. */
function paramsOf(member: ClassElement, source: Source, types: Declared): ParamDoc[] {
  const holder =
    member.type === "MethodDefinition"
      ? member.value
      : member.type === "PropertyDefinition" &&
          (member.value?.type === "ArrowFunctionExpression" || member.value?.type === "FunctionExpression")
        ? member.value
        : undefined;
  if (!holder || holder.type === "TSEmptyBodyFunctionExpression") return [];
  return holder.params.map((param) => paramOf(param, source, types)).filter((param) => param !== undefined);
}

/**
 * Read a class's JSDoc and method signatures out of source text. Works on the real file (types and
 * the class's own docstring included) and on `Ctor.toString()` (the class body alone).
 *
 * `file` is the name that source came from, and it is not decoration: the parser reads the dialect
 * off the extension. A class with a `render()` lives in `agent.tsx` and its JSX is a syntax error
 * as .ts, while a class that writes `<Slot>row` as a cast is a syntax error as .tsx — so the name
 * of the file is the one thing that can tell the two apart, and it travels from whoever read it.
 */
export function parseClassSource(text: string, file = "agent.tsx"): ClassDocs {
  const docs: ClassDocs = { methods: new Map() };
  const parsed = parseSync(file, text, { sourceType: "module" });
  const source: Source = {
    text,
    jsdoc: parsed.comments.filter((one) => one.type === "Block" && one.value.startsWith("*")),
  };
  const body = parsed.program.body as Statement[];
  const found = theClass(body);
  if (!found) return docs;
  const doc = docAt(found.start, source);
  if (doc) docs.doc = doc;
  const types = declaredTypes(body);
  for (const member of found.node.body.body) {
    const method = member.type === "MethodDefinition" && (member.kind === "method" || member.kind === "get");
    if (!method && member.type !== "PropertyDefinition") continue;
    if (member.key.type !== "Identifier") continue;
    const name = member.key.name;
    if (docs.methods.has(name)) continue;
    const entry: { doc?: string; params: ParamDoc[] } = { params: paramsOf(member, source, types) };
    const memberDoc = docAt(member.start, source);
    if (memberDoc) entry.doc = memberDoc;
    docs.methods.set(name, entry);
  }
  return docs;
}

// Every describe() moves this on, so anything that cached a spec built from the scraped body knows
// it is looking at an older answer than the one the source can now give.
let version = 0;

/** How many times a class has been handed its own source; a cache invalidator, nothing more. */
export function docsVersion(): number {
  return version;
}

/** Hand a class its own source, so its docstrings and parameter types are readable at runtime. */
export function describe(ctor: Function, source: string, file?: string): ClassDocs {
  const docs = parseClassSource(source, file);
  registered.set(ctor, docs);
  version++;
  return docs;
}

/** What this class documents about itself: what describe() was given, or its own body. */
export function docsOf(ctor: Function): ClassDocs {
  const given = registered.get(ctor);
  if (given) return given;
  let own = scraped.get(ctor);
  if (!own) {
    own = parseClassSource(ctor.toString());
    scraped.set(ctor, own);
  }
  return own;
}

/** The class docstring, read from its source or from an explicit `static doc`. */
export function classDoc(ctor: Function): string | undefined {
  return docsOf(ctor).doc ?? (ctor as { doc?: string }).doc;
}

/** A class and the classes it extends, most derived first, stopping before Function itself. */
function chain(ctor: Function): Function[] {
  const classes: Function[] = [];
  for (let current: unknown = ctor; typeof current === "function"; current = Object.getPrototypeOf(current)) {
    if (current === Function.prototype) break;
    classes.push(current as Function);
  }
  return classes;
}

/** The docstring of one method, looked up along the prototype chain. */
export function methodDoc(ctor: Function, name: string): string | undefined {
  for (const current of chain(ctor)) {
    const doc = docsOf(current).methods.get(name)?.doc;
    if (doc) return doc;
  }
  return undefined;
}

/** The parameters of one method, looked up along the prototype chain. */
export function methodParams(ctor: Function, name: string): ParamDoc[] {
  for (const current of chain(ctor)) {
    const found = docsOf(current).methods.get(name);
    if (found) return found.params;
  }
  return [];
}
