/** STATE: the app's own fields as the last state.changed left them, and who may see each one. */

import type { ReactNode } from "react";

import type { Visibility } from "../../lib/declared-state";
import { KV, SectionLabel } from "../../ui";

// The one string a masked value reads as, everywhere on the platform
// (the runtime's log/pii.py, docs/protocol/projections.md). The console never unmasks: it
// recognises the mask and says so.
const MASK = "***";

// A field nobody declared is the tenant's, which is the domain's own rule
// (AgentConfig.visibility_of). The pane says the same word the declaration would have said.
const BY_DEFAULT: Visibility = "tenant";

/** Every field of the app's state, by name, with its value as the tenant projection left it. */
export function StatePanel({ fields, declared }: { fields: Record<string, unknown>; declared: Record<string, Visibility> }): ReactNode {
  const names = Object.keys(fields).sort();
  return (
    <>
      <SectionLabel>State</SectionLabel>
      {names.length === 0 ? (
        <div className="lv-pane-text">The app has declared no state yet.</div>
      ) : (
        <div className="lv-pane-body">
          {names.map((name) => {
            const seen = seenBy(fields[name], declared[name]);
            return (
              <KV key={name} label={name}>
                {said(fields[name])}
                {/* Tenant is what a field is when nobody said: only the two that were said are worth a word. */}
                {seen !== BY_DEFAULT && <span className={seen === "pii" ? "lv-seen lv-seen-pii" : "lv-seen"}>{seen}</span>}
              </KV>
            );
          })}
        </div>
      )}
    </>
  );
}

// A field the agent declared `pii` arrives masked and cannot arrive any other way, so the mask on
// the wire is the truth about it. The other two are the declaration's to say, and the declaration
// comes from the agent's own config door (docs/protocol/projections.md).
function seenBy(value: unknown, declared: Visibility | undefined): Visibility {
  if (value === MASK) {
    return "pii";
  }
  return declared === "public" ? "public" : BY_DEFAULT;
}

function said(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}
