/** Login: a person's org, email and password, for a key of their own in this tab. */

import { useState, type FormEvent, type ReactNode } from "react";

import { GatewayError } from "../../../shared/api";
import "../../shell/shell.css";
import { loginWithPassword, type Signed } from "../../lib/login";

/**
 * The one screen shown with no key, and it signs a person IN and nothing else.
 *
 * Making an org is not this page's business. The console is a control plane for an org that
 * already exists, it ships inside the runtime every self-hoster serves, and a registration form
 * in it would be one flag away from open registration on somebody else's box. So the way in is
 * `pinecall signup` or `POST /v1/signup`, and what arrives here is a person who has a key, a
 * password, or an invitation. It signs in to PRODUCTION: this is the gateway's console, and the
 * sandbox is watched on a developer's own machine (`pinecall serve`), where nothing signs in. A
 * production `pinecall run` prints a URL with a one-use code that skips even this card (lib/login.ts). The refusal is the gateway's sentence, verbatim: one for every wrong
 * thing, by design — a door that told them apart would tell a stranger which orgs exist.
 */
export function Login({ base, onSigned }: { base: string; onSigned: (signed: Signed) => void }): ReactNode {
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
      onSigned(await loginWithPassword(base, { org: org.trim(), email: email.trim(), password, env: "production" }));
    } catch (failed) {
      setRefused(failed instanceof GatewayError ? failed.message : String(failed));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="way">
      <form className="way-card" onSubmit={(event) => void submit(event)}>
        <div className="way-mark">
          <b>pinecall</b> <span>/</span> console
        </div>
        <h1 className="way-title">Sign in</h1>
        <p className="way-lede">The email and password you were invited with. Name the org only if you belong to several; you can switch later.</p>

        <div className="way-fields">
          <label className="way-field">
            <span className="way-label">email</span>
            <input
              className="way-input"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="username"
              autoFocus
              required
            />
          </label>
          <label className="way-field">
            <span className="way-label">password</span>
            <input
              className="way-input"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          <label className="way-field">
            <span className="way-label">org · optional</span>
            <input
              className="way-input"
              value={org}
              onChange={(event) => setOrg(event.target.value)}
              autoComplete="organization"
              placeholder="the oldest of yours when left empty"
            />
          </label>
        </div>

        <button className="way-go" type="submit" disabled={busy}>
          {busy ? "signing in…" : "sign in"}
        </button>

        {refused !== null && <p className="way-refused">{refused}</p>}

        <div className="way-else">
          <p>
            Invited and no password yet? Open the link in your invitation — it is where you choose one.
          </p>
          <p>
            Looking for the copy your terminal runs? That is the sandbox, on your own machine:{" "}
            <code>pinecall serve</code>.
          </p>
        </div>
      </form>
    </div>
  );
}

