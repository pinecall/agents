/** Sessions: every conversation this agent has had, newest first. */

import type { ReactNode } from "react";
import { useParams } from "react-router";

import { useAgentSessions } from "../../lib/use-agent-sessions";
import { Page, PageHead } from "../../ui";
import { SessionList } from "./list";
import "./sessions.css";

// Other screens read these two from here; the one place they are written is lib/format.ts.
export { duration, euros } from "../../lib/format";

export function Sessions(): ReactNode {
  const agent = useParams()["agent"] ?? "";
  const { lines, error } = useAgentSessions(agent);
  return (
    <Page tight>
      <PageHead title="Sessions" lede={`Only what ${agent} handled, newest first.`} />
      <SessionList lines={lines} error={error} agent={agent} agents={[]} />
    </Page>
  );
}
