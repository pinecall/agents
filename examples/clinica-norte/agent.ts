/** Clínica Norte: la clase entera del tenant — estado, herramientas y las tres puertas. */

import { Agent, tool, type Call, type MemoryOp, type Stages } from "pinecall";

import { agendaFor, loose, NotOnTheTable, type Booking, type Patient, type Slot, type FakeAgenda } from "./lib/agenda.js";
import { crm } from "./lib/crm.js";

/**
 * Eres la recepción de Clínica Norte. Hablas de usted, con frases cortas.
 * Todo lo que dices se lee en voz alta: sin listas, sin markdown, los números como se dicen.
 * Nunca inventes una hora: las horas salen de la agenda, siempre.
 */
export default class ClinicaNorte extends Agent {
  // un bloque del prompt propio: las horas sobre la mesa viven en `views/availability.tsx` y se
  // reescriben solas cuando freeSlots vuelve con otras. Es dinámico —va después de la historia,
  // justo antes de la view— y así la view queda para decir qué hacer en ESTE turno.
  static override prompt = { dynamic: ["availability"] };

  // canales: un agente, tres puertas
  phone = "+34910000000";
  whatsapp = "+34910000000";
  web = true;
  voice = "carolina";
  llm = "haiku";
  language = "es";

  // `says`: cómo se dice una palabra que la voz leería mal. DKV es una aseguradora y TAC una
  // prueba: deletreadas suenan a error, dichas suenan a lo que la recepcionista dice.
  says = { DKV: "de ka uve", TAC: "tac" };
  // `hears`: lo que los oídos tienen que conocer. A esta lista el runtime le suma, cada vez que
  // el estado se mueve, los nombres que el estado tiene — el del paciente en cuanto una tool lo
  // identifica — porque la clase ya sabe con quién está hablando.
  hears = ["Clínica Norte", "doctora Vidal", "doctor Sáez", "doctor Ferrán"];

  // `knowledge`: el fichero que el agente se sabe de memoria, leído al lado de esta clase y
  // enviado entero; el runtime lo pone donde está el marcador, en el bloque estático, una vez por
  // llamada. `docs`: la base que se recupera por turno, por el NOMBRE con que se subió —
  // `pinecall knowledge push ./knowledge/docs --base clinica-norte`—, nunca un glob.
  knowledge = "./knowledge/clinica.md";
  docs = "clinica-norte";
  memory = {
    remember: ["cómo prefiere que le llamen", "alergias", "su médico habitual"],
    forget: ["pagos"],
  };

  // el estado: asignar re-renderiza, escribe state.changed en el log y actualiza la consola
  // la fase es un campo del estado como cualquier otro, y es lo único que mueve las herramientas
  stage: Stages<"identify" | "choose" | "book" | "done"> = "identify";

  // `| undefined` explícito: con exactOptionalPropertyTypes, un campo que una tool vuelve a dejar
  // vacío tiene que poder recibir undefined.
  patient?: Patient | undefined;
  slots: Slot[] = [];
  // La hora que está sobre la mesa esperando el sí, y la que ya quedó reservada. Son dos momentos
  // distintos de la conversación y el prompt tiene que poder decir en cuál va.
  proposed?: Slot | undefined;
  slot?: Slot | undefined;
  booking?: Booking | undefined;

  override async onCall(call: Call): Promise<void> {
    // TODO: retomar una llamada cortada con `this.last(call.contact)` en cuanto el bridge llame
    // a provideLast(); hasta entonces la llamada empieza por la ficha del número.
    this.patient = await this.agenda().byPhone(call.from ?? "");
    if (this.patient) this.stage = "choose";
  }

  /** Busca al paciente por nombre y teléfono. Pide los dos antes de llamarla. Si no está en la ficha, ofrécele darle de alta. */
  @tool({ stage: "identify", pii: ["name", "phone"] })
  async findPatient(name: string, phone: string): Promise<Patient | null> {
    this.patient = await this.agenda().find(name, phone);
    if (this.patient) this.stage = "choose";
    return this.patient ?? null;
  }

  /** Da de alta a un paciente nuevo con su nombre y teléfono. Solo cuando findPatient no lo encontró y él acepta darse de alta. */
  @tool({ stage: "identify", pii: ["name", "phone"] })
  async registerPatient(name: string, phone: string): Promise<Patient> {
    // Sin esta puerta, quien no está en la ficha se queda en `identify` para siempre: las horas no
    // se le hacen visibles y el modelo inventa un motivo para no mirarlas (2026-09-08, la primera
    // llamada real desde la pantalla Talk de `pinecall ui`).
    this.patient = await this.agenda().register(name, phone);
    this.stage = "choose";
    return this.patient;
  }

