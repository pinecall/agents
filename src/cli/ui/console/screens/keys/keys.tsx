/** Keys: the provider accounts this org brought of its own, and the ones it runs on the box's. */

import { useEffect, useState, type FormEvent, type ReactNode } from "react";

import { GatewayError } from "../../lib/api";
import { useCredentials } from "../../lib/credentials";
import { Nothing } from "../../shell/nothing";
import { addKey, readVendors, removeKey } from "./door";
import "./keys.css";

/**
 * The screen. A key typed here goes to this machine's own loopback, is signed by the terminal that
 * serves this page and sent once — exactly the path `pinecall keys add` takes, which reads it off
 * stdin for the same reason a flag is refused there: argv is visible to every user on the box.
 * No door of the runtime ever answers with a provider key, so this page lists vendors and nothing
 * more. A key that was lost was lost at the vendor, and the fix is to add it again.
 */
export function Keys(): ReactNode {
  const credentials = useCredentials();
  const [vendors, setVendors] = useState<string[] | null>(null);
  const [vendor, setVendor] = useState("");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);

  const reread = async (): Promise<void> => setVendors(await readVendors(credentials));

  useEffect(() => {
    let gone = false;
    readVendors(credentials).then(
      (brought) => {
        if (!gone) setVendors(brought);
      },
      (failed: unknown) => {
        if (!gone) setRefused(failed instanceof Error ? failed.message : String(failed));
      },
    );
    return () => {
      gone = true;
    };
  }, [credentials]);

  const add = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setRefused(null);
    try {
      await addKey(credentials, vendor.trim(), key);
      // Out of the page the moment it is out of this process: nothing here keeps it to show later.
      setKey("");
      setVendor("");
      await reread();
    } catch (failed) {
      setRefused(failed instanceof GatewayError ? failed.message : String(failed));
    } finally {
      setBusy(false);
    }
  };

  const give = async (name: string): Promise<void> => {
    setRefused(null);
    try {
      await removeKey(credentials, name);
      await reread();
    } catch (failed) {
      setRefused(failed instanceof GatewayError ? failed.message : String(failed));
    }
  };

  return (
    <section className="page">
      <div className="page-eyebrow fixed">keys</div>
      <h1 className="page-title">the accounts this org brought of its own</h1>
      <p className="page-lede">
        Every call of this org runs on these from the next one; every vendor nobody brought runs on
        the box's own key. Nothing reads a key back — not this page, not the CLI, not the log.
      </p>

      <form className="keys-add" onSubmit={(event) => void add(event)}>
        <input
          className="input mono keys-vendor"
          value={vendor}
          placeholder="elevenlabs"
          onChange={(event) => setVendor(event.target.value)}
        />
        <input
          className="input mono keys-secret"
          type="password"
          value={key}
          placeholder="the key, sent once"
          autoComplete="off"
          onChange={(event) => setKey(event.target.value)}
        />
        <button type="submit" className="button" disabled={busy || vendor.trim() === "" || key === ""}>
          {busy ? "sending…" : "bring it"}
        </button>
      </form>

      {refused !== null && <p className="note note-warn">{refused}</p>}

      {vendors !== null && vendors.length === 0 && (
        <Nothing>No provider key brought: every call runs on the keys of the box.</Nothing>
      )}

      {vendors !== null && vendors.length > 0 && (
        <ul className="keys-list">
          {vendors.map((name) => (
            <li key={name}>
              <span className="mono">{name}</span>
              <button type="button" className="link" onClick={() => void give(name)}>
                give it back
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
