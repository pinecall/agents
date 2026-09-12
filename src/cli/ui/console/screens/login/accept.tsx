/** Accepting an invitation: the person the link names chooses a password, and this tab gets their first key. */

import { useState, type FormEvent, type ReactNode } from "react";

import { GatewayError } from "../../../shared/api";
import { acceptInvitation, type Signed } from "../../lib/login";
import "./login.css";

// The runtime's own floor for a password (auth/passwords.py): said here so a person is told before
// the round trip, and refused by the gateway in its own words if a shorter one gets through.
const AT_LEAST = 12;

/**
 * The card a person sees when they open the link an admin sent them. It knows their token from the
 * URL and nothing else about them — not their name, not their email — because the token IS the
 * right, and a card that showed whose it was would tell a stranger who found the link.
 */
export function Accept({
  base,
  token,
  onSigned,
}: {
  base: string;
  token: string;
  onSigned: (signed: Signed) => void;
}): ReactNode {
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (password !== again) {
      setRefused("the two passwords differ");
      return;
    }
    setBusy(true);
    setRefused(null);
    try {
      onSigned(await acceptInvitation(base, token, password));
    } catch (failed) {
      setRefused(failed instanceof GatewayError ? failed.message : String(failed));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <form className="login-card" onSubmit={(event) => void submit(event)}>
        <div className="login-brand">pinecall / console</div>
        <p className="login-hint">
          You were invited. Choose the password you will sign in with; the link opens once and dies in a week.
        </p>
        <label className="login-field">
          <span className="login-label">password · {AT_LEAST} characters at least</span>
          <input
            className="input"
            type="password"
            value={password}
            minLength={AT_LEAST}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            autoFocus
            required
          />
        </label>
        <label className="login-field">
          <span className="login-label">again</span>
          <input
            className="input"
            type="password"
            value={again}
            onChange={(event) => setAgain(event.target.value)}
            autoComplete="new-password"
            required
          />
        </label>
        <button className="button button-accent" type="submit" disabled={busy}>
          {busy ? "joining…" : "join"}
        </button>
        {refused !== null && <p className="login-refused">{refused}</p>}
      </form>
    </div>
  );
}
