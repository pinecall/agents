// Criterio 2 del hito, clavado por un test: la región estática es byte a byte la misma en los tres
// estados capturados, y la dinámica cambia en los tres. El orden nunca se reordena: static · history
// · dynamic, que es el que el KV-cache del proveedor premia (docs/decisions/prompt-regions.md).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import { describe as describeClass, render, seal, showPrompt, toolNamed } from "pinecall";

import ClinicaNorte from "../agent.js";
import view from "../views/agent.js";

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

describe("las tres regiones del prompt", () => {
  it("mantiene la región estática idéntica en los tres estados", () => {
    const regions = STATES.map((_, index) => render(at(index), view));

    for (const region of regions) expect(region.static).toBe(regions[0]!.static);
    // Y no está vacía: un prefijo vacío también sería "idéntico" y no probaría nada.
    expect(regions[0]!.static).toContain("recepción de Clínica Norte");
  });

  it("cambia la región dinámica en cada uno de los tres", () => {
    const dynamics = STATES.map((_, index) => render(at(index), view).dynamic);

    expect(new Set(dynamics).size).toBe(STATES.length);
    expect(dynamics[0]).toContain("Saluda y pide nombre");
    expect(dynamics[1]).toContain("Ana García");
    expect(dynamics[2]).toContain("SMS");
  });

  it("imprime las regiones en su único orden", () => {
    const printed = showPrompt(at(1), view);

    expect(printed.indexOf("── static ──")).toBe(0);
    expect(printed.indexOf("── history ──")).toBeGreaterThan(printed.indexOf("── static ──"));
    expect(printed.indexOf("── dynamic ──")).toBeGreaterThan(printed.indexOf("── history ──"));
  });

  it("coincide con lo capturado, para que las capturas no se pudran", () => {
    for (const [index] of STATES.entries()) {
      const captured = readFileSync(here(`./prompts/state-${index}.txt`), "utf8");
      expect(`${showPrompt(at(index), view)}\n`).toBe(captured);
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

describe("un caso de goldens nombra unos campos y calla los demás", () => {
  it("rinde el primer caso de choose.json, que no habla de horas", () => {
    // El caso está en `choose` y no menciona `slots`: la clase le dio `[]` y la vista lee
    // `slots.length`. Con `restore` ese campo llegaba borrado y la vista moría en el CLI antes de
    // imprimir nada — este test es esa llamada, sin terminal.
    const agent = seal(new ClinicaNorte());
    agent.startIn(CASES[0]!.state);

    expect(render(agent, view).dynamic).toContain("pregúntale para qué día quiere cambiarla");
  });
});

// La clase y la vista son dos sitios donde se dice la misma regla, y durante un día no la dijeron
// igual: el docstring mandaba consultar SIEMPRE el día que nombra el paciente y la vista, sin horas
// sobre la mesa, mandaba preguntar por el día — y Haiku sigue a la vista. Este test es el clavo.
describe("la clase y la vista dicen lo mismo sobre el día que nombra el paciente", () => {
  it("repite en la vista la regla que freeSlots lleva en su docstring", () => {
    const agent = seal(new ClinicaNorte());
    agent.startIn(CASES[0]!.state);
    const dynamic = render(agent, view).dynamic;

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
    const dynamic = render(agent, view).dynamic;

    expect(dynamic).toContain("todavía no la reserva");
    expect(dynamic).toContain("pregúntale si se la confirmas");
    expect(dynamic).toContain("solo después de que te haya dicho que sí");
    expect(toolNamed(agent, "book")?.spec.description).toContain("Nunca antes de su sí");
  });

  it("calla la regla cuando no hay ninguna hora sobre la mesa", () => {
    const agent = seal(new ClinicaNorte());
    agent.startIn(CASES[0]!.state);

    expect(render(agent, view).dynamic).not.toContain("todavía no la reserva");
  });
});
