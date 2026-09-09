/** El prompt como función del estado: lo único que cambia entre dos turnos de una llamada. */

import { Memory, Retrieved, type ViewProps } from "pinecall";

import type TiendaSur from "../agent.js";

// El framework llama a la view con el estado de la clase más lo que rodea a la llamada, así que
// `ViewProps<TiendaSur>` es exactamente eso: los campos y los getters, tipados, sin repetirlos.
export default ({
  stage,
  customer,
  counter,
  cart,
  total,
  order,
  memory,
  resumed,
  call,
}: ViewProps<TiendaSur>) => {
  return (
  <>
    {/* Los dos marcadores que el runtime rellena en cada turno: lo que la memoria sabe de este
        cliente y lo que la base de conocimiento tiene que ver con lo que acaba de decir. Vienen
        como líneas sueltas, así que el título va aquí, encima de cada uno. */}
    <p>Lo que recordamos de este cliente:</p>
    <Memory kinds={["preference", "purchase"]} />
    <p>De la base de conocimiento:</p>
    <Retrieved k={4} minScore={0.02} />

    {resumed && <p>Se cortó su llamada anterior. Sigue donde lo dejasteis sin volver a preguntar.</p>}

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

    {memory.has("marca") && <p>Ofrécele primero la marca que se suele llevar.</p>}

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
        {call.channel === "phone" ? (
          <p>Nómbrale como mucho tres de los primeros y pregúntale cuál se lleva.</p>
        ) : (
          <p>Enumérale hasta cinco, uno por línea.</p>
        )}
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

    {stage === "done" && (
      <p>
        El pedido {order!.reference} queda cerrado, {order!.total} euros, y sube {order!.delivery}.
        Dile la referencia, despídete y cuelga.
      </p>
    )}
  </>
  );
};
