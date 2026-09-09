// The bridge, against a gateway that is not there: what the class does becomes what the wire sees.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, expect, it } from "vitest";
import { Pinecall } from "../../src/client/index.js";
import { FakeGateway } from "../../src/client/testing/index.js";

import ClinicaNorte from "../agent/clinica-norte.js";
import view from "../views/clinica-norte.view.js";
import { modelOf, mount, optionsFor, slugOf, type Mounted } from "../../src/runtime/connect.js";
import type { Views } from "../../src/views/layout.js";

const KEY = "pk_test";
const SLUG = "clinica-norte";
const CALL = "CA_1";
const KNOWN = "+34 600 000 001";
// The class's own .ts, so the parameter types survive a transpiler that strips them: without it
// `day: string` is an untyped argument and the schema can say nothing about it. Its path is what
// the knowledge file is found beside.
const FILE = fileURLToPath(new URL("../agent/clinica-norte.ts", import.meta.url));
const SOURCE = readFileSync(FILE, "utf8");

let gateway: FakeGateway;
let pc: Pinecall;
let mounted: Mounted;

beforeEach(async () => {
  gateway = await FakeGateway.start({ apiKey: KEY });
  pc = new Pinecall({ url: gateway.url, apiKey: KEY });
  // A tool that failed reaches the model as a tool.result and the app as an error; the tests read
  // the wire, so the app's side is silenced rather than printed by the client's default.
  pc.onErrors(() => {});
});

afterEach(async () => {
  pc.close();
  await gateway.close();
});

/** Let every promise the socket started settle: the bridge's own work is all awaited, not timed. */
async function settled(): Promise<void> {
  for (let turn = 0; turn < 20; turn++) await new Promise((resolve) => setTimeout(resolve, 1));
}

async function connected(views: Views = { view }, ctor: typeof ClinicaNorte = ClinicaNorte): Promise<void> {
  mounted = mount(ctor, { pc, views, source: SOURCE, file: FILE, slug: SLUG });
  await pc.connect();
  await settled();
}

function started(from = KNOWN): void {
  gateway.emit(SLUG, CALL, "call.started", {
    channel: "phone",
    direction: "inbound",
    from,
    to: "+34 910 000 000",
    caller: null,
    started_at: Date.now() / 1000,
  });
}

function calls(name: string, args: Record<string, unknown>, id = `t${name}`): void {
  gateway.emit(SLUG, CALL, "tool.call", { call_id: id, name, arguments: args });
}

function commands(type: string): Record<string, unknown>[] {
  return gateway.commandsOf(type).map((command) => command.data);
}

it("registers the class under its name in kebab-case, with its four tools and its three doors", async () => {
  await connected();
  expect(slugOf(ClinicaNorte)).toBe(SLUG);
  const [register] = commands("agent.register");
  expect(register?.["routes"]).toEqual([
    { channel: "phone", number: "+34 910 000 000" },
    { channel: "whatsapp", number: "clinica-norte" },
    { channel: "web", number: null },
  ]);
  const config = commands("agent.configure")[0]?.["config"] as { tools: { name: string }[]; prompt: unknown };
  expect(config.tools.map((tool) => tool.name)).toEqual([
    "findPatient",
    "freeSlots",
    "book",
    "transfer",
  ]);
  // The layout travels whole, in the one order the blocks are sent.
  expect(config.prompt).toEqual([
    { name: "identity", region: "static" },
    { name: "knowledge", region: "static" },
    { name: "tools", region: "static" },
    { name: "view", region: "dynamic" },
  ]);
});

it("sends every block that has text, in send order, and the visible tools when a call starts", async () => {
  await connected();
  started();
  await settled();
  expect(commands("prompt.set").map((data) => data["name"])).toEqual(["identity", "knowledge", "tools", "view"]);
  const [tools] = commands("tools.set");
  expect((tools?.["tools"] as { name: string }[]).map((tool) => tool.name)).toEqual([
    "freeSlots",
    "transfer",
  ]);
});

