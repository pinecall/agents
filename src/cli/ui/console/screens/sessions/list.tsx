/** The sessions table both lists draw: the org's, with its agent column and filters, and an agent's own. */

import type { SessionLine } from "@pinecall/protocol";
import { useState, type KeyboardEvent, type ReactNode } from "react";
import { useNavigate } from "react-router";

import { clockOf, duration, whoOn } from "../../lib/format";
import { isLive } from "../../lib/use-agent-sessions";
import { Button, Card, CardFoot, Dot, Empty, Input, Refused, Select, TableHead, TableRow } from "../../ui";
import { matches, useServerSearch, type Filter } from "./search";

// A call id as the log names one: pasted whole, Enter opens it even when it is not on the page.
const A_CALL = /^call[_-][\w+-]{6,}$/;

const ORG_COLUMNS = "minmax(0,1.3fr) 128px 84px 78px 74px minmax(0,1.5fr)";
const AGENT_COLUMNS = "minmax(0,1.3fr) 84px 78px 74px minmax(0,1.6fr)";
const CHANNELS = ["web", "phone", "whatsapp"] as const;

/**
 * The list. `lines` is what the screen already follows — the org's floor or the agent's door, a
 * page of 200 at most — and it is filtered here; a gateway whose sessions door searches by itself
 * (it answers a `total`) is asked instead, and its total is said.
 */
export function SessionList({
  lines,
  error,
  agent,
  agents,
}: {
  lines: SessionLine[];
  error: string | null;
  /** The agent this list is one of, or "" for the org's. */
  agent: string;
  /** The slugs the agent filter offers, on the org's list. */
  agents: string[];
}): ReactNode {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>({ query: "", agent: "", channel: "" });
  const [pages, setPages] = useState(1);
  // Asked again whenever the followed list moves: a call that rang shows up in the searched page too.
  const searched = useServerSearch(agent, filter, pages, `${lines.length}:${lines[0]?.call ?? ""}:${lines.filter(isLive).length}`);
  const org = agent === "";

  const shown =
    searched !== null
      ? searched.rows
      : lines.filter(
          (line) => matches(line, filter.query) && (filter.agent === "" || line.agent === filter.agent) && (filter.channel === "" || line.channel === filter.channel),
        );
  const ordered = [...shown.filter(isLive), ...shown.filter((line) => !isLive(line))];
  const detail = (call: string): string => (org ? `/sessions/${call}` : `/a/${agent}/sessions/${call}`);

  const open = (event: KeyboardEvent<HTMLInputElement>): void => {
    const typed = filter.query.trim();
    if (event.key === "Enter" && A_CALL.test(typed)) void navigate(detail(typed));
  };

  const columns = org ? ORG_COLUMNS : AGENT_COLUMNS;
  const filtering = filter.query !== "" || filter.agent !== "" || filter.channel !== "";

  return (
    <>
      <div className="sessions-filters">
        <Input
          size="sm"
          className="sessions-search"
          placeholder="Search a session id, number or outcome"
          aria-label="Search a session id, number or outcome"
          value={filter.query}
          onChange={(event) => setFilter({ ...filter, query: event.target.value })}
          onKeyDown={open}
        />
        {org && (
          <Select size="sm" className="sessions-select" value={filter.agent} onChange={(event) => setFilter({ ...filter, agent: event.target.value })}>
            <option value="">Every agent</option>
            {agents.map((slug) => (
              <option key={slug} value={slug}>
                {slug}
              </option>
            ))}
          </Select>
        )}
        {org && (
          <Select size="sm" className="sessions-select" value={filter.channel} onChange={(event) => setFilter({ ...filter, channel: event.target.value })}>
            <option value="">Every channel</option>
            {CHANNELS.map((channel) => (
              <option key={channel} value={channel}>
                {channel}
              </option>
            ))}
          </Select>
        )}
      </div>

      <Refused>{error}</Refused>

      <Card>
        {ordered.length === 0 ? (
          <Empty>
            {filtering ? (
              A_CALL.test(filter.query.trim()) ? (
                <>Not on this page — press Enter to open {filter.query.trim()} by its id.</>
              ) : (
                <>No session here matches. The search reads the sessions this page has listed.</>
              )
            ) : (
              <>
                No session recorded yet. The log is written during the call, so one appears here the moment it starts — from the browser, from{" "}
                <span className="ui-fixed">pinecall chat</span>, or from the telephone.
              </>
            )}
          </Empty>
        ) : (
          <>
            <TableHead columns={columns} labels={org ? ["Session", "Agent", "Channel", "Started", "Duration", "Outcome"] : ["Session", "Channel", "Started", "Duration", "Outcome"]} />
            {ordered.map((line) => (
              <TableRow key={line.call} columns={columns} to={detail(line.call)}>
                <div className="sessions-id">
                  <div className="sessions-call">
                    {isLive(line) && <Dot tone="green" small />}
                    <span className="ui-clip">{line.call}</span>
                  </div>
                  <div className="sessions-from ui-clip">{whoOn(line)}</div>
                </div>
                {org && <span className="ui-cell-ink ui-clip">{line.agent}</span>}
                <span className="ui-cell">{line.channel ?? "—"}</span>
                <span className="ui-cell">{clockOf(line.started_at)}</span>
                <span className="ui-cell">{isLive(line) ? <span className="sessions-live">live</span> : duration(line)}</span>
                <span className="ui-cell-ink ui-clip">{line.outcome ?? endedAs(line)}</span>
              </TableRow>
            ))}
          </>
        )}
        {searched !== null && searched.total > searched.rows.length && (
          <CardFoot>
            <span>
              {searched.rows.length} of {searched.total}
            </span>
            <span className="sessions-more">
              <Button size="sm" onClick={() => setPages(pages + 1)}>
                Load more
              </Button>
            </span>
          </CardFoot>
        )}
      </Card>
    </>
  );
}

/** A call with no outcome sentence, said by how it ended. */
function endedAs(line: SessionLine): string {
  if (isLive(line)) return "on a call";
  return line.end_reason === null ? "—" : line.end_reason.replace(/_/g, " ");
}
