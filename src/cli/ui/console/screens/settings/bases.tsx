/** The bases the agent searches per turn, picked from the ones this org has pushed: the Bases section. */

import type { ReactNode } from "react";

import type { KnowledgeBase } from "@pinecall/protocol";

import { Button, Label, Select } from "../../ui";

export interface Attached {
  base: string;
  /** How many chunks a turn reads from it; empty for the runtime's default. */
  k: string;
}

const ATTACH = "";

// How many chunks a turn may read, as a list: at least one (types/knowledge.py), and the runtime
// hands the model eight when nobody said.
const CHUNKS = ["2", "4", "6", "8", "12", "16"];

export function BasesSection({ rows, offered, onChange }: { rows: readonly Attached[]; offered: readonly KnowledgeBase[] | null; onChange: (rows: Attached[]) => void }): ReactNode {
  const attached = new Set(rows.map((one) => one.base));
  const free = (offered ?? []).filter((one) => !attached.has(one.base));
  const set = (at: number, row: Attached): void => onChange(rows.map((one, index) => (index === at ? row : one)));
  const drop = (at: number): void => onChange(rows.filter((_, index) => index !== at));
  return (
    <section className="set-section">
      <div className="set-section-head">
        <h2 className="set-section-title">Bases</h2>
        <p className="set-section-blurb">The documents the agent searches on every turn, by the name each folder was pushed under. A base is pushed from a project with `pinecall docs push`; the Docs tab lists them.</p>
      </div>
      {rows.length === 0 ? (
        <p className="set-help">Nothing attached: the agent answers from what it knows by heart and from its tools alone.</p>
      ) : (
        <div className="set-bases">
          <div className="set-bases-head">
            <span>Base</span>
            <span>Chunks a turn reads</span>
            <span />
          </div>
          {rows.map((row, at) => (
            <div className="set-bases-row" key={`${row.base}-${at}`}>
              <Select value={row.base} onChange={(event) => set(at, { ...row, base: event.target.value })}>
                {(offered ?? []).some((one) => one.base === row.base) ? null : <option value={row.base}>{row.base} · not pushed in this world</option>}
                {(offered ?? []).map((one) => (
                  <option key={one.base} value={one.base} disabled={one.base !== row.base && attached.has(one.base)}>
                    {one.base} · {one.chunks} chunks
                  </option>
                ))}
              </Select>
              <Select value={row.k} onChange={(event) => set(at, { ...row, k: event.target.value })}>
                <option value="">Runtime default · 8</option>
                {(row.k === "" || CHUNKS.includes(row.k) ? CHUNKS : [row.k, ...CHUNKS]).map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </Select>
              <Button size="xs" onClick={() => drop(at)}>
                Detach
              </Button>
            </div>
          ))}
        </div>
      )}
      <div className="set-row">
        <div className="set-field">
          <Label>Attach a base</Label>
          <Select value={ATTACH} disabled={free.length === 0} onChange={(event) => event.target.value !== ATTACH && onChange([...rows, { base: event.target.value, k: "" }])}>
            <option value={ATTACH}>{offered === null ? "Asking the gateway…" : free.length === 0 ? "Every pushed base is attached" : "Pick one…"}</option>
            {free.map((one) => (
              <option key={one.base} value={one.base}>
                {one.base} · {one.chunks} chunks
              </option>
            ))}
          </Select>
          <p className="set-help">Only bases pushed in this world appear. A base a colleague pushed to their own corner is theirs until they push it for the team.</p>
        </div>
      </div>
    </section>
  );
}
