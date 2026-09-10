// Lo que la clase sabe, lee y recuerda viaja en la declaración, y los marcadores que el runtime
// rellena van en el bloque dinámico con las claves del wire. Anillo 0: sin red, sin clave, sin modelo.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import { optionsFor, render, seal } from "pinecall";

import ClinicaNorte from "../agent.js";
import view from "../views/agent.js";
import availability from "../views/availability.js";

const views = { view, availability };
const AGENT = fileURLToPath(new URL("../agent.ts", import.meta.url));

describe("la declaración que recibe el gateway", () => {
  it("lleva el fichero de conocimiento entero, la base por su nombre y la política de memoria", () => {
    const options = optionsFor(ClinicaNorte, [], new ClinicaNorte(), AGENT);

    expect(options.knowledge).toEqual({
      path: "./knowledge/clinica.md",
      text: readFileSync(fileURLToPath(new URL("../knowledge/clinica.md", import.meta.url)), "utf8"),
    });
    expect(options.docs).toEqual({ base: "clinica-norte" });
    expect(options.memory).toEqual({
      remember: ["cómo prefiere que le llamen", "alergias", "su médico habitual"],
      forget: ["pagos"],
    });
  });

  // Así estaba escrito hasta hoy: un glob que la app expandía sola. La base se sube por nombre y
  // el rechazo dice con qué verbo.
  it("rechaza el glob de antes y nombra el verbo que sube la base", () => {
    class ConGlob extends ClinicaNorte {
      override docs = "./knowledge/docs/**/*.md";
    }

    expect(() => optionsFor(ConGlob, [], new ConGlob(), AGENT)).toThrow(
      "docs name the base they were pushed to: run `pinecall knowledge push ./knowledge/docs --base <slug>`",
    );
  });
});

describe("los marcadores de la view", () => {
  it("van en el bloque dinámico, cada uno bajo su título, con las claves del wire", () => {
    const rendered = render(seal(new ClinicaNorte()), views);
    const dynamic = rendered.blocks.find((block) => block.name === "view");

    expect(dynamic?.region).toBe("dynamic");
    expect(dynamic?.text).toContain('Lo que recordamos de este paciente:\n\n<!-- memory: {} -->');
    expect(dynamic?.text).toContain('De la base de conocimiento:\n\n<!-- retrieved: {"k":4,"min_score":0.5} -->');
    expect(dynamic?.text).not.toContain("minScore");
  });

  it("deja el marcador de conocimiento en el bloque estático, con la ruta que la clase escribió", () => {
    const rendered = render(seal(new ClinicaNorte()), views);
    const knowledge = rendered.blocks.find((block) => block.name === "knowledge");

    expect(knowledge?.region).toBe("static");
    expect(knowledge?.text).toBe("<!-- knowledge: ./knowledge/clinica.md -->");
  });
});
