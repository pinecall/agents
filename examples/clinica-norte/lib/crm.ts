/** El CRM de la clínica: donde se guarda lo que el agente decide recordar de un paciente. */

import type { MemoryOp } from "pinecall";

/** Lo que el CRM sabe de un contacto: clave y valor, tal y como el agente lo recordó. */
export type Notes = Record<string, unknown>;

/**
 * El CRM real es una API del centro; aquí es un mapa en memoria con la misma superficie, para que
 * `onMemory` tenga adónde escribir y el test pueda leerlo sin montar nada.
 */
export class FakeCrm {
  private readonly byContact = new Map<string, Notes>();

  /** Aplica las anotaciones de una llamada: recordar escribe, olvidar borra. */
  apply(contact: string, ops: MemoryOp[]): void {
    const notes = this.byContact.get(contact) ?? {};
    for (const op of ops) {
      if (op.op === "forget") delete notes[op.key];
      else notes[op.key] = op.value;
    }
    this.byContact.set(contact, notes);
  }

  /** Lo que el CRM tiene de un contacto ahora mismo. */
  notesOf(contact: string): Notes {
    return { ...(this.byContact.get(contact) ?? {}) };
  }
}

/** El CRM que usa el agente. */
export const crm = new FakeCrm();
