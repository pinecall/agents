/** Routes: the doors one org answers at in one world, which table said so, and a number typed or forgotten. */

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";

import { useCredentials } from "../../../shared/credentials";
import { prettyNumber } from "../../lib/format";
import { Button, Card, CardHead, Empty, Field, Input, Page, PageHead, Pill, Refused, Select, TableHead, TableRow, TextAction } from "../../ui";
import { readOrgs } from "./door";
import { addRoute, readRoutes, removeRoute } from "./door-floor";
import { useDoor, useMove } from "./use-door";
import "./box.css";

const WORLDS = ["production", "sandbox"] as const;
const CHANNELS = ["phone", "whatsapp"] as const;
const COLUMNS = "minmax(0,1.1fr) 110px minmax(0,1fr) 150px 80px";

/**
 * The screen. Two tables answer for an org: the rows an operator typed, and the doors the apps
 * holding its agents declared. A typed row outranks a declaration, and moving a number is one row
 * and no deploy.
 */
export function BoxRoutes(): ReactNode {
  const credentials = useCredentials();
  const orgs = useDoor(useCallback(() => readOrgs(credentials), [credentials]));
  const [org, setOrg] = useState("");
  const [env, setEnv] = useState<string>(WORLDS[0]);
  const routes = useDoor(useCallback(() => (org === "" ? Promise.resolve(undefined) : readRoutes(credentials, org, env)), [credentials, org, env]));
  const acting = useMove();
  const [adding, setAdding] = useState(false);
  const [number, setNumber] = useState("");
  const [agent, setAgent] = useState("");
  const [channel, setChannel] = useState<string>(CHANNELS[0]);
  const [said, setSaid] = useState<string | null>(null);

  useEffect(() => {
    if (org === "" && orgs.value !== undefined) setOrg(orgs.value.find((one) => one.slug !== "default")?.slug ?? orgs.value[0]?.slug ?? "");
  }, [org, orgs.value]);

  const add = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setSaid(null);
    const typed = await acting.move(async () => {
      const from = await addRoute(credentials, { org, number: number.trim(), agent: agent.trim(), channel, env });
      setSaid(from === null ? `${number.trim()} now rings ${agent.trim()}.` : `${number.trim()} now rings ${agent.trim()}, taken from ${from}.`);
      await routes.reread();
    });
    if (typed) {
      setNumber("");
      setAgent("");
      setAdding(false);
    }
  };

  return (
    <Page width={1060} tight>
      <PageHead title="Routes" lede="Every door one org answers at, in one world. A row typed here outranks whatever an app declared." />

      <div className="box-pick">
        <Select size="sm" value={org} onChange={(event) => setOrg(event.target.value)} aria-label="Organization">
          {(orgs.value ?? []).map((one) => (
            <option key={one.id} value={one.slug}>
              {one.slug}
            </option>
          ))}
        </Select>
        <Select size="sm" value={env} onChange={(event) => setEnv(event.target.value)} aria-label="World">
          {WORLDS.map((world) => (
            <option key={world} value={world}>
              {world}
            </option>
          ))}
        </Select>
      </div>

      <Refused>{orgs.refused ?? routes.refused ?? acting.refused}</Refused>

      {routes.value !== undefined && (
        <Card>
          <CardHead
            title={`${org} · ${env}`}
            meta={`${routes.value.length} ${routes.value.length === 1 ? "door" : "doors"}`}
            action={
              adding ? undefined : (
                <Button kind="primary" size="sm" className="ui-card-action" onClick={() => setAdding(true)}>
                  Type a number
                </Button>
              )
            }
          />
          {adding && (
            <div className="box-inline">
              <form className="ui-form" onSubmit={(event) => void add(event)}>
                <Field label="Number" minWidth={170}>
                  <Input value={number} placeholder="+34910000000" onChange={(event) => setNumber(event.target.value)} required autoFocus />
                </Field>
                <Field label="Agent" grow minWidth={170}>
                  <Input value={agent} placeholder="clinica-norte" onChange={(event) => setAgent(event.target.value)} required />
                </Field>
                <Field label="Channel" minWidth={120}>
                  <Select value={channel} onChange={(event) => setChannel(event.target.value)}>
                    {CHANNELS.map((one) => (
                      <option key={one} value={one}>
                        {one}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Button kind="primary" size="form" type="submit" disabled={acting.busy}>
                  {acting.busy ? "Typing…" : "Add"}
                </Button>
              </form>
              <div className="box-inline-foot">
                A row and nothing else: the carrier and the SFU trunk are the org's Numbers screen.
                <span className="box-inline-close">
                  <TextAction onClick={() => setAdding(false)}>Close</TextAction>
                </span>
              </div>
            </div>
          )}
          {said !== null && <div className="box-done box-done-row">{said}</div>}
          {routes.value.length === 0 ? (
            <Empty>No door in this world: nothing typed, and no app holding an agent here.</Empty>
          ) : (
            <>
              <TableHead columns={COLUMNS} labels={["Number", "Channel", "Agent", "Said by", ""]} />
              {routes.value.map((door) => (
                <TableRow key={`${door.route.channel}-${door.route.number ?? door.route.agent}`} columns={COLUMNS}>
                  <span className="ui-cell-strong">{door.route.number ? prettyNumber(door.route.number) : "—"}</span>
                  <span className="ui-cell-ink">{door.route.channel}</span>
                  <span className="ui-cell-ink ui-clip">{door.route.agent}</span>
                  <span className="box-line">
                    <Pill tone={door.source === "operator" ? "indigo" : "gray"}>{door.source === "operator" ? "typed" : door.source}</Pill>
                    {door.route.managed === true && <Pill tone="violet">bought</Pill>}
                  </span>
                  <span className="ui-cell-end">
                    {door.source === "operator" && typeof door.route.number === "string" && (
                      <TextAction
                        danger
                        disabled={acting.busy}
                        onClick={() =>
                          void acting.move(async () => {
                            await removeRoute(credentials, org, door.route.number ?? "");
                            await routes.reread();
                          })
                        }
                      >
                        Forget
                      </TextAction>
                    )}
                  </span>
                </TableRow>
              ))}
            </>
          )}
        </Card>
      )}
    </Page>
  );
}