it("sends state.set and no prompt.set when the tool wrote a field the view never reads", async () => {
  // A view that reads two getters and nothing else: `slots` changing cannot change its text.
  await connected({
    view: ({ identified, done }: Record<string, any>) => (
      <p>{identified ? "identificado" : "sin identificar"} {done ? "cerrado" : "abierto"}</p>
    ),
  });
  started();
  await settled();
  const before = commands("prompt.set").length;
  calls("freeSlots", { day: "2026-03-02" });
  await settled();
  expect(commands("state.set").at(-1)?.["changed"]).toEqual(["slots"]);
  expect(commands("prompt.set")).toHaveLength(before);
});

it("sends one prompt.set when the tool wrote a field the view does read", async () => {
  await connected();
  started("+34 000 000 000");
  await settled();
  const before = commands("prompt.set").length;
  calls("findPatient", { name: "Ana", phone: KNOWN });
  await settled();
  const sent = commands("prompt.set").slice(before);
  expect(sent).toHaveLength(1);
  expect(sent[0]?.["name"]).toBe("view");
  expect(String(sent[0]?.["text"])).toContain("Ana");
});

/** The clinic with a dynamic block of its own, fed by freeSlots and sent only when it changes. */
class ConDisponibilidad extends ClinicaNorte {
  static override prompt = { dynamic: ["availability"] };
}

const availability = ({ slots }: Record<string, any>) => (
  <>{slots.length > 0 && <p>Horas libres: {slots.map((slot: { when: string }) => slot.when).join(", ")}</p>}</>
);

it("sends a declared block by its name, before the view, and only when its text changed", async () => {
  await connected({ view, availability }, ConDisponibilidad);
  const config = commands("agent.configure")[0]?.["config"] as { prompt: { name: string }[] };
  expect(config.prompt.map((block) => block.name)).toEqual(["identity", "knowledge", "tools", "availability", "view"]);
  started();
  await settled();
  // Empty at the start: a block with nothing to say is not sent at all.
  expect(commands("prompt.set").map((data) => data["name"])).toEqual(["identity", "knowledge", "tools", "view"]);

  calls("freeSlots", { day: "2026-03-02" });
  await settled();
  const sent = commands("prompt.set").slice(4);
  expect(sent.map((data) => data["name"])).toEqual(["availability", "view"]);
  expect(String(sent[0]?.["text"])).toContain("2026-03-02 10:00");
});

it("refuses at mount a declared block nobody wrote a view for", () => {
  expect(() => mount(ConDisponibilidad, { pc, views: { view }, source: SOURCE, slug: SLUG })).toThrow(
    "prompt block availability: ConDisponibilidad declares it and no view was given for it",
  );
});

it("sends tools.set with the new visible set when a `when` flips", async () => {
  await connected();
  started();
  await settled();
  calls("freeSlots", { day: "2026-03-02" });
  await settled();
  const visible = commands("tools.set").at(-1)?.["tools"] as { name: string }[];
  expect(visible.map((tool) => tool.name)).toEqual(["freeSlots", "book", "transfer"]);
});

it("answers a tool call whose args fail validation with an error, and runs the next one", async () => {
  await connected();
  started();
  await settled();
  calls("book", { slot: "mañana a las diez" }, "t-bad");
  await settled();
  const refused = commands("tool.result").at(-1);
  expect(refused?.["call_id"]).toBe("t-bad");
  expect(String(refused?.["error"])).toContain("slot must be a object");
  expect(refused?.["output"]).toBeUndefined();

  calls("freeSlots", { day: "2026-03-02" }, "t-good");
  await settled();
  const ran = commands("tool.result").at(-1);
  expect(ran?.["call_id"]).toBe("t-good");
  expect(ran?.["error"]).toBeUndefined();
  // preview: 2 — the model reads two of the three the agenda returned.
  expect(ran?.["output"]).toHaveLength(2);
});

it("writes what the agent logged into the call's log", async () => {
  await connected();
  started();
  await settled();
  calls("freeSlots", { day: "2026-03-02" });
  await settled();
  calls("book", { slot: { when: "2026-03-02 10:00", doctor: "Ruiz" } });
  await settled();
  const [logged] = commands("call.log");
  expect(logged?.["name"]).toBe("appointment.booked");
  expect(logged?.["data"]).toMatchObject({ id: "b-p1" });
});

const ended: string[] = [];

/** The same clinic, saying out loud that its call ended: onEnd is a method, never a field. */
class Despedida extends ClinicaNorte {
  override onEnd(call: { id: string }): void {
    ended.push(call.id);
  }
}

