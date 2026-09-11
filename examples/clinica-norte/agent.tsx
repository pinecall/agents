/** Clínica Norte: la clase entera del tenant — estado, herramientas, las tres puertas y su prompt. */

import { Agent, tool, type Call, type MemoryOp, type Stages } from "pinecall";

import { agendaFor, loose, NotOnTheTable, type Booking, type Patient, type Slot, type FakeAgenda } from "./lib/agenda.js";
import { crm } from "./lib/crm.js";

/**
 * Eres la recepción de Clínica Norte. Hablas de usted, con frases cortas.
 * Todo lo que dices se lee en voz alta: sin listas, sin markdown, los números como se dicen.
 * Nunca inventes una hora: las horas salen de la agenda, siempre.
 */
export default class ClinicaNorte extends Agent {
  // canales: un agente, tres puertas
  phone = "+34910000000";
  whatsapp = "+34910000000";
  web = true;
  voice = "carolina";
  llm = "haiku";
  language = "es";

  // `greeting`: quién abre la llamada y cómo. Las palabras tal cual, porque una recepción dice
  // siempre lo mismo al descolgar y una frase fija se lee igual todas las veces. La otra forma,
  // `greeting = { reply: "saluda y preséntate" }`, deja que el modelo la encuentre él.
  greeting = "Clínica Norte, buenos días. ¿En qué puedo ayudarle?";

  // `says`: cómo se dice una palabra que la voz leería mal. DKV es una aseguradora y TAC una
  // prueba: deletreadas suenan a error, dichas suenan a lo que la recepcionista dice.
  says = { DKV: "de ka uve", TAC: "tac" };
  // `hears`: lo que los oídos tienen que conocer. A esta lista el runtime le suma, cada vez que
  // el estado se mueve, los nombres que el estado tiene — el del paciente en cuanto una tool lo
  // identifica — porque la clase ya sabe con quién está hablando.
  hears = ["Clínica Norte", "doctora Vidal", "doctor Sáez", "doctor Ferrán"];

  // `knowledge`: el fichero que el agente se sabe de memoria, leído al lado de esta clase y
  // enviado entero; el runtime escribe su texto en el bloque estático, una vez por llamada.
  // `docs`: la base que se recupera por turno, por el NOMBRE con que se subió —
  // `pinecall knowledge push ./knowledge/docs --base clinica-norte`—, nunca un glob. Cuántos
  // trozos y con qué nota mínima se dice aquí, en la declaración, y no dentro del prompt.
  knowledge = "./knowledge/clinica.md";
  docs = { base: "clinica-norte", k: 4, minScore: 0.5 };
  // `hangup`: el modelo puede terminar la llamada él mismo. La herramienta es la de livekit
  // (`end_call`), va oculta mientras saluda, y el log recibe `call.ended` con `agent_hung_up`.
  // Sin esta línea nadie cuelga salvo el paciente o un supervisor.
  hangup = { when: "cuando el paciente ya tiene su cita, o dice que no quiere nada más y se despide" };

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
  // El día que se miró y volvió sin ninguna hora. Sin este campo, un día sin agenda deja el estado
  // exactamente como estaba antes de mirarlo —`slots` vacío y fase `choose`—, la vista vuelve a la
  // rama de «todavía no ha nombrado ningún día», y al paciente que pregunta por el domingo se le
  // contesta «¿para qué día quiere cambiarla?» sin decirle nunca que el domingo no hay nada
  // (2026-09-11, `no-inventa-horas-de-un-dia-sin-agenda`: la tool se llamaba y la respuesta se
  // perdía). Es el mismo hueco que tapó `proposed`: la fase dice en qué punto va la conversación y
  // hace falta un campo que diga qué acaba de pasar.
  dayWithNoHours?: string | undefined;

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

  /**
   * Consulta la agenda real de un día concreto y devuelve las horas que quedan libres ese día, cada una con su médico.
   * Llámala EN CUANTO el paciente nombre un día o lo dé a entender —«el martes», «¿y el jueves?», «el domingo por la
   * mañana»— y antes de preguntarle ninguna otra cosa: ni la especialidad, ni el motivo, ni si quiere cambiar o cancelar.
   * Es la única fuente de horas que existe: ninguna hora puede decirse en voz alta si no ha salido de aquí. Llámala también
   * cuando la ficha del paciente ya tenga cita ese día, y también cuando creas que el centro cierra ese día —un día sin
   * agenda devuelve la lista vacía, y esa lista vacía ES la respuesta que hay que darle—. No devuelve precios ni
   * información del centro.
   */
  @tool({ stage: ["choose", "book"], preview: 2 })
  async freeSlots(day: string): Promise<Slot[]> {
    this.slots = await this.agenda().free(day);
    // Mirar otro día retira lo que hubiera sobre la mesa: la hora propuesta era de la lista
    // anterior y ya no está entre las que se pueden reservar.
    this.proposed = undefined;
    // Qué día fue el que volvió vacío, para que la vista pueda nombrarlo.
    this.dayWithNoHours = this.slots.length > 0 ? undefined : day;
    // Un día sin horas devuelve a elegir día: la fase dice en qué punto va la conversación, y sin
    // horas sobre la mesa no hay nada que reservar.
    this.stage = this.slots.length > 0 ? "book" : "choose";
    return this.slots;
  }

