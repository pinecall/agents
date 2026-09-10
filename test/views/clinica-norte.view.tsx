// The design's own view: what the tenant writes next to the agent, as `views/agent.tsx`.

import { Memory, Retrieved } from "../../src/views/components.js";

export default ({ patient, slots, booking, identified, done, memory, resumed, call }: Record<string, any>) => (
  <>
    <Memory />
    <Retrieved minScore={0.4} />
    {resumed && <p>Se cortó su llamada anterior. Retoma desde donde quedó sin volver a preguntar.</p>}
    {!identified && <p>Saluda y pide nombre y teléfono. Nada más hasta identificar al paciente.</p>}
    {identified && !done && <>
      <p>{patient.name} tiene cita el {patient.cita} con {patient.doctor}.</p>
      {slots.length === 0 && <p>Pregunta para qué día quiere cambiarla.</p>}
      {slots.length > 0 && (call.channel === "phone"
        ? <p>Ofrece como máximo dos de estas horas y pregunta cuál prefiere.</p>
        : <p>Muestra hasta cinco horas, una por línea.</p>)}
    </>}
    {done && <p>Confirma que le llega un SMS con la cita del {booking.when}. Despídete y cuelga.</p>}
  </>
);
