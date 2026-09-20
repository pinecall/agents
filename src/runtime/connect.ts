/** The bridge: an Agent class mounted on a Pinecall client, one live instance per call. */

import type { Camel, CommandData, CommandType, ToolSpec } from "@pinecall/protocol";
import type { Agent as SdkAgent, AgentOptions, Call as SdkCall, Pinecall, Tool } from "../client/index.js";

import { Agent, onChange, onLog, recalled, seal, setCall, setLast } from "../agent/agent.js";
import { eventsOf } from "../agent/accepts.js";
import { visibilityOf } from "../agent/visibility.js";
import { CallWorld, type CallLine, type Searching } from "../call/call.js";
import { describe } from "../agent/docstrings.js";
import { searchesKnowledge } from "../agent/searching.js";
import { runHook, type Call as HookCall } from "../agent/lifecycle.js";
import { snapshot, type LastCall, type Snapshot } from "../agent/state.js";
import { toolNamed } from "../agent/tools.js";
import { PROMPT_BLOCKS } from "../views/layout.js";
import { promptOf } from "../views/render.js";
import { routesOf } from "./channels.js";
import { inOrder, type Serving } from "./dispatch.js";
import { refuseTheEnvironment } from "./environment.js";
import { wordsRecalled } from "./recall.js";
import { runTool, ToolFailed } from "./run-tool.js";

/** What mount needs beyond the class: where to send, and the class's own source. */
export interface MountOptions {
  pc: Pinecall;
  /** The class's own source, so docstrings and parameter types survive compilation. */
  source?: string;
  /** The agent file's own path: the dialect its source is parsed as. */
  file?: string;
  /** Override the slug the class name would give. */
  slug?: string;
  /** Where every instance of this agent reads `this.last(contact)` from. Per mount, never global. */
  last?: LastCall;
  /** False for a console: it serves the call it opens itself and no call that named no app. */
  takesUnclaimed?: boolean;
  /**
   * The state a case opens a call in. Applied after the class's own `onCall` and before the first
   * render, which is the only moment it can be: earlier and `onCall` writes over it, later and the
   * bridge re-renders once per field and shows the model states the call was never in.
   */
  opening?: (call: SdkCall) => Snapshot | undefined;
}

/** A mounted agent: the sdk agent it registered as, and the instances it is serving right now. */
export interface Mounted {
  slug: string;
  agent: SdkAgent;
  options: AgentOptions;
  /** The instance serving one call, while the call lasts. */
  instanceOf(callId: string): Agent | undefined;
}

type Ctor = new () => Agent;

/** How the bridge puts one command on the wire: the sdk agent's own door, bound to a call. */
type Send = <K extends CommandType>(type: K, call: string, data: Camel<CommandData<K>>) => void;

// What was last put on the wire for one call, so the next render is compared against it rather
// than re-sent. A prompt.set the model would read as identical text is a cache miss for nothing.
interface Sent {
  /** Each block's text as last sent, by name. A block never sent is the empty text the runtime starts it as. */
  blocks: Map<string, string>;
  tools?: string;
}

interface Live {
  agent: Agent;
  sent: Sent;
  stop: (() => void)[];
  serving: Serving;
}

/** The slug an agent registers under: its `static slug`, or its class name in kebab-case. */
export function slugOf(ctor: Function): string {
  const declared = (ctor as { slug?: string }).slug;
  if (typeof declared === "string") return declared;
  return ctor.name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .toLowerCase();
}

function stateFieldsOf(ctor: Function): AgentOptions["stateFields"] {
  const declared = visibilityOf(ctor);
  return declared.length === 0 ? undefined : declared;
}

/**
 * Everything the class says about itself, as the declaration the gateway is sent: its doors, its
 * tools, its language, its layout, whether it searches its bases, its visibilities and events —
 * the contract, and nothing of the environment, which is refused here (runtime/environment.ts).
 * The probe is one instance of the class, read and thrown away; mount builds it once and hands it
 * in. Whether the class searches is read off its source — the file's when given, else the class's
 * own body — with the same parser that reads its docstrings.
 */
