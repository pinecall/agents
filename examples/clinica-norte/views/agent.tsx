/** El prompt como función del estado: lo único que cambia entre dos turnos de una llamada. */

import { Memory, Retrieved, type ViewProps } from "pinecall";

import type ClinicaNorte from "../agent.js";

// El framework llama a la view con el estado de la clase más lo que rodea a la llamada, así que
// `ViewProps<ClinicaNorte>` es exactamente eso: los campos y los getters, tipados, sin repetirlos.
export default ({
  stage,
  patient,
  slots,
  proposed,
  booking,
  memory,
  resumed,
  call,
}: ViewProps<ClinicaNorte>) => {
  return (
  <>
    {/* Los dos marcadores que el runtime rellena en cada turno: lo que la memoria sabe de este
        paciente y lo que la base de conocimiento tiene que ver con lo que acaba de decir. Vienen
        como líneas sueltas, así que el título va aquí, encima de cada uno. */}
    <p>Lo que recordamos de este paciente:</p>
    <Memory />
    <p>De la base de conocimiento:</p>
    <Retrieved k={4} minScore={0.5} />

    {resumed && <p>Se cortó su llamada anterior. Retoma desde donde quedó sin volver a preguntar.</p>}

    {stage === "identify" && <p>Saluda y pide nombre y teléfono. Nada más hasta identificar al paciente.</p>}

    {(stage === "choose" || stage === "book") && (
      <>
        {/* Quién está al teléfono, y que ya sabemos quién es. Sin la segunda frase el modelo ve
            `findPatient` en la lista de herramientas del prefijo estático — que las lleva todas,
            porque ese prefijo no cambia entre turnos — y vuelve a pedir nombre y teléfono a una
            paciente cuya ficha tiene delante. */}
        <p>
          Hablas con {patient!.name}, ya en la ficha: no vuelvas a pedirle el nombre ni el teléfono.
          {patient!.cita
            ? ` Tiene cita el ${patient!.cita} con ${patient!.doctor}.`
            : " Es paciente nuevo, todavía sin cita."}
        </p>
        {memory.has("médico habitual") && <p>Ofrece primero las horas de su médico habitual.</p>}
        {slots.length === 0 && (
          // La misma regla que el docstring de `freeSlots`, dicha aquí en el momento en que
          // el modelo decide: si el paciente ya ha nombrado un día, mirar la agenda es lo
          // siguiente que toca, y preguntarle otra vez por el día es no haberle escuchado.
          <p>
            Si el paciente nombra un día, consulta SIEMPRE la agenda de ese día, aunque su ficha ya
            tenga cita ese día. Si todavía no ha nombrado ninguno, pregúntale para qué día quiere
            {patient!.cita ? " cambiarla." : " la cita."}
          </p>
        )}
        {slots.length > 0 && (
          <>
            {/* Las horas mismas van en el bloque `availability`, justo antes de esta view: aquí
                solo qué hacer con ellas. */}
            {call.channel === "phone" ? (
              <p>Ofrece como máximo dos de estas horas y pregunta cuál prefiere.</p>
            ) : (
              <p>Muestra hasta cinco horas, una por línea.</p>
            )}
            {/* Lo que pasa en el turno siguiente, dicho donde el modelo decide. Sin esta frase la
                vista se acababa en cómo ofrecer: el paciente elegía, el modelo veía `book` visible
                con un docstring que hablaba de «la hora que el paciente ha elegido», y reservaba.
                La regla que lo impide vivía sólo en el prefijo estático y en genérico —«antes de
                una acción irreversible espera un sí explícito»—, y el prompt no dice en ninguna
                parte que reservar lo sea: `side_effect` y `confirm` viajan en la declaración, no en
                el texto. Dos de cada cinco llamadas no ataban los dos cabos (2026-09-08). */}
            {!proposed && (
              <p>
                Que el paciente nombre una de estas horas todavía no la reserva. Repítesela entera
                —día, hora y médico— y pregúntale si se la confirmas. Llama a book solo después de que
                te haya dicho que sí. En cuanto nombre una, llama primero a propose con ella y
                después léesela.
              </p>
            )}
            {/* El otro momento, y el que faltaba: la hora ya está sobre la mesa. La frase de arriba
                vale para el turno en que el paciente elige y es exactamente la contraria de la que
                hace falta en el turno en que dice que sí — un modelo que la sigue al pie de la letra
                vuelve a leer la hora y a preguntar, y la llamada se acaba sin reserva (2026-09-08,
                gpt-5.4-mini). Una regla que solo dice «espera el sí» sin decir «y este es» está a
                medias, así que la vista dice cuál de los dos turnos es. */}
            {proposed && (
              <p>
                Le estás proponiendo {proposed.when} con {proposed.doctor}. Léesela entera si
                todavía no lo has hecho y espera su respuesta. Cuando conteste que sí a esa hora,
                llama a book con ella en ese mismo turno, sin repetírsela otra vez ni volver a
                preguntar. Si dice que no, o nombra una hora distinta, llama a propose con la nueva.
              </p>
            )}
          </>
        )}
      </>
    )}

    {stage === "done" && <p>Confirma que le llega un SMS con la cita del {booking!.when}. Despídete y cuelga.</p>}
  </>
  );
};
