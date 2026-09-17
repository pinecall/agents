/** The console in the frame both pages wear: its header contents, its rail, and the screen. */

import type { ReactNode } from "react";
import { Outlet, useParams } from "react-router";

import { Frame, Nothing } from "../../shared/frame";
import { MODE } from "../lib/mode";
import { useHeldAgents } from "../lib/use-held-agents";
import { Header } from "./header";
import { Rail } from "./rail";
import "./shell.css";

// What a slug in the path is NOT: proof that this org has such an agent. The path is a person's
// to type and a link's to carry — one sent by a colleague in another org, one kept from before a
// `pinecall run` stopped — and the console used to draw the whole agent for it either way: Talk, Chat,
// Sessions, the lot, every one of them answering 404 on the first click. The list the gateway
// gives is the truth, and this is where the two are compared.
const NOT_HELD = "no agent called {agent} is held here";

export function Shell(): ReactNode {
  const agent = useParams()["agent"] ?? "";
  const { agents, loaded } = useHeldAgents();
  // Only once the door has answered: an empty list before that is a list nobody has read.
  const missing = agent !== "" && loaded && !agents.some((held) => held.slug === agent);
  return (
    <Frame head={<Header agent={agent} />} rail={<Rail agent={missing ? "" : agent} />}>
      {missing ? <Missing agent={agent} /> : <Outlet />}
    </Frame>
  );
}

/** Said instead of an agent's screens, because every one of them would refuse the first click. */
function Missing({ agent }: { agent: string }): ReactNode {
  return (
    <Nothing>
      {NOT_HELD.replace("{agent}", agent)}
      {MODE === "local"
        ? " — no copy of yours is running. Start `pinecall run` in the project, and it appears."
        : " — nothing by that name is deployed in this org. Check the org you signed in with; a copy you are running yourself is on your own machine, at `pinecall serve`."}
    </Nothing>
  );
}
