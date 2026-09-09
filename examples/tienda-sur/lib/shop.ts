/** El mostrador de Tienda Sur: fichas de clientes, pedidos y almacén, inventados y nunca aleatorios. */

import type { MemoryOp } from "pinecall";

import { SOLD_OUT, spoken, type Product } from "./catalog.js";

/** Un cliente de la ficha: a quién se le factura y a dónde sube el chico del reparto. */
export interface Customer {
  id: string;
  name: string;
  phone: string;
  /** La dirección de entrega, dicha como se dice: "Pagés del Corro veintidós, tercero B". */
  address: string;
}

/** Una línea del carrito: qué, cuántos y lo que suma esa línea en euros. */
export interface Line {
  /** La referencia del catálogo. Es lo que el almacén mira, porque en la pizarra hay dos cintas. */
  ref: string;
  product: string;
  qty: number;
  price: number;
}

/** El carrito leído en voz alta antes del sí: las líneas y lo que suman. Todavía no es un pedido. */
export interface Basket {
  lines: Line[];
  total: number;
}

/** Un pedido ya cerrado. La referencia es lo que el cliente lee cuando vuelve a llamar. */
export interface Order {
  reference: string;
  total: number;
  /** En preparación, en reparto o entregado: las tres cosas que el chico del reparto contesta. */
  status: string;
  /** Cuándo sube, dicho como se dice. Nunca un día de la semana: la tienda reparte el mismo día. */
  delivery: string;
}

/** El almacén dijo que no. Es un fallo de la tienda, no del modelo, y el mensaje dice qué hacer. */
export class OutOfStock extends Error {
  constructor(product: string) {
    super(`el ${product} se ha agotado esta mañana: quítalo del pedido o cámbialo por otra cosa.`);
    this.name = "OutOfStock";
  }
}

/**
 * El modelo nombró algo que no está sobre el mostrador. El mensaje lleva lo que sí está, porque lo
 * lee el propio modelo y con la lista delante se corrige en el mismo turno.
 */
export class NotOnTheCounter extends Error {
  constructor(said: string, onTheCounter: Product[]) {
    const there = onTheCounter.map((product) => product.name).join("; ") || "nada";
    super(`"${said}" no es de lo que le has cantado. Sobre el mostrador hay: ${there}.`);
    this.name = "NotOnTheCounter";
  }
}

/** El pedido no puede cerrarse todavía porque falta a quién y a dónde va. */
export class NobodyToDeliverTo extends Error {
  constructor() {
    super("antes de cerrar hace falta el nombre y la dirección: apúntalos con registerCustomer.");
    this.name = "NobodyToDeliverTo";
  }
}

/** Lo que la tienda anota de un cliente: clave y valor, tal y como el agente lo recordó. */
export type Notes = Record<string, unknown>;

// Las fichas de siempre. Los teléfonos son los del rango de pruebas de España.
const CUSTOMERS: Customer[] = [
  { id: "c-31", name: "Rosa Medina", phone: "+34 600 000 011", address: "Pagés del Corro veintidós, tercero B" },
  { id: "c-32", name: "Curro Alcaide", phone: "+34 600 000 012", address: "Castilla catorce, bajo" },
  { id: "c-33", name: "Nieves Palma", phone: "+34 600 000 013", address: "Betis seis, segundo" },
];

// Un pedido de ayer, para que preguntar por uno no exija haber hecho otro en la misma llamada.
const YESTERDAY: Order = {
  reference: "TS-7781",
  total: 32,
  status: "en reparto",
  delivery: "esta misma tarde",
};

// Cuándo sube el chico del reparto. Un día de la semana no se dice nunca: la tienda reparte por
// el barrio el mismo día, así que la frase no envejece entre una llamada y la siguiente.
const SAME_DAY = "esta misma tarde";

// De dónde salen las referencias de los pedidos nuevos: correlativas, como el talonario del
// mostrador, y por eso dos llamadas iguales dan la misma referencia. El talonario empieza en
// TS-8001, que es el primero que se cierra en un proceso: el de ayer ya ocupa un sitio en el mapa.
const FIRST_REFERENCE = 8000;

/**
 * La tienda como sistema: la misma superficie que tendría sobre su TPV real, con datos fijos
 * detrás. Cada proceso construye la suya, así un pedido no se filtra al test siguiente.
 */
export class FakeShop {
  private readonly placed = new Map<string, Order>([[YESTERDAY.reference, YESTERDAY]]);
  private readonly added: Customer[] = [];
  private readonly notes = new Map<string, Notes>();

  /** La ficha de quien llama, por el número desde el que llama. */
  async byPhone(phone: string): Promise<Customer | undefined> {
    const wanted = digits(phone);
    return wanted === "" ? undefined : this.everyone().find((one) => digits(one.phone) === wanted);
  }

  /** Abre ficha a un cliente nuevo. El id es correlativo, como lo daría el TPV de la tienda. */
  async register(name: string, address: string, phone: string): Promise<Customer> {
    const customer: Customer = { id: `c-${90 + this.added.length}`, name: name.trim(), phone, address: address.trim() };
    this.added.push(customer);
    return customer;
  }

  /**
   * Cierra el pedido. Rechaza siempre el rodillo antigoteo: está en la pizarra y no en el almacén,
   * que es exactamente lo que pasa en una ferretería el día que se acaba algo.
   */
  async place(customer: Customer | undefined, lines: Line[]): Promise<Order> {
    if (customer === undefined) throw new NobodyToDeliverTo();
    const agotado = lines.find((line) => line.ref === SOLD_OUT);
    if (agotado) throw new OutOfStock(agotado.product);
    const order: Order = {
      reference: `TS-${FIRST_REFERENCE + this.placed.size}`,
      total: lines.reduce((sum, line) => sum + line.price, 0),
      status: "en preparación",
      delivery: SAME_DAY,
    };
    this.placed.set(order.reference, order);
    return order;
  }

  /** En qué anda un pedido, por su referencia. Ninguno es un pedido que esta tienda no hizo. */
  async status(reference: string): Promise<Order | null> {
    const wanted = spoken(reference).replace(/\s/g, "");
    return [...this.placed.values()].find((order) => spoken(order.reference) === wanted) ?? null;
  }

  /** Aplica las anotaciones de una llamada a la ficha del cliente: recordar escribe, olvidar borra. */
  remember(contact: string, ops: MemoryOp[]): void {
    const written = this.notes.get(contact) ?? {};
    for (const op of ops) {
      if (op.op === "forget") delete written[op.key];
      else written[op.key] = op.value;
    }
    this.notes.set(contact, written);
  }

  /** Lo que la tienda tiene anotado de un contacto ahora mismo. */
  notesOf(contact: string): Notes {
    return { ...(this.notes.get(contact) ?? {}) };
  }

  private everyone(): Customer[] {
    return [...CUSTOMERS, ...this.added];
  }
}

// El teléfono se dice de mil maneras y se teclea de otras mil. Compararlos por sus dígitos es lo
// único honesto: "+34 600 000 011", "600000011" y "600 00 00 11" son la misma ficha.
function digits(phone: string): string {
  return phone.replace(/\D/g, "").replace(/^34/, "");
}

/** La tienda que usa el agente. Una por proceso, como el TPV que representa. */
export const tienda = new FakeShop();
