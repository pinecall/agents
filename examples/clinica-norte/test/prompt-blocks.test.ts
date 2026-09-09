// Criterio 2 del hito, clavado por un test: cada bloque estático es byte a byte el mismo en los tres
// estados capturados, y la view cambia en los tres. El orden nunca se reordena: los bloques
// estáticos · la historia · los dinámicos, la view al final — el orden que el KV-cache del
// proveedor premia (docs/decisions/prompt-blocks.md).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import { describe as describeClass, render, seal, showPrompt, toolNamed, type Blocks } from "pinecall";

import ClinicaNorte from "../agent.js";
import view from "../views/agent.js";
import availability from "../views/availability.js";

const views = { view, availability };

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const SOURCE = readFileSync(here("../agent.ts"), "utf8");
const STATES = JSON.parse(readFileSync(here("./prompts/states.json"), "utf8")) as {
  state: Record<string, unknown>;
}[];
// El fichero de goldens del diseño, el mismo que lee `pinecall prompt --state test/choose.json`.
const CASES = JSON.parse(readFileSync(here("./choose.json"), "utf8")) as {
  state: Record<string, unknown>;
}[];

describeClass(ClinicaNorte, SOURCE);

/** El agente en el estado N del fichero, como lo pone `pinecall prompt --case N`. */
function at(index: number): ClinicaNorte {
  const agent = seal(new ClinicaNorte());
  // `startIn` y no `restore`, que es lo que hace el CLI: un caso nombra los campos de los que
  // trata y ninguno más, así que el primero —que no habla de horas— conserva el `slots = []` de
  // la clase en vez de quedarse sin él.
  agent.startIn(STATES[index]!.state);
  return agent;
}

/** El texto de un bloque, por nombre. */
function block(blocks: Blocks, name: string): string {
  const found = blocks.blocks.find((one) => one.name === name);
  if (found === undefined) throw new Error(`no hay bloque ${name}`);
  return found.text;
}

describe("los bloques del prompt", () => {
  it("mantiene cada bloque estático idéntico en los tres estados", () => {
    const rendered = STATES.map((_, index) => render(at(index), views));

    for (const name of ["identity", "knowledge", "tools"]) {
      for (const one of rendered) expect(block(one, name)).toBe(block(rendered[0]!, name));
    }
    // Y no está vacío: un prefijo vacío también sería "idéntico" y no probaría nada.
    expect(block(rendered[0]!, "identity")).toContain("recepción de Clínica Norte");
  });

  it("cambia la view en cada uno de los tres", () => {
    const dynamics = STATES.map((_, index) => block(render(at(index), views), "view"));

    expect(new Set(dynamics).size).toBe(STATES.length);
    expect(dynamics[0]).toContain("Saluda y pide nombre");
    expect(dynamics[1]).toContain("Ana García");
    expect(dynamics[2]).toContain("SMS");
  });

  it("imprime los bloques en su único orden: los estáticos, la historia, los dinámicos y la view al final", () => {
    const headers = showPrompt(at(1), views)
      .split("\n")
      .filter((line) => line.startsWith("── "));

    expect(headers).toEqual([
      "── identity (static) ──",
      "── knowledge (static) ──",
      "── tools (static) ──",
      "── history ──",
      "── availability (dynamic) ──",
      "── view (dynamic) ──",
    ]);
  });

  it("coincide con lo capturado, para que las capturas no se pudran", () => {
    for (const [index] of STATES.entries()) {
      const captured = readFileSync(here(`./prompts/state-${index}.txt`), "utf8");
      expect(`${showPrompt(at(index), views)}\n`).toBe(captured);
    }
  });

  // La puerta del servidor que exigía el sí se quitó (2026-09-06) y vuelve cuando un milestone la
  // necesite; la declaración viaja igual en el wire, y eso es lo que la clase aporta y se prueba aquí.
  it("declara book como irreversible, con su lectura en voz alta", () => {
    const book = toolNamed(at(1), "book");

    expect(book?.spec.side_effect).toBe("irreversible");
    expect(book?.spec.confirm).toContain("¿Lo confirmo?");
  });
});

