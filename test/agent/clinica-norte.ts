// The design's own class, as the tenant writes it: the shape this seam exists to make possible.

import { Agent, tool, type Call } from "../../src/index.js";

export interface Patient {
  id: string;
  name: string;
  phone: string;
}
export interface Slot {
  when: string;
  doctor: string;
}
export interface Booking {
  id: string;
  slot: Slot;
}

// The agenda the tenant already has. The bridge card wires the real one; here it is a stub, because
// this seam is about the class, not about the clinic.
export const agenda = {
  async byPhone(phone: string): Promise<Patient | undefined> {
    return phone === "+34 600 000 001" ? { id: "p1", name: "Ana", phone } : undefined;
  },
  async free(day: string): Promise<Slot[]> {
    return [
      { when: `${day} 10:00`, doctor: "Ruiz" },
      { when: `${day} 11:00`, doctor: "Ruiz" },
      { when: `${day} 12:00`, doctor: "Sanz" },
    ];
  },
  async book(patient: Patient, slot: Slot): Promise<Booking> {
    return { id: `b-${patient.id}`, slot };
  },
};

/** Agenda de la Clínica Norte. Nunca inventes una hora: las horas salen de la agenda, siempre. */
export default class ClinicaNorte extends Agent {
  phone = "+34 910 000 000";
  whatsapp = "clinica-norte";
  web = true;
  voice = "carolina";
  says = { Vidal: "bidál" };
  hears = ["Clínica Norte", "doctora Vidal"];
  llm = "haiku";
  language = "es";
  knowledge = "./knowledge/clinica.md";
  docs = "./knowledge/docs/**/*.md";
  memory = { remember: ["cómo prefiere que le llamen", "alergias"], forget: ["pagos"] };

  // state: assigning re-renders, writes state.changed, updates the console
  // `| undefined` explicit: with exactOptionalPropertyTypes a field a tool empties again has to be
  // able to take undefined, and findPatient does exactly that when the name does not match.
  patient?: Patient | undefined;
  slots: Slot[] = [];
  slot?: Slot | undefined;
  booking?: Booking | undefined;

  // derived: getters, like React
  get identified(): boolean {
    return !!this.patient;
  }
  get done(): boolean {
    return !!this.booking;
  }

  override async onCall(call: Call): Promise<void> {
    this.patient = await agenda.byPhone(call.from ?? "");
  }

  /** Busca al paciente por nombre y teléfono. Pide los dos antes de llamarla. */
  @tool({ when: (s) => !s.identified, pii: ["name", "phone"] })
  async findPatient(name: string, phone: string): Promise<Patient | null> {
    const found = await agenda.byPhone(phone);
    this.patient = found?.name === name ? found : undefined;
    return this.patient ?? null;
  }

  /** Horas libres de un día. */
  @tool({ when: (s) => s.identified && !s.done, preview: 2 })
  async freeSlots(day: string): Promise<Slot[]> {
    return (this.slots = await agenda.free(day));
  }

  /** Reserva la hora que el paciente eligió. */
  @tool({
    when: (s) => s.slots.length > 0 && !s.done,
    confirm: "Le reservo el {{slot.when}} con {{slot.doctor}}. ¿Lo confirmo?",
  })
  async book(slot: Slot): Promise<Booking> {
    this.slot = slot;
    this.booking = await agenda.book(this.patient!, slot);
    this.collapse(`Reservado ${slot.when} con ${slot.doctor}.`);
    this.log("appointment.booked", this.booking);
    return this.booking;
  }

  /** Pasa la llamada a recepción. */
  @tool()
  transfer(): string {
    return "Le paso con recepción.";
  }
}
