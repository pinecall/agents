// Lo que la clase sabe, lee y recuerda viaja en la declaración, y los marcadores que el runtime
// rellena van en el bloque dinámico con las claves del wire. Anillo 0: sin red, sin clave, sin modelo.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import { optionsFor, render, seal } from "pinecall";

import TiendaSur from "../agent.js";
import view from "../views/agent.js";

const AGENT = fileURLToPath(new URL("../agent.ts", import.meta.url));

describe("la declaración que recibe el gateway", () => {
  it("lleva el fichero de conocimiento entero, la base por su nombre y la política de memoria", () => {
    const options = optionsFor(TiendaSur, [], new TiendaSur(), AGENT);

    expect(options.knowledge).toEqual({
      path: "./knowledge/tienda.md",
      text: readFileSync(fileURLToPath(new URL("../knowledge/tienda.md", import.meta.url)), "utf8"),
    });
    expect(options.docs).toEqual({ base: "tienda-sur" });
    expect(options.memory).toEqual({
      remember: ["a qué se dedica", "la marca que suele llevarse", "el piso al que hay que subir"],
      forget: ["formas de pago"],
    });
  });

  it("rechaza el glob de antes y nombra el verbo que sube la base", () => {
    class ConGlob extends TiendaSur {
      override docs = "./knowledge/docs/**/*.md";
    }

    expect(() => optionsFor(ConGlob, [], new ConGlob(), AGENT)).toThrow(
      "docs name the base they were pushed to: run `pinecall knowledge push ./knowledge/docs --base <slug>`",
    );
  });
});

describe("los marcadores de la view", () => {
  it("van en el bloque dinámico, cada uno bajo su título, con las claves del wire", () => {
    const rendered = render(seal(new TiendaSur()), { view });
    const dynamic = rendered.blocks.find((block) => block.name === "view");

    expect(dynamic?.region).toBe("dynamic");
    expect(dynamic?.text).toContain('Lo que recordamos de este cliente:\n\n<!-- memory: {"kinds":["preference","purchase"]} -->');
    expect(dynamic?.text).toContain('De la base de conocimiento:\n\n<!-- retrieved: {"k":4,"min_score":0.02} -->');
    expect(dynamic?.text).not.toContain("minScore");
  });

  it("deja el marcador de conocimiento en el bloque estático, con la ruta que la clase escribió", () => {
    const rendered = render(seal(new TiendaSur()), { view });
    const knowledge = rendered.blocks.find((block) => block.name === "knowledge");

    expect(knowledge?.region).toBe("static");
    expect(knowledge?.text).toBe("<!-- knowledge: ./knowledge/tienda.md -->");
  });
});
