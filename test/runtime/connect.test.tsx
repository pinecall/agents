// The bridge, against a gateway that is not there: what the class does becomes what the wire sees.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, expect, it } from "vitest";
import { Pinecall } from "../../src/client/index.js";
import { FakeGateway } from "../../src/client/testing/index.js";

import ClinicaNorte from "../agent/clinica-norte.js";
import { modelOf, mount, optionsFor, slugOf, type Mounted } from "../../src/runtime/connect.js";

const KEY = "pk_test";
const SLUG = "clinica-norte";
const CALL = "CA_1";
const KNOWN = "+34 600 000 001";
// The class's own .ts, so the parameter types survive a transpiler that strips them: without it
// `day: string` is an untyped argument and the schema can say nothing about it. Its path is what
// the knowledge file is found beside.
const FILE = fileURLToPath(new URL("../agent/clinica-norte.tsx", import.meta.url));
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

async function connected(ctor: typeof ClinicaNorte = ClinicaNorte): Promise<void> {
  mounted = mount(ctor, { pc, source: SOURCE, file: FILE, slug: SLUG });
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

// The knowledge file travels whole in the declaration and the runtime writes it into its own
// block: the app sends nothing for it, so a block with nothing to say is never on the wire.
it("sends every block that has text, in send order, and the visible tools when a call starts", async () => {
  await connected();
  started();
  await settled();
  expect(commands("prompt.set").map((data) => data["name"])).toEqual(["identity", "tools", "view"]);
  const [tools] = commands("tools.set");
  expect((tools?.["tools"] as { name: string }[]).map((tool) => tool.name)).toEqual([
    "freeSlots",
    "transfer",
  ]);
});

/** The same clinic, rendering two getters and nothing else: `slots` cannot change its text. */
class SoloDosCosas extends ClinicaNorte {
  override render() {
    return <p>{this.identified ? "identificado" : "sin identificar"} {this.done ? "cerrado" : "abierto"}</p>;
  }
}

it("sends state.set and no prompt.set when the tool wrote a field the view never reads", async () => {
  await connected(SoloDosCosas);
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

// What memory found moves no field, so nothing else would re-render — and a render that asks what
// the agent remembers is a different prompt once the runtime has an answer for it.
it("renders again when memory recalls something about the caller", async () => {
  await connected();
  started();
  await settled();
  const before = commands("prompt.set").length;

  gateway.emit(SLUG, CALL, "memory.ops", {
    ops: [
      {
        op: "recall",
        contact: KNOWN,
        query: "quiero cita con la doctora Vidal",
        facts: [{ id: "f1", text: "su médico habitual es la doctora Vidal", category: "médico habitual", score: 0.9 }],
        took_ms: 12,
      },
    ],
    speech_id: "s1",
  });
  await settled();

  const sent = commands("prompt.set").slice(before);
  expect(sent.map((data) => data["name"])).toEqual(["view"]);
  expect(String(sent[0]?.["text"])).toContain("Ofrece primero las horas de su médico habitual");
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
  await connected(Despedida);
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
// so the runtime writes its text into the knowledge block once per call; the base by the name it
// was pushed under; the memory policy in the tenant's own words.
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
  override docs = { base: "clinica-norte", k: 4, minScore: 0.5 };
}

it("writes a docs object out in the wire's own keys: minScore on the class, min_score on the wire", async () => {
  await connected(ConAjustes);
  const config = commands("agent.configure")[0]?.["config"] as Record<string, unknown>;
  expect(config["docs"]).toEqual({ base: "clinica-norte", k: 4, min_score: 0.5 });
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

/** The clinic that opens the call with the words themselves, in the bare-string form. */
class Saluda extends ClinicaNorte {
  greeting = "Clínica Norte, buenos días.";
}

it("reads the bare string form of a greeting as the words, said as written", () => {
  expect(optionsFor(Saluda, [], new Saluda(), FILE).greeting).toEqual({ say: "Clínica Norte, buenos días." });
});

/** The clinic that lets the model find its own opening, and says what it is for. */
class Improvisa extends ClinicaNorte {
  greeting = { reply: "saluda, di que eres la recepción y pregunta en qué puedes ayudar" };
}

it("sends an improvised opening as the instruction the model reads and the caller never hears", () => {
  expect(optionsFor(Improvisa, [], new Improvisa(), FILE).greeting).toEqual({
    reply: "saluda, di que eres la recepción y pregunta en qué puedes ayudar",
  });
});

/** The clinic that reads a legal notice: nobody talks over it. */
class NoSeInterrumpe extends ClinicaNorte {
  greeting = { say: "Esta llamada será grabada.", allowInterruptions: false };
}

it("carries allowInterruptions when the class asked for it, and leaves it out when it did not", () => {
  expect(optionsFor(NoSeInterrumpe, [], new NoSeInterrumpe(), FILE).greeting).toEqual({
    say: "Esta llamada será grabada.",
    allowInterruptions: false,
  });
  expect(optionsFor(Saluda, [], new Saluda(), FILE).greeting).not.toHaveProperty("allowInterruptions");
});

/** A class that declared both has not decided which of the two it means. */
class DiceLasDos extends ClinicaNorte {
  greeting = { say: "Buenos días.", reply: "saluda" };
}

it("refuses a greeting that names both verbs, and one that names neither", () => {
  expect(() => optionsFor(DiceLasDos, [], new DiceLasDos(), FILE)).toThrow(/Both were declared — pick one/);
  class DiceNinguna extends ClinicaNorte {
    greeting = {};
  }
  expect(() => optionsFor(DiceNinguna, [], new DiceNinguna(), FILE)).toThrow(/Neither was — pick one/);
});

it("sends no greeting for a class that declares none, so nobody speaks until the caller does", () => {
  expect(optionsFor(ClinicaNorte, [], new ClinicaNorte(), FILE).greeting).toBeUndefined();
});

/** The clinic that may not hang up: the field the class never wrote. */
class SinColgar extends ClinicaNorte {
  hangup = undefined as unknown as { when?: string };
}

it("sends no hangup for a class that declares none, so nobody but the caller ends the call", () => {
  expect(optionsFor(SinColgar, [], new SinColgar(), FILE).hangup).toBeUndefined();
});

/** The clinic that may hang up, and says in its own words when. */
class Cuelga extends ClinicaNorte {
  hangup = { when: "cuando el paciente se despide" };
}

it("sends the tenant's own words for when the model may end the call", () => {
  expect(optionsFor(Cuelga, [], new Cuelga(), FILE).hangup).toEqual({ when: "cuando el paciente se despide" });
});

/** `hangup = {}`: the model may end the call, and the wording is livekit's own. */
class CuelgaSinPalabras extends ClinicaNorte {
  hangup = {};
}

it("an empty declaration is still a declaration: the tool is there with no words of ours", () => {
  expect(optionsFor(CuelgaSinPalabras, [], new CuelgaSinPalabras(), FILE).hangup).toEqual({ when: "" });
});
