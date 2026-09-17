/** The consent proof: the join from confirm.granted to the tool call it authorised, seq to seq. */

import type { Entry } from "@pinecall/protocol";
import type { ReactNode } from "react";

// The gateway's eval draws this same join to judge a call (the runtime's api/evals/
// consent.py): a grant belongs to ONE tool call, so it is matched by call_id and never by name —
// two bookings in one call each have their own. The console judges nothing: it only draws what the
// log says, because which tools are irreversible is the app's declaration and not the log's.
const CONFIRM_PREFIX = "confirm.";
const TOOL_CALL = "tool.call";

/** One tool call the log asked the caller about, and how the asking went. */
export interface Consent {
  callId: string;
  tool: string;
  requested: Entry | null;
  granted: Entry | null;
  declined: Entry | null;
  ran: Entry | null;
}

/** Every confirmation in the call, joined to the tool call it speaks for, in the order asked. */
export function consents(entries: Entry[]): Consent[] {
  const found = new Map<string, Consent>();
  for (const entry of entries) {
    if (!entry.type.startsWith(CONFIRM_PREFIX)) {
      continue;
    }
    const callId = text(entry, "call_id");
    const consent = found.get(callId) ?? blank(callId, text(entry, "tool"));
    found.set(callId, { ...consent, ...asked(entry) });
  }
  for (const entry of entries) {
    const consent = entry.type === TOOL_CALL ? found.get(text(entry, "call_id")) : undefined;
    if (consent !== undefined) {
      consent.ran = entry;
    }
  }
  return [...found.values()];
}

export function Consents({ rows }: { rows: Consent[] }): ReactNode {
  if (rows.length === 0) {
    return null;
  }
  return (
    <div className="session-consents">
      {rows.map((row) => (
        <Proof key={row.callId} consent={row} />
      ))}
    </div>
  );
}

function Proof({ consent }: { consent: Consent }): ReactNode {
  const problem = problemOf(consent);
  return (
    <div className="session-consent">
      <div className="session-consent-join">
        <span className="session-consent-tool">{consent.tool}</span>
        <span className="session-consent-seqs">{joinOf(consent)}</span>
        <span className="session-consent-id ui-fixed">{consent.callId}</span>
      </div>
      {consent.requested !== null && <div className="session-consent-said">{text(consent.requested, "phrase")}</div>}
      {consent.granted !== null && <div className="session-consent-said">“{text(consent.granted, "said")}”</div>}
      <div className="session-consent-audience">audience {audienceOf(consent)}</div>
      {problem !== null && <div className="ui-refused">{problem}</div>}
    </div>
  );
}

// ── what the join says ──────────────────────────────────────────────────────────

// The sentence the card asks for, and the only one the console can say without the app's
// declaration of which tools are irreversible: this grant authorised that tool call.
function joinOf(consent: Consent): string {
  if (consent.granted === null) {
    return consent.declined === null
      ? `seq ${seqOf(consent.requested)} asked and nothing answered`
      : `seq ${seqOf(consent.declined)} declined seq ${seqOf(consent.ran)}`;
  }
  return `seq ${consent.granted.seq} authorised seq ${seqOf(consent.ran)}`;
}

// consent.py's own three complaints, in its own words. The console states them; it does not fail a
// call, because it does not know which tools were irreversible in the first place.
function problemOf(consent: Consent): string | null {
  const { granted, ran, requested } = consent;
  if (granted === null || ran === null) {
    return null;
  }
  if (granted.seq > ran.seq) {
    return `${consent.tool} ran at seq ${ran.seq}, before its confirm.granted at seq ${granted.seq}`;
  }
  const asked = requested === null ? null : text(requested, "audience");
  if (asked !== null && asked !== text(granted, "audience")) {
    return `${consent.tool} was confirmed by another audience than the one asked at seq ${requested?.seq ?? 0}`;
  }
  return null;
}

function audienceOf(consent: Consent): string {
  const entry = consent.granted ?? consent.declined ?? consent.requested;
  return entry === null ? "—" : text(entry, "audience");
}

function asked(entry: Entry): Partial<Consent> {
  if (entry.type === "confirm.granted") {
    return { granted: entry };
  }
  return entry.type === "confirm.declined" ? { declined: entry } : { requested: entry };
}

function blank(callId: string, tool: string): Consent {
  return { callId, tool, requested: null, granted: null, declined: null, ran: null };
}

function seqOf(entry: Entry | null): string {
  return entry === null ? "—" : String(entry.seq);
}

function text(entry: Entry, field: string): string {
  const value = entry.data[field];
  return typeof value === "string" ? value : "";
}
