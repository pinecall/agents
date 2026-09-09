// The socket: the key at the door, the declaration on the way in, and again on the way back.

import { afterEach, describe, expect, it, vi } from "vitest";
import { Pinecall, Refused } from "../../src/client/index.js";
import { FakeGateway } from "../../src/client/testing/index.js";

const KEY = "pk_test";

let gateway: FakeGateway;
let client: Pinecall | null = null;
let open: FakeGateway | null = null;

afterEach(async () => {
  client?.close();
  client = null;
  await open?.close();
  open = null;
});

async function connected(options: Partial<ConstructorParameters<typeof Pinecall>[0]> = {}, taken: string[] = []): Promise<Pinecall> {
  gateway = open = await FakeGateway.start({ apiKey: KEY, taken });
  client = new Pinecall({ url: gateway.url, apiKey: KEY, ...options });
  return client;
}

describe("connecting", () => {
  it("claims every agent's doors and sends its declaration, naming the sdk", async () => {
    const pc = await connected();
    pc.agent("clinica-norte", {
      routes: [{ channel: "phone", number: "+34910000001", label: "centralita" }, { channel: "web" }],
      instructions: "Atiendes la centralita.",
      greeting: "Clínica Norte, ¿en qué puedo ayudarte?",
    });
    await pc.connect();

    const [register] = gateway.commandsOf("agent.register");
    expect(register?.agent).toBe("clinica-norte");
    expect(register?.data["routes"]).toEqual([
      { channel: "phone", number: "+34910000001", label: "centralita" },
      { channel: "web", number: null },
    ]);
    expect(register?.data["sdk"]).toMatch(/^pinecall\//);

    const [configure] = gateway.commandsOf("agent.configure");
    expect(configure?.data["config"]).toMatchObject({ instructions: "Atiendes la centralita.", greeting: "Clínica Norte, ¿en qué puedo ayudarte?" });
  });

  it("refuses to start without a url and a key", () => {
    const had = process.env["PINECALL_API_KEY"];
    delete process.env["PINECALL_API_KEY"];
    try {
      expect(() => new Pinecall({ url: "http://127.0.0.1:1" })).toThrow(/PINECALL_URL/);
    } finally {
      if (had !== undefined) {
        process.env["PINECALL_API_KEY"] = had;
      }
    }
  });

  it("never opens, and learns nothing, when the key is wrong", async () => {
    gateway = open = await FakeGateway.start({ apiKey: KEY });
    client = new Pinecall({ url: gateway.url, apiKey: "pk_wrong" });
    client.onErrors(() => undefined);
    await expect(client.connect()).rejects.toThrow(/403/);
  });

  it("hears the registry refuse a slug it will not hand over", async () => {
    const pc = await connected({}, ["clinica-norte"]);
    pc.onErrors(() => undefined);
    pc.agent("clinica-norte", {});
    await expect(pc.connect()).rejects.toBeInstanceOf(Refused);
  });

  it("declares itself again after the gateway drops it", async () => {
    const pc = await connected({ backoff: { firstMs: 20, capMs: 40 } });
    pc.onErrors(() => undefined);
    pc.agent("clinica-norte", {});
    await pc.connect();
    expect(gateway.commandsOf("agent.register")).toHaveLength(1);

    gateway.cut();
    await vi.waitFor(() => expect(gateway.commandsOf("agent.register")).toHaveLength(2), { timeout: 4_000 });
    expect(gateway.commandsOf("agent.configure")).toHaveLength(2);
  });

  it("pings while it is up", async () => {
    const pc = await connected({ pingMs: 20 });
    pc.agent("clinica-norte", {});
    await pc.connect();
    await vi.waitFor(() => expect(gateway.commandsOf("ping").length).toBeGreaterThan(1), { timeout: 4_000 });
  });
});
