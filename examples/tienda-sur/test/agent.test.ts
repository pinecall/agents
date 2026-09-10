// La clase es una clase: cuatro fases, un carrito, y un pedido que la tienda puede rechazar.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { beforeEach, describe, expect, it } from "vitest";
import {
  CallWorld,
  describe as describeClass,
  recalled,
  promptOf,
  runHook,
  runTool,
  seal,
  setCall,
  tool,
  toolNamed,
  type ToolDeclaration,
} from "pinecall";

import TiendaSur from "../agent.js";
import { SOLD_OUT, type Product } from "../lib/catalog.js";
import { tienda, type Line } from "../lib/shop.js";

// El fuente de la clase, para que los tipos de los parámetros sobrevivan al transpilador: sin él,
// `query: string` es un argumento sin tipo y el esquema no puede decir nada de él.
const SOURCE = readFileSync(fileURLToPath(new URL("../agent.tsx", import.meta.url)), "utf8");
const ROSA = "+34 600 000 011";

// La clase recibe su propio fuente una vez, como se lo dará el runner.
describeClass(TiendaSur, SOURCE);

let sur: TiendaSur;

/** El texto de un bloque del prompt, por nombre, en el estado en que esté la tienda. */
function block(name: string, agent: TiendaSur = sur): string {
  const found = promptOf(agent).blocks.find((one) => one.name === name);
  if (found === undefined) throw new Error(`no hay bloque ${name}`);
  return found.text;
}

beforeEach(() => {
  sur = onA("phone");
});

/** La tienda atendiendo una llamada por esa puerta: es lo que `promptOf()` lee de `this.call`. */
function onA(channel: string): TiendaSur {
  const agent = seal(new TiendaSur());
  setCall(agent, new CallWorld({ id: "CA_1", contact: ROSA, from: ROSA, channel }, () => undefined));
  return agent;
}

/** Llamar una tool como la llama el runtime: por su nombre, con el objeto que manda el modelo. */
function call(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
  const declaration = toolNamed(sur, name) as ToolDeclaration;
  return runTool(sur, declaration, args);
}

function names(): string[] {
  return sur.visibleTools().map((spec) => spec.name);
}

/** El carrito con una brocha dentro, que es el punto de partida de casi todo lo de abajo. */
async function withABrush(): Promise<void> {
  await call("findProduct", { query: "brocha" });
  await call("addToCart", { product: "brocha de cuatro pulgadas", qty: 2 });
}

describe("buscar en el catálogo", () => {
  it("el modelo ve tres artículos y el campo se los queda todos", async () => {
    const seen = (await call("findProduct", { query: "pintura" })) as Product[];
    expect(seen).toHaveLength(3);
    expect(sur.counter.length).toBeGreaterThan(3);
    expect(sur.counter[0]).toEqual(seen[0]);
  });

  it("lo que la tienda no vende devuelve la lista vacía en vez de un precio", async () => {
    const seen = (await call("findProduct", { query: "lavadora" })) as Product[];
    expect(seen).toEqual([]);
    expect(sur.counter).toEqual([]);
  });

  it("encuentra por el pasillo y por la referencia, que es como el cliente sabe pedirlo", async () => {
    expect((await call("findProduct", { query: "electricidad" })) as Product[]).toHaveLength(2);
    expect(((await call("findProduct", { query: "TS-301" })) as Product[])[0]?.price).toBe(4);
  });

  it("busca en dos pasadas: si nada encaja del todo, algo que encaje en una palabra", async () => {
    // "brocha ancha" no es ninguna ficha entera y es exactamente como se pide una brocha.
    const seen = (await call("findProduct", { query: "brocha ancha" })) as Product[];
    expect(seen.map((product) => product.ref)).toEqual(["TS-202"]);
  });

  it("una búsqueda que no encuentra nada no barre lo que ya está sobre el mostrador", async () => {
    // El fallo que se vio en la primera conversación entera: se cantaba la pintura, se buscaba una
    // brocha con un nombre que no existía, y el carrito se quedaba sin poder llenarse de nada.
    await call("findProduct", { query: "pintura plástica blanca" });
    await call("findProduct", { query: "hidrolimpiadora" });

    expect(sur.counter.map((product) => product.ref)).toEqual(["TS-201"]);
    await call("addToCart", { product: "pintura plástica blanca", qty: 2 });
    expect(sur.total).toBe(38);
  });

  it("lo último cantado va delante, y nada se canta dos veces", async () => {
    await call("findProduct", { query: "brocha" });
    await call("findProduct", { query: "bombilla" });
    await call("findProduct", { query: "brocha" });

    expect(sur.counter.map((product) => product.ref)).toEqual(["TS-202", "TS-301"]);
  });
});

