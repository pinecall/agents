// La clase declara el contrato — las puertas, el idioma, las tools, el render() — y nada del
// entorno: la voz, el modelo, el saludo, las palabras, la memoria, lo sabido de memoria y la base
// son del mundo, y una clase que todavía los declara es rechazada al cargar nombrando el verbo.
// Anillo 0: sin red, sin clave, sin modelo.

import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import { Agent, optionsFor, promptOf, seal } from "pinecall";

import ClinicaNorte from "../../agents/clinica-norte/agent.js";

const AGENT = fileURLToPath(new URL("../../agents/clinica-norte/agent.tsx", import.meta.url));

describe("la declaración que recibe el gateway", () => {
  it("lleva el idioma y las tools, y nada del entorno ni de las puertas", () => {
    const options = optionsFor(ClinicaNorte, [], new ClinicaNorte(), AGENT);

    // Una puerta es una fila de la org (`pinecall numbers import`), nunca un campo de la clase.
    expect("routes" in options).toBe(false);
    expect(options.language).toBe("es");
    for (const field of ["voice", "llm", "stt", "greeting", "says", "hears", "memory", "docs", "knowledge"]) {
      expect((options as Record<string, unknown>)[field]).toBeUndefined();
    }
  });

  // Así estaba escrito hasta hoy: la base nombrada en la clase. Es del mundo, y el rechazo dice
  // con qué verbo se adjunta.
  it("rechaza una clase que todavía nombra su base, y dice el verbo que la adjunta", () => {
    /** Un agente escrito como antes. */
    class DeAntes extends Agent {
      constructor() {
        super();
        Object.defineProperty(this, "docs", { value: "clinica-norte", enumerable: true });
      }
    }

    expect(() => optionsFor(DeAntes, [], new DeAntes(), AGENT)).toThrow("pinecall docs attach <base>");
  });
});

// El prompt es lo que escribió la clínica y nada más. Lo que la memoria recuerda y lo que devuelve
// la base le llegan al modelo como resultados de una herramienta, en JSON, y por eso no hay ni un
// hueco que alguien rellene después (runtime/docs/security/prompt-injection.md).
describe("la view", () => {
  it("no lleva ningún marcador, ni una palabra que no sea de la clínica", () => {
    const rendered = promptOf(seal(new ClinicaNorte()));
    const dynamic = rendered.blocks.find((block) => block.name === "view");

    expect(dynamic?.region).toBe("dynamic");
    expect(dynamic?.text).not.toContain("<!--");
    expect(dynamic?.text).toContain("Saluda y pide nombre y teléfono");
  });

  it("deja el bloque de conocimiento al gateway, que escribe en él lo que el mundo sabe de memoria", () => {
    const rendered = promptOf(seal(new ClinicaNorte()));
    const knowledge = rendered.blocks.find((block) => block.name === "knowledge");

    expect(knowledge?.region).toBe("static");
    expect(knowledge?.text).toBe("");
  });
});
