/** The org screens parse the gateway's own shapes, field for field, and refuse a field renamed. */

import { expect, test } from "vitest";
import { z } from "zod";

// The schemas are module-private on purpose — a screen parses at its own door — so the test reads
// them through the doors' public functions with a fetch that answers the runtime's shapes.
import { readNumbers } from "../../../../src/cli/ui/console/screens/numbers/door";
import { readMembers } from "../../../../src/cli/ui/console/screens/team/door";
import { readUsage } from "../../../../src/cli/ui/console/screens/usage/door";

const CREDENTIALS = { base: "/", key: "pk_test" };

// runtime log/usage.py: UsageRow and Totals, as asdict() writes them.
const A_USAGE_PAGE = {
  rows: [
    { cursor: 7, org: "clinica", agent: "clinica-norte", call: "CA_1", type: "call.summary", at: 1.5, minutes: 1.5, messages: 6, input_tokens: 1200, output_tokens: 300, characters: 0, judge_calls: 0, cost_eur: 0.0021 },
  ],
  totals: { minutes: 1.5, messages: 6, input_tokens: 1200, output_tokens: 300, characters: 0, judge_calls: 0, cost_eur: 0.0021, calls: 1 },
  next: 7,
};

// runtime api/routes.py: `Answering` — the domain's Route and which table put it there.
const A_DOOR = { route: { org: "clinica", agent: "clinica-norte", channel: "phone", number: "+34910000000", label: null, env: "production" }, source: "app" };

// runtime api/members.py: one member as the wire says it.
const A_MEMBER = { id: "m_1", email: "ana@clinica.uy", name: "Ana", role: "supervisor", agents: ["clinica-norte"], status: "active", scopes: ["calls", "evals", "supervise", "talk"] };

function answering(body: unknown): void {
  globalThis.window = { location: { origin: "https://box.pinecall.io" } } as unknown as Window & typeof globalThis;
  globalThis.fetch = (async () => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;
}

test("usage is the runtime's rows and totals, field for field", async () => {
  answering(A_USAGE_PAGE);
  const page = await readUsage(CREDENTIALS);
  expect(page.totals?.calls).toBe(1);
  expect(page.rows[0]?.cost_eur).toBe(0.0021);
  answering({ ...A_USAGE_PAGE, rows: [{ ...A_USAGE_PAGE.rows[0], minutes: undefined }] });
  await expect(readUsage(CREDENTIALS)).rejects.toBeInstanceOf(z.ZodError);
});

test("a number is a route with its source, and a member is who they are with what their role opens", async () => {
  answering([A_DOOR]);
  expect((await readNumbers(CREDENTIALS))[0]?.source).toBe("app");
  answering({ members: [A_MEMBER] });
  expect((await readMembers(CREDENTIALS))[0]?.scopes).toContain("supervise");
  answering({ members: [{ ...A_MEMBER, role: "owner" }] });
  await expect(readMembers(CREDENTIALS)).rejects.toBeInstanceOf(z.ZodError);
});

// runtime api/numbers.py and api/managed.py: the carrier by kind and account, what the account
// owns, and the one shape an import and a purchase both answer — the route, the steps, dry_run.
test("the numbers screen parses the carrier, the account's numbers and a plan, and refuses a step that is not a string", async () => {
  const { readCarrier, readAvailable, importNumber, buyNumber } = await import("../../../../src/cli/ui/console/screens/numbers/door");
  answering({ kind: "twilio", account: "AC" + "0".repeat(32) });
  expect((await readCarrier(CREDENTIALS))?.kind).toBe("twilio");
  answering({ kind: "twilio", numbers: [{ number: "+14176743169", name: "abai", imported: false }] });
  expect((await readAvailable(CREDENTIALS)).numbers[0]?.imported).toBe(false);
  const wired = { route: { ...A_DOOR.route, channel: "phone", number: "+14176743169", managed: true }, steps: ["buy      +14176743169 — on account AC…, billed to the box"], dry_run: true };
  answering(wired);
  expect((await buyNumber(CREDENTIALS, { country: "US", agent: "clinica-norte", channel: "phone" }, true)).route.managed).toBe(true);
  answering({ ...wired, dry_run: false, route: { ...wired.route, managed: false } });
  expect((await importNumber(CREDENTIALS, { number: "+14176743169", agent: "clinica-norte", channel: "phone" }, false)).dry_run).toBe(false);
  answering({ ...wired, steps: [42] });
  await expect(buyNumber(CREDENTIALS, { country: "US", agent: "clinica-norte", channel: "phone" }, true)).rejects.toBeInstanceOf(z.ZodError);
});

test("a carrier nobody brought is null, not a refusal: the door's 404 is the empty state", async () => {
  const { readCarrier } = await import("../../../../src/cli/ui/console/screens/numbers/door");
  globalThis.fetch = (async () => new Response(JSON.stringify({ detail: "this org has no carrier yet" }), { status: 404, headers: { "content-type": "application/json" } })) as typeof fetch;
  expect(await readCarrier(CREDENTIALS)).toBeNull();
});
