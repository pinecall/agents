/** La agenda de la Clínica Norte: inventada, nunca aleatoria — dos llamadas iguales dan lo mismo. */

/** Un paciente de la ficha: lo que recepción necesita saber antes de tocar la agenda. */
export interface Patient {
  id: string;
  name: string;
  phone: string;
  /** Su cita actual, tal y como se lee en voz alta. Un paciente recién dado de alta no tiene. */
  cita?: string | undefined;
  doctor?: string | undefined;
}

/** Un hueco libre, con el nombre del profesional que lo atiende. */
export interface Slot {
  when: string;
  doctor: string;
}

/** Una cita ya reservada: la referencia es lo que viaja en el SMS. */
export interface Booking {
  id: string;
  when: string;
  doctor: string;
}

/** La agenda dijo que no. Es un fallo del sistema de la clínica, no del modelo. */
export class AgendaRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgendaRefused";
  }
}

/**
 * El modelo pidió una hora que la agenda no ha ofrecido. El mensaje lleva las que sí están sobre
 * la mesa, porque lo lee el propio modelo y con la lista delante corrige en el mismo turno.
 */
export class NotOnTheTable extends Error {
  constructor(said: string, offered: Slot[]) {
    const free = offered.map((slot) => slot.when).join("; ") || "ninguna";
    super(`"${said}" no está entre las horas libres. Están libres: ${free}.`);
    this.name = "NotOnTheTable";
  }
}

// La hora que el sistema de la clínica rechaza siempre. Existe para que el camino del "no" sea
// tan comprobable como el del "sí": sin ella, ningún test vería nunca fallar una reserva.
export const REFUSED_HOUR = "13:00";

const REFUSAL = "ese hueco acaba de ocuparse";

// Las fichas. Los teléfonos son los del rango de pruebas de España, y la cita actual es la que el
// paciente llama para cambiar: la clínica no tiene pacientes sin cita en este ejemplo.
const PATIENTS: Patient[] = [
  { id: "p-1041", name: "Ana García", phone: "+34 600 000 001", cita: "jueves a las diez", doctor: "la doctora Vidal" },
  { id: "p-1042", name: "Luis Ferrer", phone: "+34 600 000 002", cita: "lunes a las nueve y media", doctor: "el doctor Sáez" },
  { id: "p-1043", name: "Marta Ruiz", phone: "+34 600 000 003", cita: "miércoles a las seis de la tarde", doctor: "la doctora Vidal" },
];

// El cuadro de huecos por día de la semana. Todos los días ofrecen un hueco a las 13:00 porque esa
// es la hora que la agenda rechaza al reservar: está libre al mirar y ocupada al escribir, que es
// exactamente la carrera que se da en una agenda real.
const FREE: Record<string, Slot[]> = {
  lunes: [
    { when: "lunes a las nueve", doctor: "el doctor Sáez" },
    { when: "lunes a las once y media", doctor: "la doctora Vidal" },
    { when: `lunes a las ${REFUSED_HOUR}`, doctor: "el doctor Sáez" },
    { when: "lunes a las cinco de la tarde", doctor: "la doctora Vidal" },
  ],
  martes: [
    { when: "martes a las diez", doctor: "la doctora Vidal" },
    { when: `martes a las ${REFUSED_HOUR}`, doctor: "el doctor Sáez" },
    { when: "martes a las cuatro de la tarde", doctor: "la doctora Vidal" },
    { when: "martes a las siete y media de la tarde", doctor: "el doctor Ferrán" },
  ],
  miércoles: [
    { when: "miércoles a las ocho y media", doctor: "el doctor Ferrán" },
    { when: `miércoles a las ${REFUSED_HOUR}`, doctor: "la doctora Vidal" },
    { when: "miércoles a las seis de la tarde", doctor: "el doctor Sáez" },
  ],
  jueves: [
    { when: "jueves a las nueve y cuarto", doctor: "la doctora Vidal" },
    { when: `jueves a las ${REFUSED_HOUR}`, doctor: "el doctor Ferrán" },
    { when: "jueves a las siete de la tarde", doctor: "la doctora Vidal" },
  ],
  viernes: [
    { when: "viernes a las diez y media", doctor: "el doctor Sáez" },
    { when: `viernes a las ${REFUSED_HOUR}`, doctor: "la doctora Vidal" },
  ],
  sábado: [{ when: "sábado a las once", doctor: "el doctor Ferrán" }],
};

