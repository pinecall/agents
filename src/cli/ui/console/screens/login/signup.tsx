/** Sign-up: an org's name, who is making it, their password — the free trial, on Pinecall's cloud alone. */

import { useState, type FormEvent, type ReactNode } from "react";

import { GatewayError } from "../../lib/api";
import { signUp, type Signed } from "../../lib/login";
import { slugOf } from "./slug";

// runtime auth/passwords.py refuses fewer; the form says so before the gateway has to.
const SHORTEST_PASSWORD = 12;

/**
 * The other side of the login card, shown where `/.well-known/pinecall` says `signup`, and opened
 * directly by `/signup` so a site in front of this gateway can link to it. The gateway makes the
 * org on the free trial with this person as its admin and answers their first key, which the tab
 * keeps exactly as a login's. The refusal is the gateway's sentence, verbatim.
 */
export function SignUp({ base, onSigned, onSignInInstead }: { base: string; onSigned: (signed: Signed) => void; onSignInInstead: () => void }): ReactNode {
  const [name, setName] = useState("");
  const [person, setPerson] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const slug = slugOf(name);

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setRefused(null);
    try {
      onSigned(await signUp(base, { org: slug, name: name.trim(), email: email.trim(), person: person.trim(), password }));
    } catch (failed) {
      setRefused(failed instanceof GatewayError ? failed.message : String(failed));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="login-card" onSubmit={(event) => void submit(event)}>
      <div className="login-brand">pinecall / console</div>
      <p className="login-lead">Create your account. Forty-five minutes on us, no card.</p>
      <label className="login-field">
        <span className="login-label">organization</span>
        <input className="input" value={name} onChange={(event) => setName(event.target.value)} autoComplete="organization" placeholder="Clínica Norte" required />
        <span className="login-slug">{slug === "" ? "its address is made from the name" : `its address: ${slug}`}</span>
      </label>
      <label className="login-field">
        <span className="login-label">your name</span>
        <input className="input" value={person} onChange={(event) => setPerson(event.target.value)} autoComplete="name" required />
      </label>
      <label className="login-field">
        <span className="login-label">email</span>
        <input className="input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
      </label>
      <label className="login-field">
        <span className="login-label">password</span>
        <input className="input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" minLength={SHORTEST_PASSWORD} placeholder={`${SHORTEST_PASSWORD} characters at least`} required />
      </label>
      <button className="button button-accent" type="submit" disabled={busy || slug === ""}>
        {busy ? "creating…" : "create account"}
      </button>
      {refused !== null && <p className="login-refused">{refused}</p>}
      <p className="login-hint">
        Already have an account? <button type="button" className="link login-switch" onClick={onSignInInstead}>sign in</button>
      </p>
    </form>
  );
}
