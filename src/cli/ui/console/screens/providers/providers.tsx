/** Providers: the vendor accounts this org brought of its own, and the ones it runs on the box's. */

import { useEffect, useState, type FormEvent, type ReactNode } from "react";

import { GatewayError } from "../../../shared/api";
import { useCredentials } from "../../../shared/credentials";
import { Nothing } from "../../../shared/frame";
import { addKey, readVendors, removeKey } from "./door";
import "./providers.css";

/**
 * The screen. A key typed here goes to this machine's own loopback, is signed by the terminal that
 * serves this page and sent once — exactly the path `pinecall providers add` takes, which reads it off
 * stdin for the same reason a flag is refused there: argv is visible to every user on the box.
 * No door a person reads answers with a provider key — the one that does is the worker's, an
 * org's own keys to its own process — so this page lists vendors and nothing more. A key that was
 * lost is set again.
 */
export function Providers(): ReactNode {
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
      <div className="page-eyebrow fixed">providers</div>
      <h1 className="page-title">Providers</h1>
      <p className="page-lede">
        Every call of this org runs on these from the next one; every vendor nobody brought runs on
        the box's own key. Nothing reads a key back — not this page, not the CLI, not the log.
      </p>

      <div className="panel providers-bring">
        <p className="panel-title">bring one</p>
        <form className="providers-add" onSubmit={(event) => void add(event)}>
          <input className="input" value={vendor} placeholder="elevenlabs" onChange={(event) => setVendor(event.target.value)} />
          <input
            className="input"
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
      </div>

      {refused !== null && <p className="note note-warn">{refused}</p>}

      {vendors !== null && vendors.length === 0 && (
        <div className="providers-nothing">
          <Nothing>No provider key brought: every call runs on the keys of the box.</Nothing>
        </div>
      )}

      {vendors !== null && vendors.length > 0 && (
        <ul className="panel providers-list">
          {vendors.map((name) => (
            <li className="providers-one" key={name}>
              <span className="providers-vendor fixed">{name}</span>
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
