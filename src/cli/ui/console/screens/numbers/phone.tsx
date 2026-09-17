/** Phone testing: how a developer's own mobile reaches their own copy, on the number customers call. */

import { useEffect, useState, type ReactNode } from "react";

import { read } from "../../../shared/api";
import { useCredentials } from "../../../shared/credentials";
import { meIn } from "../../lib/corners";
import { prettyNumber } from "../../lib/format";
import { useOrg } from "../../lib/org";
import { useWhoami } from "../../lib/whoami";
import { Card, CardHead, Empty, Page, PageHead, Pill, SectionLabel } from "../../ui";
import "./numbers.css";

/** One production number, and the agent it reaches: what `GET /v1/line/numbers` lists. */
interface ToCall {
  number: string;
  agent: string;
}

/**
 * The local console's one screen about numbers. A sandbox needs none of its own: the gateway sends
 * a call from the phone a developer named to the copy they are running, and everybody else's to
 * production. So this says the two commands, and which copies a call would reach right now.
 */
export function PhoneTesting(): ReactNode {
  const credentials = useCredentials();
  const me = meIn(useWhoami());
  // Null until the door answers, and for a gateway older than the door: the screen then says the
  // commands and leaves the numbers to the gateway's own console.
  const [numbers, setNumbers] = useState<ToCall[] | null>(null);
  // The phones the gateway knows are this person's. It keeps them beside a live socket, so with
  // no `pinecall run` up it knows none — which is also when none would be diverted.
  const [calling, setCalling] = useState<string[]>([]);

  useEffect(() => {
    let gone = false;
    read(credentials, "/v1/line/numbers").then(
      (said) => {
        if (gone) return;
        const line = said as { numbers: ToCall[]; calling?: string[] };
        setNumbers(line.numbers);
        setCalling(line.calling ?? []);
      },
      () => undefined,
    );
    return () => {
      gone = true;
    };
  }, [credentials]);

  const mine = useOrg().held.filter((held) => me !== null && held.holder?.holder === me);

  return (
    <Page width={900}>
      <PageHead
        title="Phone testing"
        ledeWidth={660}
        lede={
          <>
            Call the number your customers call, from your own mobile, and <b>your copy answers</b>. Everybody else who calls still reaches
            production. You do not need a sandbox number.
          </>
        }
      />

      <Card>
        <SectionLabel>Once per machine</SectionLabel>
        <pre className="ui-code">pinecall line from +1XXXXXXXXXX     # this mobile is mine</pre>
        <SectionLabel ruled>While you work</SectionLabel>
        <pre className="ui-code">{"pinecall run --serve                # your copies up, and this console\npinecall line forget                # give your calls back to production"}</pre>
        <div className="ui-card-foot">
          <span>
            The call shows up here, in Sessions, marked <span className="ui-fixed">diverted_from: production</span>.
          </span>
        </div>
      </Card>

      {numbers !== null && (
        <Card>
          <CardHead title="The numbers to call" />
          {numbers.length === 0 && <Empty>This org has no phone number in production yet. The gateway's console adds one, under Numbers.</Empty>}
          {numbers.map((one) => {
            const running = mine.some((held) => held.slug === one.agent);
            const yours = running && calling.length > 0;
            return (
              <div key={one.number} className="num-row">
                <span className="num-number">{prettyNumber(one.number)}</span>
                <span className="num-arrow" aria-hidden>
                  →
                </span>
                <span className="num-agent">{one.agent}</span>
                <span className="num-end">
                  {yours ? (
                    <Pill tone="green">your copy answers {calling.map(prettyNumber).join(", ")}</Pill>
                  ) : running ? (
                    <Pill tone="amber">production answers: say which phone is yours</Pill>
                  ) : (
                    <Pill tone="gray">production answers: you are not running it</Pill>
                  )}
                </span>
              </div>
            );
          })}
        </Card>
      )}

      <Card>
        <CardHead title="What a call from your phone reaches right now" />
        <div className="num-body">
          {mine.length === 0 ? (
            <>
              Nothing: no copy of yours is running, so your calls reach production. Start <span className="ui-fixed">pinecall run</span> in the project.
            </>
          ) : calling.length === 0 ? (
            <>
              Production, still: you are running {mine.map((held) => held.slug).join(", ")}, and the gateway does not know which phone is yours.{" "}
              <span className="ui-fixed">pinecall line from +1…</span>, once.
            </>
          ) : (
            <>
              Your copy of {mine.map((held) => held.slug).join(", ")}, from {calling.map(prettyNumber).join(", ")} — for as long as{" "}
              <span className="ui-fixed">pinecall run</span> stays up.
            </>
          )}
        </div>
      </Card>
    </Page>
  );
}
