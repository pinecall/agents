// The bridge, against a gateway that is not there: what the class does becomes what the wire sees.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, expect, it } from "vitest";
import { Pinecall } from "../../src/client/index.js";
import { FakeGateway } from "../../src/client/testing/index.js";

import ClinicaNorte from "../agent/clinica-norte.js";
import { THE_WORLDS, movedToTheWorld } from "../../src/runtime/environment.js";
import { mount, optionsFor, slugOf, type Mounted } from "../../src/runtime/connect.js";

const KEY = "pk_test";
const SLUG = "clinica-norte";
const CALL = "CA_1";
const KNOWN = "+34 600 000 001";
// The class's own .ts, so the parameter types survive a transpiler that strips them: without it
// `day: string` is an untyped argument and the schema can say nothing about it.
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

it("registers the class under its name in kebab-case, with its four tools and no door", async () => {
  await connected();
  expect(slugOf(ClinicaNorte)).toBe(SLUG);
  const [register] = commands("agent.register");
  // Even though the fixture class still writes `phone`, `whatsapp` and `web`: a door is a row the
  // org keeps (`pinecall numbers import`), and a field on a class is read by nobody.
  expect(register?.["routes"]).toEqual([]);
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

// The knowledge block is the gateway's — the whole documents of the bases the world attaches —
// so the app sends nothing for it, and a block with nothing to say is never on the wire.
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

// The class declares the contract and nothing of the environment: a voice, the models, an
// opening, a hangup, the words, what it remembers, what it reads are the world's — set with
// `pinecall agent`, `lexicon`, `memory policy`, `docs` — and a class still carrying one is refused
// at load, naming the verb, before a prompt is printed or a gateway is knocked at.
it.each(Object.keys(THE_WORLDS))("refuses a class that still declares %s, naming the verb that sets it", (field) => {
  class DeAntes extends ClinicaNorte {
    constructor() {
      super();
      // Assigned, not declared: the compiler refuses most of these as fields already, and this is
      // what a class compiled elsewhere, on an older package, still hands the bridge.
      Object.defineProperty(this, field, { value: "carolina", enumerable: true });
    }
  }
  expect(() => optionsFor(DeAntes, [], new DeAntes(), FILE)).toThrow(movedToTheWorld(field));
  expect(movedToTheWorld(field)).toContain("pinecall ");
});

it("sends the language, and none of the environment, in the configure", async () => {
  await connected();
  const config = commands("agent.configure")[0]?.["config"] as Record<string, unknown>;
  expect(config["language"]).toBe("es");
  for (const field of Object.keys(THE_WORLDS)) expect(config[field]).toBeUndefined();
});

// The day the call opened is the SDK call's, and the class reads it as `this.call.today`: an
// agenda that resolves "el martes" counts from it. The bridge built the world from the hook's
// shape, which has no such field, so every mounted agent saw `undefined` and fell back to the
// machine's clock — which is a different day, in a different timezone, on a box.
it("hands the class the day the call opened", async () => {
  await connected();
  started();
  await settled();

  const serving = mounted.instanceOf(CALL) as unknown as { call?: { today?: string } } | undefined;
  expect(serving?.call?.today).toBe(new Date().toISOString().slice(0, 10));
});

// A caller who is also on the site keys the code their page shows, and from the claim on the
// class knows it — the times it offers are on their screen too. A code they said instead is the
// class's to claim, and that is one command on the wire.
it("tells the class the call was claimed, and claims a code the caller said", async () => {
  await connected();
  started();
  await settled();
  const serving = mounted.instanceOf(CALL) as unknown as { call: { claimed: string | null; claim(code: string): void } };
  expect(serving.call.claimed).toBeNull();

  gateway.emit(SLUG, CALL, "call.claimed", { code: "4821", via: "keypad" });
  await settled();
  expect(serving.call.claimed).toBe("4821");

  serving.call.claim("7305");
  await settled();
  expect(commands("call.claim")).toEqual([{ code: "7305" }]);
});

// The claim moves no field, and a view about it is a different prompt from that moment: rendered
// then, not at the caller's next turn.
class KnowsTheScreen extends ClinicaNorte {
  override render() {
    return this.call.claimed === null ? <p>Read the times out.</p> : <p>The times are on their screen.</p>;
  }
}

it("renders again the moment the call is claimed", async () => {
  await connected(KnowsTheScreen);
  started();
  await settled();
  const before = commands("prompt.set").length;
  gateway.emit(SLUG, CALL, "call.claimed", { code: "4821", via: "keypad" });
  await settled();
  const sent = commands("prompt.set").slice(before);
  expect(sent.map((data) => data["name"])).toEqual(["view"]);
  expect(String(sent[0]?.["text"])).toContain("on their screen");
});

// The caller's turn is the fact a view is most often about, and the framework's own page says a
// view says what to do in THIS turn. It could not: the turn reached the class's history, nothing
// asked for a new view, and the render that read it was sent one turn late (2026-09-20).
class AsksAboutTheTurn extends ClinicaNorte {
  override render() {
    const last = this.call.history.last;
    return last?.who === "user" ? <p>They just said: {last.text}</p> : <p>Nobody has said anything yet.</p>;
  }
}

it("renders again when the caller's turn lands, so a view can be about the turn it answers", async () => {
  await connected(AsksAboutTheTurn);
  started();
  await settled();
  const before = commands("prompt.set").length;

  gateway.emit(SLUG, CALL, "turn.user", { text: "305 555 0101", speech_id: "s1", metrics: {} });
  await settled();

  const sent = commands("prompt.set").slice(before);
  expect(sent.map((data) => data["name"])).toEqual(["view"]);
  expect(String(sent[0]?.["text"])).toBe("They just said: 305 555 0101");
});
