/** Login: a person's org, email and password, for a key of their own in this tab. */

import { useState, type FormEvent, type ReactNode } from "react";

import { GatewayError } from "../../lib/api";
import { loginWithPassword, type Signed } from "../../lib/login";
import "./login.css";

/**
 * The one screen shown with no key, and it signs a person IN and nothing else.
 *
 * Making an org is not this page's business. The console is a control plane for an org that
 * already exists, it ships inside the runtime every self-hoster serves, and a registration form
 * in it would be one flag away from open registration on somebody else's box. So the way in is
 * `pinecall signup` or `POST /v1/signup`, and what arrives here is a person who has a key or a
 * password. A `pinecall run` prints a URL with a one-use code that skips even this card
 * (lib/login.ts); cold, it asks for the three things a member has. The refusal is the gateway's
 * sentence, verbatim: one for every wrong thing, by design.
 */
export function Login({ base, onSigned }: { base: string; onSigned: (signed: Signed) => void }): ReactNode {
  return (
    <div className="login">
      <SignIn base={base} onSigned={onSigned} />
    </div>
  );
}

function SignIn({ base, onSigned }: { base: string; onSigned: (signed: Signed) => void }): ReactNode {
  const [org, setOrg] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setRefused(null);
    try {
      onSigned(await loginWithPassword(base, { org: org.trim(), email: email.trim(), password }));
    } catch (failed) {
      setRefused(failed instanceof GatewayError ? failed.message : String(failed));
    } finally {
      setBusy(false);
    }
  };

  return (
      <form className="login-card" onSubmit={(event) => void submit(event)}>
        <div className="login-brand">pinecall / console</div>
        <label className="login-field">
          <span className="login-label">org</span>
          <input className="input" value={org} onChange={(event) => setOrg(event.target.value)} autoComplete="organization" required />
        </label>
        <label className="login-field">
          <span className="login-label">email</span>
          <input className="input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" required />
        </label>
        <label className="login-field">
          <span className="login-label">password</span>
          <input className="input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
        </label>
        <button className="button button-accent" type="submit" disabled={busy}>
          {busy ? "signing in…" : "sign in"}
        </button>
        {refused !== null && <p className="login-refused">{refused}</p>}
        <p className="login-hint">
          Invited and no password yet? Open the link in your invitation first. Running the agent here? <span className="fixed">pinecall run</span> prints a URL that signs you in.
        </p>
        <p className="login-hint">
          No org yet? Make one from the terminal: <span className="fixed">pinecall signup</span> — it keeps the key and prints a link back here.
        </p>
      </form>
  );
}
