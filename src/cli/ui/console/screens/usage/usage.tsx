/** Usage: the org's totals, then every metered row — a call.summary or a call.score, folded, never a price of ours. */

import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router";

import { GatewayError } from "../../../shared/api";
import { started } from "../../lib/clock";
import { useCredentials } from "../../../shared/credentials";
import { euros } from "../sessions/finished-calls";
import { readUsage, type UsagePage } from "./door";
import "./usage.css";

/**
 * What the org consumed, off the same rows the operator's `/v1/ops/usage` pages, cut to the key's
 * org. The totals are a sum over the rows read; a row is one metered entry with the call it came
 * from, linked. `cost_eur` is the provider's bill as best the log knows it, four decimals.
 */
export function Usage(): ReactNode {
  const credentials = useCredentials();
  const [page, setPage] = useState<UsagePage | null>(null);
  const [refused, setRefused] = useState<string | null>(null);

  useEffect(() => {
    let gone = false;
    readUsage(credentials).then(
      (read) => {
        if (!gone) setPage(read);
      },
      (failed: unknown) => {
        if (!gone) setRefused(failed instanceof GatewayError ? failed.message : String(failed));
      },
    );
    return () => {
      gone = true;
    };
  }, [credentials]);

  return (
    <div className="usage">
      <h1 className="usage-title">Usage</h1>
      <p className="usage-lede">What this org consumed, as the log says it: every call summary and score, folded.</p>
      {refused !== null && <p className="usage-note usage-refused fixed">{refused}</p>}
      {page !== null && page.totals === null && (
        <p className="usage-note fixed">Nothing metered yet: the first call to end writes the first row.</p>
      )}
      {page !== null && page.totals !== null && (
        <>
          <div className="usage-totals">
            {(
              [
                ["calls", String(page.totals.calls)],
                ["minutes", page.totals.minutes.toFixed(1)],
                ["messages", String(page.totals.messages)],
                ["input tokens", String(page.totals.input_tokens)],
                ["output tokens", String(page.totals.output_tokens)],
                ["characters", String(page.totals.characters)],
                ["judge calls", String(page.totals.judge_calls)],
                ["cost", euros(page.totals.cost_eur)],
              ] as const
            ).map(([name, value]) => (
              <span key={name} className="usage-total">
                <span className="fixed usage-total-name">{name}</span>
                <span className="usage-total-value">{value}</span>
              </span>
            ))}
          </div>
          <div className="usage-panel">
            <div className="usage-row usage-row-head fixed">
              <span>AT</span>
              <span>AGENT</span>
              <span>CALL</span>
              <span>TYPE</span>
              <span className="usage-num">MIN</span>
              <span className="usage-num">IN</span>
              <span className="usage-num">OUT</span>
              <span className="usage-num">JUDGE</span>
              <span className="usage-num">COST</span>
            </div>
            {page.rows.map((row) => (
              <div key={`${row.cursor}`} className="usage-row fixed">
                <span className="usage-dim">{started(row.at)}</span>
                <span>{row.agent}</span>
                <Link to={`/a/${row.agent}/sessions/${row.call}`} className="usage-link">
                  {row.call}
                </Link>
                <span className="usage-dim">{row.type}</span>
                <span className="usage-num">{row.minutes.toFixed(1)}</span>
                <span className="usage-num">{row.input_tokens}</span>
                <span className="usage-num">{row.output_tokens}</span>
                <span className="usage-num">{row.judge_calls}</span>
                <span className="usage-num">{euros(row.cost_eur)}</span>
              </div>
            ))}
          </div>
          <p className="usage-note fixed">
            {page.rows.length} row{page.rows.length === 1 ? "" : "s"} read
            {page.next !== null ? ` · cursor ${page.next}` : ""} · the provider's bill as the log knows it, never a price of ours
          </p>
        </>
      )}
    </div>
  );
}
