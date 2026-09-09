// `pinecall prompt --state`: the loader, the goldens file, and the three regions in their one order.

import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { docOf } from "../../src/agent/tools.js";
import { showPrompt } from "../../src/views/render.js";
import { load } from "../../src/cli/load.js";
import { firstState, run } from "../../src/cli/prompt.js";
import ClinicaNorte from "../agent/clinica-norte.js";
import view from "../views/clinica-norte.view.js";

const AGENT = fileURLToPath(new URL("./clinic/agent.ts", import.meta.url));
const GOLDENS = fileURLToPath(new URL("./choose.json", import.meta.url));

function collected(): { stream: NodeJS.WritableStream; text(): string } {
  const written: string[] = [];
  const stream = { write: (chunk: string) => written.push(chunk) } as unknown as NodeJS.WritableStream;
  return { stream, text: () => written.join("") };
}

describe("loading an agent from disk", () => {
  it("hands the class its own source, so the docstring above it survives the import", async () => {
    const loaded = await load(AGENT);

    // Ctor.toString() cannot see a comment above the class; only describe(Ctor, source) can.
    expect(docOf(new loaded.ctor())).toContain("recepción de Clínica Norte");
  });

  it("brings the view that sits beside the agent, and calls it with the state", async () => {
    const loaded = await load(AGENT);

    expect(loaded.view?.({
        identified: false,
        slots: [],
        memory: { has: () => false },
        resumed: false,
        call: { channel: "web" },
      })).toContain("Saluda y pide nombre");
  });

  it("says where it looked when there is no agent there", async () => {
    await expect(load("does/not/exist.ts")).rejects.toThrow(/no agent at/);
  });
});

describe("the goldens file a state comes from", () => {
  it("takes the first case unless --case names another", () => {
    expect(firstState(GOLDENS, undefined)).toMatchObject({ patient: { name: "Ana García" } });
    expect(firstState(GOLDENS, "1")).toMatchObject({ slots: [{ when: "martes 16:00" }] });
  });

  it("refuses a case the file does not have, by number", () => {
    expect(() => firstState(GOLDENS, "9")).toThrow(/no case 9/);
  });
});

describe("the prompt a state would produce", () => {
  it("prints the three regions, each under its header, in the one order they are ever sent", async () => {
    const out = collected();

    const code = await run([AGENT, "--state", GOLDENS], out.stream);

    expect(code).toBe(0);
    const printed = out.text();
    expect(printed.indexOf("── static ──")).toBeGreaterThanOrEqual(0);
    expect(printed.indexOf("── static ──")).toBeLessThan(printed.indexOf("── history ──"));
    expect(printed.indexOf("── history ──")).toBeLessThan(printed.indexOf("── dynamic ──"));
  });

  it("renders the view against the state the goldens describe, not against a fresh instance", async () => {
    const out = collected();

    await run([AGENT, "--state", GOLDENS, "--case", "1"], out.stream);

    // Case 1 has a patient and one slot: the view takes the identified branch.
    expect(out.text()).toContain("Ofrece 1 horas");
  });

  it("asks for the state file rather than guessing one", async () => {
    const err = collected();

    expect(await run([AGENT], collected().stream, err.stream)).toBe(2);
    expect(err.text()).toContain("--state <file> is required");
  });
});

describe("the same three regions on the example the design is written around", () => {
  it("puts the clinic's own state into Clínica Norte and renders its view at the end", () => {
    const agent = new ClinicaNorte();
    agent.restore(firstState(GOLDENS, "1"));

    const page = showPrompt(agent, view, { call: { channel: "web" } });

    expect(page.indexOf("── static ──")).toBeLessThan(page.indexOf("── dynamic ──"));
    expect(page).toContain("Ana García");
  });
});
