/** Tokens: a person's own keys, and the servers' — made here, shown once, revoked from a row. */

import { useEffect, useState, type FormEvent, type ReactNode } from "react";

import { GatewayError } from "../../../shared/api";
import { useCredentials } from "../../../shared/credentials";
import { dayAndTime } from "../../lib/format";
import { useScopes, useWhoami } from "../../lib/whoami";
import { Button, Card, CardHead, Empty, Input, Page, PageHead, Pill, Refused, Select, TableHead, TextAction } from "../../ui";
import { makeToken, readTokens, revokeToken, type Issued, type Listed } from "./door";
import "./tokens.css";

type World = "production" | "sandbox";

const COLUMNS = "minmax(0,1.2fr) 96px minmax(0,1fr) 150px 92px";

/**
 * The screen.
 *
 * A person holds one key per device — the laptop's, written into a project by `pinecall link` — and
 * what it opens is their role and their production switch. A server holds none of theirs: it runs
 * on a token of the ORG's, made here for one world, which stays when the person who made it leaves.
 * It is shown once, by the card below, and kept by nothing: the table has its sha256.
 */
export function Tokens(): ReactNode {
  const credentials = useCredentials();
  const whoami = useWhoami();
  const scopes = useScopes();
  const [rows, setRows] = useState<Listed[] | null>(null);
  const [label, setLabel] = useState("");
  const [env, setEnv] = useState<World>("production");
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<Issued | null>(null);
  const [copied, setCopied] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  // A server's token is made by somebody who writes agents (`app`), and production's by somebody
  // their org lets act there. The gateway refuses the rest in a sentence; the form does not offer it.
  const makes = scopes !== null && scopes.includes("app");
  const inProduction = whoami?.production === true;
  const world: World = inProduction ? env : "sandbox";

  const reread = async (): Promise<void> => setRows(await readTokens(credentials));

  useEffect(() => {
    let gone = false;
    readTokens(credentials).then(
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

  const make = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (label.trim() === "") {
      setRefused("Name what the token is for — the server or the job it will run on.");
      return;
    }
    setBusy(true);
    setRefused(null);
    try {
      setMade(await makeToken(credentials, { label: label.trim(), env: world }));
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
      await revokeToken(credentials, fingerprint);
      await reread();
    } catch (failed) {
      setRefused(failed instanceof GatewayError ? failed.message : String(failed));
    }
  };

  const copy = async (line: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(line);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Page tight>
      <PageHead
        title="Tokens"
        ledeWidth={640}
        lede="Your own keys — one per device, what `pinecall link` writes into a project — and the tokens this org's servers run on. A server's token is the org's: it opens one world, and it stays when the person who made it leaves."
      />

      {makes && (
        <Card pad>
          <form className="keys-form" onSubmit={(event) => void make(event)}>
            <div className="keys-label-field">
              <label className="ui-label" htmlFor="token-label">
                New server token
              </label>
              <Input id="token-label" value={label} placeholder="maravilla web" onChange={(event) => setLabel(event.target.value)} />
            </div>
            <Select className="keys-env-select" value={world} onChange={(event) => setEnv(event.target.value as World)} aria-label="which world it opens">
              <option value="production" disabled={!inProduction}>
                production
              </option>
              <option value="sandbox">sandbox</option>
            </Select>
            <Button type="submit" kind="primary" size="form" disabled={busy}>
              {busy ? "Making…" : "Create"}
            </Button>
            <div className="keys-form-note">
              {inProduction ? "It holds the agent in that world and pushes its knowledge base in a release — nothing else." : "Production's is made by somebody your org lets act in production."}
            </div>
          </form>
        </Card>
      )}

      {made !== null && (
        <Card>
          <CardHead
            title={`${made.label ?? "A new token"} · ${made.env}`}
            meta="shown once"
            action={
              <span className="keys-minted-actions">
                <Button size="xs" onClick={() => void copy(`PINECALL_KEY=${made.key}`)}>
                  {copied ? "Copied" : "Copy"}
                </Button>
                <Button size="xs" onClick={() => setMade(null)}>
                  Done
                </Button>
              </span>
            }
          />
          <pre className="ui-code">PINECALL_KEY={made.key}</pre>
          <div className="keys-minted-warn">Copy it now and put it in your server's secrets: the gateway keeps its fingerprint, and this token is never shown again.</div>
        </Card>
      )}

      <Refused>{refused}</Refused>

      <Card>
        {rows !== null && rows.length === 0 ? (
          <Empty>No token yet. A server's is made above; yours is made by `pinecall link`.</Empty>
        ) : (
          <>
            <TableHead columns={COLUMNS} labels={["Name", "World", "Whose", "Last used", "Status>"]} />
            {(rows ?? []).map((row) => (
              <Row key={row.fingerprint} row={row} stop={stop} />
            ))}
          </>
        )}
      </Card>
    </Page>
  );
}

/** One token as a person reads it: what it is for, which world, whose, when it was last used. */
function Row({ row, stop }: { row: Listed; stop: (fingerprint: string) => Promise<void> }): ReactNode {
  const [sure, setSure] = useState(false);
  const revoked = row.revoked_at !== null;
  const whose = row.kind === "person" ? `${row.name ?? "a person"} · their own` : `the org's${row.created_by === null ? "" : ` · made by ${row.created_by}`}`;
  return (
    <div className="ui-table-row keys-row" style={{ gridTemplateColumns: COLUMNS }} onMouseLeave={() => setSure(false)}>
      <span className={revoked ? "keys-name keys-name-gone" : "keys-name"} title={row.fingerprint}>
        {row.label ?? row.fingerprint.slice(0, 12)}
      </span>
      <span className="ui-cell-faint">{row.env ?? "—"}</span>
      <span className="ui-cell-ink ui-clip">{whose}</span>
      <span className="ui-cell-faint">{row.last_used_at === null ? "never" : dayAndTime(Date.parse(row.last_used_at) / 1000)}</span>
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
