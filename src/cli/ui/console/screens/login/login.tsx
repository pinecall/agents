/** Login: a person's email, password and — when they belong to several — the workspace, for a key of their own in this tab. */

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

import { GatewayError } from "../../../shared/api";
import { discovered } from "../../../shared/the-floor";
import { gatewayHasSso, googleUrl, loginWithPassword, orgsForPassword, ssoOrgsFor, ssoUrl, type Opens, type Signed, type SsoOrg } from "../../lib/login";
import { WayIn } from "./way-in";

/**
 * The one screen shown with no key, and it signs a person IN and nothing else.
 *
 * Making an org is not this page's business. The console is a control plane for an org that
 * already exists, it ships inside the runtime every self-hoster serves, and a registration form
 * in it would be one flag away from open registration on somebody else's box. So an org is made by
 * whoever runs the gateway, and what arrives here is a person who has a key, a
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
  // A provider that turned somebody away sends them back here with its sentence in the address.
  const [refused, setRefused] = useState<string | null>(() => new URLSearchParams(window.location.search).get("refused"));
  const [forgot, setForgot] = useState(false);
  const [hasGoogle, setHasGoogle] = useState(false);
  // The orgs these credentials open, asked once per email and password — the door shares the
  // login's throttle, so it is asked when the password is left, not on every key pressed.
  const [opens, setOpens] = useState<Opens[] | null>(null);
  const [known, setKnown] = useState(true);
  const asked = useRef("");
  // Signing in with a provider: drawn only on a gateway that has the door, and asked by address.
  const [hasSso, setHasSso] = useState(false);
  const [ssoOrgs, setSsoOrgs] = useState<SsoOrg[] | null>(null);
  const [ssoNote, setSsoNote] = useState<string | null>(null);
  const [ssoBusy, setSsoBusy] = useState(false);

  useEffect(() => {
    let gone = false;
    void gatewayHasSso(base).then((has) => {
      if (!gone) setHasSso(has);
    });
    // Drawn only on a gateway whose operator wired it: the gateway says so before anybody holds a key.
    void discovered(base).then((said) => {
      if (!gone) setHasGoogle(said.google === true);
    });
    return () => {
      gone = true;
    };
  }, [base]);

  const withSso = async (): Promise<void> => {
    setSsoNote(null);
    setSsoOrgs(null);
    if (email.trim() === "") {
      setSsoNote("Type your work email first: it says which workspace signs you in.");
      return;
    }
    setSsoBusy(true);
    try {
      const found = await ssoOrgsFor(base, email.trim());
      const only = found[0];
      if (found.length === 1 && only !== undefined) window.location.assign(ssoUrl(base, only.slug ?? only.org));
      else if (found.length === 0) setSsoNote("No workspace signs in with a provider for that address.");
      else setSsoOrgs(found);
    } catch (failed) {
      setSsoNote(failed instanceof GatewayError ? failed.message : String(failed));
    } finally {
      setSsoBusy(false);
    }
  };

  const askOrgs = async (): Promise<void> => {
    const pair = `${email.trim()}\n${password}`;
    if (email.trim() === "" || password === "" || pair === asked.current) return;
    asked.current = pair;
    try {
      const listed = await orgsForPassword(base, email.trim(), password);
      if (listed === null) {
        setKnown(false);
        return;
      }
      setOpens(listed);
      const first = listed[0];
      if (listed.length > 0 && !listed.some((one) => (one.slug ?? one.org) === org) && first !== undefined) setOrg(first.slug ?? first.org);
    } catch {
      // A wrong password: the sign-in says so, in the gateway's own sentence, when it is pressed.
      setOpens(null);
    }
  };

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

        <div className="login-label-row">
          <label className="login-label" htmlFor="login-password">
            Password
          </label>
          <button type="button" className="login-link" onClick={() => setForgot(!forgot)}>
            Forgot password
          </button>
        </div>
        <input
          id="login-password"
          className="login-input login-input-secret"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          onBlur={() => void askOrgs()}
          autoComplete="current-password"
          required
        />
        {forgot && (
          <p className="login-forgot">
            Ask an admin of your workspace: from Team they hand you a one-use link where you choose a new password.
          </p>
        )}

        {opens !== null && opens.length > 0 ? (
          <>
            <label className="login-label" htmlFor="login-org">
              Workspace
            </label>
            <div className="login-workspace">
              <span className="login-workspace-tile">{(org[0] ?? "·").toUpperCase()}</span>
              <select id="login-org" className="login-workspace-input" value={org} onChange={(event) => setOrg(event.target.value)} disabled={opens.length === 1}>
                {opens.map((one) => (
                  <option key={one.org} value={one.slug ?? one.org}>
                    {one.name ?? one.slug ?? one.org}
                  </option>
                ))}
              </select>
            </div>
          </>
        ) : (
          !known && (
            <>
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
            </>
          )
        )}

        <button className="login-go" type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>

        {refused !== null && <p className="login-refused">{refused}</p>}

        {(hasSso || hasGoogle) && (
          <div className="login-or">
            <span className="login-or-line" />
            <span className="login-or-word">or</span>
            <span className="login-or-line" />
          </div>
        )}

        {hasGoogle && (
          <button type="button" className="login-sso login-google" onClick={() => window.location.assign(googleUrl(base))}>
            <GoogleGlyph />
            Continue with Google
          </button>
        )}

        {hasSso && (
          <>
            <button type="button" className="login-sso" disabled={ssoBusy} onClick={() => void withSso()}>
              <span className="login-sso-glyph" />
              {ssoBusy ? "Looking for your workspace…" : "Continue with SSO"}
            </button>
            {ssoOrgs !== null && (
              <div className="login-sso-pick">
                <label className="login-label" htmlFor="login-sso-org">
                  Which workspace
                </label>
                <div className="login-workspace">
                  <span className="login-workspace-tile">·</span>
                  <select
                    id="login-sso-org"
                    className="login-workspace-input"
                    defaultValue=""
                    onChange={(event) => event.target.value !== "" && window.location.assign(ssoUrl(base, event.target.value))}
                  >
                    <option value="" disabled>
                      Choose one…
                    </option>
                    {ssoOrgs.map((one) => (
                      <option key={one.org} value={one.slug ?? one.org}>
                        {one.name ?? one.slug ?? one.org}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
            {ssoNote !== null && <p className="login-sso-note">{ssoNote}</p>}
          </>
        )}

        <p className="login-note">Invited and no password yet? Open the link in your invitation — that is where you choose one.</p>
      </form>
    </WayIn>
  );
}

// Google's own mark, in Google's own colours: the one place a colour is not this console's.
function GoogleGlyph(): ReactNode {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
