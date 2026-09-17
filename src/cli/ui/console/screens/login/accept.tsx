/** Accepting an invitation: the person the link names chooses a password, and this tab gets their first key. */

import { useEffect, useState, type FormEvent, type ReactNode } from "react";

import { GatewayError } from "../../../shared/api";
import { discovered } from "../../../shared/the-floor";
import { acceptInvitation, type Signed } from "../../lib/login";
import { WayIn } from "./way-in";

/**
 * The card a person sees when they open the link an admin sent them.
 *
 * It knows their token from the URL and nothing else about them — not their name, not their email
 * — because the token IS the right, and a card that showed whose it was would tell a stranger who
 * found the link. How long a password must be is the BOX's rule and not this page's: it is read
 * off `/.well-known/pinecall`, which takes no key, so the card says the rule this gateway actually
 * enforces rather than a number copied here that drifts the day an operator moves it.
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
  const [floor, setFloor] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);

  useEffect(() => {
    let gone = false;
    void discovered(base).then((said) => {
      if (!gone) setFloor(said.min_password);
    });
    return () => {
      gone = true;
    };
  }, [base]);

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (password !== again) {
      setRefused("The two passwords differ.");
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
    <WayIn>
      <form onSubmit={(event) => void submit(event)}>
        <h1 className="login-title">Choose your password</h1>
        <p className="login-lede">This link came from an invitation, or from an admin resetting your password. It opens once; the password you pick here is the one you sign in with from now on.</p>

        <div className="login-label-row">
          <label className="login-label" htmlFor="accept-password">
            Password
          </label>
          {floor !== null && floor > 0 && <span className="login-hint">{floor} characters at least</span>}
        </div>
        <input
          id="accept-password"
          className="login-input login-input-secret"
          type="password"
          value={password}
          minLength={floor ?? undefined}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="new-password"
          autoFocus
          required
        />

        <label className="login-label" htmlFor="accept-again">
          Again
        </label>
        <input
          id="accept-again"
          className="login-input login-input-secret"
          type="password"
          value={again}
          onChange={(event) => setAgain(event.target.value)}
          autoComplete="new-password"
          required
        />

        <button className="login-go" type="submit" disabled={busy} style={{ marginTop: 8 }}>
          {busy ? "Joining…" : "Join"}
        </button>

        {refused !== null && <p className="login-refused">{refused}</p>}
      </form>
    </WayIn>
  );
}
