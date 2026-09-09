// An agent on disk, for the CLI's own loader: it is imported through tsx, the way a tenant's is.
// It imports the agent subtree directly rather than the package index, because the loader runs
// before anybody built a dist and the index reaches the sdk through its published exports.

import { Agent } from "../../../src/agent/agent.js";

/** Eres la recepción de Clínica Norte. Hablas de usted, con frases cortas. */
export default class ClinicaNorte extends Agent {
  language = "es";

  patient?: { name: string };
  slots: { when: string }[] = [];

  get identified(): boolean {
    return !!this.patient;
  }
}
