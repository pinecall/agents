/** Keys: the API keys this org's machines run on — issued here, shown once, revoked from a row. */

import { useEffect, useState, type FormEvent, type ReactNode } from "react";

import { GatewayError } from "../../lib/api";
import { useCredentials } from "../../lib/credentials";
import { Nothing } from "../../shell/nothing";
import { issueKey, readKeys, revokeKey, type Issued, type Listed } from "./door";
import "./keys.css";

// The shape a deployment has, and the default this form opens on: the key a server runs on holds
// the app socket and nothing else. The other worlds and scopes are a choice, made out loud.
const HOLDING = "app";
const PRODUCTION = "production";
const DEVELOPMENT = "development";

// What a key with no person on it is. Every key issued here is one: people get keys by logging in.
const A_MACHINE = "a machine";

/**
 * The screen.
 *
 * Your own key does not hold `app` in production — a deployed agent is held by the process
 * somebody put on a box, not by whoever is logged in — so this is where the key that box runs on
 * comes from. It is shown once, by the card below, and kept by nothing: the table has its sha256.
 */
export function Keys(): ReactNode {
  const credentials = useCredentials();
  const [rows, setRows] = useState<Listed[] | null>(null);
  const [label, setLabel] = useState("");
  const [env, setEnv] = useState(PRODUCTION);
  const [busy, setBusy] = useState(false);
  const [minted, setMinted] = useState<Issued | null>(null);
  const [refused, setRefused] = useState<string | null>(null);

  const reread = async (): Promise<void> => setRows(await readKeys(credentials));

  useEffect(() => {
    let gone = false;
    readKeys(credentials).then(
      (kept) => {
        if (!gone) setRows(kept);
      },
      (failed: unknown) => {
        if (!gone) setRefused(failed instanceof Error ? failed.message : String(failed));
      },
    );
    return () => {
      gone = true;
    };
  }, [credentials]);

  const issue = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setRefused(null);
    try {
      setMinted(await issueKey(credentials, { label: label.trim(), env, scopes: [HOLDING] }));
      setLabel("");
      await reread();
    } catch (failed) {
      setRefused(failed instanceof GatewayError ? failed.message : String(failed));
    } finally {
      setBusy(false);
    }
  };

  const stop = async (fingerprint: string): Promise<void> => {
    setRefused(null);
    try {
      await revokeKey(credentials, fingerprint);
      await reread();
    } catch (failed) {
      setRefused(failed instanceof GatewayError ? failed.message : String(failed));
    }
  };

  return (
    <section className="page">
      <div className="page-eyebrow fixed">keys</div>
      <h1 className="page-title">Keys</h1>
      <p className="page-lede">
        The keys this org's machines run on. A key you hold by being logged in does not hold an
        agent in production — the process on the box does — so the one that answers your numbers is
        issued here, exported in that box's environment, and revoked from its row when it is over.
      </p>

      <div className="panel keys-issue">
        <p className="panel-title">issue one for a machine</p>
        <form className="keys-form" onSubmit={(event) => void issue(event)}>
          <input
            className="input"
            value={label}
            placeholder="prod server"
            onChange={(event) => setLabel(event.target.value)}
          />
          <select className="input" value={env} onChange={(event) => setEnv(event.target.value)}>
            <option value={PRODUCTION}>production</option>
            <option value={DEVELOPMENT}>development</option>
          </select>
          <button type="submit" className="button" disabled={busy || label.trim() === ""}>
            {busy ? "issuing…" : "issue"}
          </button>
        </form>
        <p className="note">It will hold the app socket and nothing else, and name nobody.</p>
      </div>

      {minted !== null && (
        <div className="panel keys-minted">
          <p className="panel-title">{minted.label} · {minted.env}</p>
          <code className="keys-clear fixed">{minted.key}</code>
          <p className="note note-warn">
            Copy it now: the gateway keeps the fingerprint, and this key is never shown again.
          </p>
          <button type="button" className="link" onClick={() => setMinted(null)}>
            done
          </button>
        </div>
      )}

      {refused !== null && <p className="note note-warn">{refused}</p>}

      {rows !== null && rows.length === 0 && (
        <div className="keys-nothing">
          <Nothing>No key of this org yet: the first one is what a deploy runs on.</Nothing>
        </div>
      )}

      {rows !== null && rows.length > 0 && (
        <ul className="panel keys-list">
          {rows.map((row) => (
            <Row key={row.fingerprint} row={row} stop={stop} />
          ))}
        </ul>
      )}
    </section>
  );
}

/** One key as a person reads it: what it is for, where it opens, whose it is, and its standing. */
function Row({ row, stop }: { row: Listed; stop: (fingerprint: string) => Promise<void> }): ReactNode {
  const revoked = row.revoked_at !== null;
  return (
    <li className={revoked ? "keys-one keys-gone" : "keys-one"}>
      <span className="keys-label">{row.label ?? row.fingerprint.slice(0, 12)}</span>
      <span className="keys-env fixed">{row.env}</span>
      <span className="keys-whose">{row.name ?? A_MACHINE}</span>
      <span className="keys-scopes fixed">{row.scopes.join(" · ")}</span>
      {revoked ? (
        <span className="keys-standing">revoked</span>
      ) : (
        <button type="button" className="link" onClick={() => void stop(row.fingerprint)}>
          revoke
        </button>
      )}
    </li>
  );
}
