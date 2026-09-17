/** The carrier panel: whose numbers reach the org — a Twilio account or a SIP peer — brought, shown, taken back. */

import { useState, type FormEvent, type ReactNode } from "react";

import { Button, Card, CardHead, Input, Label, Select } from "../../ui";
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
      <div className="ui-card num-carrier">
        <span className="num-kind">{carrier.kind.toUpperCase()}</span>
        <span className="num-carrier-standing">{carrier.kind === "twilio" ? "Account connected" : "SIP peer connected"}</span>
        <span className="num-carrier-account">{carrier.account}</span>
        <span className="num-carrier-moves">
          <Button size="xs" onClick={() => setReplacing(true)} disabled={busy}>
            Change
          </Button>
          <Button size="xs" kind="danger" onClick={() => void onDrop()} disabled={busy}>
            Disconnect
          </Button>
        </span>
      </div>
    );
  }
  return (
    <CarrierForm
      busy={busy}
      onBring={async (wanted) => {
        await onBring(wanted);
        setReplacing(false);
      }}
      onCancel={carrier === null ? null : () => setReplacing(false)}
    />
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
  const [outHost, setOutHost] = useState("");
  const [outTransport, setOutTransport] = useState<"auto" | "udp" | "tcp" | "tls">("auto");
  const [outUsername, setOutUsername] = useState("");
  const [outPassword, setOutPassword] = useState("");

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    const wanted: WantedCarrier =
      kind === "twilio"
        ? { kind, account_sid: accountSid.trim(), user: user.trim() || accountSid.trim(), secret }
        : {
            kind,
            username: username.trim(),
            password,
            addresses: addresses.split(/[\s,]+/).filter(Boolean),
            // A peer the box only receives from names no outbound host, and sends none of the four.
            ...(outHost.trim() === ""
              ? {}
              : {
                  outbound_host: outHost.trim(),
                  outbound_transport: outTransport,
                  ...(outUsername.trim() === "" ? {} : { outbound_username: outUsername.trim() }),
                  ...(outPassword === "" ? {} : { outbound_password: outPassword }),
                }),
          };
    void onBring(wanted);
  };

  return (
    <Card>
      <CardHead title="Connect your phone carrier">
        <div className="ui-segmented num-ways" role="group">
          <button type="button" className={kind === "twilio" ? "ui-segment ui-segment-on" : "ui-segment"} onClick={() => setKind("twilio")}>
            Twilio
          </button>
          <button type="button" className={kind === "sip" ? "ui-segment ui-segment-on" : "ui-segment"} onClick={() => setKind("sip")}>
            SIP peer
          </button>
        </div>
      </CardHead>
      <form onSubmit={submit}>
        <div className="num-fields num-fields-3">
          {kind === "twilio" ? (
            <>
              <div>
                <Label>Account SID</Label>
                <Input value={accountSid} onChange={(e) => setAccountSid(e.target.value)} placeholder="AC…" required autoComplete="off" />
              </div>
              <div>
                <Label>API key SID · or the account SID</Label>
                <Input value={user} onChange={(e) => setUser(e.target.value)} placeholder="SK…" autoComplete="off" />
              </div>
              <div>
                <Label>Secret · the key's, or the auth token</Label>
                <Input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} required autoComplete="off" />
              </div>
            </>
          ) : (
            <>
              <div>
                <Label>Username</Label>
                <Input value={username} onChange={(e) => setUsername(e.target.value)} required autoComplete="off" />
              </div>
              <div>
                <Label>Password</Label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="off" />
              </div>
              <div>
                <Label>Networks its calls come from · CIDR</Label>
                <Input value={addresses} onChange={(e) => setAddresses(e.target.value)} placeholder="203.0.113.0/24" required autoComplete="off" />
              </div>
            </>
          )}
        </div>
        {kind === "sip" && (
          <div className="num-outbound-group">
            <div className="num-outbound-title">Outbound</div>
            <div className="num-outbound-say">Where this box sends a call it places. Leave empty for a peer you only receive from.</div>
            <div className="num-fields num-fields-4 num-fields-flush">
              <div>
                <Label>Host · and port</Label>
                <Input value={outHost} onChange={(e) => setOutHost(e.target.value)} placeholder="sip.carrier.example:5060" autoComplete="off" />
              </div>
              <div>
                <Label>Transport</Label>
                <Select value={outTransport} onChange={(e) => setOutTransport(e.target.value as typeof outTransport)}>
                  <option value="auto">auto</option>
                  <option value="udp">udp</option>
                  <option value="tcp">tcp</option>
                  <option value="tls">tls</option>
                </Select>
              </div>
              <div>
                <Label>Username · else the one above</Label>
                <Input value={outUsername} onChange={(e) => setOutUsername(e.target.value)} autoComplete="off" />
              </div>
              <div>
                <Label>Password · else the one above</Label>
                <Input type="password" value={outPassword} onChange={(e) => setOutPassword(e.target.value)} autoComplete="off" />
              </div>
            </div>
          </div>
        )}
        <div className="num-actions">
          <Button kind="primary" type="submit" disabled={busy}>
            {busy ? "Connecting…" : "Connect"}
          </Button>
          {onCancel !== null && <Button onClick={onCancel}>Cancel</Button>}
          <span className="num-note">
            {kind === "twilio"
              ? "The account is checked once. The credentials are stored encrypted and never shown again."
              : "Calls are accepted only from these networks, with this username and password."}
          </span>
        </div>
      </form>
    </Card>
  );
}