describe("el carrito", () => {
  it("mete lo que está sobre el mostrador, lo multiplica y pasa a la fase del carrito", async () => {
    await withABrush();
    expect(sur.cart).toEqual([{ ref: "TS-202", product: "brocha de cuatro pulgadas", qty: 2, price: 8 }]);
    expect(sur.total).toBe(8);
    expect(sur.stage).toBe("cart");
  });

  it("se niega a meter algo que la tienda no le ha cantado, y dice lo que sí le cantó", async () => {
    await call("findProduct", { query: "brocha" });
    await expect(call("addToCart", { product: "taladro percutor", qty: 1 })).rejects.toThrow(
      "Sobre el mostrador hay: brocha de cuatro pulgadas.",
    );
    expect(sur.cart).toEqual([]);
  });

  it("una cantidad de menos de uno es uno: nadie se lleva media brocha", async () => {
    await call("findProduct", { query: "brocha" });
    const line = (await call("addToCart", { product: "brocha", qty: 0 })) as Line;
    expect(line.qty).toBe(1);
  });
});

describe("cerrar el pedido", () => {
  beforeEach(async () => {
    await runHook(sur, "onCall", { id: "CA_1", contact: ROSA, from: ROSA, channel: "phone" });
    await withABrush();
  });

  it("repasar el carrito lo deja sobre la mesa sin cerrarlo, y cerrarlo lo retira", async () => {
    await call("proposeOrder");
    expect(sur.stage).toBe("confirm");
    expect(sur.order).toBeUndefined();

    await call("confirmOrder");
    expect(sur.order?.total).toBe(8);
    expect(sur.stage).toBe("done");
  });

  it("meter algo después de la lectura devuelve el carrito a repasarse", async () => {
    await call("proposeOrder");
    await call("findProduct", { query: "bombilla" });
    await call("addToCart", { product: "bombilla led", qty: 1 });
    expect(sur.stage).toBe("cart");
    expect(sur.total).toBe(12);
  });

  it("deja el hecho en el log y colapsa la historia en una frase", async () => {
    await call("proposeOrder");
    await call("confirmOrder");
    expect(promptOf(sur).history).toContain("cerrado por Rosa Medina");
  });

  it("un artículo agotado deja el pedido sin hacer y dice qué hacer con él", async () => {
    await call("findProduct", { query: "rodillo" });
    await call("addToCart", { product: "rodillo antigoteo", qty: 1 });
    expect(sur.cart.some((line) => line.ref === SOLD_OUT)).toBe(true);
    await call("proposeOrder");

    await expect(call("confirmOrder")).rejects.toThrow("se ha agotado esta mañana");
    expect(sur.order).toBeUndefined();
    expect(sur.stage).toBe("confirm");
  });
});

describe("de quién es el pedido", () => {
  it("encuentra la ficha por el número desde el que se llama, sin preguntar nada", async () => {
    // El hook se corre como lo corre el runtime: lo que escribe lo firma el hook, no nadie.
    await runHook(sur, "onCall", { id: "CA_2", contact: ROSA, from: ROSA, channel: "phone" });
    expect(sur.customer?.name).toBe("Rosa Medina");
    expect(sur.customer?.address).toContain("Pagés del Corro");
  });

  it("sin ficha, cerrar se niega y dice con qué se arregla", async () => {
    await withABrush();
    await call("proposeOrder");
    await expect(call("confirmOrder")).rejects.toThrow("apúntalos con registerCustomer");

    await call("registerCustomer", { name: "Paco Ruz", address: "Alfarería nueve", phone: "600 000 099" });
    expect(sur.customer?.name).toBe("Paco Ruz");
    expect((await call("confirmOrder")) as { reference: string }).toHaveProperty("reference");
  });
});

