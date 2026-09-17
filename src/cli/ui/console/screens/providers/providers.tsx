/** Providers: every vendor this build runs, what each one still wants, and the keys this org brought. */

import { useEffect, useState, type FormEvent, type ReactNode } from "react";

import { GatewayError } from "../../../shared/api";
import { useCredentials } from "../../../shared/credentials";
import { ITS_OWN, MODALITIES, NO_KEY, NO_PLUGIN, READY, doing, said, type Catalogue, type Modality, type Provider } from "../../lib/catalogue";
import { Button, Card, Chips, Field, Input, Page, PageHead, Pill, Refused, Select, TextAction } from "../../ui";
import { addKey, readCatalogue, readVendors, removeKey } from "./door";
import "./providers.css";

// Until this screen listed the catalog it listed nothing: a free text box, and a tenant who typed
// `cartesia` into it was told by the gateway that no such vendor existed — from a build that was
// one `pip install` away from having it. What a person is choosing between is forty-five vendors,
// so the screen shows forty-five vendors and says, per row, what each one is still waiting for.
const FILTERS = ["all", ...MODALITIES] as const;
type Filter = (typeof FILTERS)[number];

const COLUMNS = "130px minmax(0,1.6fr) 110px 92px";

// A vendor that runs a call first, then the ones waiting on the operator, the unusual last.
const STANDING_ORDER: Record<Provider["standing"], number> = { [READY]: 0, [NO_KEY]: 1, [ITS_OWN]: 2, [NO_PLUGIN]: 3 };

/**
 * The screen. A key typed here is sent once, on this request — exactly the path `pinecall providers
 * add` takes, which reads it off stdin for the same reason a flag is refused there: argv is visible
 * to every user on the box. No door a person reads answers with a provider key — the one that does
 * is the worker's, an org's own keys to its own process — so this page lists vendors and nothing
 * more. A key that was lost is set again.
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
  const theirs = new Set(brought ?? []);
  const shown = (filter === "all" ? providers : doing(providers, filter)).slice().sort(
    (one, other) =>
      Number(theirs.has(other.name)) - Number(theirs.has(one.name)) ||
      STANDING_ORDER[one.standing] - STANDING_ORDER[other.standing] ||
      one.name.localeCompare(other.name),
  );

  return (
    <Page tight>
      <PageHead
        title="Providers"
        ledeWidth={660}
        lede="Every vendor the runtime can reach, and what each one still wants on this box. Nothing reads a key back — not this page, not the CLI, not the log."
      />

      <Card pad>
        <form className="ui-form" onSubmit={(event) => void add(event)}>
          <Field label="Bring one" minWidth={180}>
            <Select value={vendor} onChange={(event) => setVendor(event.target.value)}>
              <option value="">Choose a vendor…</option>
              {providers
                .filter((one) => one.env !== null)
                .map((one) => (
                  <option key={one.name} value={one.name}>
                    {one.name} · {one.does.join(" ")}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="The key, sent once" grow minWidth={220}>
            <Input type="password" value={key} placeholder="sk-…" autoComplete="off" onChange={(event) => setKey(event.target.value)} />
          </Field>
          <Button kind="primary" size="form" type="submit" disabled={busy || vendor.trim() === "" || key === ""}>
            {busy ? "Sending…" : "Bring it"}
          </Button>
        </form>
        <div className="prov-hint">A key brought here runs every call of this org from the next one; every vendor nobody brought runs on the box's own key.</div>
      </Card>

      <Refused>{refused}</Refused>

      <Chips
        options={FILTERS.map((one) => ({
          value: one,
          label: one === "all" ? `All ${providers.length}` : `${one.toUpperCase()} ${doing(providers, one as Modality).length}`,
        }))}
        value={filter}
        onChange={setFilter}
      />

      <Card>
        {shown.map((one) => (
          <div key={one.name} className="prov-row" style={{ gridTemplateColumns: COLUMNS }} title={one.aliases.length > 0 ? `also ${one.aliases.join(" · ")}` : undefined}>
            <span className="prov-name">{one.name}</span>
            <span className="prov-note">
              <span className="ui-clip">{said(one)}</span>
              {theirs.has(one.name) && (
                <TextAction danger onClick={() => void give(one.name)}>
                  Give back
                </TextAction>
              )}
            </span>
            <span className="prov-kinds">{one.does.join(" ")}</span>
            <span className="ui-cell-end">
              <Standing provider={one} brought={theirs.has(one.name)} />
            </span>
          </div>
        ))}
      </Card>
    </Page>
  );
}

/** What a vendor is still waiting for, in one pill. */
function Standing({ provider, brought }: { provider: Provider; brought: boolean }): ReactNode {
  if (brought) return <Pill tone="green">your key</Pill>;
  if (provider.standing === READY) return <Pill tone="green">ready</Pill>;
  return <Pill tone="gray">{provider.standing}</Pill>;
}
