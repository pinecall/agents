/** Phone testing: how a developer's own mobile reaches their own copy, on the number customers call. */

import { useEffect, useState, type ReactNode } from "react";

import { read } from "../../../shared/api";
import { useCredentials } from "../../../shared/credentials";
import { meIn } from "../../lib/corners";
import { useHeldAgents } from "../../lib/use-held-agents";
import { useWhoami } from "../../lib/whoami";
import { pretty } from "./numbers";
import "./numbers.css";

/**
 * The local console's one screen about numbers. A sandbox needs none of its own: the gateway sends
 * a call from the phone a developer named to the copy they are running, and everybody else's to
 * production. So this says the two commands, and which copies a call would reach right now.
 */
/** One production number, and the agent it reaches: what `GET /v1/line/numbers` lists. */
interface ToCall {
  number: string;
  agent: string;
}

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

  const mine = useHeldAgents().agents.filter((held) => me !== null && held.holder?.holder === me);

  return (
    <div className="numbers">
      <h1 className="numbers-title">Phone testing</h1>
      <p className="numbers-lede">
        Call the number your customers call, from your own mobile, and <b>your copy answers</b>. Everybody else who
        calls still reaches production. You do not need a sandbox number.
      </p>

      <section className="numbers-doors numbers-callout">
        <h2 className="numbers-heading">Once per machine</h2>
        <pre className="numbers-code fixed">pinecall line from +1XXXXXXXXXX    # this mobile is mine</pre>
        <h2 className="numbers-heading">While you work</h2>
        <pre className="numbers-code fixed">pinecall run --serve               # your copies up, and this console{"\n"}pinecall line forget               # give your calls back to production</pre>
        <p className="numbers-hint">
          The call shows up here, in Sessions, marked <span className="fixed">diverted_from: production</span>.
        </p>
      </section>

      {numbers !== null && (
        <section className="numbers-doors">
          <h2 className="numbers-heading">The numbers to call</h2>
          {numbers.length === 0 ? (
            <p className="numbers-empty">This org has no phone number in production yet. The gateway's console adds one, under Numbers.</p>
          ) : (
            <div className="numbers-cards">
              {numbers.map((one) => {
                const running = mine.some((held) => held.slug === one.agent);
                const yours = running && calling.length > 0;
                const why = !running ? "production answers: you are not running it" : "production answers: say which phone is yours";
                return (
                  <div key={one.number} className="numbers-card">
                    <span className="numbers-card-number fixed">{pretty(one.number)}</span>
                    <span className="numbers-card-arrow" aria-hidden>→</span>
                    <span className="numbers-card-agent fixed">{one.agent}</span>
                    <span className={yours ? "numbers-world numbers-world-sandbox" : "numbers-world numbers-world-production"}>
                      {yours ? `your copy answers ${calling.map(pretty).join(", ")}` : why}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      <section className="numbers-doors">
        <h2 className="numbers-heading">What a call from your phone reaches right now</h2>
        {mine.length === 0 ? (
          <p className="numbers-empty">
            Nothing: no copy of yours is running, so your calls reach production. Start <code>pinecall run</code> in the
            project.
          </p>
        ) : (
          <p className="numbers-text">
            {calling.length === 0 ? (
              <>
                Production, still: you are running {mine.map((held) => held.slug).join(", ")}, and the gateway does not
                know which phone is yours. <code>pinecall line from +1…</code>, once.
              </>
            ) : (
              <>
                Your copy of {mine.map((held) => held.slug).join(", ")}, from {calling.map(pretty).join(", ")} — for as
                long as <code>pinecall run</code> stays up.
              </>
            )}
          </p>
        )}
      </section>
    </div>
  );
}
