/** STATE: the app's own fields as the last state.changed left them, and who may see each one. */

import type { ReactNode } from "react";

import type { Visibility } from "../../lib/declared-state";

// The one string a masked value reads as, everywhere on the platform
// (the runtime's log/pii.py, docs/protocol/projections.md). The console never unmasks: it
// recognises the mask and says so.
const MASK = "***";

// A field nobody declared is the tenant's, which is the domain's own rule
// (AgentConfig.visibility_of). The panel says the same word the declaration would have said.
const BY_DEFAULT: Visibility = "tenant";

/** Every field of the app's state, by name, with its value as the tenant projection left it. */
export function StatePanel({
  fields,
  declared,
}: {
  fields: Record<string, unknown>;
  declared: Record<string, Visibility>;
}): ReactNode {
  const names = Object.keys(fields).sort();
  return (
    <section className="live-panel">
      <h3 className="live-panel-name">STATE</h3>
      {names.length === 0 ? <p className="live-panel-empty">The app has declared no state yet.</p> : null}
      <dl className="state-fields">
        {names.map((name) => {
          const seen = seenBy(fields[name], declared[name]);
          return (
            <div className="state-field" key={name}>
              <dt className="state-field-name fixed">{name}</dt>
              <dd className="state-field-value fixed">
                {said(fields[name])} <span className={seen === "pii" ? "seen-by seen-by-pii" : "seen-by"}>{seen}</span>
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}

// A field the agent declared `pii` arrives masked and cannot arrive any other way, so the mask on
// the wire is the truth about it. The other two are the declaration's to say, and the declaration
// comes from the agent's own config door (docs/protocol/projections.md).
function seenBy(value: unknown, declared: Visibility | undefined): string {
  if (value === MASK) {
    return "pii";
  }
  return declared === "public" ? "public" : BY_DEFAULT;
}

function said(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}
