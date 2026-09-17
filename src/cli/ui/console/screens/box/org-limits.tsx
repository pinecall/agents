/** What an org may do: its quotas, replaced whole, and the fence around the calls its agents place. */

import { useState, type ReactNode } from "react";

import { useCredentials } from "../../../shared/credentials";
import { Button, Card, CardHead, Field, Input, Refused, Switch } from "../../ui";
import { QUOTAS, saveDialling, saveQuotas, type OneOrg, type Quota } from "./door";
import { useMove } from "./use-door";

// What each limit is about, in the fewest words that say it.
const ABOUT: Record<Quota, { name: string; about: string }> = {
  minutes: { name: "Minutes", about: "of call, ever" },
  messages: { name: "Messages", about: "written turns, ever" },
  agents: { name: "Agents", about: "slugs held at once" },
  concurrent_calls: { name: "Concurrent calls", about: "calls at once" },
  memory_facts: { name: "Memory facts", about: "facts kept" },
  knowledge_chunks: { name: "Knowledge chunks", about: "chunks kept" },
  numbers: { name: "Numbers", about: "numbers this box bought" },
  seats: { name: "Seats", about: "people invited or active" },
  budget_eur: { name: "Budget, €", about: "a month's spend" },
};

const HELD: Partial<Record<Quota, keyof OneOrg["holding"]>> = { memory_facts: "memory_facts", knowledge_chunks: "knowledge_chunks", numbers: "numbers", seats: "seats" };

const digits = (typed: string): string => typed.replace(/[^0-9]/g, "");

/**
 * Both panels replace their set WHOLE. An empty quota is no limit, and `0` is a real limit that
 * refuses; an empty country list is the codes of the org's own numbers, which is a fence, not a gap.
 */
export function OrgLimits({ org, onSaved }: { org: OneOrg; onSaved: () => Promise<void> }): ReactNode {
  const credentials = useCredentials();
  const quotas = useMove();
  const dialling = useMove();
  const [wanted, setWanted] = useState<Record<string, string>>(() =>
    Object.fromEntries(QUOTAS.map((quota) => [quota, org.quotas[quota] === null || org.quotas[quota] === undefined ? "" : String(org.quotas[quota])])),
  );
  const [saved, setSaved] = useState<"quotas" | "dialling" | null>(null);
  const guards = org.dialling ?? null;
  const [anywhere, setAnywhere] = useState(guards?.dial_anywhere ?? false);
  const [perMinute, setPerMinute] = useState(String(guards?.per_minute ?? ""));
  const [perDay, setPerDay] = useState(String(guards?.per_day ?? ""));
  const [countries, setCountries] = useState((guards?.countries ?? []).join(" "));
  const [longest, setLongest] = useState(String(guards?.max_duration_s ?? ""));

  const saveLimits = async (): Promise<void> => {
    setSaved(null);
    const done = await quotas.move(async () => {
      await saveQuotas(credentials, org.slug, Object.fromEntries(QUOTAS.map((quota) => [quota, wanted[quota] === "" ? null : Number(wanted[quota])])));
      await onSaved();
    });
    if (done) setSaved("quotas");
  };

  const saveGuards = async (): Promise<void> => {
    setSaved(null);
    const done = await dialling.move(async () => {
      await saveDialling(credentials, org.slug, {
        dial_anywhere: anywhere,
        per_minute: Number(perMinute),
        per_day: Number(perDay),
        countries: countries.split(/[\s,+]+/).filter((one) => one !== ""),
        max_duration_s: Number(longest),
      });
      await onSaved();
    });
    if (done) setSaved("dialling");
  };

  return (
    <>
      <Card>
        <CardHead title="Quotas" meta="empty is no limit · 0 refuses everything" />
        <div className="box-limits">
          {QUOTAS.map((quota) => (
            <Field key={quota} label={ABOUT[quota].name}>
              <Input inputMode="numeric" value={wanted[quota] ?? ""} placeholder="no limit" onChange={(event) => setWanted({ ...wanted, [quota]: digits(event.target.value) })} />
              <div className="box-limit-about">
                {ABOUT[quota].about}
                {HELD[quota] !== undefined && ` · holding ${org.holding[HELD[quota]]}`}
              </div>
            </Field>
          ))}
        </div>
        <div className="box-save">
          <Button kind="primary" size="md" disabled={quotas.busy} onClick={() => void saveLimits()}>
            {quotas.busy ? "Saving…" : "Save the quotas"}
          </Button>
          {saved === "quotas" && <span className="box-done">Saved. They bite the next call and the next register.</span>}
        </div>
        <Refused>{quotas.refused}</Refused>
      </Card>

      {guards !== null && (
        <Card>
          <CardHead title="Outbound calls" meta="the fence around the calls this org's agents place" />
          <div className="box-anywhere">
            <span className="box-anywhere-words">
              <strong>Call anybody</strong>
              <span className="ui-note">Off, an agent only calls numbers that already called or wrote to this org — "call back" means back.</span>
            </span>
            <Switch on={anywhere} onChange={setAnywhere} label="Call anybody" />
          </div>
          <div className="box-limits">
            <Field label="Calls a minute">
              <Input inputMode="numeric" value={perMinute} onChange={(event) => setPerMinute(digits(event.target.value))} />
            </Field>
            <Field label="Calls a day">
              <Input inputMode="numeric" value={perDay} onChange={(event) => setPerDay(digits(event.target.value))} />
            </Field>
            <Field label="Longest call, seconds">
              <Input inputMode="numeric" value={longest} onChange={(event) => setLongest(digits(event.target.value))} />
            </Field>
            <Field label="Country codes">
              <Input value={countries} placeholder="1 34" onChange={(event) => setCountries(event.target.value)} />
              <div className="box-limit-about">empty: the codes of its own numbers</div>
            </Field>
          </div>
          <div className="box-save">
            <Button kind="primary" size="md" disabled={dialling.busy} onClick={() => void saveGuards()}>
              {dialling.busy ? "Saving…" : "Save the guards"}
            </Button>
            {saved === "dialling" && <span className="box-done">Saved. They bite the next dial.</span>}
          </div>
          <Refused>{dialling.refused}</Refused>
        </Card>
      )}
    </>
  );
}
