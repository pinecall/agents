/** The box's doors about its tenants: every org, and what one may do, runs on, seats and brought. */

import { z } from "zod";

import { drop, post, put, read, type Credentials } from "../../../shared/api";

const OPS = "/v1/ops";
const at = (named: string): string => `${OPS}/orgs/${encodeURIComponent(named)}`;

// The quotas in the runtime's own order (types/org.py). `null` is no limit, which is what a box of
// its own gives everybody; `0` is a real limit that refuses. `budget_eur` is the month's spend.
export const QUOTAS = ["minutes", "messages", "agents", "concurrent_calls", "memory_facts", "knowledge_chunks", "numbers", "seats", "budget_eur"] as const;
export type Quota = (typeof QUOTAS)[number];

const aLimit = z.number().nullish();

// Read loosely, every one of them: the operator's page must keep opening the day a door says more.
const OrgSchema = z.looseObject({ id: z.string(), slug: z.string(), name: z.string() });
export type Org = z.infer<typeof OrgSchema>;

const DiallingSchema = z.looseObject({
  dial_anywhere: z.boolean(),
  per_minute: z.number(),
  per_day: z.number(),
  countries: z.array(z.string()),
  max_duration_s: z.number(),
});
export type Dialling = z.infer<typeof DiallingSchema>;

const OneOrgSchema = OrgSchema.extend({
  quotas: z.looseObject({
    minutes: aLimit,
    messages: aLimit,
    agents: aLimit,
    concurrent_calls: aLimit,
    memory_facts: aLimit,
    knowledge_chunks: aLimit,
    numbers: aLimit,
    seats: aLimit,
    budget_eur: aLimit,
  }),
  // An older gateway has no dial guards to answer.
  dialling: DiallingSchema.nullish(),
  holding: z.looseObject({ memory_facts: z.number(), knowledge_chunks: z.number(), numbers: z.number(), seats: z.number() }),
});
export type OneOrg = z.infer<typeof OneOrgSchema>;

const ListedKeySchema = z.looseObject({
  fingerprint: z.string(),
  label: z.string().nullish(),
  created_at: z.string(),
  revoked_at: z.string().nullish(),
  env: z.string(),
  scopes: z.array(z.string()),
  subject: z.string().nullish(),
  name: z.string().nullish(),
});
export type ListedKey = z.infer<typeof ListedKeySchema>;

// The ONE answer that carries a key in the clear: shown once by the screen and kept by nothing.
const IssuedSchema = z.looseObject({ key: z.string(), key_id: z.string(), label: z.string().nullish(), env: z.string(), scopes: z.array(z.string()) });
export type Issued = z.infer<typeof IssuedSchema>;

const MemberSchema = z.looseObject({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  role: z.string(),
  agents: z.array(z.string()),
  status: z.string(),
  operator: z.boolean().nullish(),
});
export type Member = z.infer<typeof MemberSchema>;

const InvitedSchema = z.looseObject({ member: MemberSchema, token: z.string().nullish(), expires_at: z.string().nullish(), mailed: z.boolean().nullish() });
export type Invited = z.infer<typeof InvitedSchema>;

const SsoSchema = z.looseObject({ configured: z.boolean(), issuer: z.string().nullish(), domains: z.array(z.string()).nullish(), required: z.boolean() });
export type Sso = z.infer<typeof SsoSchema>;

// ── the orgs ────────────────────────────────────────────────────────────────────

/** Every org this box serves, oldest first. */
export async function readOrgs(credentials: Credentials): Promise<Org[]> {
  return z.array(OrgSchema).parse(await read(credentials, `${OPS}/orgs`));
}

/** One org by id or slug: its limits, its dial guards, what it holds. */
export async function readOrg(credentials: Credentials, named: string): Promise<OneOrg> {
  return OneOrgSchema.parse(await read(credentials, at(named)));
}

/** A new tenant. The gateway mints the id and judges the slug. */
export async function addOrg(credentials: Credentials, slug: string, name: string): Promise<Org> {
  return OrgSchema.parse(await post(credentials, `${OPS}/orgs`, { slug, name: name || null }));
}

/** Forget the org. The gateway refuses while a live key or a route still names it. */
export async function removeOrg(credentials: Credentials, named: string): Promise<void> {
  await drop(credentials, at(named));
}

