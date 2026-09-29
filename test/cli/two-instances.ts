// Fake production and sandbox instances: production names its sandbox and mints codes, the
// sandbox exchanges a code for its own key. Both record the world each request claimed.

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

/** The person's production key, as `pinecall link` writes it to .env. */
export const PRODUCTIONS_KEY = "pc_the_persons_key_at_production";

/** One request received by either instance. */
export interface Knock {
  at: "production" | "sandbox";
  method: string;
  path: string;
  /** The `pinecall-env` the request carried, if any. */
  world: string | undefined;
  /** The bearer it carried, if any. */
  bearer: string | undefined;
  body: Record<string, unknown>;
}

/** Production's /.well-known/pinecall: its sandbox, no sandbox, or (older) no world at all. */
export type Naming = "the sandbox" | "no sandbox" | "no world";

export class TwoInstances {
  readonly heard: Knock[] = [];
  /** What production says at /.well-known/pinecall. */
  names: Naming = "the sandbox";
  /** Whether the sandbox refuses every code (e.g. the person is disabled). */
  refusesCodes = false;
  /** Keys the sandbox accepts; any other key gets 401. */
  readonly taken = new Set<string>();
  /** Codes production minted that are still unspent. */
  readonly #codes = new Set<string>();
  #minted = 0;
  #servers: Server[] = [];
  production = "";
  sandbox = "";

  async open(): Promise<void> {
    this.production = await this.#listening("production");
    this.sandbox = await this.#listening("sandbox");
  }

  async close(): Promise<void> {
    for (const server of this.#servers) {
      server.closeAllConnections();
      await new Promise<void>((closed) => server.close(() => closed()));
    }
    this.#servers = [];
  }

  /** Requests other than the keyless /.well-known/pinecall. */
  signed(): Knock[] {
    return this.heard.filter((knock) => knock.path !== "/.well-known/pinecall");
  }

  async #listening(at: Knock["at"]): Promise<string> {
    const server = createServer((request, response) => void this.#heard(at, request, response));
    await new Promise<void>((bound) => server.listen(0, "127.0.0.1", bound));
    this.#servers.push(server);
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }

  async #heard(at: Knock["at"], request: IncomingMessage, response: ServerResponse): Promise<void> {
    let text = "";
    for await (const chunk of request) text += String(chunk);
    const bearer = request.headers.authorization?.replace(/^Bearer /, "");
    const world = request.headers["pinecall-env"];
    const knock: Knock = {
      at,
      method: request.method ?? "GET",
      path: request.url ?? "/",
      world: typeof world === "string" ? world : undefined,
      bearer,
      body: text === "" ? {} : (JSON.parse(text) as Record<string, unknown>),
    };
    this.heard.push(knock);
    const [status, body] = at === "production" ? this.#atProduction(knock) : this.#atTheSandbox(knock);
    response.writeHead(status, { "content-type": "application/json" });
    response.end(JSON.stringify(body));
  }

  #atProduction(knock: Knock): [number, unknown] {
    if (knock.path === "/.well-known/pinecall") {
      if (this.names === "no world") return [200, { version: "0.9.0", cloud: false }];
      return [200, { world: "production", elsewhere: this.names === "the sandbox" ? this.sandbox : null }];
    }
    if (knock.bearer !== PRODUCTIONS_KEY) return [401, { detail: "this door takes an API key" }];
    if (knock.path === "/v1/login/codes") {
      const code = `lc_${++this.#minted}`;
      this.#codes.add(code);
      return [200, { code, expires_at: 0 }];
    }
    if (knock.path === "/v1/whoami") return [200, whose("production", "k_laptop")];
    return [404, { detail: "Not Found" }];
  }

  #atTheSandbox(knock: Knock): [number, unknown] {
    if (knock.path === "/.well-known/pinecall") return [200, { world: "sandbox", elsewhere: this.production }];
    if (knock.path === "/v1/login") {
      const code = String(knock.body["code"]);
      // The sandbox asks production whom the code names; an unknown code names nobody.
      if (this.refusesCodes || !this.#codes.delete(code)) return [401, { detail: "no code answers to that" }];
      const key = `pc_the_sandboxs_key_${++this.#minted}`;
      this.taken.add(key);
      return [200, { key, key_id: `k_${this.#minted}`, org: "org_1", env: "sandbox" }];
    }
    if (knock.bearer === undefined || !this.taken.has(knock.bearer)) return [401, { detail: "this door takes an API key" }];
    if (knock.path === "/v1/login/codes") return [200, { code: "lc_minted_by_the_sandbox", expires_at: 0 }];
    if (knock.path === "/v1/whoami") return [200, whose("sandbox", "k_sandbox")];
    return [404, { detail: "Not Found" }];
  }
}

function whose(env: string, keyId: string): Record<string, unknown> {
  return { org: "org_1", slug: "clinica", key_id: keyId, label: "the laptop", env, name: "Berna", production: true };
}
