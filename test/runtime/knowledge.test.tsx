// The class and its base: what it declares it reads, what it may no longer carry, and a search
// made from inside a tool — run by the gateway for the call in hand.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, expect, it } from "vitest";
import { Pinecall } from "../../src/client/index.js";
import { FakeGateway } from "../../src/client/testing/index.js";

import Busca from "../agent/busca.js";
import ClinicaNorte from "../agent/clinica-norte.js";
import { movedToTheWorld } from "../../src/runtime/environment.js";
import { mount, optionsFor } from "../../src/runtime/connect.js";

const KEY = "pk_test";
const SLUG = "clinica-norte";
const CALL = "CA_1";
const FILE = fileURLToPath(new URL("../agent/clinica-norte.tsx", import.meta.url));
const SOURCE = readFileSync(FILE, "utf8");
const BUSCA_FILE = fileURLToPath(new URL("../agent/busca.tsx", import.meta.url));
const BUSCA_SOURCE = readFileSync(BUSCA_FILE, "utf8");

let gateway: FakeGateway;
let pc: Pinecall;

beforeEach(async () => {
  gateway = await FakeGateway.start({ apiKey: KEY });
  pc = new Pinecall({ url: gateway.url, apiKey: KEY });
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

/** Wait for a round trip over HTTP to land, up to a second: a search is a request and an answer. */
async function answered(type: string): Promise<Record<string, unknown>[]> {
  for (let turn = 0; turn < 200 && commands(type).length === 0; turn++) await new Promise((resolve) => setTimeout(resolve, 5));
  return commands(type);
}

function commands(type: string): Record<string, unknown>[] {
  return gateway.commandsOf(type).map((command) => command.data);
}

// Whether the class reaches `this.knowledge` is read off its source with the parser that reads
// its docstrings, and said at registration: the gateway refuses a world that attaches it no base
// there, and not in a call where the search would find nothing.
it("says it searches knowledge when the source reaches this.knowledge, and not otherwise", () => {
  expect(optionsFor(Busca, [], new Busca(), BUSCA_FILE, BUSCA_SOURCE).usesKnowledge).toBe(true);
  expect(optionsFor(ClinicaNorte, [], new ClinicaNorte(), FILE, SOURCE).usesKnowledge).toBeUndefined();
  // No source given: the class's own body is what the parser reads.
  expect(optionsFor(Busca, [], new Busca()).usesKnowledge).toBe(true);
  // The word inside a string is not a search.
  expect(optionsFor(ClinicaNorte, [], new ClinicaNorte(), FILE, `class X { doc = "this.knowledge is not a call"; }`).usesKnowledge).toBeUndefined();
});

it("runs a tool's search through the gateway, for this call, and hands the chunks back", async () => {
  mount(Busca, { pc, slug: SLUG, source: BUSCA_SOURCE, file: BUSCA_FILE });
  await pc.connect();
  await settled();
  gateway.finds([
    { path: "clinica.md", heading: "Horarios", text: "De nueve a ocho." },
    { path: "clinica.md", heading: "Dirección", text: "Calle Mayor 12." },
    { path: "tarifas.md", heading: "Revisión", text: "Cuarenta euros." },
  ]);
  gateway.emit(SLUG, CALL, "call.started", { channel: "phone", direction: "inbound", from: "+34 600 000 001", to: "+34 910 000 000", caller: null, started_at: Date.now() / 1000 });
  await settled();
  gateway.emit(SLUG, CALL, "tool.call", { call_id: "t1", name: "lookUp", arguments: { words: "horarios" } });
  const [result] = await answered("tool.result");
  expect(gateway.searched).toEqual([{ call: CALL, query: "horarios", k: 2 }]);
  expect(result?.["output"]).toBe("De nueve a ocho.\nCalle Mayor 12.");
});

it("refuses a search from an instance nobody is serving through a gateway", async () => {
  await expect(new Busca().knowledge.search("horarios")).rejects.toThrow("this.call is only there while a call is being served");
});

/** The clinic as it was written when the file it knew by heart travelled inside the class. */
class DeMemoria extends ClinicaNorte {
  constructor() {
    super();
    // Assigned, not declared: the compiler already refuses a `knowledge` field on a class that
    // extends Agent, and this is what a class compiled elsewhere still sends the bridge.
    Object.defineProperty(this, "knowledge", { value: "./knowledge/clinica.md", enumerable: true });
  }
}

it("refuses a class that still carries a knowledge file: what it knows by heart is a setting", () => {
  expect(() => optionsFor(DeMemoria, [], new DeMemoria(), FILE, SOURCE)).toThrow(movedToTheWorld("knowledge"));
  expect(movedToTheWorld("knowledge")).toContain("pinecall agent knowledge edit");
});