// El teléfono se dice de mil maneras y se teclea de otras mil. Compararlos por sus dígitos es lo
// único honesto: "+34 600 000 001", "600000001" y "600 00 00 01" son la misma ficha.
function digits(phone: string): string {
  return phone.replace(/\D/g, "").replace(/^34/, "");
}

/**
 * Lo dicho por teléfono, comparable: sin tildes, sin mayúsculas y sin espacios de sobra. Sirve
 * para un nombre y para una hora, que entran igual de habladas y salen igual de escritas.
 */
export function loose(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * La agenda de la clínica como sistema: la misma superficie que tendría sobre su API real, con
 * datos fijos detrás. Cada llamada construye la suya, así una reserva no se filtra a la de al lado.
 */
export class FakeAgenda {
  private readonly booked = new Set<string>();
  // Las altas de esta sesión, detrás de las fichas fijas: quien se dio de alta en una llamada es
  // un paciente en la siguiente, que es lo que hace una agenda de verdad.
  private readonly added: Patient[] = [];

  /** La ficha de quien llama, por el número desde el que llama. */
  async byPhone(phone: string): Promise<Patient | undefined> {
    const wanted = digits(phone);
    return wanted ? [...PATIENTS, ...this.added].find((patient) => digits(patient.phone) === wanted) : undefined;
  }

  /** Da de alta a un paciente nuevo. El id es correlativo, como lo daría el sistema de la clínica. */
  async register(name: string, phone: string): Promise<Patient> {
    const patient: Patient = { id: `p-${2001 + this.added.length}`, name: name.trim(), phone };
    this.added.push(patient);
    return patient;
  }

  /** La ficha por nombre y teléfono: los dos tienen que cuadrar, como en el mostrador. */
  async find(name: string, phone: string): Promise<Patient | undefined> {
    const found = await this.byPhone(phone);
    if (!found) return undefined;
    const said = loose(name);
    const real = loose(found.name);
    return real === said || real.startsWith(`${said} `) ? found : undefined;
  }

  /** Los huecos libres de un día, en el orden en que la clínica los ofrece. */
  async free(day: string): Promise<Slot[]> {
    const key = loose(day);
    const found = Object.entries(FREE).find(([name]) => loose(name) === key);
    return (found?.[1] ?? []).filter((slot) => !this.booked.has(slot.when));
  }

  /** Reserva un hueco. Rechaza siempre el de las 13:00: alguien lo cogió antes. */
  async book(patient: Patient, slot: Slot): Promise<Booking> {
    if (slot.when.includes(REFUSED_HOUR) || this.booked.has(slot.when)) {
      throw new AgendaRefused(REFUSAL);
    }
    this.booked.add(slot.when);
    return { id: `CN-${patient.id.slice(2)}`, when: slot.when, doctor: slot.doctor };
  }
}

// Una agenda por llamada, colgada de la instancia que la atiende y no de un campo suyo: `state.ts`
// se queda con toda propiedad propia de la clase, y un `#privado` no sobrevive al Proxy por el que
// el framework sirve al agente. El WeakMap la olvida sola cuando la llamada termina.
const agendas = new WeakMap<object, FakeAgenda>();

/** La agenda de quien atiende esta llamada. La primera pregunta la crea; las demás la encuentran. */
export function agendaFor(agent: object): FakeAgenda {
  const mine = agendas.get(agent);
  if (mine) return mine;
  const made = new FakeAgenda();
  agendas.set(agent, made);
  return made;
}
