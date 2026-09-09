// The two things a rendered prompt must do: keep its cached blocks byte-identical, and follow state.

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { Agent, describe as describeClass, seal, tool } from "../../src/index.js";
import { declaredBlocksOf, layoutOf, type Block, type Blocks, type View, type ViewProps } from "../../src/views/layout.js";
import { render, showPrompt, viewFor } from "../../src/views/render.js";
import ClinicaNorte from "../agent/clinica-norte.js";
import view from "./clinica-norte.view.js";

// The class docstring lives above the class, where `Ctor.toString()` cannot see it, so whoever
// loaded the file hands it over. Here that is the test; in production it is `pinecall run`.
describeClass(ClinicaNorte, readFileSync(new URL("../agent/clinica-norte.ts", import.meta.url), "utf8"));

function clinica(): ClinicaNorte {
  return seal(new ClinicaNorte());
}

const onThePhone = { call: { channel: "phone", from: "+34 600 000 001" } };

/** The text of one block of a render, by name. */
function block(blocks: Blocks, name: string): string {
  const found = blocks.blocks.find((one) => one.name === name);
  if (found === undefined) throw new Error(`no block ${name}`);
  return found.text;
}

function names(blocks: Blocks, region?: Block["region"]): string[] {
  return blocks.blocks.filter((one) => region === undefined || one.region === region).map((one) => one.name);
}

describe("the default layout", () => {
  it("is the framework's four blocks, static then dynamic, with the view last", () => {
    expect(layoutOf(ClinicaNorte)).toEqual([
      { name: "identity", region: "static" },
      { name: "knowledge", region: "static" },
      { name: "tools", region: "static" },
      { name: "view", region: "dynamic" },
    ]);
    expect(names(render(clinica(), { view }, onThePhone))).toEqual(["identity", "knowledge", "tools", "view"]);
  });

  it("keeps every static block byte-identical across state changes", async () => {
    const agent = clinica();
    const before = render(agent, { view }, onThePhone);

    await agent.findPatient("Ana", "+34 600 000 001");
    await agent.freeSlots("lunes");
    await agent.book({ when: "lunes 10:00", doctor: "Ruiz" });

    const after = render(agent, { view }, onThePhone);
    for (const name of names(before, "static")) expect(block(after, name)).toBe(block(before, name));
  });

  it("opens identity with the class docstring, then the rules and the protocols", () => {
    const identity = block(render(clinica(), { view }, onThePhone), "identity");
    expect(identity.startsWith("Agenda de la Clínica Norte.")).toBe(true);
    expect(identity.indexOf("<rules>")).toBeLessThan(identity.indexOf("<protocols>"));
    expect(identity).not.toContain("<tools>");
  });

  it("puts the knowledge marker in a block of its own, and every declared tool in tools", () => {
    const blocks = render(clinica(), { view }, onThePhone);
    expect(block(blocks, "knowledge")).toBe("<!-- knowledge: ./knowledge/clinica.md -->");
    const tools = block(blocks, "tools");
    for (const name of ["findPatient", "freeSlots", "book", "transfer"]) {
      expect(tools).toContain(`- ${name}: `);
    }
  });

  it("leaves knowledge empty for a class that named no file", () => {
    const quiet = seal(
      new (class extends ClinicaNorte {
        override knowledge = "";
      })(),
    );
    expect(block(render(quiet, { view }), "knowledge")).toBe("");
  });
});

describe("the view", () => {
  it("flips a conditional when the state changes", async () => {
    const agent = clinica();
    expect(block(render(agent, { view }, onThePhone), "view")).toContain("Saluda y pide nombre y teléfono");

    await agent.findPatient("Ana", "+34 600 000 001");

    const identified = block(render(agent, { view }, onThePhone), "view");
    expect(identified).not.toContain("Saluda y pide nombre y teléfono");
    expect(identified).toContain("Ana tiene cita el");
    expect(identified).toContain("Pregunta para qué día quiere cambiarla.");
  });

  it("answers a phone call differently from a web chat once there are slots", async () => {
    const agent = clinica();
    await agent.findPatient("Ana", "+34 600 000 001");
    await agent.freeSlots("lunes");

    expect(block(render(agent, { view }, onThePhone), "view")).toContain("Ofrece como máximo dos de estas horas");
    expect(block(render(agent, { view }, { call: { channel: "web" } }), "view")).toContain("Muestra hasta cinco horas");
  });

  it("opens with the memory and retrieval markers, in that order", () => {
    const text = block(render(clinica(), { view }, onThePhone), "view");
    expect(text.indexOf('<!-- memory: {"kinds":["preference","health"]} -->')).toBe(0);
    expect(text).toContain('<!-- retrieved: {"minScore":0.4} -->');
  });

  it("is told it is resuming a call that was cut", () => {
    const text = block(render(clinica(), { view }, { ...onThePhone, resumed: true }), "view");
    expect(text).toContain("Se cortó su llamada anterior.");
  });

  it("puts a collapsed stretch of the call in the history", async () => {
    const agent = clinica();
    await agent.findPatient("Ana", "+34 600 000 001");
    await agent.freeSlots("lunes");
    await agent.book({ when: "lunes 10:00", doctor: "Ruiz" });

    const { history } = render(agent, { view }, onThePhone);
    expect(history).toContain("<!-- collapsed:");
    expect(history).toContain("Reservado lunes 10:00 con Ruiz.");
  });

  it("looks for the default view next to the agent file, and a declared block by its name", () => {
    expect(viewFor("/app/clinica/agent.ts")).toBe("/app/clinica/views/agent.tsx");
    expect(viewFor("/app/clinica/agent.ts", "availability")).toBe("/app/clinica/views/availability.tsx");
  });
});

