/** Which of the person's orgs this console looks at, and the move to another one. */

import { useEffect, useState, type ReactNode } from "react";

import { GatewayError } from "../../shared/api";
import { useCredentials } from "../../shared/credentials";
import { orgsOf, type OrgOf } from "../lib/login";
import { useWorld } from "../lib/world";

/**
 * A person is their email on this box and may belong to several orgs; a key opens one. This
 * lists the orgs the gateway says are theirs and, on a pick, asks it for the same person's key in
 * that org (POST /v1/login/org). Nothing is drawn for a person of one org, and nothing for a
 * machine key, which names nobody: the gateway refuses the listing in a sentence and this stays
 * out of the way rather than showing it — an org's own key has no other org to switch to.
 */
export function OrgSelect(): ReactNode {
  const credentials = useCredentials();
  const { moveTo } = useWorld();
  const [orgs, setOrgs] = useState<OrgOf[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);

  useEffect(() => {
    let gone = false;
    orgsOf(credentials)
      .then((listed) => {
        if (!gone) setOrgs(listed);
      })
      .catch(() => {
        if (!gone) setOrgs(null);
      });
    return () => {
      gone = true;
    };
  }, [credentials]);

  if (orgs === null || orgs.length < 2) return null;
  const here = orgs.find((one) => one.here);

  const move = async (org: string): Promise<void> => {
    if (busy || org === here?.org) return;
    setBusy(true);
    setRefused(null);
    try {
      await moveTo(org);
    } catch (failed) {
      setRefused(failed instanceof GatewayError ? failed.message : String(failed));
      setBusy(false);
    }
  };

  return (
    <span className="org-switch fixed">
      <select
        className="org-select"
        value={here?.org ?? ""}
        onChange={(event) => void move(event.target.value)}
        disabled={busy}
        aria-label="which org"
        title="switch to another org you belong to"
      >
        {orgs.map((one) => (
          <option key={one.org} value={one.org}>
            {one.slug ?? one.name ?? one.org}
          </option>
        ))}
      </select>
      {refused !== null && <span className="world-refused fixed">{refused}</span>}
    </span>
  );
}
