// Criterio 2 del hito, clavado por un test: la región estática es byte a byte la misma en los tres
// estados capturados, y la dinámica cambia en los tres. El orden nunca se reordena: static · history
// · dynamic, que es el que el KV-cache del proveedor premia (docs/decisions/prompt-regions.md).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import { describe as describeClass, render, seal, showPrompt, toolNamed } from "pinecall";

import TiendaSur from "../agent.js";
import view from "../views/agent.js";

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const SOURCE = readFileSync(here("../agent.ts"), "utf8");
const STATES = JSON.parse(readFileSync(here("./prompts/states.json"), "utf8")) as {
  state: Record<string, unknown>;
}[];

describeClass(TiendaSur, SOURCE);

/** El agente en el estado N del fichero, como lo pone `pinecall prompt --case N`. */
function at(index: number): TiendaSur {
  const agent = seal(new TiendaSur());
  // `startIn` y no `restore`, que es lo que hace el CLI: un caso nombra los campos de los que
  // trata y ninguno más, así que el primero —que no habla del carrito— conserva el `cart = []` de
  // la clase en vez de quedarse sin él.
  agent.startIn(STATES[index]!.state);
  return agent;
}

describe("las tres regiones del prompt", () => {
  it("mantiene la región estática idéntica en los tres estados", () => {
    const regions = STATES.map((_, index) => render(at(index), view));

    for (const region of regions) expect(region.static).toBe(regions[0]!.static);
    // Y no está vacía: un prefijo vacío también sería "idéntico" y no probaría nada.
    expect(regions[0]!.static).toContain("mostrador de Tienda Sur");
  });

  it("cambia la región dinámica en cada uno de los tres", () => {
    const dynamics = STATES.map((_, index) => render(at(index), view).dynamic);

    expect(new Set(dynamics).size).toBe(STATES.length);
    expect(dynamics[0]).toContain("El carrito está vacío");
    expect(dynamics[1]).toContain("Rosa Medina");
    expect(dynamics[2]).toContain("TS-8001");
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
  it("declara confirmOrder como irreversible, con su lectura en voz alta", () => {
    const close = toolNamed(at(1), "confirmOrder");

    expect(close?.spec.side_effect).toBe("irreversible");
    expect(close?.spec.confirm).toContain("¿Lo confirmo?");
  });
});

// Un caso nombra los campos de los que trata y calla los demás. El primero está en `browse` y no
// menciona `cart`: la clase le dio `[]` y la vista lee `cart.length`. Con `restore` ese campo
// llegaría borrado y la vista moriría en el CLI antes de imprimir nada — esto es esa llamada, sin
// terminal.
describe("un caso que nombra unos campos y calla los demás", () => {
  it("rinde un estado que solo dice la fase", () => {
    const agent = seal(new TiendaSur());
    agent.startIn({ stage: "browse" });

    expect(render(agent, view).dynamic).toContain("El carrito está vacío");
  });
});

// La clase y la vista son dos sitios donde se dice la misma regla, y en la Clínica se descubrió a
// base de llamadas que decían cosas distintas: el docstring mandaba buscar antes de decir un precio
// y la vista callaba. Haiku sigue a la vista. Este test es el clavo.
describe("la clase y la vista dicen lo mismo sobre buscar antes de decir un precio", () => {
  it("repite en la vista la regla que findProduct lleva en su docstring", () => {
    const agent = at(0);
    const dynamic = render(agent, view).dynamic;

    expect(toolNamed(agent, "findProduct")?.spec.description).toContain("Llámala SIEMPRE");
    expect(dynamic).toContain("búscalo SIEMPRE con findProduct");
  });
});

// El par que la Clínica pagó con dos llamadas: con el carrito lleno, decir «ya está» no cierra
// nada, y una vez leído el pedido el sí SÍ lo cierra, en ese mismo turno. Las dos frases no pueden
// coincidir nunca, y aquí lo que las separa es la fase: `cart` dice una y `confirm` dice la otra.
describe("con el carrito lleno, terminar la compra no cierra el pedido", () => {
  it("manda repasarlo y esperar el sí, en la vista y en el docstring de confirmOrder", () => {
    const agent = seal(new TiendaSur());
    agent.startIn({
      stage: "cart",
      cart: [{ ref: "TS-202", product: "brocha de cuatro pulgadas", qty: 1, price: 4 }],
    });
    const dynamic = render(agent, view).dynamic;

    expect(dynamic).toContain("todavía no es un pedido");
    expect(dynamic).toContain("pregúntale si se lo cierras");
    expect(dynamic).toContain("solo después de que te haya dicho que sí");
    expect(toolNamed(agent, "confirmOrder")?.spec.description).toContain("Nunca antes de su sí");
  });

  it("y una vez leído dice lo contrario, que es la otra mitad de la regla", () => {
    const dynamic = render(at(1), view).dynamic;

    expect(dynamic).toContain("llama a confirmOrder en ese mismo turno");
    expect(dynamic).not.toContain("todavía no es un pedido");
  });
});
