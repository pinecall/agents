// `pinecall serve`'s server: the console's files, the gateway's doors behind the key, and who may ask.

import { mkdtempSync, writeFileSync } from "node:fs";
import { createServer, request as ask, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { notTheSandbox } from "../../../src/cli/serve.js";
import { ABOUT, LocalConsole } from "../../../src/cli/serve/server.js";
import { aliveAt, theOneUp } from "../../../src/cli/serve/sidecar.js";

const KEY = "pk_sandbox_secret";
const WHO = { org: "org_1", slug: "cloudacio", key_id: "k_1", label: null, env: "sandbox", production: false };

interface Seen {
  path: string;
  headers: IncomingHttpHeaders;
}

let gateway: Server;
let seen: Seen[];
let served: LocalConsole;
let door: { url: string; apiKey: string };

beforeEach(async () => {
  seen = [];
  gateway = createServer((request, response) => {
    seen.push({ path: request.url ?? "", headers: request.headers });
    if (request.url === "/v1/events") {
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.write("id: 1\ndata: {}\n\n");
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ agents: [] }));
  });
  await new Promise<void>((up) => gateway.listen(0, "127.0.0.1", up));
  door = { url: `http://127.0.0.1:${(gateway.address() as AddressInfo).port}`, apiKey: KEY };
  const files = mkdtempSync(join(tmpdir(), "pinecall-console-"));
  writeFileSync(join(files, "index.html"), "<html><head><title>console</title></head><body></body></html>");
  writeFileSync(join(files, "app.js"), "console.log(1)");
  served = await LocalConsole.open(door, files, { gateway: door.url, org: "cloudacio", env: "sandbox" }, 0);
});

afterEach(async () => {
  await served.close();
  gateway.closeAllConnections();
  await new Promise<void>((down) => gateway.close(() => down()));
});

/** One request with the headers a test names, which `fetch` would not let it set. */
function get(path: string, headers: Record<string, string> = {}): Promise<{ status: number; body: string; type: string }> {
  const at = new URL(served.url);
  return new Promise((answered, failed) => {
    const asking = ask({ host: "127.0.0.1", port: at.port, path, headers: { host: at.host, ...headers } }, (response) => {
      let body = "";
      response.on("data", (chunk: Buffer) => {
        body += chunk.toString();
        if (path === "/v1/events") response.destroy();
      });
      const done = (): void => answered({ status: response.statusCode ?? 0, body, type: String(response.headers["content-type"]) });
      response.on("end", done);
      response.on("close", done);
    });
    asking.on("error", failed);
    asking.end();
  });
}

describe("the page", () => {
  it("is served for every screen the console routes, marked local, with no key in it", async () => {
    const page = await get("/a/bidfire-sales/chat");

    expect(page.type).toContain("text/html");
    expect(page.body).toContain('<meta name="pinecall-console" content="local">');
    expect(page.body).not.toContain(KEY);
  });

  // The other two marks are the BOX's, written into the page it serves at each of its names
  // (the runtime's api/pages.py), and this sidecar writes the same two so one console reads one
  // thing: the world it looks at, and where the gateway is — which is both the other console and
  // the name a widget tag must load from, never this loopback.
  it("marks the page the sandbox's, and names the gateway as the console elsewhere", async () => {
    const page = await get("/");

    expect(page.body).toContain('<meta name="pinecall-world" content="sandbox">');
    expect(page.body).toContain(`<meta name="pinecall-elsewhere" content="${door.url}">`);
  });

  it("serves a file of the console as that file", async () => {
    expect((await get("/app.js")).body).toBe("console.log(1)");
  });
});

describe("a door of the gateway", () => {
  it("is asked with the key on the header, which the page never sent", async () => {
    await get("/v1/agents?limit=3", { "pinecall-corner": "mem_2", cookie: "a=b" });

    expect(seen[0]?.path).toBe("/v1/agents?limit=3");
    expect(seen[0]?.headers.authorization).toBe(`Bearer ${KEY}`);
    expect(seen[0]?.headers["pinecall-corner"]).toBe("mem_2");
    expect(seen[0]?.headers.cookie).toBeUndefined();
  });

  it("streams: the first event arrives while the door is still open", async () => {
    const stream = await get("/v1/events");

    expect(stream.type).toContain("text/event-stream");
    expect(stream.body).toContain("id: 1");
  });

  it("the widget is fetched with no key: it is a public file", async () => {
    await get("/widget/pinecall-widget.js");

    expect(seen[0]?.headers.authorization).toBeUndefined();
  });
});

describe("who may ask", () => {
  it("refuses a name rebound to the loopback, before the key is spent", async () => {
    expect((await get("/v1/whoami", { host: "evil.test" })).status).toBe(403);
    expect(seen).toEqual([]);
  });

  it("refuses a page of another origin, and takes its own", async () => {
    expect((await get("/v1/whoami", { origin: "https://evil.test" })).status).toBe(403);
    expect((await get("/v1/whoami", { origin: served.url })).status).toBe(200);
  });
});

describe("one per machine", () => {
  it("says what it is, so a run beside it can tell it from a stranger's port", async () => {
    const port = Number(new URL(served.url).port);

    expect(await aliveAt(port)).toEqual({ pinecall: "serve", gateway: door.url, org: "cloudacio", env: "sandbox" });
    expect(JSON.parse((await get(ABOUT)).body)).toMatchObject({ pinecall: "serve" });
  });

  it("is reused for the same gateway and org, and never for another's", async () => {
    const port = Number(new URL(served.url).port);

    expect(await theOneUp(door, WHO, port)).toBe(`http://localhost:${port}`);
    expect(await theOneUp(door, { ...WHO, slug: "somebody-else" }, port)).toBeUndefined();
    expect(await theOneUp({ ...door, url: "https://other.test" }, WHO, port)).toBeUndefined();
  });

  it("a stranger's port is nobody's sidecar", async () => {
    expect(await aliveAt((gateway.address() as AddressInfo).port)).toBeUndefined();
  });
});

describe("a production key", () => {
  it("is told where production is watched", () => {
    expect(notTheSandbox("https://box.pinecall.io")).toContain("production is watched at https://box.pinecall.io");
  });
});