  /** Horas libres de un día. Un día que nombre el paciente se consulta SIEMPRE, aunque su ficha ya tenga cita ese día. */
  @tool({ stage: ["choose", "book"], preview: 2 })
  async freeSlots(day: string): Promise<Slot[]> {
    this.slots = await this.agenda().free(day);
    // Mirar otro día retira lo que hubiera sobre la mesa: la hora propuesta era de la lista
    // anterior y ya no está entre las que se pueden reservar.
    this.proposed = undefined;
    // Un día sin horas devuelve a elegir día: la fase dice en qué punto va la conversación, y sin
    // horas sobre la mesa no hay nada que reservar.
    this.stage = this.slots.length > 0 ? "book" : "choose";
    return this.slots;
  }

  /** Deja sobre la mesa la hora que el paciente acaba de nombrar. Llámala en cuanto nombre una, antes de leérsela; reservar sigue siendo book, después de su sí. */
  @tool({ stage: "book", when: (s) => s.slots.length > 0 })
  propose(chosen: string): Slot {
    // Sin este campo la vista no sabe en qué turno va: dice «repítesela y pregunta» tanto antes de
    // la lectura como después del sí, y un modelo que la obedece al pie de la letra vuelve a leerla
    // en vez de reservar (2026-09-08, gpt-5.4-mini). La hora se resuelve como en `book`, contra las
    // que están sobre la mesa, para que lo propuesto sea siempre algo reservable.
    const slot = this.offered(chosen);
    if (!slot) throw new NotOnTheTable(chosen, this.slots);
    this.proposed = slot;
    return slot;
  }

  /** Reserva la hora que el paciente ya ha confirmado, dicha tal y como se la has leído. Nunca antes de su sí. */
  @tool({
    stage: "book",
    // La fase dice que toca reservar; el predicado, que hay algo que reservar. Se piden las dos.
    when: (s) => s.slots.length > 0,
    confirm: "Le reservo el {{result.when}} con {{result.doctor}}. ¿Lo confirmo?",
  })
  async book(chosen: string): Promise<Booking> {
    // El modelo elige diciendo la hora, no rellenando una ficha. Pedirle un `Slot` entero fue el
    // primer diseño y una golden lo tumbó: se inventaba `{day, time, doctor}` y la agenda recibía
    // un hueco que nunca ofreció. Aquí la hora tiene que ser una de las que están sobre la mesa —
    // que es la regla que el prefijo estático dice con palabras, sostenida por el código.
    const slot = this.offered(chosen);
    if (!slot) throw new NotOnTheTable(chosen, this.slots);
    // La agenda escribe primero y el estado después: si el hueco se ocupó entre mirar y reservar,
    // el paciente no puede quedarse con una hora suya en el estado ni en el prompt.
    const booking = await this.agenda().book(this.patient!, slot);
    this.slot = slot;
    this.booking = booking;
    // Reservada, ya no está esperando nada. Una reserva que la agenda rechaza no llega aquí y deja
    // la hora sobre la mesa, que es lo que el paciente sigue teniendo delante.
    this.proposed = undefined;
    this.stage = "done";
    this.collapse(`Reservado ${slot.when} con ${slot.doctor}, confirmado por el paciente.`);
    this.log("appointment.booked", this.booking);
    return this.booking;
  }

  /** Pasa la llamada a una persona. Solo si el paciente lo pide o no puedes ayudarle. */
  @tool()
  transfer(): string {
    // TODO: devolver `call.forward("+34 910 000 099", …)` cuando el framework lo tenga.
    return "Le paso con recepción.";
  }

  override onMemory(ops: MemoryOp[], call: Call): void {
    crm.apply(call.contact, ops);
  }

  // La agenda de esta llamada. Es un método y no un getter porque `state.ts` lee los getters del
  // prototipo y se los queda como estado: la agenda es un colaborador, no algo que el agente
  // recuerde, y no tiene nada que hacer en el prompt ni en una golden.
  private agenda(): FakeAgenda {
    return agendaFor(this);
  }

  // El paciente repite la hora como se la han leído, o solo un trozo de ella: "las cuatro de la
  // tarde" por "martes a las cuatro de la tarde". Se acepta si una contiene a la otra.
  private offered(said: string): Slot | undefined {
    const wanted = loose(said);
    return this.slots.find((slot) => {
      const own = loose(slot.when);
      return own === wanted || own.includes(wanted) || wanted.includes(own);
    });
  }
}
