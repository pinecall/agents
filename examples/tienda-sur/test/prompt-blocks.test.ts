// Criterio 2 del hito, clavado por un test: cada bloque estático es byte a byte el mismo en los tres
// estados capturados, y la view cambia en los tres. El orden nunca se reordena: los bloques
// estáticos · la historia · la view, que es toda la región dinámica y lo último que lee el modelo
// — el orden que el KV-cache del proveedor premia (docs/decisions/prompt-blocks.md).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import {
  CallWorld,
  describe as describeClass,
  promptOf,
  seal,
  setCall,
  showPrompt,
  toolNamed,
  type Blocks,
} from "pinecall";

import TiendaSur from "../agent.js";

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const SOURCE = readFileSync(here("../agent.tsx"), "utf8");
const STATES = JSON.parse(readFileSync(here("./prompts/states.json"), "utf8")) as {
  state: Record<string, unknown>;
}[];

describeClass(TiendaSur, SOURCE);

/** El agente en el estado N del fichero, como lo pone `pinecall prompt --case N`. */
function at(index: number): TiendaSur {
  const agent = fresh();
  // `startIn` y no `restore`, que es lo que hace el CLI: un caso nombra los campos de los que
  // trata y ninguno más, así que el primero —que no habla del carrito— conserva el `cart = []` de
  // la clase en vez de quedarse sin él.
  agent.startIn(STATES[index]!.state);
  return agent;
}

// Una instancia con una llamada a la que contestar, que es lo que `pinecall prompt` le da: un
// `promptOf()` puede leer `this.call`, y una página sobre una llamada que no existe no sería la
// página del prompt. Por escrito, como imprime el CLI cuando nadie dice otra cosa.
function fresh(): TiendaSur {
  const agent = seal(new TiendaSur());
  setCall(agent, new CallWorld({ id: "", contact: "", channel: "web" }, () => undefined));
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
    const rendered = STATES.map((_, index) => promptOf(at(index)));

    for (const name of ["identity", "knowledge", "tools"]) {
      for (const one of rendered) expect(block(one, name)).toBe(block(rendered[0]!, name));
    }
    // Y no está vacío: un prefijo vacío también sería "idéntico" y no probaría nada.
    expect(block(rendered[0]!, "identity")).toContain("mostrador de Tienda Sur");
  });

  it("cambia la view en cada uno de los tres", () => {
    const dynamics = STATES.map((_, index) => block(promptOf(at(index)), "view"));

    expect(new Set(dynamics).size).toBe(STATES.length);
    expect(dynamics[0]).toContain("El carrito está vacío");
    expect(dynamics[1]).toContain("Rosa Medina");
    expect(dynamics[2]).toContain("TS-8001");
  });

  it("imprime los cuatro bloques por defecto en su único orden, con la historia en medio", () => {
    const headers = showPrompt(at(1))
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

  it("coincide con lo capturado, para que las capturas no se pudran", () => {
    for (const [index] of STATES.entries()) {
      const captured = readFileSync(here(`./prompts/state-${index}.txt`), "utf8");
      expect(`${showPrompt(at(index))}\n`).toBe(captured);
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
    const agent = fresh();
    agent.startIn({ stage: "browse" });

    expect(block(promptOf(agent), "view")).toContain("El carrito está vacío");
  });
});

// La clase y la vista son dos sitios donde se dice la misma regla, y en la Clínica se descubrió a
// base de llamadas que decían cosas distintas: el docstring mandaba buscar antes de decir un precio
// y la vista callaba. Haiku sigue a la vista. Este test es el clavo.
describe("la clase y la vista dicen lo mismo sobre buscar antes de decir un precio", () => {
  it("repite en la vista la regla que findProduct lleva en su docstring", () => {
    const agent = at(0);
    const dynamic = block(promptOf(agent), "view");

    expect(toolNamed(agent, "findProduct")?.spec.description).toContain("Llámala SIEMPRE");
    expect(dynamic).toContain("búscalo SIEMPRE con findProduct");
  });
});

// El par que la Clínica pagó con dos llamadas: con el carrito lleno, decir «ya está» no cierra
// nada, y una vez leído el pedido el sí SÍ lo cierra, en ese mismo turno. Las dos frases no pueden
// coincidir nunca, y aquí lo que las separa es la fase: `cart` dice una y `confirm` dice la otra.
describe("con el carrito lleno, terminar la compra no cierra el pedido", () => {
  it("manda repasarlo y esperar el sí, en la vista y en el docstring de confirmOrder", () => {
    const agent = fresh();
    agent.startIn({
      stage: "cart",
      cart: [{ ref: "TS-202", product: "brocha de cuatro pulgadas", qty: 1, price: 4 }],
    });
    const dynamic = block(promptOf(agent), "view");

    expect(dynamic).toContain("todavía no es un pedido");
    expect(dynamic).toContain("pregúntale si se lo cierras");
    expect(dynamic).toContain("solo después de que te haya dicho que sí");
    expect(toolNamed(agent, "confirmOrder")?.spec.description).toContain("Nunca antes de su sí");
  });

  it("y una vez leído dice lo contrario, que es la otra mitad de la regla", () => {
    const dynamic = block(promptOf(at(1)), "view");

    expect(dynamic).toContain("llama a confirmOrder en ese mismo turno");
    expect(dynamic).not.toContain("todavía no es un pedido");
  });
});
