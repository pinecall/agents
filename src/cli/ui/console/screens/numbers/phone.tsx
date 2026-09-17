/** Phone testing: how a developer's own mobile reaches their own copy, on the number customers call. */

import type { ReactNode } from "react";

import { meIn } from "../../lib/corners";
import { useHeldAgents } from "../../lib/use-held-agents";
import { useWhoami } from "../../lib/whoami";
import "./numbers.css";

/**
 * The local console's one screen about numbers. A sandbox needs none of its own: the gateway sends
 * a call from the phone a developer named to the copy they are running, and everybody else's to
 * production. So this says the two commands, and which copies a call would reach right now.
 */
export function PhoneTesting(): ReactNode {
  const me = meIn(useWhoami());
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
          The call shows up here, in Sessions, marked <span className="fixed">diverted_from: production</span>. The
          numbers themselves are on the gateway's console, under Numbers.
        </p>
      </section>

      <section className="numbers-doors">
        <h2 className="numbers-heading">What a call from your phone reaches right now</h2>
        {mine.length === 0 ? (
          <p className="numbers-empty">
            Nothing: no copy of yours is running, so your calls reach production. Start <code>pinecall run</code> in the
            project.
          </p>
        ) : (
          <p className="numbers-text">
            Your copy of {mine.map((held) => held.slug).join(", ")} — for as long as <code>pinecall run</code> stays up.
          </p>
        )}
      </section>
    </div>
  );
}