export function optionsFor(ctor: Ctor, tools: Tool[], instance: Agent = new ctor(), file?: string, source?: string): AgentOptions {
  const probe = instance as unknown as Record<string, unknown>;
  refuseTheEnvironment(probe);
  const options: AgentOptions = { routes: routesOf(probe), tools };
  if (searchesKnowledge(source ?? ctor.toString(), file)) options.usesKnowledge = true;
  const language = probe["language"];
  if (typeof language === "string") options.language = language;
  // The layout is always sent whole: the send order is the framework's contract, and the wire
  // carrying it is what lets the runtime and the console name every block the same way.
  options.prompt = [...PROMPT_BLOCKS];
  const stateFields = stateFieldsOf(ctor);
  if (stateFields) options.stateFields = stateFields;
  const events = eventsOf(ctor);
  if (events.length > 0) options.events = events;
  return options;
}

/**
 * Mount a class on a client: it registers once, and from then on every call gets its own instance,
 * its own state and its own rendered prompt. Nothing is sent until `pc.connect()`.
 */
export function mount(
  ctor: Ctor,
  { pc, source, file, slug, last, opening, takesUnclaimed = true }: MountOptions,
): Mounted {
  if (source !== undefined) describe(ctor, source, file);
  const name = slug ?? slugOf(ctor);
  const live = new Map<string, Live>();
  // One instance to read the class with: its tools and everything it declares about itself are
  // read off the same probe, which is then thrown away. Every call gets an instance of its own.
  const probe = new ctor();
  const tools: Tool[] = probe.tools().map((spec) => ({
    ...(spec as unknown as Camel<ToolSpec>),
    run: (args, call) => call_(live, call, spec.name, args),
  }));
  const options = { ...optionsFor(ctor, tools, probe, file, source), takesUnclaimed };
  const agent = pc.agent(name, options);

  agent.on("call.started", (_payload, call) => {
    if (call !== null) {
      const send: Send = (type, id, data) => agent.command(type, id, data);
      const searching: Searching = (query, k) => pc.search(call.id, query, k);
      void start(ctor, live, call, send, searching, last, opening);
    }
  });
  agent.on("call.ended", (_payload, call) => {
    if (call !== null) void end(live, call);
  });
  return { slug: name, agent, options, instanceOf: (id) => live.get(id)?.agent };
}

// One tool call, routed to the instance that owns this call. A call the bridge is not serving is
// the model talking to a hung-up line, and the model is told so instead of the process throwing.
async function call_(
  live: Map<string, Live>,
  call: SdkCall,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const serving = live.get(call.id);
  if (serving === undefined) throw new ToolFailed(`${name}: this call is no longer being served`);
  const declaration = toolNamed(serving.agent, name);
  if (declaration === undefined) throw new ToolFailed(`${name}: this agent declares no such tool`);
  return runTool(serving.agent, declaration, args);
}