it("runs onEnd and forgets the instance when the call ends", async () => {
  await connected({ view }, Despedida);
  started();
  await settled();
  expect(mounted.instanceOf(CALL)).toBeInstanceOf(Despedida);
  gateway.emit(SLUG, CALL, "call.ended", {
    reason: "caller_hung_up",
    ended_by: "caller",
    ended_at: Date.now() / 1000,
    duration_s: 12,
  });
  await settled();
  expect(ended).toEqual([CALL]);
  expect(mounted.instanceOf(CALL)).toBeUndefined();
});

// `llm = "haiku"` is the design's sugar; the provider needs the id behind it or the first turn is a 404.
it("expands a short model name to the id the provider recognises", () => {
  expect(modelOf("haiku")).toEqual({ provider: "anthropic", model: "claude-haiku-4-5-20251001" });
  expect(modelOf("openai/gpt-4.1-mini")).toEqual({ provider: "openai", model: "gpt-4.1-mini" });
  expect(modelOf({ provider: "anthropic", model: "claude-opus-5" })).toEqual({
    provider: "anthropic",
    model: "claude-opus-5",
  });
});

// `voice = "carolina"` reached ElevenLabs as a voice_id once and came back 1008 seven times in one
// call. The class's word travels as the word it is; the platform holds the table that has the id.
it("sends the voice as the word the class wrote, never as a vendor's id", async () => {
  await connected();
  expect(mounted.options.voice).toEqual({ name: "carolina" });
});

// A map is how anybody thinks about how a word is said; the wire carries a list so the schema can
// name both halves, and the voice is given the spoken form while the log keeps what was written.
it("sends the class's pronunciation map as the wire's list of both halves", async () => {
  await connected();
  expect(mounted.options.says).toEqual([{ word: "Vidal", spoken: "bidál" }]);
});

it("sends the words the ears must know in the order the class wrote them", async () => {
  await connected();
  expect(mounted.options.hears).toEqual(["Clínica Norte", "doctora Vidal"]);
});

// What the class knows, reads and remembers travels in the declaration: the knowledge file whole,
// so the runtime can put its text where the marker is once per call; the base by the name it was
// pushed under; the memory policy in the tenant's own words.
it("sends the knowledge file whole, the docs base by name and the memory policy in the configure", async () => {
  await connected();
  const config = commands("agent.configure")[0]?.["config"] as Record<string, unknown>;
  expect(config["knowledge"]).toEqual({
    path: "./knowledge/clinica.md",
    text: readFileSync(fileURLToPath(new URL("../agent/knowledge/clinica.md", import.meta.url)), "utf8"),
  });
  expect(config["docs"]).toEqual({ base: "clinica-norte" });
  expect(config["memory"]).toEqual({ remember: ["cómo prefiere que le llamen", "alergias"], forget: ["pagos"] });
});

/** The clinic saying how its chunks reach the model, in the words a class writes them in. */
class ConAjustes extends ClinicaNorte {
  override docs = { base: "clinica-norte", k: 4, minScore: 0.02 };
}

it("writes a docs object out in the wire's own keys: minScore on the class, min_score on the wire", async () => {
  await connected({ view }, ConAjustes);
  const config = commands("agent.configure")[0]?.["config"] as Record<string, unknown>;
  expect(config["docs"]).toEqual({ base: "clinica-norte", k: 4, min_score: 0.02 });
});

/** The clinic as it was written before the base had a name: a glob the app expanded itself. */
class ConGlob extends ClinicaNorte {
  override docs = "./knowledge/docs/**/*.md";
}

it("refuses the old glob form of docs, naming the verb that pushes the base", () => {
  expect(() => optionsFor(ConGlob, [], new ConGlob(), FILE)).toThrow(
    "docs name the base they were pushed to: run `pinecall knowledge push ./knowledge/docs --base <slug>`",
  );
});

/** The clinic naming a file nobody wrote. */
class SinFichero extends ClinicaNorte {
  override knowledge = "./knowledge/nadie.md";
}

it("refuses a knowledge file that is not there, with the path it looked at", () => {
  expect(() => optionsFor(SinFichero, [], new SinFichero(), FILE)).toThrow(
    /^knowledge \.\/knowledge\/nadie\.md: no such file at .*test\/agent\/knowledge\/nadie\.md$/,
  );
});
