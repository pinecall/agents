/** Login: a person's org, email and password, for a key of their own in this tab. */

import { useState, type FormEvent, type ReactNode } from "react";

import { GatewayError } from "../../lib/api";
import { loginWithPassword, type Signed } from "../../lib/login";
import { SignUp } from "./signup";
import "./login.css";

/**
 * The one screen shown with no key. A `pinecall run` prints a URL with a one-use code that skips
 * it (lib/login.ts); a person opening the console cold types the three things a member has. The
 * refusal is the gateway's sentence, verbatim: one for every wrong thing, by design. Where the
 * gateway is Pinecall's cloud, the card turns over into a sign-up (signup.tsx); on a box of its
 * own there is nothing to turn to, since its operator is who makes orgs and invites people.
 */
export function Login({ base, cloud, onSigned }: { base: string; cloud: boolean; onSigned: (signed: Signed) => void }): ReactNode {
  const [signingUp, setSigningUp] = useState(false);
  return (
    <div className="login">
      {signingUp && cloud ? (
        <SignUp base={base} onSigned={onSigned} onSignInInstead={() => setSigningUp(false)} />
      ) : (
        <SignIn base={base} cloud={cloud} onSigned={onSigned} onSignUpInstead={() => setSigningUp(true)} />
      )}
    </div>
  );
}

function SignIn({ base, cloud, onSigned, onSignUpInstead }: { base: string; cloud: boolean; onSigned: (signed: Signed) => void; onSignUpInstead: () => void }): ReactNode {
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
        {cloud && (
          <p className="login-hint">
            New here? <button type="button" className="link login-switch" onClick={onSignUpInstead}>create an account</button> — forty-five minutes on us, no card.
          </p>
        )}
      </form>
  );
}
