/** Orgs: every tenant this box serves, and the one form that makes another. */

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router";

import { GatewayError } from "../../../shared/api";
import { useCredentials } from "../../../shared/credentials";
import { Nothing } from "../../../shared/frame";
import { addOrg, orgs, type Org } from "../../lib/doors";
import "./orgs.css";

/**
 * The screen.
 *
 * A tenant is a row and nothing else: an id minted here, a slug people type, a name. What it may
 * DO is the next screen, and what it PAYS is not on this page at all — a plan is the charging
 * package's, and a box of its own has none.
 */
export function Orgs(): ReactNode {
  const credentials = useCredentials();
  const [listed, setListed] = useState<Org[] | null>(null);
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);

  const reread = async (): Promise<void> => setListed(await orgs(credentials));

  useEffect(() => {
    let gone = false;
    orgs(credentials).then(
      (kept) => {
        if (!gone) setListed(kept);
      },
      (failed: unknown) => {
        if (!gone) setRefused(failed instanceof Error ? failed.message : String(failed));
      },
    );
    return () => {
      gone = true;
    };
  }, [credentials]);

  const make = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setRefused(null);
    try {
      await addOrg(credentials, slug.trim(), name.trim());
      setSlug("");
      setName("");
      await reread();
    } catch (failed) {
      setRefused(failed instanceof GatewayError ? failed.message : String(failed));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="page">
      <div className="page-eyebrow fixed">orgs</div>
      <h1 className="page-title">Orgs</h1>
      <p className="page-lede">
        Every tenant this box serves. The id is what each of their rows names them by and never
        changes; the slug is what a person types and may be renamed. What one may do is its own
        screen — what it is charged is not on this page, and is not this box's to know.
      </p>

      <div className="panel tenant-make">
        <p className="panel-title">make one</p>
        <form className="tenant-make-form" onSubmit={(event) => void make(event)}>
          <input
            className="input"
            value={slug}
            placeholder="tienda-sur"
            onChange={(event) => setSlug(event.target.value)}
          />
          <input
            className="input"
            value={name}
            placeholder="Tienda Sur (optional)"
            onChange={(event) => setName(event.target.value)}
          />
          <button type="submit" className="button" disabled={busy || slug.trim() === ""}>
            {busy ? "making…" : "add"}
          </button>
        </form>
      </div>

      {refused !== null && <p className="note note-warn">{refused}</p>}

      {listed !== null && listed.length === 0 && (
        <Nothing>No org on this box yet. The first one is what a key is issued against.</Nothing>
      )}

      {listed !== null && listed.length > 0 && (
        <ul className="panel tenants">
          {listed.map((org) => (
            <li className="tenant" key={org.id}>
              <Link to={`/orgs/${encodeURIComponent(org.slug)}`}>{org.slug}</Link>
              <span>{org.name}</span>
              <span className="tenant-id fixed">{org.id}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