/** Replace the limits, whole: one left out is no limit. */
export async function saveQuotas(credentials: Credentials, named: string, wanted: Partial<Record<Quota, number | null>>): Promise<void> {
  await put(credentials, `${at(named)}/quotas`, wanted);
}

/** Replace the outbound guards, whole: one left out goes back to the code's default. */
export async function saveDialling(credentials: Credentials, named: string, wanted: Dialling): Promise<void> {
  await put(credentials, `${at(named)}/dialling`, wanted);
}

/** An agent that registered in the wrong org, brought here with its log and its numbers. */
export async function moveAgent(credentials: Credentials, named: string, agent: string): Promise<{ logs: number; numbers: string[] }> {
  return z.looseObject({ logs: z.number(), numbers: z.array(z.string()) }).parse(await put(credentials, `${at(named)}/agents`, { agent }));
}

// ── its keys ────────────────────────────────────────────────────────────────────

export async function readKeys(credentials: Credentials, named: string): Promise<ListedKey[]> {
  return z.array(ListedKeySchema).parse(await read(credentials, `${at(named)}/keys`));
}

/** A machine's key for that org. Every scope when none is named, which is what an org's own key holds. */
export async function issueKey(credentials: Credentials, named: string, wanted: { label: string; env: string; scopes: string[] | null }): Promise<Issued> {
  return IssuedSchema.parse(await post(credentials, `${at(named)}/keys`, wanted));
}

export async function revokeKey(credentials: Credentials, fingerprint: string): Promise<void> {
  await post(credentials, `${OPS}/keys/${encodeURIComponent(fingerprint)}/revoke`, {});
}

// ── its people ──────────────────────────────────────────────────────────────────

export async function readMembers(credentials: Credentials, named: string): Promise<{ members: Member[]; seated: number }> {
  return z.looseObject({ members: z.array(MemberSchema), seated: z.number() }).parse(await read(credentials, `${at(named)}/members`));
}

/** The operator's invitation: it takes no seat, and it is how an org with sign-ups shut gets its first admin. */
export async function inviteTo(credentials: Credentials, named: string, who: { email: string; name: string; role: string; agents: string[] }): Promise<Invited> {
  return InvitedSchema.parse(await post(credentials, `${at(named)}/members`, who));
}

/** This person runs the box, or stops. Their org's doors are untouched either way. */
export async function makeOperator(credentials: Credentials, named: string, id: string, operator: boolean): Promise<void> {
  await put(credentials, `${at(named)}/members/${encodeURIComponent(id)}/operator`, { operator });
}

/** Remove a person for good. A gateway without the door answers 404/405, in its own words. */
export async function removeMember(credentials: Credentials, named: string, id: string): Promise<void> {
  await drop(credentials, `${at(named)}/members/${encodeURIComponent(id)}`);
}

// ── what it brought, and how it signs in ────────────────────────────────────────

/** Which vendors this org brought its own key for. Never a value. */
export async function readVendors(credentials: Credentials, named: string): Promise<string[]> {
  return z.looseObject({ vendors: z.array(z.string()) }).parse(await read(credentials, `${at(named)}/provider-keys`)).vendors;
}

/** Put a vendor's key in for this org. It is sent once and read back by no door a person opens. */
export async function bringVendor(credentials: Credentials, named: string, vendor: string, key: string): Promise<void> {
  await put(credentials, `${at(named)}/provider-keys/${encodeURIComponent(vendor)}`, { key });
}

/** Give a vendor back to the box's own key for this org, from the next call. */
export async function forgetVendor(credentials: Credentials, named: string, vendor: string): Promise<void> {
  await drop(credentials, `${at(named)}/provider-keys/${encodeURIComponent(vendor)}`);
}

/** Which identity provider the org is wired to, or null where there is nothing to read. */
export async function readSso(credentials: Credentials, named: string): Promise<Sso | null> {
  try {
    return SsoSchema.parse(await read(credentials, `${at(named)}/sso`));
  } catch {
    return null;
  }
}

/** The break-glass: passwords work again for an org whose provider stopped answering. */
export async function requireSso(credentials: Credentials, named: string, required: boolean): Promise<void> {
  await put(credentials, `${at(named)}/sso/required`, { required });
}
