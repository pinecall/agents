// Lo que la clase sabe, lee y recuerda viaja en la declaración, con las claves del wire, y nada de
// eso se cuela en el texto del prompt. Anillo 0: sin red, sin clave, sin modelo.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import { Agent, optionsFor, render, seal } from "pinecall";

import ClinicaNorte from "../agent.js";

const AGENT = fileURLToPath(new URL("../agent.tsx", import.meta.url));

describe("la declaración que recibe el gateway", () => {
  it("lleva el fichero de conocimiento entero, la base por su nombre y la política de memoria", () => {
    const options = optionsFor(ClinicaNorte, [], new ClinicaNorte(), AGENT);

    expect(options.knowledge).toEqual({
      path: "./knowledge/clinica.md",
      text: readFileSync(fileURLToPath(new URL("../knowledge/clinica.md", import.meta.url)), "utf8"),
    });
    expect(options.docs).toEqual({ base: "clinica-norte", k: 4, minScore: 0.5 });
    expect(options.memory).toEqual({
      remember: ["cómo prefiere que le llamen", "alergias", "su médico habitual"],
      forget: ["pagos"],
    });
  });

  // Así estaba escrito hasta hoy: un glob que la app expandía sola. La base se sube por nombre y
  // el rechazo dice con qué verbo.
  it("rechaza el glob de antes y nombra el verbo que sube la base", () => {
    // Escrita como se escribía hasta hoy, sobre la clase base: el glob es del campo, no de esta
    // tienda ni de esta clínica.
    /** Un agente que dice su base con un glob. */
    class ConGlob extends Agent {
      docs = "./knowledge/docs/**/*.md";
    }

    expect(() => optionsFor(ConGlob, [], new ConGlob(), AGENT)).toThrow(
      "docs name the base they were pushed to: run `pinecall knowledge push ./knowledge/docs --base <slug>`",
    );
  });
});

// El prompt es lo que escribió la clínica y nada más. Lo que la memoria recuerda y lo que devuelve
// la base de conocimiento le llegan al modelo como resultados de una herramienta, en JSON, y por
// eso no hay ni un hueco que alguien rellene después (runtime/docs/security/prompt-injection.md).
describe("la view", () => {
  it("no lleva ningún marcador, ni una palabra que no sea de la clínica", () => {
    const rendered = render(seal(new ClinicaNorte()));
    const dynamic = rendered.blocks.find((block) => block.name === "view");

    expect(dynamic?.region).toBe("dynamic");
    expect(dynamic?.text).not.toContain("<!--");
    expect(dynamic?.text).toContain("Saluda y pide nombre y teléfono");
  });

  it("deja el bloque de conocimiento al runtime, que escribe en él el fichero de la declaración", () => {
    const rendered = render(seal(new ClinicaNorte()));
    const knowledge = rendered.blocks.find((block) => block.name === "knowledge");

    expect(knowledge?.region).toBe("static");
    expect(knowledge?.text).toBe("");
  });
});