// A call started: build the instance, let onCall write into it, send the whole prompt once, and
// only then start listening — so the opening send is one prompt and not one per field onCall set.
async function start(
  ctor: Ctor,
  live: Map<string, Live>,
  call: SdkCall,
  send: Send,
  searching: Searching,
  last?: LastCall,
  opening?: (call: SdkCall) => Snapshot | undefined,
): Promise<void> {
  const agent = seal(new ctor());
  if (last !== undefined) setLast(agent, last);
  const world = new CallWorld(callLine(call), (type, data) => send(type, call.id, data), searching);
  setCall(agent, world);
  const serving: Serving = { agent, ctor, call: world, warned: new Set<string>(), queue: Promise.resolve() };
  const link: Live = { agent, sent: { blocks: new Map() }, stop: [], serving };
  live.set(call.id, link);
  await runHook(agent, "onCall", hookCall(call));
  const wanted = opening?.(call);
  if (wanted !== undefined) agent.startIn(wanted);
  call.setState(snapshot(agent));
  sync(link, call);
  link.stop.push(
    onChange(agent, (change) => {
      call.setState(snapshot(agent), [change.field]);
      // state.set carries no cause on the wire, so the reason a field moved goes in the log next
      // to it: one line naming the event, the field and the event's place in this call's stream.
      const cause = world.cause;
      if (cause !== null) call.log("state.cause", { field: change.field, kind: "event", ...cause });
      sync(link, call);
    }),
    onLog(agent, (entry) => call.log(entry.name, dataOf(entry.data))),
    call.onAny((event) => {
      world.take(event.type, event.data as Record<string, unknown>, Date.now());
      if (event.type === "event.received") void received(serving, event.data);
      // What memory found is not state and moves no field, so nothing else would re-render — and a
      // `render()` that asks what the agent remembers is a different prompt once it has an answer.
      if (event.type === "memory.ops") {
        recalled(agent, wordsRecalled(event.data));
        sync(link, call);
      }
    }),
  );
}

// One outside fact, numbered by this call rather than by the wire: camelEvent hands listeners the
// event without the entry's own seq, so the hook is told where the fact sits in this call's own
// stream of them. See docs/decisions/agent-events.md.
async function received(serving: Serving, data: unknown): Promise<void> {
  const fact = data as { name: string; data: Record<string, unknown>; source: "app" | "participant"; identity?: string };
  await inOrder(serving, {
    name: fact.name,
    data: fact.data,
    source: fact.source,
    seq: serving.call.numbered(),
    ...(fact.identity === undefined ? {} : { identity: fact.identity }),
  });
}

async function end(live: Map<string, Live>, call: SdkCall): Promise<void> {
  const link = live.get(call.id);
  if (link === undefined) return;
  live.delete(call.id);
  for (const stop of link.stop) stop();
  await runHook(link.agent, "onEnd", hookCall(call));
  setCall(link.agent, null);
}

// The one rule this card exists for: render, then compare with what this call was last sent, and
// send only the block whose text is different. Tools are compared as their whole declaration,
// because a `when` flipping changes the list and nothing else about a spec ever changes mid-call.
function sync(serving: Live, call: SdkCall): void {
  const { blocks } = promptOf(serving.agent);
  for (const block of blocks) {
    if (block.text === (serving.sent.blocks.get(block.name) ?? "")) continue;
    serving.sent.blocks.set(block.name, block.text);
    call.setPrompt(block.name, block.text);
  }
  const visible = serving.agent.visibleTools();
  const key = JSON.stringify(visible);
  if (key !== serving.sent.tools) {
    serving.sent.tools = key;
    call.setTools(visible as unknown as Camel<ToolSpec>[]);
  }
}

function hookCall(call: SdkCall): HookCall {
  const hook: HookCall = { id: call.id, contact: call.contact?.id ?? call.from ?? "" };
  if (call.from !== null) hook.from = call.from;
  if (call.channel !== null) hook.channel = call.channel;
  return hook;
}

// What the CLASS holds is the hook's call and one thing more: the day this call opened, which the
// wire carries and `onCall` has no field for. Built here because it was dropped here — the world
// took `hookCall`'s shape, so `this.call.today` was undefined in every mounted agent and an agenda
// asking for "today" silently fell back to the machine's clock.
function callLine(call: SdkCall): CallLine {
  return { ...hookCall(call), today: call.today };
}

// call.log carries an object; a tool that logged a number still deserves a line, so a value that
// is not an object travels under `value` rather than being dropped at the door.
function dataOf(data: unknown): Record<string, unknown> {
  if (data === undefined) return {};
  if (typeof data === "object" && data !== null && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  return { value: data };
}
