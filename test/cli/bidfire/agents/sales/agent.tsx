// An agent whose slug is not the name of its folder: the project calls it `sales` and its class
// calls it `bidfire-sales`, which is the name the gateway files its callers under. The CLI's own
// loader imports it through tsx, and it reaches the agent subtree directly, as the clinic does.

import { Agent } from "../../../../../src/agent/agent.js";

/** Eres el comercial de Bidfire. Hablas claro y no prometes descuentos. */
export default class BidfireSales extends Agent {
  language = "es";

  override render(): string {
    return "Saluda y pregunta qué necesita.";
  }
}
