/** The metered rows folded the ways a person reads a bill: one line per call, per day, per agent. */

import { utcDay } from "../../lib/format";
import type { UsageRow } from "./door";

/** What a group of metered rows adds up to. */
export interface Sum {
  calls: number;
  minutes: number;
  messages: number;
  judge_calls: number;
  cost_eur: number;
}

/** One call's bill: its summary and whatever its judges cost, as one line. */
export interface CallBill extends Sum {
  call: string;
  agent: string;
  at: number;
}

/** A named group — a day, an agent — and its sum. */
export interface Group extends Sum {
  name: string;
}

// A call writes two metered rows (its summary, and its score — often at no cost): a person reads one.
/** One line per call, newest first. */
export function byCall(rows: readonly UsageRow[]): CallBill[] {
  const bills = new Map<string, CallBill>();
  for (const row of rows) {
    const bill = bills.get(row.call) ?? { call: row.call, agent: row.agent, at: row.at, calls: 1, minutes: 0, messages: 0, judge_calls: 0, cost_eur: 0 };
    bill.minutes += row.minutes;
    bill.messages += row.messages;
    bill.judge_calls += row.judge_calls;
    bill.cost_eur += row.cost_eur;
    bill.at = Math.min(bill.at, row.at);
    bills.set(row.call, bill);
  }
  return [...bills.values()].sort((one, other) => other.at - one.at);
}

function grouped(bills: readonly CallBill[], nameOf: (bill: CallBill) => string): Group[] {
  const groups = new Map<string, Group>();
  for (const bill of bills) {
    const name = nameOf(bill);
    const group = groups.get(name) ?? { name, calls: 0, minutes: 0, messages: 0, judge_calls: 0, cost_eur: 0 };
    group.calls += 1;
    group.minutes += bill.minutes;
    group.messages += bill.messages;
    group.judge_calls += bill.judge_calls;
    group.cost_eur += bill.cost_eur;
    groups.set(name, group);
  }
  return [...groups.values()];
}

/** One line per UTC day, newest first. */
export function byDay(bills: readonly CallBill[]): Group[] {
  return grouped(bills, (bill) => utcDay(bill.at)).sort((one, other) => other.name.localeCompare(one.name));
}

/** One line per agent, the costliest first. */
export function byAgent(bills: readonly CallBill[]): Group[] {
  return grouped(bills, (bill) => bill.agent).sort((one, other) => other.cost_eur - one.cost_eur);
}

/** Everything, summed. */
export function total(bills: readonly CallBill[]): Sum {
  return grouped(bills, () => "")[0] ?? { calls: 0, minutes: 0, messages: 0, judge_calls: 0, cost_eur: 0 };
}
