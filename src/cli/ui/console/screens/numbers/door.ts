/** The Numbers screen's doors: the org's routes, its carrier, what the carrier owns, one imported, one bought, one let go. */

import { z } from "zod";

import { drop, post, put, read, type Credentials } from "../../../shared/api";

// The runtime's `Answering`: the domain's Route, and which of the two tables put it there.
// `managed` is a number the box bought for the org — the stock the `numbers` quota caps.
const AnsweringSchema = z.object({
  route: z.object({
    org: z.string(),
    agent: z.string(),
    channel: z.enum(["phone", "web", "whatsapp"]),
    number: z.string().nullable(),
    label: z.string().nullable(),
    env: z.enum(["production", "sandbox"]),
    managed: z.boolean().default(false),
  }),
  source: z.enum(["operator", "app"]),
});
export type Answering = z.infer<typeof AnsweringSchema>;

// runtime api/numbers.py: GET /v1/carrier answers the kind and the account, never a secret.
const CarrierSchema = z.object({ kind: z.enum(["twilio", "sip"]), account: z.string() });
export type Carrier = z.infer<typeof CarrierSchema>;

// What the carrier account owns, and whether this org imported each one already.
const AvailableSchema = z.object({
  kind: z.enum(["twilio", "sip"]),
  numbers: z.array(z.object({ number: z.string(), name: z.string(), imported: z.boolean() })),
});
export type Available = z.infer<typeof AvailableSchema>;

// An import and a purchase answer the same shape: the route, the steps taken or planned, and
// whether anything was written. `?dry_run=true` is the plan and nothing else.
const WiredSchema = z.object({
  route: AnsweringSchema.shape.route,
  steps: z.array(z.string()),
  dry_run: z.boolean(),
});
export type Wired = z.infer<typeof WiredSchema>;

/** What PUT /v1/carrier takes: a Twilio account, or a SIP peer with its own networks. */
export type WantedCarrier =
  | { kind: "twilio"; account_sid: string; user: string; secret: string }
  | {
      kind: "sip";
      username: string;
      password: string;
      addresses: string[];
      /** Where the box sends a call it places through this peer. Left out: a peer it only receives from. */
      outbound_host?: string;
      outbound_transport?: "auto" | "udp" | "tcp" | "tls";
      outbound_username?: string;
      outbound_password?: string;
    };

/** What an import wants: which number, which agent, on which channel. */
export interface WantedNumber {
  number: string;
  agent: string;
  channel: "phone" | "whatsapp";
}

/** What a purchase wants: where the number should be from, and who answers it. */
export interface WantedPurchase {
  country: string;
  area_code?: string;
  agent: string;
  channel: "phone" | "whatsapp";
}

/** Every door the org answers in this world, in the order the worker is given them. */
export async function readNumbers(credentials: Credentials): Promise<Answering[]> {
  return z.array(AnsweringSchema).parse(await read(credentials, "/v1/numbers"));
}

/** The org's carrier, or null when it has brought none yet (the door's own 404). */
export async function readCarrier(credentials: Credentials): Promise<Carrier | null> {
  try {
    return CarrierSchema.parse(await read(credentials, "/v1/carrier"));
  } catch (refused) {
    if (isStatus(refused, 404)) return null;
    throw refused;
  }
}

/** Bring the carrier, replacing whatever the org had. A Twilio account is verified once there. */
export async function bringCarrier(credentials: Credentials, wanted: WantedCarrier): Promise<void> {
  await put(credentials, "/v1/carrier", wanted);
}

/** Forget the carrier. The numbers already imported stay routed until each is let go. */
export async function dropCarrier(credentials: Credentials): Promise<void> {
  await drop(credentials, "/v1/carrier");
}

/** What the carrier account owns that this org has not imported yet. A SIP peer lists nothing. */
export async function readAvailable(credentials: Credentials): Promise<Available> {
  return AvailableSchema.parse(await read(credentials, "/v1/numbers/available"));
}

/** Import one number: the plan alone with `dryRun`, or the three looked-up-first writes. */
export async function importNumber(credentials: Credentials, wanted: WantedNumber, dryRun: boolean): Promise<Wired> {
  return WiredSchema.parse(await post(credentials, `/v1/numbers${dryRun ? "?dry_run=true" : ""}`, wanted));
}

/** Buy one on the box's own carrier: the plan names the number and pays nothing with `dryRun`. */
export async function buyNumber(credentials: Credentials, wanted: WantedPurchase, dryRun: boolean): Promise<Wired> {
  return WiredSchema.parse(await post(credentials, `/v1/numbers/buy${dryRun ? "?dry_run=true" : ""}`, wanted));
}

/** Let a number go: the route and the admission. The carrier account is not touched. */
export async function releaseNumber(credentials: Credentials, number: string): Promise<void> {
  await drop(credentials, `/v1/numbers/${encodeURIComponent(number)}`);
}

// GET /v1/carrier/outbound (the runtime's docs/protocol/console-api.md §4): whether the org can place
// a call at all, the numbers it would place it from, what is still missing in the gateway's own
// sentences, and the guards only whoever runs the gateway sets. Read loosely: a guard added later
// is not a refusal.
const OutboundSchema = z.looseObject({
  ready: z.boolean(),
  kind: z.string().nullish(),
  from_numbers: z.array(z.string()),
  steps_missing: z.array(z.string()),
  guards: z.looseObject({
    dial_anywhere: z.boolean(),
    per_minute: z.number(),
    per_day: z.number(),
    countries: z.array(z.string()),
    max_duration_s: z.number(),
  }),
});
export type Outbound = z.infer<typeof OutboundSchema>;

const ProvisionedSchema = z.looseObject({ steps: z.array(z.string()), dry_run: z.boolean(), ready: z.boolean() });
export type Provisioned = z.infer<typeof ProvisionedSchema>;

/** Whether this org can dial out, or null from a gateway with no such door (its 404) or a key that may not ask. */
export async function readOutbound(credentials: Credentials): Promise<Outbound | null> {
  try {
    return OutboundSchema.parse(await read(credentials, "/v1/carrier/outbound"));
  } catch (refused) {
    if (isStatus(refused, 404) || isStatus(refused, 405) || isStatus(refused, 403)) return null;
    throw refused;
  }
}

/** Provision or repair the trunk calls are placed through: the plan alone with `dryRun`, else the writes. */
export async function provisionOutbound(credentials: Credentials, dryRun: boolean): Promise<Provisioned> {
  return ProvisionedSchema.parse(await post(credentials, `/v1/carrier/outbound${dryRun ? "?dry_run=true" : ""}`, {}));
}

const DialledSchema = z.looseObject({ call: z.string() });

/** Place a call as the agent (POST /v1/agents/{slug}/dial). Answers the call it became; the guards refuse in sentences. */
export async function dial(credentials: Credentials, agent: string, to: string, from?: string): Promise<string> {
  const body = from === undefined || from === "" ? { to } : { to, from };
  return DialledSchema.parse(await post(credentials, `/v1/agents/${encodeURIComponent(agent)}/dial`, body)).call;
}

function isStatus(failed: unknown, status: number): boolean {
  return typeof failed === "object" && failed !== null && (failed as { status?: unknown }).status === status;
}
