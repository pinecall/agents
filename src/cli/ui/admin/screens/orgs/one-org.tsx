/** One tenant, whole: what it may do, the keys it runs on, its people, and the vendors it brought. */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router";

import { GatewayError } from "../../../shared/api";
import { useCredentials } from "../../../shared/credentials";
import { Nothing } from "../../../shared/frame";
import {
  forgetVendor,
  keysOf,
  membersOf,
  oneOrg,
  revokeKey,
  vendorsOf,
  type ListedKey,
  type Member,
  type OneOrg,
} from "../../lib/doors";
import { Limits } from "./limits";
import "./orgs.css";

/** What the screen holds: the org and the three lists beside it, each read from its own door. */
interface Everything {
  org: OneOrg;
  keys: ListedKey[];
  people: { members: Member[]; seated: number };
  vendors: string[];
}

export function OneOrgScreen(): ReactNode {
  const credentials = useCredentials();
  const named = useParams()["named"] ?? "";
  const [all, setAll] = useState<Everything | null>(null);
  const [refused, setRefused] = useState<string | null>(null);

  // Four doors, asked together: the screen is one read of one tenant, not four that arrive apart.
  const reread = useCallback(async (): Promise<Everything> => {
    const [org, keys, people, vendors] = await Promise.all([
      oneOrg(credentials, named),
      keysOf(credentials, named),
      membersOf(credentials, named),
      vendorsOf(credentials, named),
    ]);
    return { org, keys, people, vendors };
  }, [credentials, named]);

  const again = (): void => {
    void reread().then(setAll, (failed: unknown) =>
      setRefused(failed instanceof Error ? failed.message : String(failed)),
    );
  };

  useEffect(() => {
    let gone = false;
    reread().then(
      (read) => {
        if (!gone) setAll(read);
      },
      (failed: unknown) => {
        if (!gone) setRefused(failed instanceof Error ? failed.message : String(failed));
      },
    );
    return () => {
      gone = true;
    };
  }, [reread]);

  const stop = async (fingerprint: string): Promise<void> => {
    setRefused(null);
    try {
      await revokeKey(credentials, fingerprint);
      again();
    } catch (failed) {
      setRefused(failed instanceof GatewayError ? failed.message : String(failed));
    }
  };

  const giveBack = async (vendor: string): Promise<void> => {
    setRefused(null);
    try {
      await forgetVendor(credentials, named, vendor);
      again();
    } catch (failed) {
      setRefused(failed instanceof GatewayError ? failed.message : String(failed));
    }
  };

  if (all === null) {
    return (
      <section className="page">
        {refused !== null && <p className="note note-warn">{refused}</p>}
      </section>
    );
  }
  return (
    <section className="page">
      <div className="page-eyebrow fixed">
        <Link to="/">orgs</Link> / {all.org.slug}
      </div>
      <h1 className="page-title">{all.org.name}</h1>
      <p className="page-lede fixed">{all.org.id}</p>

      {refused !== null && <p className="note note-warn">{refused}</p>}

      <Limits org={all.org} onSaved={again} />

      <div className="panel of-the-org-panel">
        <p className="panel-title">keys · {all.keys.filter((one) => one.revoked_at === null).length} live</p>
        {all.keys.length === 0 ? (
          <div className="of-the-org-empty">
            <Nothing>No key issued to this org yet.</Nothing>
          </div>
        ) : (
          <ul className="of-the-org">
            {all.keys.map((key) => (
              <li key={key.fingerprint} className={key.revoked_at === null ? undefined : "gone"}>
                <span>{key.label ?? key.fingerprint.slice(0, 12)}</span>
                <span className="fixed">{key.env}</span>
                <span>{key.name ?? "a machine"}</span>
                {key.revoked_at === null ? (
                  <button type="button" className="link" onClick={() => void stop(key.fingerprint)}>
                    revoke
                  </button>
                ) : (
                  <span className="limit-held">revoked</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="panel of-the-org-panel">
        <p className="panel-title">people · {all.people.seated} seated</p>
        {all.people.members.length === 0 ? (
          <div className="of-the-org-empty">
            <Nothing>Nobody has been invited to this org.</Nothing>
          </div>
        ) : (
          <ul className="of-the-org">
            {all.people.members.map((who) => (
              <li key={who.id} className={who.status === "disabled" ? "gone" : undefined}>
                <span>{who.email}</span>
                <span className="fixed">{who.role}</span>
                <span>{who.name}</span>
                <span className="limit-held">{who.status}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="note of-the-org-note">
          Read only: who works at a tenant is the tenant&rsquo;s to decide, and a box that could
          edit a member could put itself in somebody&rsquo;s org.
        </p>
      </div>

      <div className="panel of-the-org-panel">
        <p className="panel-title">vendors it brought</p>
        {all.vendors.length === 0 ? (
          <div className="of-the-org-empty">
            <Nothing>None: every call of this org runs on the keys of the box.</Nothing>
          </div>
        ) : (
          <ul className="of-the-org">
            {all.vendors.map((vendor) => (
              <li key={vendor}>
                <span className="fixed">{vendor}</span>
                <span />
                <span />
                <button type="button" className="link" onClick={() => void giveBack(vendor)}>
                  give it back
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
