/** Routes: the doors one org answers at in one world, and which of the two tables said so. */

import { useEffect, useState, type ReactNode } from "react";

import { useCredentials } from "../../../shared/credentials";
import { Nothing } from "../../../shared/frame";
import { orgs, routesOf, type Answering, type Org } from "../../lib/doors";
import "./routes.css";

const WORLDS = ["production", "sandbox"] as const;

/**
 * The screen.
 *
 * Both tables of one org, in one world: the rows an operator typed, and the doors the apps
 * holding its agents declared and no row has claimed. `source` is which of the two — a typed row
 * outranks a declaration, and the sentence beside it says so where they collide.
 */
export function Routes(): ReactNode {
  const credentials = useCredentials();
  const [tenants, setTenants] = useState<Org[]>([]);
  const [org, setOrg] = useState("");
  const [env, setEnv] = useState<string>(WORLDS[0]);
  const [doors, setDoors] = useState<Answering[] | null>(null);
  const [refused, setRefused] = useState<string | null>(null);

  useEffect(() => {
    let gone = false;
    void orgs(credentials).then((listed) => {
      if (gone) return;
      setTenants(listed);
      setOrg((chosen) => chosen || (listed[0]?.slug ?? ""));
    });
    return () => {
      gone = true;
    };
  }, [credentials]);

  useEffect(() => {
    if (org === "") return undefined;
    let gone = false;
    setDoors(null);
    routesOf(credentials, org, env).then(
      (answered) => {
        if (!gone) setDoors(answered);
      },
      (failed: unknown) => {
        if (!gone) setRefused(failed instanceof Error ? failed.message : String(failed));
      },
    );
    return () => {
      gone = true;
    };
  }, [credentials, org, env]);

  return (
    <section className="page">
      <div className="page-eyebrow fixed">routes</div>
      <h1 className="page-title">Routes</h1>
      <p className="page-lede">
        Every door one org answers at, in one world. A row an operator typed outranks whatever an
        app declared, and a number is one door: moving it is one row and no deploy.
      </p>

      <div className="doors-pick">
        <select className="input" value={org} onChange={(event) => setOrg(event.target.value)}>
          {tenants.map((tenant) => (
            <option key={tenant.id} value={tenant.slug}>
              {tenant.slug}
            </option>
          ))}
        </select>
        <select className="input" value={env} onChange={(event) => setEnv(event.target.value)}>
          {WORLDS.map((world) => (
            <option key={world} value={world}>
              {world}
            </option>
          ))}
        </select>
      </div>

      {refused !== null && <p className="note note-warn">{refused}</p>}

      {doors !== null && doors.length === 0 && (
        <Nothing>No door in this world: nothing typed, and no app holding an agent here.</Nothing>
      )}

      {doors !== null && doors.length > 0 && (
        <ul className="panel doors">
          {doors.map((door) => (
            <li className="door" key={`${door.route.channel}-${door.route.number ?? door.route.agent}`}>
              <span className="fixed">{door.route.number ?? "—"}</span>
              <span className="fixed">{door.route.channel}</span>
              <span>{door.route.agent}</span>
              <span className="door-source fixed">
                {door.source}
                {door.route.managed && " · bought"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
