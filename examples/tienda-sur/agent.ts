/** Tienda Sur: la clase entera del tenant — el carrito, el pedido y las tres puertas. */

import { Agent, tool, type Call, type MemoryOp, type Stages } from "pinecall";

import { named, search, type Product } from "./lib/catalog.js";
import {
  NotOnTheCounter,
  tienda,
  type Basket,
  type Customer,
  type Line,
  type Order,
} from "./lib/shop.js";

/**
 * Eres el mostrador de Tienda Sur, la ferretería de la calle San Jacinto, en Triana. Tuteas a
 * todo el mundo, con frases cortas y sin prisa. Todo lo que dices se lee en voz alta: sin listas,
 * sin markdown. Un precio sale del catálogo y nunca de tu cabeza, y se dice con la palabra euros.
 */
export default class TiendaSur extends Agent {
  // canales: un agente, tres puertas
  phone = "+34910000100";
  whatsapp = "+34910000100";
  web = true;
  voice = "mateo";
  llm = "haiku";
  language = "es";

  // `says`: cómo se dice lo que la voz leería mal. Las referencias del catálogo empiezan por dos
  // letras que juntas no son una palabra, y "LED" se dice como suena y no deletreada.
  says = { TS: "te ese", LED: "led" };
  // `hears`: lo que los oídos tienen que conocer antes de oírlo. El runtime le suma, cada vez que
  // el estado se mueve, los nombres que el estado lleva — el del cliente en cuanto se le abre ficha.
  hears = ["Tienda Sur", "Triana", "San Jacinto", "antigoteo", "tirafondos"];

  // `knowledge`: el fichero que el agente se sabe de memoria, leído al lado de esta clase y
  // enviado entero. `docs`: la base que se recupera por turno, por el NOMBRE con que se subió —
  // `pinecall knowledge push ./knowledge/docs --base tienda-sur`—, nunca un glob.
  knowledge = "./knowledge/tienda.md";
  docs = "tienda-sur";
  memory = {
    remember: ["a qué se dedica", "la marca que suele llevarse", "el piso al que hay que subir"],
    forget: ["formas de pago"],
  };

  // el estado: asignar re-renderiza, escribe state.changed en el log y llega a quien lo esté mirando
  // la fase es un campo del estado como cualquier otro, y es lo único que mueve las herramientas
  stage: Stages<"browse" | "cart" | "confirm" | "done"> = "browse";

  // `| undefined` explícito: con exactOptionalPropertyTypes, un campo que una tool puede volver a
  // dejar vacío tiene que poder recibir undefined.
  customer?: Customer | undefined;
  // El mostrador: todo lo que la tienda le ha cantado en esta llamada, lo último delante. De aquí,
  // y de ningún otro sitio, sale lo que entra al carrito.
  counter: Product[] = [];
  cart: Line[] = [];
  order?: Order | undefined;

  /** Lo que suma el carrito ahora mismo, en euros. La vista lo lee y el cliente lo oye. */
  get total(): number {
    return this.cart.reduce((sum, line) => sum + line.price, 0);
  }

  override async onCall(call: Call): Promise<void> {
    // Quien llama desde un número con ficha ya tiene nombre y dirección; a los demás se les abre
    // ficha con `registerCustomer` en cuanto los den.
    this.customer = await tienda.byPhone(call.from ?? "");
  }

  /** Busca en el catálogo lo que el cliente acaba de nombrar. Llámala SIEMPRE antes de decir un precio o de meter nada en el carrito. */
  @tool({ stage: ["browse", "cart", "confirm"], preview: 3 })
  findProduct(query: string): Product[] {
    const hits = search(query);
    // Lo que se saca al mostrador se queda fuera: el cliente nombra la pintura tres turnos después
    // de que se la cantaran, y una búsqueda posterior que no encuentra nada no puede barrerla.
    // Reemplazar el mostrador en cada búsqueda dejó un carrito imposible de llenar (2026-09-09).
    this.counter = [...hits, ...this.counter.filter((was) => !hits.some((hit) => hit.ref === was.ref))];
    return hits;
  }

  /** Mete en el carrito uno de los artículos que acabas de cantarle, dicho como se lo has dicho, y cuántos se lleva. */
  @tool({ stage: ["browse", "cart", "confirm"] })
  addToCart(product: string, qty: number): Line {
    // El modelo elige diciendo el nombre, no rellenando una ficha: pedirle un `Product` entero le
    // dejaría inventarse la referencia y el precio, que son las dos cosas que no puede inventar.
    const found = named(product, this.counter);
    if (!found) throw new NotOnTheCounter(product, this.counter);
    const units = Math.max(1, Math.trunc(qty));
    this.cart = [...this.cart, { ref: found.ref, product: found.name, qty: units, price: found.price * units }];
    // Meter algo retira la lectura anterior: lo que le leíste ya no es lo que se lleva. Volver a
    // `cart` es lo que obliga a leérselo otra vez antes de cerrar.
    this.stage = "cart";
    return this.cart[this.cart.length - 1]!;
  }

  /** Repasa el carrito en voz alta antes de cerrarlo. Llámala cuando el cliente diga que ya está, y después léeselo entero: cada línea y el total. */
  @tool({ stage: "cart", when: (s) => s.cart.length > 0 })
  proposeOrder(): Basket {
    // No toca la tienda: es la lectura en voz alta, hecha estado. Sin ella la vista no sabe en qué
    // turno va —el de repasar o el del sí— y diría «léeselo y pregunta» en los dos.
    this.stage = "confirm";
    return { lines: this.cart, total: this.total };
  }

  /** Cierra el pedido que el cliente ya ha confirmado. Nunca antes de su sí. */
  @tool({
    // La fase dice que toca cerrar; el predicado, que hay algo que cerrar. Se piden las dos.
    stage: "confirm",
    when: (s) => s.cart.length > 0,
    confirm: "Te cierro el pedido: {{result.total}} euros. ¿Lo confirmo?",
  })
  async confirmOrder(): Promise<Order> {
    // La tienda escribe primero y el estado después: si algo se agotó entre la pizarra y el
    // almacén, el cliente no puede quedarse con un pedido suyo en el estado ni en el prompt.
    const order = await tienda.place(this.customer, this.cart);
    this.order = order;
    this.stage = "done";
    this.collapse(`Pedido ${order.reference} cerrado por ${this.customer?.name}, ${order.total} euros.`);
    this.log("order.placed", order);
    return order;
  }

  /** Abre ficha al cliente: su nombre, la dirección a la que sube el reparto y un teléfono. Pídele los tres antes de llamarla. */
  @tool({ stage: ["browse", "cart", "confirm"], pii: ["name", "address", "phone"] })
  async registerCustomer(name: string, address: string, phone: string): Promise<Customer> {
    // Sin ficha no hay a dónde llevar el pedido, así que `confirmOrder` se niega y lo dice. Esta
    // es la puerta que lo arregla, y está abierta en las tres fases en que todavía se puede.
    this.customer = await tienda.register(name, address, phone);
    return this.customer;
  }

  /** En qué anda un pedido ya hecho, por su referencia. Sirve en cualquier momento de la llamada. */
  @tool()
  async orderStatus(reference: string): Promise<Order | null> {
    return await tienda.status(reference);
  }

  override onMemory(ops: MemoryOp[], call: Call): void {
    tienda.remember(call.contact, ops);
  }
}