  /**
   * Deja sobre la mesa la hora que el paciente acaba de elegir de las que le has leído, para poder leérsela entera y
   * pedirle su confirmación. Llámala en cuanto se refiera a una de ellas, la nombre entera o no: «la de las cuatro»,
   * «esa», «la primera», «la de la tarde» son todas ella eligiendo. Pásale la hora como se la leíste tú, no como la dijo
   * él. Esto NO reserva nada: reservar es book, y sólo después de que diga que sí.
   */
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

  /**
   * Reserva de verdad, en la agenda de la clínica, la hora que el paciente YA ha confirmado. Llámala en el mismo turno en
   * que dice que sí a la hora que le acabas de leer, sea como sea que lo diga: «sí», «confírmemela», «esa me viene bien»,
   * «perfecto». No se la vuelvas a leer ni le preguntes otra vez: ya ha dicho que sí. Nunca la llames antes de ese sí, y
   * nunca con una hora que la agenda no haya devuelto.
   */
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

  /**
   * El prompt como función del estado: lo único que cambia entre dos turnos de una llamada, y lo
   * último que lee el modelo. Todo lo que hay aquí son palabras de la clínica — lo que la memoria
   * recuerda y lo que la base de conocimiento devuelve le llegan al modelo como resultados de una
   * herramienta, y nunca metidos dentro de estas frases.
   */
  override render() {
    return (
      <>
        {this.stage === "identify" && <p>Saluda y pide nombre y teléfono. Nada más hasta identificar al paciente.</p>}

        {(this.stage === "choose" || this.stage === "book") && (
          <>
            {/* Quién está al teléfono, y que ya sabemos quién es. Sin la segunda frase el modelo ve
                `findPatient` en la lista de herramientas del prefijo estático — que las lleva todas,
                porque ese prefijo no cambia entre turnos — y vuelve a pedir nombre y teléfono a una
                paciente cuya ficha tiene delante. */}
            <p>
              Hablas con {this.patient!.name}, ya en la ficha: no vuelvas a pedirle el nombre ni el teléfono.
              {this.patient!.cita
                ? ` Tiene cita el ${this.patient!.cita} con ${this.patient!.doctor}.`
                : " Es paciente nuevo, todavía sin cita."}
            </p>
            {this.remembers("médico habitual") && <p>Ofrece primero las horas de su médico habitual.</p>}
            {this.slots.length === 0 && this.dayWithNoHours && (
              // Ya se miró un día y no había nada. Decirlo NOMBRANDO el día es la mitad que se
              // perdía: el paciente preguntó por el domingo y se le ofrecía elegir otro día sin
              // llegar a contarle qué pasaba con el suyo.
              <p>
                Ya has mirado la agenda del {this.dayWithNoHours} y no queda ninguna hora libre. Dile
                eso, nombrando el día, y pregúntale qué otro día le viene bien.
              </p>
            )}
            {this.slots.length === 0 && !this.dayWithNoHours && (
              // La misma regla que el docstring de `freeSlots`, dicha aquí en el momento en que
              // el modelo decide: si el paciente ya ha nombrado un día, mirar la agenda es lo
              // siguiente que toca, y preguntarle otra vez por el día es no haberle escuchado.
              //
              // El ORDEN de estas dos frases es la regla, no el estilo. Con la pregunta al final,
              // haiku la tomaba aunque el paciente acabase de nombrar el martes: la última línea
              // de la región dinámica es la última que lee antes de contestar. La acción va
              // última. Es el mismo hallazgo que arregló `no-reserva-antes-del-si`.
              <p>
                Si todavía no ha nombrado ningún día, pregúntale para qué día quiere
                {this.patient!.cita ? " cambiarla." : " la cita."} En cuanto nombre uno, consulta
                SIEMPRE la agenda de ese día con freeSlots, aunque su ficha ya tenga cita ese día.
              </p>
            )}
            {this.slots.length > 0 && this.hoursOnTheTable()}
          </>
        )}

        {this.stage === "done" && (
          <p>Confirma que le llega un SMS con la cita del {this.booking!.when}. Despídete y cuelga.</p>
        )}
      </>
    );
  }

  override onMemory(ops: MemoryOp[], call: Call): void {
    crm.apply(call.contact, ops);
  }

  // Las horas libres y qué hacer con ellas. Es un método aparte porque es una idea entera —la mesa
  // puesta— y porque `render()` se lee mejor como la lista de los momentos de la conversación.
  private hoursOnTheTable() {
    return (
      <>
        <p>Horas libres, en orden:</p>
        {this.slots.map((slot) => (
          <p>
            {slot.when} con {slot.doctor}
          </p>
        ))}
        {this.call.channel === "phone" ? (
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
        {!this.proposed && (
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
        {this.proposed && (
          <p>
            Le estás proponiendo {this.proposed.when} con {this.proposed.doctor}. Léesela entera si
            todavía no lo has hecho y espera su respuesta. Cuando conteste que sí a esa hora,
            llama a book con ella en ese mismo turno, sin repetírsela otra vez ni volver a
            preguntar. Si dice que no, o nombra una hora distinta, llama a propose con la nueva.
          </p>
        )}
      </>
    );
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
