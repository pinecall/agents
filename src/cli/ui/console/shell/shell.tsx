/** The console's frame: the sidebar, the top bar, an agent's head and tabs, and the screen. */

import { useEffect, useState, type ReactNode } from "react";
import { Outlet, useParams } from "react-router";

import { MODE } from "../lib/mode";
import { OrgProvider, useOrg } from "../lib/org";
import { AgentHead } from "./agent-head";
import { Palette } from "./palette";
import { Ringing } from "./ringing";
import { Sidebar } from "./sidebar";
import { Top } from "./top";
import "./shell.css";

// What a slug in the path is NOT: proof that this org has such an agent. The path is a person's
// to type and a link's to carry — one sent by a colleague in another org, one kept from before a
// `pinecall start` stopped — and the console used to draw the whole agent for it either way: Talk, Chat,
// Sessions, the lot, every one of them answering 404 on the first click. The list the gateway
// gives is the truth, and this is where the two are compared.
const NOT_HELD = "No agent called {agent} is held here";

export function Shell(): ReactNode {
  return (
    <OrgProvider>
      <Frame />
    </OrgProvider>
  );
}

function Frame(): ReactNode {
  const agent = useParams()["agent"] ?? "";
  const { agents, agentsLoaded } = useOrg();
  const [searching, setSearching] = useState(false);
  // Only once the door has answered: an empty list before that is a list nobody has read.
  const missing = agent !== "" && agentsLoaded && !agents.some((held) => held.slug === agent);

  useEffect(() => {
    const summon = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearching((now) => !now);
      }
    };
    document.addEventListener("keydown", summon);
    return () => document.removeEventListener("keydown", summon);
  }, []);

  return (
    <div className="frame">
      <Sidebar agent={missing ? "" : agent} onSearch={() => setSearching(true)} />
      <div className="frame-main">
        <Top agent={agent} />
        {agent !== "" && !missing && <AgentHead agent={agent} />}
        <div className="frame-screen">{missing ? <Missing agent={agent} /> : <Outlet />}</div>
      </div>
      <Ringing />
      {searching && <Palette agent={missing ? "" : agent} onClose={() => setSearching(false)} />}
    </div>
  );
}

/** Said instead of an agent's screens, because every one of them would refuse the first click. */
function Missing({ agent }: { agent: string }): ReactNode {
  return (
    <p className="missing">
      {NOT_HELD.replace("{agent}", agent)}
      {MODE === "local"
        ? " — no copy of yours is running. Start `pinecall start` in the project, and it appears."
        : " — nothing by that name is deployed in this org. Check the org you signed in with; a copy you are running yourself is on your own machine, at `pinecall serve`."}
    </p>
  );
}
