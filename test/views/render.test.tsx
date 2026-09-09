// The two things a rendered prompt must do: keep its cached half byte-identical, and follow state.

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { describe as describeClass, seal } from "../../src/index.js";
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

describe("render, region by region", () => {
  it("produces a byte-identical static region across state changes", async () => {
    const agent = clinica();
    const before = render(agent, view, onThePhone).static;

    await agent.findPatient("Ana", "+34 600 000 001");
    await agent.freeSlots("lunes");
    await agent.book({ when: "lunes 10:00", doctor: "Ruiz" });

    expect(render(agent, view, onThePhone).static).toBe(before);
  });

  it("names every declared tool in the static region, visible or not", () => {
    const staticRegion = render(clinica(), view, onThePhone).static;
    for (const name of ["findPatient", "freeSlots", "book", "transfer"]) {
      expect(staticRegion).toContain(`- ${name}: `);
    }
  });

  it("opens the static region with the class docstring and the knowledge marker", () => {
    const staticRegion = render(clinica(), view, onThePhone).static;
    expect(staticRegion.startsWith("Agenda de la Clínica Norte.")).toBe(true);
    expect(staticRegion).toContain("<!-- knowledge: ./knowledge/clinica.md -->");
  });

  it("flips a conditional in the view when the state changes", async () => {
    const agent = clinica();
    expect(render(agent, view, onThePhone).dynamic).toContain("Saluda y pide nombre y teléfono");

    await agent.findPatient("Ana", "+34 600 000 001");

    const identified = render(agent, view, onThePhone).dynamic;
    expect(identified).not.toContain("Saluda y pide nombre y teléfono");
    expect(identified).toContain("Ana tiene cita el");
    expect(identified).toContain("Pregunta para qué día quiere cambiarla.");
  });

  it("answers a phone call differently from a web chat once there are slots", async () => {
    const agent = clinica();
    await agent.findPatient("Ana", "+34 600 000 001");
    await agent.freeSlots("lunes");

    expect(render(agent, view, onThePhone).dynamic).toContain("Ofrece como máximo dos de estas horas");
    expect(render(agent, view, { call: { channel: "web" } }).dynamic).toContain("Muestra hasta cinco horas");
  });

  it("opens the dynamic region with the memory and retrieval markers, in that order", () => {
    const dynamic = render(clinica(), view, onThePhone).dynamic;
    expect(dynamic.indexOf('<!-- memory: {"kinds":["preference","health"]} -->')).toBe(0);
    expect(dynamic).toContain('<!-- retrieved: {"minScore":0.4} -->');
  });

  it("tells the view it is resuming a call that was cut", () => {
    const dynamic = render(clinica(), view, { ...onThePhone, resumed: true }).dynamic;
    expect(dynamic).toContain("Se cortó su llamada anterior.");
  });

  it("puts a collapsed stretch of the call in the history region", async () => {
    const agent = clinica();
    await agent.findPatient("Ana", "+34 600 000 001");
    await agent.freeSlots("lunes");
    await agent.book({ when: "lunes 10:00", doctor: "Ruiz" });

    const { history } = render(agent, view, onThePhone);
    expect(history).toContain("<!-- collapsed:");
    expect(history).toContain("Reservado lunes 10:00 con Ruiz.");
  });

  it("prints the three headers in order: static, history, dynamic", () => {
    const page = showPrompt(clinica(), view, onThePhone);
    expect(page).toContain("── static ──");
    expect(page.indexOf("── static ──")).toBeLessThan(page.indexOf("── history ──"));
    expect(page.indexOf("── history ──")).toBeLessThan(page.indexOf("── dynamic ──"));
  });

  it("looks for the default view next to the agent file", () => {
    expect(viewFor("/app/clinica/agent.ts")).toBe("/app/clinica/views/agent.tsx");
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

    expect(render(spanish).static).toContain("Una sola pregunta por turno");
    expect(render(english).static).toContain("One question per turn");
    expect(render(english).static).not.toContain("Una sola pregunta");
    expect(render(martian).static).toContain("Una sola pregunta por turno");
  });
});