// El bloque propio: las horas viven en `availability`, que se reescribe solo cuando freeSlots vuelve
// con otras, y la view —que va después— queda para decir qué hacer con ellas en este turno.
describe("el bloque availability", () => {
  it("está vacío hasta que freeSlots vuelve, y entonces lleva las horas y la view no", async () => {
    const agent = at(0);
    expect(block(render(agent, views), "availability")).toBe("");

    agent.startIn({ ...STATES[0]!.state, stage: "choose", patient: { name: "Ana García", phone: "+34 600 000 001" } });
    await agent.freeSlots("martes");

    const rendered = render(agent, views);
    expect(agent.slots.length).toBeGreaterThan(0);
    expect(block(rendered, "availability")).toContain("Horas libres, en orden:");
    expect(block(rendered, "availability")).toContain(agent.slots[0]!.when);
    expect(block(rendered, "view")).not.toContain("Horas libres");
    expect(block(rendered, "view")).toContain("de estas horas");
  });
});

describe("un caso de goldens nombra unos campos y calla los demás", () => {
  it("rinde el primer caso de choose.json, que no habla de horas", () => {
    // El caso está en `choose` y no menciona `slots`: la clase le dio `[]` y la vista lee
    // `slots.length`. Con `restore` ese campo llegaba borrado y la vista moría en el CLI antes de
    // imprimir nada — este test es esa llamada, sin terminal.
    const agent = seal(new ClinicaNorte());
    agent.startIn(CASES[0]!.state);

    expect(block(render(agent, views), "view")).toContain("pregúntale para qué día quiere cambiarla");
  });
});

// La clase y la vista son dos sitios donde se dice la misma regla, y durante un día no la dijeron
// igual: el docstring mandaba consultar SIEMPRE el día que nombra el paciente y la vista, sin horas
// sobre la mesa, mandaba preguntar por el día — y Haiku sigue a la vista. Este test es el clavo.
describe("la clase y la vista dicen lo mismo sobre el día que nombra el paciente", () => {
  it("repite en la vista la regla que freeSlots lleva en su docstring", () => {
    const agent = seal(new ClinicaNorte());
    agent.startIn(CASES[0]!.state);
    const dynamic = block(render(agent, views), "view");

    expect(toolNamed(agent, "freeSlots")?.spec.description).toContain("se consulta SIEMPRE");
    expect(dynamic).toContain("consulta SIEMPRE la agenda de ese día");
    // Y la vista sigue diciendo qué hacer cuando todavía no ha nombrado ninguno: son dos ramas,
    // no una regla que sustituye a la otra.
    expect(dynamic).toContain("todavía no ha nombrado ninguno");
  });
});

// El 2026-09-08 `no-reserva-antes-del-si` reservó en dos de cada cinco corridas sobre haiku: con
// horas sobre la mesa la vista terminaba en cómo ofrecerlas y no decía nada del turno siguiente,
// que es siempre el paciente eligiendo. El único «espera un sí explícito» estaba en el prefijo
// estático, en genérico, y nada en el prompt dice que reservar sea irreversible. Este test es el
// clavo: la regla se dice donde el modelo decide, y `book` la repite en su docstring.
describe("con horas sobre la mesa, elegir una no la reserva", () => {
  it("manda repetir la hora entera y esperar el sí, en la vista y en el docstring de book", () => {
    const agent = at(1);
    const dynamic = block(render(agent, views), "view");

    expect(dynamic).toContain("todavía no la reserva");
    expect(dynamic).toContain("pregúntale si se la confirmas");
    expect(dynamic).toContain("solo después de que te haya dicho que sí");
    expect(toolNamed(agent, "book")?.spec.description).toContain("Nunca antes de su sí");
  });

  it("calla la regla cuando no hay ninguna hora sobre la mesa", () => {
    const agent = seal(new ClinicaNorte());
    agent.startIn(CASES[0]!.state);

    expect(block(render(agent, views), "view")).not.toContain("todavía no la reserva");
  });
});
