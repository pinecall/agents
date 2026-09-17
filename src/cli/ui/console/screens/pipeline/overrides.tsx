/** What the console has already changed, under the form that changes it. */

import type { ReactNode } from "react";

import { Pill } from "../../ui";
import type { Overridden } from "./door";

export function Overrides({ turned }: { turned: Overridden }): ReactNode {
  const rows = (Object.entries(turned) as [keyof Overridden, string | null][]).filter(([, value]) => value !== null);
  return (
    <div className="ui-card">
      <div className="ui-card-head">
        <span className="ui-card-title">Turned</span>
        <span className="ui-card-meta">{rows.length === 0 ? "nothing" : `${rows.length} of ${Object.keys(turned).length} knobs`}</span>
      </div>
      {rows.length === 0 ? (
        <div className="ui-empty">
          Nothing overridden — this agent runs exactly what its class declares. The console may set {Object.keys(turned).join(", ")}.
        </div>
      ) : (
        rows.map(([field, value]) => (
          <div className="pipe-turned" key={field}>
            <span className="pipe-turned-field">{field}</span>
            <span className="pipe-turned-value">{value}</span>
            <Pill tone="violet" small>
              ← turned
            </Pill>
          </div>
        ))
      )}
    </div>
  );
}
