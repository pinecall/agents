/** Usage: the org's totals, then every metered row — a call.summary or a call.score, folded, never a price of ours. */

import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router";

import { GatewayError } from "../../../shared/api";
import { useCredentials } from "../../../shared/credentials";
import { clockOf, euros } from "../../lib/format";
import { Button, Card, CardFoot, Empty, Page, PageHead, Refused, Stat, Stats, TableHead } from "../../ui";
import { readUsage, type Totals, type UsageRow } from "./door";
import "./usage.css";

const COLUMNS = "78px 120px minmax(110px,1fr) 100px 54px 86px";

// Every total the door adds up. The ones the design does not headline — tokens, characters — are
// still the log's and still on the card's foot.
const NONE: Totals = { minutes: 0, messages: 0, input_tokens: 0, output_tokens: 0, characters: 0, judge_calls: 0, cost_eur: 0, calls: 0 };

function added(one: Totals, other: Totals | null): Totals {
  if (other === null) return one;
  return {
    minutes: one.minutes + other.minutes,
    messages: one.messages + other.messages,
    input_tokens: one.input_tokens + other.input_tokens,
    output_tokens: one.output_tokens + other.output_tokens,
    characters: one.characters + other.characters,
    judge_calls: one.judge_calls + other.judge_calls,
    cost_eur: one.cost_eur + other.cost_eur,
    calls: one.calls + other.calls,
  };
}

/**
 * What the org consumed, off the same rows the operator's `/v1/ops/usage` pages, cut to the key's
 * org. The totals are a sum over the pages read; a row is one metered entry with the call it came
 * from, linked. `cost_eur` is the provider's bill as best the log knows it, four decimals.
 */
export function Usage(): ReactNode {
  const credentials = useCredentials();
  const [rows, setRows] = useState<UsageRow[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [next, setNext] = useState<number | null>(null);
  const [read, setRead] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);

  const page = async (after: number, first: boolean): Promise<void> => {
    setBusy(true);
    try {
      const answer = await readUsage(credentials, after);
      setRows((kept) => (first ? answer.rows : [...kept, ...answer.rows]));
      setTotals((kept) => (answer.totals === null ? kept : added(first || kept === null ? NONE : kept, answer.totals)));
      setNext(answer.next);
      setRefused(null);
    } catch (failed) {
      setRefused(failed instanceof GatewayError ? failed.message : String(failed));
    } finally {
      setRead(true);
      setBusy(false);
    }
  };

  // The first page, again for another key; later pages are asked for by the button.
  useEffect(() => {
    void page(0, true);
  }, [credentials]);

  return (
    <Page tight>
      <PageHead title="Usage" lede="What this org consumed, as the log says it: every call summary and score, folded." />
      <Refused>{refused}</Refused>

      {totals !== null && (
        <Stats min={140}>
          <Stat size="small" label="Calls" value={totals.calls} />
          <Stat size="small" label="Minutes" value={totals.minutes.toFixed(1)} />
          <Stat size="small" label="Messages" value={totals.messages} />
          <Stat size="small" label="Judge calls" value={totals.judge_calls} />
          <Stat size="small" label="Cost" value={euros(totals.cost_eur)} accent />
        </Stats>
      )}

      <Card>
        {read && rows.length === 0 ? (
          <Empty>Nothing metered yet: the first call to end writes the first row.</Empty>
        ) : (
          <>
            <TableHead columns={COLUMNS} labels={["At", "Agent", "Call", "Type", "Min>", "Cost>"]} />
            {rows.map((row) => (
              <div key={row.cursor} className="ui-table-row usage-row" style={{ gridTemplateColumns: COLUMNS }}>
                <span className="ui-cell-faint">{clockOf(row.at)}</span>
                <span className="ui-cell-ink ui-clip">{row.agent}</span>
                <Link to={`/sessions/${row.call}`} className="usage-call ui-clip">
                  {row.call}
                </Link>
                <span className="ui-cell-faint ui-clip">{row.type}</span>
                <span className="ui-cell-ink usage-right">{row.minutes.toFixed(1)}</span>
                <span className="usage-cost">{euros(row.cost_eur)}</span>
              </div>
            ))}
          </>
        )}
        {rows.length > 0 && (
          <CardFoot>
            <span>
              {rows.length} {rows.length === 1 ? "row" : "rows"} read
              {totals !== null && ` · ${totals.input_tokens} tokens in · ${totals.output_tokens} out · ${totals.characters} characters`} · the provider's bill as the
              log knows it, never a price of ours
            </span>
            {next !== null && (
              <span className="usage-more">
                <Button size="sm" disabled={busy} onClick={() => void page(next, false)}>
                  {busy ? "Reading…" : "Load more"}
                </Button>
              </span>
            )}
          </CardFoot>
        )}
      </Card>
    </Page>
  );
}
