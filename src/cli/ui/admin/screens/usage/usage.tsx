/** Usage: the metered rows of every org, folded off the log, a page at a time. */

import { useEffect, useState, type ReactNode } from "react";

import { useCredentials } from "../../../shared/credentials";
import { Nothing } from "../../../shared/frame";
import { usage, type Totals, type UsageRow } from "../../lib/doors";
import "./usage.css";

const A_PAGE = 100;

/**
 * The screen.
 *
 * There is no usage table: these rows are a fold over the log's own `call.summary` and
 * `call.score` entries, read by a cursor. So a page is a page of the LOG, and `next` moves past
 * every row read — which is why a page can come back with rows and still be making progress.
 */
export function Usage(): ReactNode {
  const credentials = useCredentials();
  const [rows, setRows] = useState<UsageRow[]>([]);
  const [totals, setTotals] = useState<Record<string, Totals>>({});
  const [next, setNext] = useState<number | null>(0);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);

  useEffect(() => {
    let gone = false;
    usage(credentials, 0, A_PAGE).then(
      (page) => {
        if (gone) return;
        setRows(page.rows);
        setTotals(page.totals);
        setNext(page.next);
      },
      (failed: unknown) => {
        if (!gone) setRefused(failed instanceof Error ? failed.message : String(failed));
      },
    );
    return () => {
      gone = true;
    };
  }, [credentials]);

  const more = async (): Promise<void> => {
    if (next === null) return;
    setBusy(true);
    try {
      const page = await usage(credentials, next, A_PAGE);
      setRows((kept) => [...kept, ...page.rows]);
      setTotals((kept) => summed(kept, page.totals));
      setNext(page.next);
    } catch (failed) {
      setRefused(failed instanceof Error ? failed.message : String(failed));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="page">
      <div className="page-eyebrow fixed">usage</div>
      <h1 className="page-title">Usage</h1>
      <p className="page-lede">
        What every tenant consumed, folded off the log by a cursor — there is no counter table to
        drift from it. The cost is the provider&rsquo;s bill as the log knows it, never a price.
      </p>

      {refused !== null && <p className="note note-warn">{refused}</p>}

      {Object.keys(totals).length > 0 && (
        <div className="consumed">
          {Object.entries(totals).map(([org, sum]) => (
            <div className="panel consumed-org" key={org}>
              <p className="consumed-name fixed">{org}</p>
              <p className="consumed-figure fixed">
                {sum.minutes.toFixed(1)} min · {sum.messages} messages
              </p>
              <p className="consumed-figure fixed">
                {sum.input_tokens + sum.output_tokens} tokens · {sum.characters} characters
              </p>
            </div>
          ))}
        </div>
      )}

      {rows.length === 0 && next === null && (
        <Nothing>Nothing metered yet: no call of any org has been summarised.</Nothing>
      )}

      {rows.length > 0 && (
        <div className="panel metered-scroll">
          <table className="metered fixed">
            <thead>
              <tr>
                <th>org</th>
                <th>agent</th>
                <th>call</th>
                <th>what</th>
                <th>minutes</th>
                <th>messages</th>
                <th>cost</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.cursor}-${row.call}`}>
                  <td>{row.org}</td>
                  <td>{row.agent}</td>
                  <td>{row.call}</td>
                  <td>{row.type}</td>
                  <td>{row.minutes.toFixed(2)}</td>
                  <td>{row.messages}</td>
                  <td>€{row.cost_eur.toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {next !== null && (
            <div className="metered-more">
              <button type="button" className="button" disabled={busy} onClick={() => void more()}>
                {busy ? "reading…" : "read on"}
              </button>
              <span className="consumed-figure fixed">from {next}</span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/** Two pages' totals, added: the same org on both pages is one figure and not two cards. */
function summed(kept: Record<string, Totals>, page: Record<string, Totals>): Record<string, Totals> {
  const all = { ...kept };
  for (const [org, sum] of Object.entries(page)) {
    const had = all[org];
    all[org] =
      had === undefined
        ? sum
        : {
            minutes: had.minutes + sum.minutes,
            messages: had.messages + sum.messages,
            input_tokens: had.input_tokens + sum.input_tokens,
            output_tokens: had.output_tokens + sum.output_tokens,
            characters: had.characters + sum.characters,
          };
  }
  return all;
}
