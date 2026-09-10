// The two things a rendered prompt must do: keep its cached blocks byte-identical, and follow state.

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { Agent, CallWorld, describe as describeClass, recalled, seal, setCall, tool } from "../../src/index.js";
import { PROMPT_BLOCKS, type Block, type Blocks } from "../../src/views/layout.js";
import { render, showPrompt } from "../../src/views/render.js";
import ClinicaNorte from "../agent/clinica-norte.js";

const KNOWN = "+34 600 000 001";

// The class docstring lives above the class, where `Ctor.toString()` cannot see it, so whoever
// loaded the file hands it over. Here that is the test; in production it is `pinecall run`.
describeClass(ClinicaNorte, readFileSync(new URL("../agent/clinica-norte.tsx", import.meta.url), "utf8"));

/** The clinic answering a call on that door, which is what a `render()` reads off `this.call`. */
function clinica(channel = "phone"): ClinicaNorte {
  const agent = seal(new ClinicaNorte());
  setCall(agent, new CallWorld({ id: "CA_1", contact: KNOWN, from: KNOWN, channel }, () => undefined));
  return agent;
}

/** The text of one block of a render, by name. */
function block(blocks: Blocks, name: string): string {
  const found = blocks.blocks.find((one) => one.name === name);
  if (found === undefined) throw new Error(`no block ${name}`);
  return found.text;
}

function names(blocks: Blocks, region?: Block["region"]): string[] {
  return blocks.blocks.filter((one) => region === undefined || one.region === region).map((one) => one.name);
}

describe("the layout", () => {
  it("is the framework's four blocks, static then dynamic, with the view last", () => {
    expect(PROMPT_BLOCKS).toEqual([
      { name: "identity", region: "static" },
      { name: "knowledge", region: "static" },
      { name: "tools", region: "static" },
      { name: "view", region: "dynamic" },
    ]);
    expect(names(render(clinica()))).toEqual(["identity", "knowledge", "tools", "view"]);
  });

  it("keeps every static block byte-identical across state changes", async () => {
    const agent = clinica();
    const before = render(agent);

    await agent.findPatient("Ana", KNOWN);
    await agent.freeSlots("lunes");
    await agent.book({ when: "lunes 10:00", doctor: "Ruiz" });

    const after = render(agent);
    for (const name of names(before, "static")) expect(block(after, name)).toBe(block(before, name));
  });

  it("opens identity with the class docstring, then the rules and the protocols", () => {
    const identity = block(render(clinica()), "identity");
    expect(identity.startsWith("Agenda de la Clínica Norte.")).toBe(true);
    expect(identity.indexOf("<rules>")).toBeLessThan(identity.indexOf("<protocols>"));
    expect(identity).not.toContain("<tools>");
  });

  // The file the class named travels whole in the declaration and the runtime writes it into this
  // block, once per call, where it is the operator's own words in the cached prefix. The app sends
  // nothing for it: two copies of one file is a bigger bug than an empty block.
  it("leaves the knowledge block to the runtime, and every declared tool in tools", () => {
    const blocks = render(clinica());
    expect(block(blocks, "knowledge")).toBe("");
    const tools = block(blocks, "tools");
    for (const name of ["findPatient", "freeSlots", "book", "transfer"]) {
      expect(tools).toContain(`- ${name}: `);
    }
  });
});

