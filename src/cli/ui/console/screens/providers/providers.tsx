/** Providers: every vendor this build runs, what each one still wants, and the keys this org brought. */

import { useEffect, useState, type FormEvent, type ReactNode } from "react";

import { GatewayError } from "../../../shared/api";
import { useCredentials } from "../../../shared/credentials";
import { MODALITIES, READY, doing, said, standing, type Catalogue, type Modality, type Provider } from "../../lib/catalogue";
import { addKey, readCatalogue, readVendors, removeKey } from "./door";
import "./providers.css";

// Until this screen listed the catalog it listed nothing: a free text box, and a tenant who typed
// `cartesia` into it was told by the gateway that no such vendor existed — from a build that was
// one `pip install` away from having it. What a person is choosing between is forty-five vendors,
// so the screen shows forty-five vendors and says, per row, what each one is still waiting for.
const FILTERS = ["all", ...MODALITIES] as const;
type Filter = (typeof FILTERS)[number];

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
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [brought, setBrought] = useState<string[] | null>(null);
  const [vendor, setVendor] = useState("");
  const [key, setKey] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);

  const reread = async (): Promise<void> => setBrought(await readVendors(credentials));

  useEffect(() => {
    let gone = false;
    const failed = (why: unknown): void => {
      if (!gone) setRefused(why instanceof Error ? why.message : String(why));
    };
    readCatalogue(credentials).then((whole) => {
      if (!gone) setCatalogue(whole);
    }, failed);
    readVendors(credentials).then((theirs) => {
      if (!gone) setBrought(theirs);
    }, failed);
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

  const providers = catalogue?.providers ?? [];
  const shown = filter === "all" ? providers : doing(providers, filter);
  const theirs = new Set(brought ?? []);

  return (
    <section className="page">
      <div className="page-eyebrow fixed">providers</div>
      <h1 className="page-title">Providers</h1>
      <p className="page-lede">
        Every vendor LiveKit reaches, and what each one still wants on this box. A key brought here
        runs every call of this org from the next one; every vendor nobody brought runs on the box's
        own key. Nothing reads a key back — not this page, not the CLI, not the log.
      </p>

      <div className="panel providers-bring">
        <p className="panel-title">bring one</p>
        <form className="providers-add" onSubmit={(event) => void add(event)}>
          <select className="input mono" value={vendor} onChange={(event) => setVendor(event.target.value)}>
            <option value="">choose a vendor…</option>
            {providers
              .filter((one) => one.env !== null)
              .map((one) => (
                <option key={one.name} value={one.name}>
                  {one.name} · {one.does.join(" ")}
                </option>
              ))}
          </select>
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

      <div className="providers-filters">
        {FILTERS.map((one) => (
          <button
            type="button"
            key={one}
            className={one === filter ? "providers-filter providers-filter-on" : "providers-filter"}
            onClick={() => setFilter(one)}
          >
            {one === "all" ? `all ${providers.length}` : `${one} ${doing(providers, one as Modality).length}`}
          </button>
        ))}
      </div>

      <ul className="panel providers-list">
        {shown.map((one) => (
          <Row key={one.name} provider={one} brought={theirs.has(one.name)} onGiveBack={() => void give(one.name)} />
        ))}
      </ul>
    </section>
  );
}

// One vendor: its name, the jobs it can do, what it is waiting for, and — only when this org
// brought its own key — the one link that gives it back to the box.
function Row({ provider, brought, onGiveBack }: { provider: Provider; brought: boolean; onGiveBack: () => void }): ReactNode {
  const state = standing(provider);
  return (
    <li className="providers-one">
      <div className="providers-who">
        <span className="providers-vendor fixed">{provider.name}</span>
        <span className="providers-said">{said(provider)}</span>
        {provider.aliases.length > 0 && <span className="providers-aliases fixed">also {provider.aliases.join(" · ")}</span>}
      </div>
      <span className="providers-does fixed">{provider.does.join(" ")}</span>
      <span className={state === READY ? "providers-state providers-state-on" : "providers-state"}>{state}</span>
      {brought ? (
        <button type="button" className="link" onClick={onGiveBack}>
          give it back
        </button>
      ) : (
        <span className="providers-boxes">the box's</span>
      )}
    </li>
  );
}
