/** What the console has already changed, under the form that changes it. */

import type { ReactNode } from "react";

import type { Overridden } from "./door";

export function Overrides({ turned }: { turned: Overridden }): ReactNode {
  const rows = (Object.entries(turned) as [keyof Overridden, string | null][]).filter(([, value]) => value !== null);
  if (rows.length === 0) {
    return (
      <p className="note">
        nothing overridden — this agent runs exactly what its class declares. The console may set{" "}
        <code className="mono">{Object.keys(turned).join(", ")}</code>.
      </p>
    );
  }
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>field</th>
            <th>value</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([field, value]) => (
            <tr key={field}>
              <td className="mono">{field}</td>
              <td className="mono">{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
