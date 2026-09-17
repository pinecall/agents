/** How the console writes a length of time, a sum of money, a moment, a share and a phone number. UTC, like the log. */

import type { SessionLine } from "@pinecall/protocol";

import { NOTHING } from "./clock";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** `1m 04s`: how long a call lasted, or a dash while it is still running. */
export function duration(line: { started_at: number | null; ended_at: number | null }): string {
  if (line.started_at === null || line.ended_at === null) return NOTHING;
  const total = Math.max(0, Math.round(line.ended_at - line.started_at));
  return `${Math.floor(total / 60)}m ${String(total % 60).padStart(2, "0")}s`;
}

/** `0:42`: how long a live call has been going, by the clock of this tab. */
export function elapsed(since: number | null, now: number = Date.now() / 1000): string {
  if (since === null) return NOTHING;
  const total = Math.max(0, Math.round(now - since));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
}

/** Four decimals, because a whole call costs less than a cent and 0.00 € is a lie. */
export function euros(value: number | null | undefined): string {
  return value === null || value === undefined ? NOTHING : `${value.toFixed(4)} €`;
}

/** `€1.65`: a day's spend, where cents are the resolution that matters. */
export function spend(value: number): string {
  return `€${value.toFixed(2)}`;
}

/** `15:10:47`, UTC. */
export function clockOf(at: number | null): string {
  if (at === null) return NOTHING;
  return new Date(at * 1000).toISOString().slice(11, 19);
}

/** `16 Sep, 15:10`, UTC. */
export function dayAndTime(at: number | null): string {
  if (at === null) return NOTHING;
  const date = new Date(at * 1000);
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}, ${date.toISOString().slice(11, 16)}`;
}

/** `16 Sep`, UTC. */
export function dayOf(at: number | null): string {
  if (at === null) return NOTHING;
  const date = new Date(at * 1000);
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
}

/** `12 min ago`, `1 h ago`, `Yesterday`, or the day. */
export function ago(at: number | null, now: number = Date.now() / 1000): string {
  if (at === null) return NOTHING;
  const seconds = Math.max(0, now - at);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
  if (seconds < 172800) return "Yesterday";
  return dayOf(at);
}

/** The UTC day a moment falls in, as `YYYY-MM-DD`. */
export function utcDay(at: number): string {
  return new Date(at * 1000).toISOString().slice(0, 10);
}

/** Today's UTC day, and the one before it. */
export function today(now: number = Date.now() / 1000): { today: string; yesterday: string } {
  return { today: utcDay(now), yesterday: utcDay(now - 86400) };
}

/** The lines that started on a UTC day. */
export function startedOn(lines: readonly SessionLine[], day: string): SessionLine[] {
  return lines.filter((line) => line.started_at !== null && utcDay(line.started_at) === day);
}

/** `+18%`, `−4%`, or nothing to compare against. */
export function change(now: number, before: number): { text: string; tone: "up" | "down" | "flat" } | null {
  if (before === 0) return null;
  const share = Math.round(((now - before) / before) * 100);
  if (share === 0) return { text: "steady", tone: "flat" };
  return share > 0 ? { text: `+${share}%`, tone: "up" } : { text: `−${Math.abs(share)}%`, tone: "down" };
}

/** `82%`. */
export function percent(share: number): string {
  return `${Math.round(share * 100)}%`;
}

/** A number the way a person dials it: `+1 (417) 674-3169`, or as it came. */
export function prettyNumber(number: string | null | undefined): string {
  if (number === null || number === undefined) return NOTHING;
  const digits = number.replace(/[^\d]/g, "");
  if (number.startsWith("+1") && digits.length === 11) return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  if (number.startsWith("+34") && digits.length === 11) return `+34 ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`;
  if (number.startsWith("+598") && digits.length === 11) return `+598 ${digits.slice(3, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`;
  return number;
}

/** Who was on a call, as a list names them: their name, their number, or a web visitor's id. */
export function whoOn(line: SessionLine): string {
  const name = line.caller?.name;
  if (name !== null && name !== undefined && name !== "") return name;
  const from = line.direction === "outbound" ? line.to : line.from;
  if (from === null || from === undefined) return NOTHING;
  return from.startsWith("+") ? prettyNumber(from) : from;
}
