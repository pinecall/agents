// El recorrido entero contra el gateway que no existe: buscar, meter, repasar, cerrar, y el "no".
// El paseo por la terminal (`pinecall chat`) es del cierre de la tarjeta; esto es su equivalente en
// proceso: las mismas cuatro fases, los mismos tool.result, sin teclado y sin modelo.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, expect, it } from "vitest";
import { Pinecall } from "pinecall/client";
import { FakeGateway } from "pinecall/client/testing";
import { mount, type Mounted } from "pinecall";

import TiendaSur from "../agent.js";
import view from "../views/agent.js";
import type { Product } from "../lib/catalog.js";

const KEY = "pk_test";
const SLUG = "tienda-sur";
const CALL = "CA_chat_1";
const ROSA = "+34 600 000 011";
const SOURCE = readFileSync(fileURLToPath(new URL("../agent.ts", import.meta.url)), "utf8");

let gateway: FakeGateway;
let pc: Pinecall;
let mounted: Mounted;

beforeEach(async () => {
  gateway = await FakeGateway.start({ apiKey: KEY });
  pc = new Pinecall({ url: gateway.url, apiKey: KEY });
  // Una tool que falla llega al modelo como tool.result y a la app como error; aquí se lee el cable,
  // así que el lado de la app se calla en vez de imprimirse.
  pc.onErrors(() => {});
  mounted = mount(TiendaSur, { pc, views: { view }, source: SOURCE, slug: SLUG });
  await pc.connect();
  await settled();
});

afterEach(async () => {
  pc.close();
  await gateway.close();
});

/** Dejar que se asiente todo lo que el socket empezó: el bridge lo espera todo, nadie cronometra. */
async function settled(): Promise<void> {
  for (let turn = 0; turn < 20; turn++) await new Promise((resolve) => setTimeout(resolve, 1));
}

function calls(name: string, args: Record<string, unknown> = {}): void {
  gateway.emit(SLUG, CALL, "tool.call", { call_id: `t-${name}`, name, arguments: args });
}

function results(): Record<string, unknown>[] {
  return gateway.commandsOf("tool.result").map((command) => command.data);
}

function offered(): string[] {
  const sent = gateway.commandsOf("tools.set").at(-1)?.data["tools"] as { name: string }[];
  return sent.map((tool) => tool.name);
}

it("recorre buscar, meter y cerrar, y dice que no cuando el almacén dice que no", async () => {
  gateway.emit(SLUG, CALL, "call.started", {
    channel: "phone",
    direction: "inbound",
    from: ROSA,
    to: SLUG,
    caller: { phone: ROSA, name: "Rosa Medina" },
    started_at: Date.now() / 1000,
  });
  await settled();
  // Fase uno: el carrito está vacío, así que no hay nada que repasar ni que cerrar.
  expect(offered()).toEqual(["findProduct", "addToCart", "registerCustomer", "orderStatus"]);

  calls("findProduct", { query: "pintura" });
  await expect.poll(results).toHaveLength(1);
  await settled();
  // El modelo ve tres artículos; el estado guarda los cuatro, y por eso puede ofrecer un cuarto.
  expect((results()[0]?.["output"] as Product[]).length).toBe(3);
  const instance = mounted.instanceOf(CALL) as unknown as TiendaSur;
  expect(instance.counter.length).toBeGreaterThan(3);

  calls("addToCart", { product: "rodillo antigoteo", qty: 1 });
  await expect.poll(results).toHaveLength(2);
  await settled();
  expect(instance.stage).toBe("cart");
  expect(offered()).toEqual([
    "findProduct",
    "addToCart",
    "proposeOrder",
    "registerCustomer",
    "orderStatus",
  ]);

  calls("proposeOrder");
  await expect.poll(results).toHaveLength(3);
  await settled();
  expect(instance.stage).toBe("confirm");
  expect(offered()).toEqual([
    "findProduct",
    "addToCart",
    "confirmOrder",
    "registerCustomer",
    "orderStatus",
  ]);

  calls("confirmOrder");
  await expect.poll(results).toHaveLength(4);
  await settled();
  // El "no" del almacén llega al modelo como texto, no como una excepción, y el estado sigue sin
  // pedido: el rodillo está en la pizarra y no en el patio de atrás.
  expect(String(results()[3]?.["error"])).toContain("se ha agotado esta mañana");
  expect(instance.order).toBeUndefined();
  expect(instance.stage).toBe("confirm");

  calls("findProduct", { query: "brocha" });
  await expect.poll(results).toHaveLength(5);
  calls("addToCart", { product: "brocha de cuatro pulgadas", qty: 2 });
  await expect.poll(results).toHaveLength(6);
  await settled();
  // Meter algo devuelve el carrito a repasarse: lo que se le leyó ya no es lo que se lleva.
  expect(instance.stage).toBe("cart");

  calls("proposeOrder");
  await expect.poll(results).toHaveLength(7);
  await settled();
  const prompt = gateway.commandsOf("prompt.set").at(-1)?.data;
  expect(String(prompt?.["text"])).toContain("Le estás proponiendo este pedido");
});

it("sin ficha no cierra, y con ficha sí: el pedido tiene que ir a algún sitio", async () => {
  gateway.emit(SLUG, CALL, "call.started", {
    channel: "web",
    direction: "inbound",
    from: "web_anonimo",
    to: SLUG,
    caller: null,
    started_at: Date.now() / 1000,
  });
  await settled();

  calls("findProduct", { query: "bombilla" });
  await expect.poll(results).toHaveLength(1);
  calls("addToCart", { product: "bombilla led", qty: 4 });
  await expect.poll(results).toHaveLength(2);
  calls("proposeOrder");
  await expect.poll(results).toHaveLength(3);
  calls("confirmOrder");
  await expect.poll(results).toHaveLength(4);
  await settled();
  expect(String(results()[3]?.["error"])).toContain("apúntalos con registerCustomer");

  calls("registerCustomer", { name: "Paco Ruz", address: "Alfarería nueve", phone: "600 000 099" });
  await expect.poll(results).toHaveLength(5);
  calls("confirmOrder");
  await expect.poll(results).toHaveLength(6);
  await settled();

  const instance = mounted.instanceOf(CALL) as unknown as TiendaSur;
  expect(instance.stage).toBe("done");
  expect(instance.order?.total).toBe(16);
  expect(offered()).toEqual(["orderStatus"]);
  expect(gateway.commandsOf("call.log")[0]?.data["name"]).toBe("order.placed");

  const prompt = gateway.commandsOf("prompt.set").at(-1)?.data;
  expect(String(prompt?.["text"])).toContain("sube esta misma tarde");
});
