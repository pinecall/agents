/** Las horas sobre la mesa: un bloque dinámico propio, reescrito solo cuando freeSlots vuelve con otras. */

import type { ViewProps } from "pinecall";

import type ClinicaNorte from "../agent.js";

// Solo la lista. Qué hacer con ella —cuántas ofrecer, qué pasa cuando el paciente nombra una— lo
// dice la view, que va después de este bloque y es lo último que lee el modelo.
export default ({ stage, slots }: ViewProps<ClinicaNorte>) => (
  <>
    {(stage === "choose" || stage === "book") && slots.length > 0 && (
      <>
        <p>Horas libres, en orden:</p>
        {slots.map((slot) => (
          <p>
            {slot.when} con {slot.doctor}
          </p>
        ))}
      </>
    )}
  </>
);
