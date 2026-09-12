/** The way in: the box's ops key, typed once, proved at its own door before the page is drawn. */

import { useState, type FormEvent, type ReactNode } from "react";

import { GatewayError } from "../../../shared/api";
import { theBox } from "../../lib/the-box";
import "./login.css";

// What the key is, said where somebody who does not have it will read it: it is the BOX's, out of
// its environment, and no key of any tenant opens this page however many scopes it holds.
const WHAT_IT_IS =
  "the operator key this box was given — PINECALL_OPS_KEY in its environment. A tenant's key opens nothing here.";

/**
 * The screen.
 *
 * The key is proved at `/v1/ops/whoami` before it is kept, exactly as `pinecall login` proves a
 * tenant's at `/v1/whoami`: a key that opens nothing is a page a person would trust tomorrow and
 * a refusal they would not understand. It is kept only once the box has answered.
 */
export function Login({
  base,
  onProved,
}: {
  base: string;
  onProved: (key: string) => void;
}): ReactNode {
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);

  const prove = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setRefused(null);
    try {
      const proved = key.trim();
      // The door answers 401 to any key that is not the box's, and answered() throws on it: a
      // key that reaches the next line opened the box. Out of the field the moment it is out of
      // this component — what keeps it is the caller.
      await theBox({ base, key: proved });
      setKey("");
      onProved(proved);
    } catch (failed) {
      setRefused(failed instanceof GatewayError ? failed.message : String(failed));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="way-in">
      <section className="panel way-in-card">
        <h1 className="way-in-title">pinecall · admin</h1>
        <p className="note">
          {window.location.host} — {WHAT_IT_IS}
        </p>
        <form className="way-in-form" onSubmit={(event) => void prove(event)}>
          <input
            className="input"
            type="password"
            value={key}
            placeholder="the operator key"
            autoComplete="off"
            autoFocus
            onChange={(event) => setKey(event.target.value)}
          />
          <button type="submit" className="button" disabled={busy || key.trim() === ""}>
            {busy ? "asking the box…" : "open"}
          </button>
        </form>
        {refused !== null && <p className="note note-warn">{refused}</p>}
      </section>
    </div>
  );
}
