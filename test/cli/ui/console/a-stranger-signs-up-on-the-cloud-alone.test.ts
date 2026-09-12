/** The console offers a sign-up only where the gateway says it is the cloud, and reads the door's answer as a login's. */

import { expect, test } from "vitest";

import { discover } from "../../../../src/cli/ui/console/lib/discovery";
import { signUp } from "../../../../src/cli/ui/console/lib/login";
import { slugOf } from "../../../../src/cli/ui/console/screens/login/slug";

// runtime api/signup.py: the login shape plus the slug, the member and a one-use code — the code
// is the landing page's to use; this tab holds the key straight away.
const SIGNED_UP = {
  key: "pk_" + "a".repeat(40),
  key_id: "k_1",
  org: "org_1",
  label: "console",
  env: "production",
  scopes: ["app", "calls"],
  subject: "m_1",
  name: "Ana",
  slug: "tienda-sur",
  member: { id: "m_1", email: "ana@tiendasur.uy", name: "Ana", role: "admin", agents: [], status: "active", scopes: ["app", "calls"] },
  code: "lc_x",
  code_expires_at: "2026-09-12T05:00:00Z",
};

function answering(status: number, body: unknown): { asked: { url: string; body: unknown }[] } {
  const asked: { url: string; body: unknown }[] = [];
  globalThis.window = { location: { origin: "https://box.pinecall.io" } } as unknown as Window & typeof globalThis;
  globalThis.fetch = (async (url: URL | RequestInfo, init?: RequestInit) => {
    asked.push({ url: String(url), body: typeof init?.body === "string" ? JSON.parse(init.body) : null });
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { asked };
}

test("discovery reads {version, cloud}, and a gateway that does not say is a box", async () => {
  answering(200, { version: "0.0.0", cloud: true });
  expect((await discover("/")).cloud).toBe(true);
  answering(404, { detail: "nothing here" });
  expect((await discover("/")).cloud).toBe(false);
  globalThis.fetch = (async () => {
    throw new TypeError("network");
  }) as typeof fetch;
  expect((await discover("/")).cloud).toBe(false);
});

test("a sign-up knocks at /v1/signup naming this device and is read as a login's answer", async () => {
  const { asked } = answering(201, SIGNED_UP);
  const signed = await signUp("/", { org: "tienda-sur", name: "Tienda Sur", email: "ana@tiendasur.uy", person: "Ana", password: "correct horse battery staple" });
  expect(asked[0]?.url).toBe("https://box.pinecall.io/v1/signup");
  expect(asked[0]?.body).toMatchObject({ org: "tienda-sur", device: "console" });
  expect([signed.org, signed.env, signed.subject]).toEqual(["org_1", "production", "m_1"]);
});

test("the org's address is made from its name the way a person would type it", () => {
  expect(slugOf("Clínica Norte")).toBe("clinica-norte");
  expect(slugOf("  Tienda   Sur! ")).toBe("tienda-sur");
  expect(slugOf("---")).toBe("");
  expect(slugOf("x".repeat(80))).toHaveLength(63);
});