describe("un pedido de otro día", () => {
  it("lo encuentra por su referencia, y contesta que no cuando no es de esta tienda", async () => {
    expect(await call("orderStatus", { reference: "TS-7781" })).toMatchObject({ status: "en reparto" });
    expect(await call("orderStatus", { reference: "TS-0000" })).toBeNull();
  });
});

describe("las cuatro fases", () => {
  it("las herramientas visibles cambian con la fase y con nada más", async () => {
    expect(sur.stage).toBe("browse");
    expect(names()).toEqual(["findProduct", "addToCart", "registerCustomer", "orderStatus"]);

    await withABrush();
    expect(sur.stage).toBe("cart");
    expect(names()).toEqual(["findProduct", "addToCart", "proposeOrder", "registerCustomer", "orderStatus"]);

    await call("proposeOrder");
    expect(sur.stage).toBe("confirm");
    expect(names()).toEqual(["findProduct", "addToCart", "confirmOrder", "registerCustomer", "orderStatus"]);

    await call("registerCustomer", { name: "Paco Ruz", address: "Alfarería nueve", phone: "600 000 099" });
    await call("confirmOrder");
    expect(sur.stage).toBe("done");
    expect(names()).toEqual(["orderStatus"]);
  });

  it("confirmOrder pide las dos cosas: la fase y algo en el carrito", async () => {
    await withABrush();
    await call("proposeOrder");
    expect(names()).toContain("confirmOrder");

    // La fase sigue siendo confirm y la tool desaparece igual: el predicado es la otra mitad.
    sur.startIn({ stage: "confirm", cart: [] });

    expect(names()).not.toContain("confirmOrder");
  });

  it("orderStatus no nombra ninguna fase, y por eso está en todas", () => {
    for (const stage of ["browse", "cart", "confirm", "done"] as const) {
      // Restaurar un estado es una escritura firmada, como la del runtime al retomar una llamada.
      sur.startIn({ stage });
      expect(names()).toContain("orderStatus");
    }
  });

  it("no compila una fase que la clase no nombra", () => {
    // @ts-expect-error "car" no es una de las cuatro fases que declara el campo stage
    const misspelled: Parameters<typeof tool<TiendaSur>>[0] = { stage: "car" };

    expect(misspelled).toBeDefined();
  });

  it("declara confirmOrder como irreversible y proposeOrder como lectura, con su frase", () => {
    const close = sur.tools().find((spec) => spec.name === "confirmOrder");
    expect(close?.side_effect).toBe("irreversible");
    expect(close?.confirm).toBe("Te cierro el pedido: {{result.total}} euros. ¿Lo confirmo?");
    // Repasar no toca la tienda: el gate no tiene nada que leer antes de dejarlo pasar, y por eso
    // el modelo puede llamarlo en el mismo turno en que el cliente dice que ya está.
    const propose = sur.tools().find((spec) => spec.name === "proposeOrder");
    expect(propose?.side_effect).toBe("read");
    expect(propose?.confirm).toBeUndefined();
    const register = sur.tools().find((spec) => spec.name === "registerCustomer");
    expect(register?.pii).toEqual(["name", "address", "phone"]);
  });
});

