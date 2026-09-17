/** Keys: the API keys this org's machines run on — issued here, shown once, revoked from a row. */

import { useEffect, useState, type FormEvent, type ReactNode } from "react";

import { GatewayError } from "../../../shared/api";
import { useCredentials } from "../../../shared/credentials";
import { scopesLine } from "../../lib/scopes";
import { Button, Card, CardHead, Empty, Input, Page, PageHead, Pill, Refused, Select, TableHead, TextAction } from "../../ui";
import { issueKey, readKeys, revokeKey, type Issued, type Listed } from "./door";
import "./keys.css";

// The shape a deployment has, and the default this form opens on: the key a server runs on holds
// the app socket and nothing else. The other world is a choice, made out loud.
const HOLDING = "app";
const PRODUCTION = "production";
const SANDBOX = "sandbox";

// What a key with no person on it is. Every key issued here is one: people get keys by logging in.
const A_MACHINE = "a machine";

const COLUMNS = "minmax(0,1fr) 96px 130px minmax(0,1.5fr) 92px";

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
  const [copied, setCopied] = useState(false);
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
    if (label.trim() === "") {
      setRefused("Name what the key is for — the server or the job it will run on.");
      return;
    }
    setBusy(true);
    setRefused(null);
    try {
      setMinted(await issueKey(credentials, { label: label.trim(), env, scopes: [HOLDING] }));
      setCopied(false);
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

  const copy = async (key: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(key);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Page tight>
      <PageHead
        title="Keys"
        ledeWidth={640}
        lede="The keys this org's machines run on. The key you hold by being logged in does not hold an agent in production — the process on the box does."
      />

      <Card pad>
        <form className="keys-form" onSubmit={(event) => void issue(event)}>
          <div className="keys-label-field">
            <label className="ui-label" htmlFor="keys-label">
              Issue one for a machine
            </label>
            <Input id="keys-label" value={label} placeholder="prod server" onChange={(event) => setLabel(event.target.value)} />
          </div>
          <Select className="keys-env-select" value={env} onChange={(event) => setEnv(event.target.value)} aria-label="which world it opens">
            <option value={PRODUCTION}>production</option>
            <option value={SANDBOX}>sandbox</option>
          </Select>
          <Button type="submit" kind="primary" size="form" disabled={busy}>
            {busy ? "Issuing…" : "Issue"}
          </Button>
          <div className="keys-form-note">It will hold the app socket and nothing else, and name nobody.</div>
        </form>
      </Card>

      {minted !== null && (
        <Card>
          <CardHead
            title={`${minted.label ?? "A new key"} · ${minted.env}`}
            meta="shown once"
            action={
              <span className="keys-minted-actions">
                <Button size="xs" onClick={() => void copy(minted.key)}>
                  {copied ? "Copied" : "Copy"}
                </Button>
                <Button size="xs" onClick={() => setMinted(null)}>
                  Done
                </Button>
              </span>
            }
          />
          <pre className="ui-code">{minted.key}</pre>
          <div className="keys-minted-warn">Copy it now: the gateway keeps its fingerprint, and this key is never shown again.</div>
        </Card>
      )}

      <Refused>{refused}</Refused>

      <Card>
        {rows !== null && rows.length === 0 ? (
          <Empty>No key of this org yet: the first one is what a deploy runs on.</Empty>
        ) : (
          <>
            <TableHead columns={COLUMNS} labels={["Name", "Env", "Who holds it", "May do", "Status>"]} />
            {(rows ?? []).map((row) => (
              <Row key={row.fingerprint} row={row} stop={stop} />
            ))}
          </>
        )}
      </Card>
    </Page>
  );
}

/** One key as a person reads it: what it is for, where it opens, whose it is, and its standing. */
function Row({ row, stop }: { row: Listed; stop: (fingerprint: string) => Promise<void> }): ReactNode {
  const [sure, setSure] = useState(false);
  const revoked = row.revoked_at !== null;
  const may = scopesLine(row.scopes);
  return (
    <div className="ui-table-row keys-row" style={{ gridTemplateColumns: COLUMNS }} onMouseLeave={() => setSure(false)}>
      <span className={revoked ? "keys-name keys-name-gone" : "keys-name"} title={row.fingerprint}>
        {row.label ?? row.fingerprint.slice(0, 12)}
      </span>
      <span className="ui-cell-faint">{row.env}</span>
      <span className="ui-cell-ink ui-clip">{row.name ?? A_MACHINE}</span>
      <span className="keys-scopes">{may === "everything" ? may : row.scopes.join(" · ")}</span>
      <span className="ui-cell-end">
        {!revoked && (
          <span className={sure ? "keys-revoke keys-revoke-sure" : "keys-revoke"}>
            <TextAction danger onClick={() => (sure ? void stop(row.fingerprint) : setSure(true))}>
              {sure ? "Revoke it" : "Revoke"}
            </TextAction>
          </span>
        )}
        {revoked ? <Pill tone="gray">revoked</Pill> : <Pill tone="green">active</Pill>}
      </span>
    </div>
  );
}
