/** Tienda Sur: el prompt como función del agente, y la clase entera — carrito, pedido, tres puertas. */

import { Agent, render, tool, type Call, type MemoryOp, type Stages } from "pinecall";

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
 * El prompt como función del agente: los props SON la instancia, así que desestructurar los
 * campos funciona y sigue tipado sin envoltorio ninguno. Los métodos se llaman sobre `tienda`:
 * `remembers` desestructurado perdería su `this`. Un getter —`total`— se lee al desestructurar,
 * que es justo lo que hace falta.
 *
 * Son todas palabras de la tienda: lo que la memoria recuerda de este cliente y lo que dice la
 * base de conocimiento le llegan al modelo como resultados de una herramienta, nunca metidos
 * dentro de estas frases.
 */
const TiendaPrompt = (tienda: TiendaSur) => {
  const { stage, customer, counter, cart, total, order } = tienda;
  return (
    <>
      {stage !== "done" && (
        /* Quién está al teléfono, y que ya lo sabes. Sin la segunda frase el modelo ve
           `registerCustomer` en la lista de herramientas del prefijo estático —que las lleva todas,
           porque ese prefijo no cambia entre turnos— y vuelve a pedirle el nombre y la dirección a
           un cliente cuya ficha tiene delante. */
        customer ? (
          <p>
            Hablas con {customer.name}, ya en la ficha: no le pidas otra vez el nombre ni la
            dirección. El reparto sube a {customer.address}.
          </p>
        ) : (
          <p>
            Todavía no sabes quién llama. Puedes ir buscándole lo que te pida, pero antes de cerrar
            el pedido necesitas su nombre, su dirección y un teléfono: pídeselos y apúntalos con
            registerCustomer.
          </p>
        )
      )}

      {tienda.remembers("marca") && <p>Ofrécele primero la marca que se suele llevar.</p>}

      {stage === "browse" && cart.length === 0 && (
        /* La misma regla que el docstring de `findProduct`, dicha aquí en el momento en que el
           modelo decide. El catálogo es una tool y no está escrito en ninguna parte del prompt, así
           que sin esta frase el modelo contesta de memoria lo que la tienda tiene y lo que vale. */
        <p>
          El carrito está vacío. Pregúntale qué necesita y búscalo SIEMPRE con findProduct antes de
          decir un precio o de darlo por hecho: lo que la tienda tiene y lo que cuesta sale de ahí.
        </p>
      )}

      {counter.length > 0 && (
        <>
          <p>Sobre el mostrador tienes, con su precio, lo último delante:</p>
          {counter.map((product) => (
            <p>
              {product.name}, {product.price} euros {product.unit}
            </p>
          ))}
          {tienda.call.channel === "phone" ? (
            <p>Nómbrale como mucho tres de los primeros y pregúntale cuál se lleva.</p>
          ) : (
            <p>Enumérale hasta cinco, uno por línea.</p>
          )}
          {/* Lo de encima del mostrador ya está buscado. «SIEMPRE con findProduct» dicho a secas
              hacía que «ponme dos brochas de esas» volviera a buscar la brocha en vez de meterla,
              y el cliente se quedaba con la pregunta «¿te pongo dos?» (2026-09-17). */}
          <p>Si te pide uno de estos, mételo con addToCart en ese mismo turno, sin volver a buscarlo.</p>
        </>
      )}

      {cart.length > 0 && (
        <>
          <p>En el carrito lleva:</p>
          {cart.map((line) => (
            <p>
              {line.qty} × {line.product}, {line.price} euros
            </p>
          ))}
          <p>Suman {total} euros.</p>
        </>
      )}

      {/* Lo que pasa en el turno siguiente, dicho donde el modelo decide. Un carrito lleno y un
          cliente que dice «ya está» son todas las condiciones que el modelo puede ver para cerrar:
          `confirmOrder` está visible, su fase se cumple y su predicado también. Que cerrar sea
          irreversible viaja en `side_effect` y en `confirm`, que son declaración y no texto, así que
          el prompt no lo dice en ninguna parte — es la lección de la Clínica, y aquí se dice antes de
          que cueste una llamada. */}
      {stage === "cart" && (
        <p>
          Que el carrito esté lleno todavía no es un pedido. Cuando te diga que ya está, llama
          primero a proposeOrder, léeselo entero —cada línea y el total— y pregúntale si se lo
          cierras. confirmOrder solo después de que te haya dicho que sí.
        </p>
      )}

      {/* El otro turno, y el que la Clínica descubrió que le faltaba: el pedido ya está sobre la
          mesa. La frase de arriba vale para el turno en que el cliente termina la compra y es
          exactamente la contraria de la que hace falta en el turno en que dice que sí — un modelo
          que la sigue al pie de la letra vuelve a leer el carrito y la llamada acaba sin pedido.
          Aquí las dos frases no pueden coincidir nunca porque las separa la fase, no un campo. */}
      {stage === "confirm" && (
        <p>
          Le estás proponiendo este pedido de {total} euros. Léeselo entero si todavía no lo has
          hecho y espera su respuesta. En cuanto conteste que sí, llama a confirmOrder en ese mismo
          turno, sin repetírselo otra vez ni volver a preguntar. Si quiere cambiar algo, búscalo y
          vuelve a metérselo en el carrito.
        </p>
      )}

      {/* La última frase, porque es la acción: quien no tiene ficha da sus datos y el modelo
          contestaba «apuntado» sin llamar a la tool, que es decirlo sin hacerlo (2026-09-17). */}
      {!customer && stage !== "done" && (
        <p>
          En cuanto te diga su nombre, su dirección y su teléfono, llama a registerCustomer con los
          tres en ese mismo turno, antes de contestarle: decirle que está apuntado sin llamarla no
          apunta nada.
        </p>
      )}

      {stage === "done" && (
        <p>
          El pedido {order!.reference} queda cerrado, {order!.total} euros, y sube {order!.delivery}.
          Dile la referencia, despídete y cuelga.
        </p>
      )}
    </>
  );
};

