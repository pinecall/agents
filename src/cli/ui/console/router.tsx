/** Every URL the console has. Append a route as a screen lands; never reorder — this file is a seam. */

import type { ReactNode } from "react";
import { createBrowserRouter, Navigate, type RouteObject } from "react-router";

import { BASE } from "./lib/base";
import { AGENT_SCREENS, BOX_SCREENS, MODE, ORG_SCREENS, screensOf, type Screen } from "./lib/mode";
// One import line per screen, and it is the screen's directory, never a file inside it: a screen
// that reorganises itself renames nothing here.
import { Agents } from "./screens/agents";
import { BoxFleet, BoxOrg, BoxOrgs, BoxRoutes, BoxSettings, BoxUsage, OperatorOnly } from "./screens/box";
import { Calls } from "./screens/calls";
import { Chat } from "./screens/chat";
import { OrgEvals } from "./screens/org-evals";
import { OrgMemory } from "./screens/org-memory";
import { OrgBase, OrgDocs } from "./screens/org-docs";
import { RoomChat } from "./screens/talk";
import { Evals } from "./screens/evals";
import { FloorLive, FloorSessions } from "./screens/floor";
import { Home } from "./screens/home";
import { Tokens } from "./screens/tokens";
import { Lexicon } from "./screens/lexicon";
import { Providers } from "./screens/providers";
import { Docs } from "./screens/docs";
import { Memory } from "./screens/memory";
import { Numbers, PhoneTesting } from "./screens/numbers";
import { Pipeline } from "./screens/pipeline";
import { Session, Sessions } from "./screens/sessions";
import { Simulations } from "./screens/simulations";
import { Settings } from "./screens/settings";
import { Talk } from "./screens/talk";
import { Terminal } from "./screens/terminal";
import { Team } from "./screens/team";
import { Usage } from "./screens/usage";
import { Widget, WidgetPreview } from "./screens/widget";
import { Shell } from "./shell/shell";

// The element of every screen, by the key lib/mode.ts lists it under. Which of them THIS console
// has is that table's answer and not this file's: a row it leaves out gets no route, so a path
// typed by hand lands on the front page and not on a screen whose doors would refuse.
const ORG: Record<string, ReactNode> = {
  home: <Home />,
  agents: <Agents />,
  live: <FloorLive />,
  sessions: <FloorSessions />,
  simulations: <Simulations />,
  "org-evals": <OrgEvals />,
  "org-memory": <OrgMemory />,
  "org-docs": <OrgDocs />,
  numbers: <Numbers />,
  phone: <PhoneTesting />,
  tokens: <Tokens />,
  providers: <Providers />,
  team: <Team />,
  usage: <Usage />,
  lexicon: <Lexicon />,
};

// The box's. They are routed for anybody on the gateway's page, because the router is built before
// anybody has signed in, and drawn for an operator only: anyone else lands on the front page
// before a door of the box's is ever knocked at.
const BOX: Record<string, ReactNode> = {
  "box-orgs": <OperatorOnly><BoxOrgs /></OperatorOnly>,
  "box-fleet": <OperatorOnly><BoxFleet /></OperatorOnly>,
  "box-routes": <OperatorOnly><BoxRoutes /></OperatorOnly>,
  "box-usage": <OperatorOnly><BoxUsage /></OperatorOnly>,
  "box-settings": <OperatorOnly><BoxSettings /></OperatorOnly>,
};

const AGENT: Record<string, ReactNode> = {
  talk: <Talk />,
  chat: <RoomChat />,
  devchat: <Chat />,
  calls: <Calls />,
  sessions: <Sessions />,
  settings: <Settings />,
  pipeline: <Pipeline />,
  docs: <Docs />,
  memory: <Memory />,
  evals: <Evals />,
  widget: <Widget />,
};

// A call in the path is the conversation, the call being watched, or the session read: the same
// screen one level deeper.
const DEEPER: Record<string, ReactNode> = { devchat: <Chat />, calls: <Calls />, sessions: <Session /> };
// The org's: a call watched on the floor, a session read whichever agent handled it.
const ORG_DEEPER: Record<string, ReactNode> = { live: <FloorLive />, sessions: <Session />, simulations: <Simulations /> };

function routesOf(table: readonly Screen[], elements: Record<string, ReactNode>): RouteObject[] {
  return screensOf(table, MODE, true).flatMap((screen): RouteObject[] => {
    const element = elements[screen.key];
    if (screen.path === "") return [{ index: true, element }];
    const deeper = (elements === AGENT ? DEEPER : ORG_DEEPER)[screen.key];
    return deeper === undefined ? [{ path: screen.path, element }] : [{ path: screen.path, element }, { path: `${screen.path}/:call`, element: deeper }];
  });
}

// The URL is the state: which agent, which screen, and later which call. Nothing the console holds
// in memory decides what is on screen, so a reload lands on exactly the same thing. The org's
// screens sit at the root; an agent's under /a/<slug>.
export const router = createBrowserRouter(
  [
    {
      path: "/",
      element: <Shell />,
      children: [
        ...routesOf(ORG_SCREENS, ORG),
        ...routesOf(BOX_SCREENS, BOX),
        // One org of the box's, one level under its list.
        ...(MODE === "hosted" ? [{ path: "box/orgs/:org", element: <OperatorOnly><BoxOrg /></OperatorOnly> }] : []),
        // Where `pinecall login` sends a person: the card that signs their terminal in. The
        // gateway's alone — a machine that serves its own console is signed in already.
        ...(MODE === "hosted" ? [{ path: "cli", element: <Terminal /> }] : []),
        // One base of the org's documents, its files read and edited one at a time.
        { path: "docs/:base", element: <OrgBase /> },
      ],
    },
    {
      path: "/a/:agent",
      element: <Shell />,
      children: [{ index: true, element: <Navigate to="talk" replace /> }, ...routesOf(AGENT_SCREENS, AGENT)],
    },
    // A blank page with nothing but the widget on it, the way a site would have it: outside the
    // shell, the same key.
    { path: "/a/:agent/widget/preview", element: <WidgetPreview /> },
    { path: "*", element: <Navigate to="/" replace /> },
  ],
  { basename: BASE },
);
