/** The carrier panel: whose numbers reach the org — a Twilio account or a SIP peer — brought, shown, taken back. */

import { useState, type FormEvent, type ReactNode } from "react";

import type { Carrier, WantedCarrier } from "./door";

/** What the panel is told: the carrier standing, and the two moves. */
export interface CarrierPanelProps {
  carrier: Carrier | null;
  busy: boolean;
  onBring: (wanted: WantedCarrier) => Promise<void>;
  onDrop: () => Promise<void>;
}

/**
 * One carrier per org. Standing, it is named by kind and account and never a secret — the
 * gateway seals the credentials under the vault key and answers the name alone. Absent, the form
 * offers the two kinds the runtime knows: a Twilio account (verified once, on bringing) or a SIP
 * peer with its own username, password and the networks its calls come from.
 */
export function CarrierPanel({ carrier, busy, onBring, onDrop }: CarrierPanelProps): ReactNode {
  const [replacing, setReplacing] = useState(false);
  if (carrier !== null && !replacing) {
    return (
      <section className="numbers-carrier">
        <h2 className="numbers-heading">Phone carrier</h2>
        <div className="numbers-carrier-standing">
          <span className="numbers-kind fixed">{carrier.kind}</span>
          <span>{carrier.kind === "twilio" ? "Twilio account connected" : "SIP peer connected"}</span>
          <span className="numbers-dim fixed">{carrier.account}</span>
          <span className="numbers-carrier-moves">
            <button type="button" className="link" onClick={() => setReplacing(true)} disabled={busy}>change</button>
            <button type="button" className="link" onClick={() => void onDrop()} disabled={busy}>disconnect</button>
          </span>
        </div>
      </section>
    );
  }
  return (
    <section className="numbers-carrier">
      <CarrierForm
        busy={busy}
        onBring={async (wanted) => {
          await onBring(wanted);
          setReplacing(false);
        }}
        onCancel={carrier === null ? null : () => setReplacing(false)}
      />
    </section>
  );
}

function CarrierForm({ busy, onBring, onCancel }: { busy: boolean; onBring: (wanted: WantedCarrier) => Promise<void>; onCancel: (() => void) | null }): ReactNode {
  const [kind, setKind] = useState<"twilio" | "sip">("twilio");
  const [accountSid, setAccountSid] = useState("");
  const [user, setUser] = useState("");
  const [secret, setSecret] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [addresses, setAddresses] = useState("");

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    const wanted: WantedCarrier =
      kind === "twilio"
        ? { kind, account_sid: accountSid.trim(), user: user.trim() || accountSid.trim(), secret }
        : { kind, username: username.trim(), password, addresses: addresses.split(/[\s,]+/).filter(Boolean) };
    void onBring(wanted);
  };

  return (
    <form className="numbers-form" onSubmit={submit}>
      <div className="numbers-form-head">
        <h2 className="numbers-heading">Connect your phone carrier</h2>
        <span className="tabs">
          <button type="button" className={kind === "twilio" ? "tab is-active" : "tab"} onClick={() => setKind("twilio")}>Twilio</button>
          <button type="button" className={kind === "sip" ? "tab is-active" : "tab"} onClick={() => setKind("sip")}>SIP peer</button>
        </span>
      </div>
      {kind === "twilio" ? (
        <div className="numbers-fields">
          <label className="numbers-field"><span>account SID</span><input className="input fixed" value={accountSid} onChange={(e) => setAccountSid(e.target.value)} placeholder="AC…" required autoComplete="off" /></label>
          <label className="numbers-field"><span>API key SID <em>or leave it: the account SID</em></span><input className="input fixed" value={user} onChange={(e) => setUser(e.target.value)} placeholder="SK…" autoComplete="off" /></label>
          <label className="numbers-field"><span>secret <em>the key's, or the auth token</em></span><input className="input fixed" type="password" value={secret} onChange={(e) => setSecret(e.target.value)} required autoComplete="off" /></label>
        </div>
      ) : (
        <div className="numbers-fields">
          <label className="numbers-field"><span>username</span><input className="input fixed" value={username} onChange={(e) => setUsername(e.target.value)} required autoComplete="off" /></label>
          <label className="numbers-field"><span>password</span><input className="input fixed" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="off" /></label>
          <label className="numbers-field"><span>networks its calls come from <em>CIDR, comma separated</em></span><input className="input fixed" value={addresses} onChange={(e) => setAddresses(e.target.value)} placeholder="203.0.113.0/24" required autoComplete="off" /></label>
        </div>
      )}
      <div className="numbers-form-foot">
        <button className="button button-accent" type="submit" disabled={busy}>{busy ? "connecting…" : "Connect"}</button>
        {onCancel !== null && <button type="button" className="link" onClick={onCancel}>cancel</button>}
        <span className="numbers-note fixed">
          {kind === "twilio"
            ? "The account is checked once. The credentials are stored encrypted and never shown again."
            : "Calls are accepted only from these networks, with this username and password."}
        </span>
      </div>
    </form>
  );
}
