/** The way into the operator's page: a person who runs this box, or the box's own key. */

import { useState, type FormEvent, type ReactNode } from "react";

import { GatewayError } from "../../../shared/api";
import { theBox } from "../../lib/the-box";
import { signedIn } from "../../lib/way-in";

// What a key that opened `/v1/login` but not `/v1/ops/whoami` means, said as the thing to do about
// it rather than as a status: the person is real and their password was right, and they are simply
// not one of this box's operators. The gateway's own 401 says the same in the box's words; this is
// said before it, because the page knows it asked with a key it had just minted.
const NOT_AN_OPERATOR =
  "that is a real account, and it does not run this box. Whoever does can grant it: `pinecall-runtime orgs operator <org> <email>`.";

/** Which of the two the card is asking for. A person is the way in; the key is the way back in. */
type How = "person" | "key";

/**
 * The screen.
 *
 * Being an `admin` of an org is NOT what opens this page: an admin owns a tenant, an operator owns
 * the machine every tenant is on, and the box would be handed over by the first org that invited
 * itself one. So a person opens it by being MADE an operator (runtime 0020), and their ordinary
 * login is what they type — the same email and password the console takes.
 *
 * The box's own key is the other way, and the one a box starts with: it is what the operator holds
 * before any person exists, and what grants the first person. Both are proved at
 * `/v1/ops/whoami` before anything is kept.
 */
export function Login({
  base,
  onProved,
}: {
  base: string;
  onProved: (key: string) => void;
}): ReactNode {
  const [how, setHow] = useState<How>("person");
  const [org, setOrg] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);

  const enter = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setRefused(null);
    try {
      const proved =
        how === "key"
          ? key.trim()
          : await signedIn(base, { org: org.trim(), email: email.trim(), password });
      // Proved at the box's own door before it is kept, whichever way it was got: a key that
      // opens nothing is a page somebody would trust tomorrow and a refusal they would not read.
      await theBox({ base, key: proved });
      setPassword("");
      setKey("");
      onProved(proved);
    } catch (failed) {
      setRefused(said(failed, how));
    } finally {
      setBusy(false);
    }
  };

  const ready = how === "key" ? key.trim() !== "" : org.trim() !== "" && email.trim() !== "" && password !== "";
  return (
    <div className="way">
      <form className="way-card" onSubmit={(event) => void enter(event)}>
        <div className="way-mark">
          <b>pinecall</b> <span>/</span> admin
        </div>
        <h1 className="way-title">{how === "key" ? "The box's own key" : "Sign in"}</h1>
        <p className="way-lede">
          {how === "key"
            ? "PINECALL_OPS_KEY, out of this box's environment. It belongs to no org, and it is what grants the first person who runs the box."
            : "The email and password you use for the console. It opens this page only if the box made you one of its operators."}
        </p>

        <div className="way-fields">
          {how === "person" ? (
            <>
              <label className="way-field">
                <span className="way-label">org</span>
                <input
                  className="way-input"
                  value={org}
                  onChange={(event) => setOrg(event.target.value)}
                  autoComplete="organization"
                  autoFocus
                />
              </label>
              <label className="way-field">
                <span className="way-label">email</span>
                <input
                  className="way-input"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="username"
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
                />
              </label>
            </>
          ) : (
            <label className="way-field">
              <span className="way-label">operator key</span>
              <input
                className="way-input"
                type="password"
                value={key}
                onChange={(event) => setKey(event.target.value)}
                autoComplete="off"
                autoFocus
              />
            </label>
          )}
        </div>

        <button className="way-go" type="submit" disabled={busy || !ready}>
          {busy ? "asking the box…" : "open"}
        </button>

        {refused !== null && <p className="way-refused">{refused}</p>}

        <div className="way-else">
          {how === "person" ? (
            <p>
              No account on this box?{" "}
              <button type="button" className="link" onClick={() => turn(setHow, setRefused, "key")}>
                Use the operator key
              </button>{" "}
              instead.
            </p>
          ) : (
            <p>
              Have an account here?{" "}
              <button type="button" className="link" onClick={() => turn(setHow, setRefused, "person")}>
                Sign in
              </button>{" "}
              instead.
            </p>
          )}
          <p>
            This page is the box&rsquo;s, not a tenant&rsquo;s. The console is at{" "}
            <code>/</code>.
          </p>
        </div>
      </form>
    </div>
  );
}

/** Turn the card over, and drop the refusal with it: it was about the other way in. */
function turn(
  setHow: (how: How) => void,
  setRefused: (said: string | null) => void,
  to: How,
): void {
  setRefused(null);
  setHow(to);
}

/** The gateway's own sentence, except for the one case the page can name better than a 401 can. */
function said(failed: unknown, how: How): string {
  if (!(failed instanceof GatewayError)) return String(failed);
  return how === "person" && failed.status === 401 && failed.message.includes("box")
    ? NOT_AN_OPERATOR
    : failed.message;
}
