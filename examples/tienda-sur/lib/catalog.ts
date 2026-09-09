/** El catálogo de Tienda Sur: doce referencias con precio fijo, y cómo se busca una hablando. */

/** Una referencia del catálogo, tal y como el dependiente la canta por teléfono. */
export interface Product {
  /** La referencia impresa en la etiqueta: "TS-201". Es lo que el cliente lee del albarán. */
  ref: string;
  name: string;
  /** Euros enteros: la tienda redondea al euro desde que puso los precios en la pizarra. */
  price: number;
  /** Cómo se vende — la unidad, el bote, la caja. Sin esto el precio no significa nada. */
  unit: string;
  /** El pasillo en el que está, para buscar por lo que el cliente sabe decir: "pinturas". */
  family: string;
}

/**
 * Lo dicho por teléfono, comparable: sin tildes, en minúsculas y sin espacios de sobra. Vale para
 * el nombre de un producto y para una referencia, que entran habladas y salen escritas.
 */
export function spoken(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

// La referencia que el almacén no puede servir. Existe para que el camino del "no" sea tan
// comprobable como el del "sí": sin ella ningún test vería nunca un pedido rechazado.
export const SOLD_OUT = "TS-203";

/**
 * Los doce artículos que la tienda tiene en la pizarra. Ni uno más: un catálogo inventado es un
 * precio inventado, y este ejemplo existe para que el modelo no pueda decir ninguno de los dos.
 */
export const CATALOGUE: Product[] = [
  { ref: "TS-101", name: "martillo de carpintero de medio kilo", price: 13, unit: "la unidad", family: "herramienta" },
  { ref: "TS-102", name: "juego de doce destornilladores", price: 25, unit: "el estuche", family: "herramienta" },
  { ref: "TS-103", name: "cinta métrica de cinco metros", price: 8, unit: "la unidad", family: "herramienta" },
  { ref: "TS-104", name: "taladro percutor de seiscientos vatios", price: 59, unit: "la unidad", family: "herramienta" },
  { ref: "TS-105", name: "tornillos de cuatro por cuarenta", price: 5, unit: "la caja de cien", family: "tornillería" },
  { ref: "TS-106", name: "tacos y tirafondos surtidos", price: 7, unit: "el blíster", family: "tornillería" },
  { ref: "TS-201", name: "pintura plástica blanca", price: 19, unit: "el bote de cuatro litros", family: "pintura" },
  { ref: "TS-202", name: "brocha de cuatro pulgadas", price: 4, unit: "la unidad", family: "pintura" },
  { ref: SOLD_OUT, name: "rodillo antigoteo de veintidós centímetros", price: 7, unit: "la unidad", family: "pintura" },
  { ref: "TS-204", name: "cinta de carrocero de treinta y ocho milímetros", price: 3, unit: "el rollo", family: "pintura" },
  { ref: "TS-301", name: "bombilla led de nueve vatios de luz cálida", price: 4, unit: "la unidad", family: "electricidad" },
  { ref: "TS-302", name: "alargador de cinco metros con tres tomas", price: 11, unit: "la unidad", family: "electricidad" },
];

/** Lo que la tienda tiene de lo que el cliente acaba de nombrar, en el orden de la pizarra. */
export function search(query: string): Product[] {
  return matching(CATALOGUE, query);
}

/**
 * La referencia que el cliente nombró de entre las que ya están sobre el mostrador, o ninguna.
 * Se busca igual que en el catálogo, pero solo entre lo que la tienda le ha cantado: así el
 * carrito no puede llenarse de algo que nadie le ofreció.
 */
export function named(said: string, onTheCounter: Product[]): Product | undefined {
  return matching(onTheCounter, said)[0];
}

/**
 * Dos pasadas, que es como busca una persona detrás del mostrador: primero lo que encaja con todo
 * lo que el cliente dijo, y solo si eso no da nada, lo que encaja con alguna de sus palabras.
 *
 * Sin la segunda pasada, "brocha ancha" no es nada en una tienda que tiene una brocha, y el
 * dependiente contesta que no la vende — 2026-09-09, la primera conversación entera por
 * `pinecall chat`. Sin la primera, "cinta de carrocero" trae también la cinta métrica.
 */
function matching(where: Product[], said: string): Product[] {
  const wanted = spoken(said);
  if (wanted === "") return [];
  // Las palabras cortas —"de", "con", "y"— están en todas las fichas y no distinguen nada. Cuando
  // no hay ninguna larga, lo dicho vale entero: "led" es tres letras y es una referencia.
  const long = wanted.split(/\s+/).filter((word) => word.length >= 4);
  const terms = long.length > 0 ? long : [wanted];
  const close = where.filter((product) => terms.every((term) => carries(fichaOf(product), term)));
  return close.length > 0
    ? close
    : where.filter((product) => terms.some((term) => carries(fichaOf(product), term)));
}

// Todo lo que de un producto se puede decir en voz alta, junto y comparable: la referencia, el
// nombre, cómo se vende y el pasillo. Se busca contra esto y no solo contra el nombre porque
// "electricidad", "el bote" y "TS-301" son maneras legítimas de pedir algo.
function fichaOf(product: Product): string {
  return spoken(`${product.ref} ${product.name} ${product.unit} ${product.family}`);
}

// El cliente pide "dos brochas" y la pizarra dice "brocha": el plural de lo que se pide de dos en
// dos es la forma normal de pedirlo, y la ficha nunca lo lleva.
function carries(ficha: string, word: string): boolean {
  return ficha.includes(word) || ficha.includes(word.replace(/e?s$/, ""));
}