// A tenant with blocks of its own: a cached FAQ it writes as prose, and a dynamic block its
// free-slots tool feeds. Written inline, so the test is the whole fixture.
/** Agenda con preguntas frecuentes. */
class ConBloques extends Agent {
  static override prompt = { static: ["faq"], dynamic: ["availability"] };
  language = "es";
  slots: string[] = [];

  /** Horas libres. */
  @tool()
  freeSlots(): string[] {
    return (this.slots = ["lunes 10:00", "lunes 11:00"]);
  }
}

const faq: View = () => <p>¿Aparcamiento? Sí, gratuito, en la puerta.</p>;
const availability = ({ slots }: ViewProps<ConBloques>) => (
  <>{slots.length > 0 && <p>Horas libres: {slots.join(", ")}</p>}</>
);

describe("the blocks a class declares", () => {
  it("are sent after the framework's static blocks and before the view, which is last", () => {
    const blocks = render(seal(new ConBloques()), { faq, availability });
    expect(names(blocks)).toEqual(["identity", "knowledge", "tools", "faq", "availability", "view"]);
    expect(names(blocks, "static")).toEqual(["identity", "knowledge", "tools", "faq"]);
    expect(names(blocks, "dynamic")).toEqual(["availability", "view"]);
  });

  it("render a dynamic block against the state, and a static one as prose", async () => {
    const agent = seal(new ConBloques());
    expect(block(render(agent, { faq, availability }), "availability")).toBe("");

    await agent.freeSlots();

    const blocks = render(agent, { faq, availability });
    expect(block(blocks, "availability")).toBe("Horas libres: lunes 10:00, lunes 11:00");
    expect(block(blocks, "faq")).toBe("¿Aparcamiento? Sí, gratuito, en la puerta.");
  });

  it("refuse a static block that reads the state, naming the block and the field", () => {
    const reads = ({ slots }: ViewProps<ConBloques>) => <p>{slots.length}</p>;
    expect(() => render(seal(new ConBloques()), { faq: reads, availability })).toThrow(
      "a static block cannot read the state: faq.tsx reads slots",
    );
  });

  it("refuse a declared block nobody wrote a view for", () => {
    expect(() => render(seal(new ConBloques()), { faq })).toThrow("prompt block availability: ConBloques declares it");
  });

  it("refuse a name that is the framework's, and one the wire would refuse", () => {
    class Choca extends Agent {
      static override prompt = { static: ["tools"] };
    }
    expect(() => declaredBlocksOf(Choca)).toThrow("prompt block tools: that name is the framework's");
    class Mayuscula extends Agent {
      static override prompt = { dynamic: ["Availability"] };
    }
    expect(() => declaredBlocksOf(Mayuscula)).toThrow("prompt block Availability: a name is lowercase words");
    class Doble extends Agent {
      static override prompt = { static: ["faq"], dynamic: ["faq"] };
    }
    expect(() => declaredBlocksOf(Doble)).toThrow("prompt block faq: declared twice");
  });
});

describe("the printed page", () => {
  it("rules every block under its name and region, the history between the two regions", () => {
    const page = showPrompt(seal(new ConBloques()), { faq, availability });
    const headers = page.split("\n").filter((line) => line.startsWith("── "));
    expect(headers).toEqual([
      "── identity (static) ──",
      "── knowledge (static) ──",
      "── tools (static) ──",
      "── faq (static) ──",
      "── history ──",
      "── availability (dynamic) ──",
      "── view (dynamic) ──",
    ]);
  });
});

describe("the framework's own words", () => {
  it("speaks the language the agent declares, and falls back to Spanish", () => {
    const spanish = clinica();
    const english = seal(
      new (class extends ClinicaNorte {
        override language = "en";
      })(),
    );
    const martian = seal(
      new (class extends ClinicaNorte {
        override language = "mar";
      })(),
    );

    expect(block(render(spanish), "identity")).toContain("Una sola pregunta por turno");
    expect(block(render(english), "identity")).toContain("One question per turn");
    expect(block(render(english), "identity")).not.toContain("Una sola pregunta");
    expect(block(render(martian), "identity")).toContain("Una sola pregunta por turno");
  });
});
