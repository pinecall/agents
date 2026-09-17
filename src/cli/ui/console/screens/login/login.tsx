/** Login: a person's email, password and — when they belong to several — the workspace, for a key of their own in this tab. */

import { useState, type FormEvent, type ReactNode } from "react";

import { GatewayError } from "../../../shared/api";
import { loginWithPassword, type Signed } from "../../lib/login";
import { WayIn } from "./way-in";

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
    <WayIn>
      <form onSubmit={(event) => void submit(event)}>
        <h1 className="login-title">Sign in</h1>
        <p className="login-lede">Use the email and password you were invited with.</p>

        <label className="login-label" htmlFor="login-email">
          Email
        </label>
        <input
          id="login-email"
          className="login-input"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="username"
          autoFocus
          required
        />

        <label className="login-label" htmlFor="login-password">
          Password
        </label>
        <input
          id="login-password"
          className="login-input login-input-secret"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          required
        />

        <div className="login-label-row">
          <label className="login-label" htmlFor="login-org">
            Workspace
          </label>
          <span className="login-hint">only if you belong to several</span>
        </div>
        <div className="login-workspace">
          <span className="login-workspace-tile">{(org.trim()[0] ?? "·").toUpperCase()}</span>
          <input
            id="login-org"
            className="login-workspace-input"
            value={org}
            onChange={(event) => setOrg(event.target.value)}
            autoComplete="organization"
            placeholder="the oldest of yours"
          />
        </div>

        <button className="login-go" type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>

        {refused !== null && <p className="login-refused">{refused}</p>}

        <p className="login-note">Invited and no password yet? Open the link in your invitation — that is where you choose one.</p>
      </form>
    </WayIn>
  );
}
