/** Sessions searched by the gateway, when it can: the sessions door with a query, a total and a cursor. */

import { SessionLineSchema, type SessionLine } from "@pinecall/protocol";
import { useEffect, useState } from "react";

import { read } from "../../../shared/api";
import { useCredentials } from "../../../shared/credentials";

/** What the screen filters by. Empty strings are "every". */
export interface Filter {
  query: string;
  agent: string;
  channel: string;
}

/** One page the gateway searched: the rows, how many match in all, and where the next page starts. */
export interface Searched {
  rows: SessionLine[];
  total: number;
  next: string | null;
}

// A row read leniently: a gateway newer than this page may add fields (a score, flags), and a list
// that refused a row for carrying more than it knows would draw nothing at all.
const LooseLine = SessionLineSchema.loose();

const A_PAGE = 50;
const SETTLE_MS = 250;

/**
 * The gateway's own search, when its sessions door answers one (it says so with a `total`). A
 * gateway that does not — every one before the door grew `q`, `agent`, `channel` and `before` —
 * answers the plain list, and this returns null for good: the screen filters what it holds.
 */
export function useServerSearch(scope: string, filter: Filter, pages: number, refresh: string): Searched | null {
  const credentials = useCredentials();
  const [searched, setSearched] = useState<Searched | null>(null);
  const [unsupported, setUnsupported] = useState(false);

  useEffect(() => {
    if (unsupported) return;
    let gone = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        const path = scope === "" ? "/v1/sessions" : `/v1/agents/${encodeURIComponent(scope)}/sessions`;
        const params: Record<string, string | number> = { limit: A_PAGE };
        if (filter.query.trim() !== "") params["q"] = filter.query.trim();
        if (filter.agent !== "") params["agent"] = filter.agent;
        if (filter.channel !== "") params["channel"] = filter.channel;
        try {
          // One request per page, each continuing below the last call of the one before (`before`):
          // the door caps a page at 200, so a growing `limit` would stop there for good.
          const rows: SessionLine[] = [];
          let total = 0;
          let next: string | null = null;
          for (let page = 0; page < pages; page += 1) {
            if (page > 0 && next === null) break;
            const answer = (await read(credentials, path, next === null ? params : { ...params, before: next })) as Record<string, unknown>;
            if (gone) return;
            if (typeof answer["total"] !== "number") {
              setUnsupported(true);
              return;
            }
            const listed = Array.isArray(answer["calls"]) ? answer["calls"] : [];
            rows.push(...listed.map((row) => LooseLine.parse(row) as SessionLine));
            total = answer["total"];
            next = typeof answer["next"] === "string" ? answer["next"] : null;
          }
          setSearched({ rows, total, next });
        } catch {
          if (!gone) setUnsupported(true);
        }
      })();
    }, SETTLE_MS);
    return () => {
      gone = true;
      window.clearTimeout(timer);
    };
  }, [credentials, scope, filter.query, filter.agent, filter.channel, pages, unsupported, refresh]);

  return unsupported ? null : searched;
}

/** Whether a line matches what a person typed: its id, its numbers, its caller, its outcome, its agent. */
export function matches(line: SessionLine, query: string): boolean {
  const words = query.trim().toLowerCase();
  if (words === "") return true;
  const digits = words.replace(/[^\d]/g, "");
  const said = [line.call, line.agent, line.from, line.to, line.caller?.name, line.outcome, line.channel].filter(Boolean).join(" ").toLowerCase();
  if (said.includes(words)) return true;
  if (digits.length >= 3) {
    const numbers = `${line.from ?? ""} ${line.to ?? ""} ${line.call}`.replace(/[^\d ]/g, "");
    return numbers.replace(/ /g, "").includes(digits) || numbers.includes(digits);
  }
  return false;
}