describe("the view", () => {
  it("flips a conditional when the state changes", async () => {
    expect(block(render(clinica()), "view")).toContain("Saluda y pide nombre y teléfono");

    const agent = clinica();
    await agent.findPatient("Ana", KNOWN);

    const identified = block(render(agent), "view");
    expect(identified).not.toContain("Saluda y pide nombre y teléfono");
    expect(identified).toContain("Hablas con Ana, ya en la ficha.");
    expect(identified).toContain("Pregunta para qué día quiere la cita.");
  });

  it("answers a phone call differently from a web chat once there are slots", async () => {
    const byPhone = clinica("phone");
    await byPhone.findPatient("Ana", KNOWN);
    await byPhone.freeSlots("lunes");
    expect(block(render(byPhone), "view")).toContain("Ofrece como máximo dos de estas horas");

    const written = clinica("web");
    await written.findPatient("Ana", KNOWN);
    await written.freeSlots("lunes");
    expect(block(render(written), "view")).toContain("Muestra hasta cinco horas");
  });

  it("is empty for a class that renders nothing at all", () => {
    /** Agenda que no dice nada de este turno. */
    class Callada extends Agent {
      language = "es";
    }

    expect(block(render(seal(new Callada())), "view")).toBe("");
  });

  it("puts a collapsed stretch of the call in the history, and no marker line with it", async () => {
    const agent = clinica();
    await agent.findPatient("Ana", KNOWN);
    await agent.freeSlots("lunes");
    await agent.book({ when: "lunes 10:00", doctor: "Ruiz" });

    const { history } = render(agent);
    expect(history).toBe("Reservado lunes 10:00 con Ruiz.");
  });

  // The whole page is the tenant's own words and the runtime's blocks: nothing this package writes
  // is a placeholder for somebody else to replace. See docs/security/prompt-injection.md.
  it("writes no marker line anywhere on the printed page", async () => {
    const agent = clinica();
    await agent.findPatient("Ana", KNOWN);
    await agent.freeSlots("lunes");

    expect(showPrompt(agent)).not.toContain("<!--");
  });
});

// What memory found is the runtime's to supply, and it reaches the class as words and never as a
// sentence spliced into the view: `remembers()` is how a render asks, and it answers false until
// a recall has actually come back, which is exactly what a caller nobody has met looks like.
describe("what the agent remembers about this caller", () => {
  it("is false until the runtime has recalled something", () => {
    const agent = clinica();

    expect(agent.remembers("médico habitual")).toBe(false);
  });

  it("answers on the word a fact was filed under, and on the fact itself", async () => {
    const agent = clinica();
    await agent.findPatient("Ana", KNOWN);
    recalled(agent, ["su médico habitual es la doctora Vidal", "médico habitual"]);

    expect(agent.remembers("médico habitual")).toBe(true);
    expect(agent.remembers("la doctora Vidal")).toBe(true);
    expect(agent.remembers("alergias")).toBe(false);
    expect(block(render(agent), "view")).toContain("Ofrece primero las horas de su médico habitual");
  });
});

describe("the printed page", () => {
  it("rules every block under its name and region, the history between the two regions", () => {
    const headers = showPrompt(clinica())
      .split("\n")
      .filter((line) => line.startsWith("── "));
    expect(headers).toEqual([
      "── identity (static) ──",
      "── knowledge (static) ──",
      "── tools (static) ──",
      "── history ──",
      "── view (dynamic) ──",
    ]);
  });
});

describe("the framework's own words", () => {
  it("speaks the language the agent declares, and falls back to Spanish", () => {
    /** Agenda que habla en inglés. */
    class InEnglish extends Agent {
      language = "en";
    }
    /** Agenda que habla marciano. */
    class OnMars extends Agent {
      language = "mar";
    }

    expect(block(render(clinica()), "identity")).toContain("Una sola pregunta por turno");
    expect(block(render(seal(new InEnglish())), "identity")).toContain("One question per turn");
    expect(block(render(seal(new InEnglish())), "identity")).not.toContain("Una sola pregunta");
    expect(block(render(seal(new OnMars())), "identity")).toContain("Una sola pregunta por turno");
  });
});

// A tool is in the `tools` block whether or not it is visible right now, because the model reads
// the docstring and the wire decides what may be called.
describe("a class with one tool and no view", () => {
  /** Agenda con preguntas frecuentes. */
  class ConUnaTool extends Agent {
    language = "es";
    slots: string[] = [];

    /** Horas libres. */
    @tool()
    freeSlots(): string[] {
      return (this.slots = ["lunes 10:00", "lunes 11:00"]);
    }
  }

  it("declares it in the static tools block and renders an empty view", () => {
    const blocks = render(seal(new ConUnaTool()));

    expect(block(blocks, "tools")).toBe("<tools>\n- freeSlots: Horas libres.\n</tools>");
    expect(block(blocks, "view")).toBe("");
  });
});