describe("la view", () => {
  const dynamic = (agent: TiendaSur = sur): string => block("view", agent);

  it("dice que no sabe quién llama mientras no haya ficha", () => {
    expect(dynamic()).toContain("Todavía no sabes quién llama");
    expect(dynamic()).toContain("búscalo SIEMPRE con findProduct");
  });

  it("nombra al cliente y su dirección, y deja de pedirle los datos", async () => {
    await runHook(sur, "onCall", { id: "CA_3", contact: ROSA, from: ROSA, channel: "phone" });
    const text = dynamic();
    expect(text).toContain("Hablas con Rosa Medina, ya en la ficha");
    expect(text).toContain("El reparto sube a Pagés del Corro");
    expect(text).not.toContain("Todavía no sabes quién llama");
  });

  it("ofrece tres artículos por teléfono y cinco por escrito, con los mismos en el estado", async () => {
    await call("findProduct", { query: "pintura" });
    expect(dynamic()).toContain("como mucho tres");

    // La misma clase por la otra puerta: la llamada que atiende es lo único que cambia.
    const escrita = onA("web");
    await runTool(escrita, toolNamed(escrita, "findProduct") as ToolDeclaration, { query: "pintura" });
    expect(dynamic(escrita)).toContain("hasta cinco");
  });

  // Lo que la memoria sabe de este cliente lo pone el runtime, y llega como palabras: `remembers`
  // es cómo lo pregunta la clase, y contesta que no mientras nadie haya recordado nada.
  it("prioriza la marca de siempre solo cuando la memoria la sabe", () => {
    expect(dynamic()).not.toContain("la marca que se suele llevar");

    recalled(sur, ["la marca que suele llevarse es Bosch", "la marca que suele llevarse"]);

    expect(dynamic()).toContain("la marca que se suele llevar");
  });

  it("con el carrito lleno lo canta, lo suma y manda repasarlo antes de cerrar", async () => {
    await withABrush();
    const text = dynamic();
    expect(text).toContain("2 × brocha de cuatro pulgadas, 8 euros");
    expect(text).toContain("Suman 8 euros");
    expect(text).toContain("todavía no es un pedido");
    expect(text).toContain("confirmOrder solo después de que te haya dicho que sí");
    // El turno de después todavía no ha llegado: la frase que manda cerrar sin volver a preguntar
    // no puede estar delante del modelo mientras el cliente no haya dicho que ya está.
    expect(text).not.toContain("Le estás proponiendo");
  });

  it("con el pedido sobre la mesa manda cerrarlo en cuanto diga que sí, sin repetirlo", async () => {
    await withABrush();
    await call("proposeOrder");
    const text = dynamic();
    expect(text).toContain("Le estás proponiendo este pedido de 8 euros");
    expect(text).toContain("llama a confirmOrder en ese mismo turno");
    // Y la de antes se va: las dos juntas son la contradicción que deja la llamada sin pedido.
    expect(text).not.toContain("todavía no es un pedido");
  });

  it("cierra con la referencia y con cuándo sube el reparto", async () => {
    await runHook(sur, "onCall", { id: "CA_4", contact: ROSA, from: ROSA, channel: "phone" });
    await withABrush();
    await call("proposeOrder");
    await call("confirmOrder");
    const text = dynamic();
    expect(text).toContain(`El pedido ${sur.order!.reference} queda cerrado`);
    expect(text).toContain("esta misma tarde");
  });
});

describe("los bloques estáticos", () => {
  // El bloque `knowledge` lo escribe el runtime con el fichero que viaja en la declaración: la app
  // no manda nada en él, porque el mismo fichero dos veces es peor bug que un bloque vacío.
  it("dejan el conocimiento al runtime y listan las seis tools", () => {
    expect(block("knowledge")).toBe("");
    expect(block("identity")).toContain("Un precio sale del catálogo");
    for (const name of ["findProduct", "addToCart", "proposeOrder", "confirmOrder", "registerCustomer", "orderStatus"]) {
      expect(block("tools")).toContain(`- ${name}:`);
    }
  });

  it("tipa los parámetros del fuente que la clase recibió", () => {
    const add = sur.tools().find((spec) => spec.name === "addToCart");
    const properties = (add?.parameters as { properties: Record<string, { type: string }> }).properties;
    expect(properties["product"]).toEqual({ type: "string" });
    expect(properties["qty"]).toEqual({ type: "number" });
  });
});

describe("lo que la tienda anota de un cliente", () => {
  it("escribe lo que el agente recordó y borra lo que mandó olvidar", () => {
    sur.onMemory(
      [
        { op: "remember", key: "a qué se dedica", value: "pintor" },
        { op: "remember", key: "formas de pago", value: "bizum" },
        { op: "forget", key: "formas de pago" },
      ],
      { id: "CA_5", contact: ROSA, from: ROSA, channel: "phone" },
    );

    expect(tienda.notesOf(ROSA)).toEqual({ "a qué se dedica": "pintor" });
  });
});
