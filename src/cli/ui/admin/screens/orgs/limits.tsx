/** One org's quotas: the whole set, replaced whole, with what it is holding beside each stock. */

import { useState, type ReactNode } from "react";

import { GatewayError } from "../../../shared/api";
import { useCredentials } from "../../../shared/credentials";
import { QUOTAS, setQuotas, type OneOrg, type Quota } from "../../lib/doors";

// What each limit is about, in the fewest words that say it. The order is the runtime's own.
const ABOUT: Record<Quota, string> = {
  minutes: "of call, ever",
  messages: "written turns, ever",
  agents: "slugs held at once",
  concurrent_calls: "calls at once",
  memory_facts: "facts kept",
  knowledge_chunks: "chunks kept",
  numbers: "numbers this box bought",
  seats: "people invited or active",
};

// The four the gateway can count, and what it counted. The three flows are folded from the log
// and read on the Usage screen instead; a number beside them here would be a second answer.
const HELD: Partial<Record<Quota, keyof OneOrg["holding"]>> = {
  memory_facts: "memory_facts",
  knowledge_chunks: "knowledge_chunks",
  numbers: "numbers",
  seats: "seats",
};

/**
 * The panel.
 *
 * An empty field is **no limit**, which is what a box of its own gives everybody; `0` is a real
 * limit and refuses everything, which is how a plan says it does not include a feature. The set
 * is replaced whole, so a field left empty is a limit taken away and not a limit kept.
 */
export function Limits({ org, onSaved }: { org: OneOrg; onSaved: () => void }): ReactNode {
  const credentials = useCredentials();
  const [wanted, setWanted] = useState<Record<string, string>>(() => typed(org));
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const save = async (): Promise<void> => {
    setBusy(true);
    setRefused(null);
    setSaved(false);
    try {
      await setQuotas(credentials, org.slug, asLimits(wanted));
      setSaved(true);
      onSaved();
    } catch (failed) {
      setRefused(failed instanceof GatewayError ? failed.message : String(failed));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel">
      <p className="panel-title">what it may do</p>
      <div className="limits">
        {QUOTAS.map((quota) => (
          <label className="limit" key={quota}>
            <span className="limit-name fixed">{quota}</span>
            <input
              className="input limit-input"
              inputMode="numeric"
              value={wanted[quota] ?? ""}
              placeholder="no limit"
              onChange={(event) =>
                setWanted({ ...wanted, [quota]: event.target.value.replace(/[^0-9]/g, "") })
              }
            />
            <span className="limit-held">
              {ABOUT[quota]}
              {HELD[quota] !== undefined && ` · holding ${org.holding[HELD[quota]]}`}
            </span>
          </label>
        ))}
      </div>
      <div className="limits-save">
        <button type="button" className="button" disabled={busy} onClick={() => void save()}>
          {busy ? "saving…" : "replace the set"}
        </button>
        {saved && <span className="note">saved — it bites the next call and the next register.</span>}
      </div>
      {refused !== null && <p className="note note-warn">{refused}</p>}
    </div>
  );
}

/** The org's limits as the fields hold them: a number as its digits, no limit as an empty box. */
function typed(org: OneOrg): Record<string, string> {
  return Object.fromEntries(
    QUOTAS.map((quota) => [quota, org.quotas[quota] === null ? "" : String(org.quotas[quota])]),
  );
}

/** The fields as the door takes them: digits as a number, an empty box as `null` — no limit. */
function asLimits(wanted: Record<string, string>): Partial<Record<Quota, number | null>> {
  return Object.fromEntries(
    QUOTAS.map((quota) => [quota, wanted[quota] === "" ? null : Number(wanted[quota])]),
  );
}