/**
 * Eres el mostrador de Tienda Sur, la ferretería de la calle San Jacinto, en Triana. Tuteas a
 * todo el mundo, con frases cortas y sin prisa. Todo lo que dices se lee en voz alta: sin listas,
 * sin markdown. Un precio sale del catálogo y nunca de tu cabeza, y se dice con la palabra euros.
 */
@render(TiendaPrompt)
export default class TiendaSur extends Agent {
  // canales: un agente, tres puertas
  phone = "+34910000100";
  whatsapp = "+34910000100";
  web = true;
  voice = "mateo";
  llm = "haiku";
  language = "es";

  // La otra forma de abrir una llamada: el mostrador no dice siempre la misma frase, así que
  // aquí no se declaran las palabras sino lo que el modelo lee antes de encontrarlas él. El que
  // llama nunca oye esta línea; oye lo que el modelo hace con ella.
  greeting = { reply: "saluda, di que esto es Ferretería Tienda Sur y pregunta qué necesita" };

  // `says`: cómo se dice lo que la voz leería mal. Las referencias del catálogo empiezan por dos
  // letras que juntas no son una palabra, y "LED" se dice como suena y no deletreada.
  says = { TS: "te ese", LED: "led" };
  // `hears`: lo que los oídos tienen que conocer antes de oírlo. El runtime le suma, cada vez que
  // el estado se mueve, los nombres que el estado lleva — el del cliente en cuanto se le abre ficha.
  hears = ["Tienda Sur", "Triana", "San Jacinto", "antigoteo", "tirafondos"];

  // `knowledge`: el fichero que el agente se sabe de memoria, leído al lado de esta clase y
  // enviado entero; el runtime escribe su texto en el bloque estático, una vez por llamada.
  // `docs`: la base que se recupera por turno, por el NOMBRE con que se subió —
  // `pinecall knowledge push ./knowledge/docs --base tienda-sur`—, nunca un glob. Cuántos trozos
  // y con qué nota mínima se dice aquí, en la declaración, y no dentro del prompt.
  knowledge = "./knowledge/tienda.md";
  docs = { base: "tienda-sur", k: 4, minScore: 0.5 };
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

  /** Busca en el catálogo lo que el cliente acaba de nombrar. Llámala SIEMPRE antes de decir un precio o de meter en el carrito algo que no esté ya sobre el mostrador. */
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
