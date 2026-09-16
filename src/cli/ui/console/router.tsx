/** Every URL the console has. Append a route as a screen lands; never reorder — this file is a seam. */

import { createBrowserRouter, Navigate } from "react-router";

import { BASE } from "./lib/base";
// One import line per screen, and it is the screen's directory, never a file inside it: a screen
// that reorganises itself renames nothing here.
import { Agents } from "./screens/agents";
import { Calls } from "./screens/calls";
import { Chat } from "./screens/chat";
import { Evals } from "./screens/evals";
import { FloorLive, FloorSessions } from "./screens/floor";
import { Keys } from "./screens/keys";
import { Providers } from "./screens/providers";
import { Knowledge } from "./screens/knowledge";
import { Memory } from "./screens/memory";
import { Numbers } from "./screens/numbers";
import { Pipeline } from "./screens/pipeline";
import { Session, Sessions } from "./screens/sessions";
import { Talk } from "./screens/talk";
import { Terminal } from "./screens/terminal";
import { Team } from "./screens/team";
import { Usage } from "./screens/usage";
import { Widget, WidgetPreview } from "./screens/widget";
import { Shell } from "./shell/shell";

// The URL is the state: which agent, which screen, and later which call. Nothing the console holds
// in memory decides what is on screen, so a reload lands on exactly the same thing. The org's
// screens sit at the root; an agent's under /a/<slug>.
export const router = createBrowserRouter(
  [
    {
      path: "/",
      element: <Shell />,
      children: [
        { index: true, element: <Agents /> },
        { path: "live", element: <FloorLive /> },
        { path: "sessions", element: <FloorSessions /> },
        { path: "numbers", element: <Numbers /> },
        { path: "keys", element: <Keys /> },
        { path: "providers", element: <Providers /> },
        { path: "team", element: <Team /> },
        { path: "usage", element: <Usage /> },
        // Where `pinecall login` sends a person: the card that signs their terminal in.
        { path: "cli", element: <Terminal /> },
      ],
    },
    {
      path: "/a/:agent",
      element: <Shell />,
      children: [
        { index: true, element: <Navigate to="talk" replace /> },
        { path: "talk", element: <Talk /> },
        { path: "chat", element: <Chat /> },
        // A call in the path is the conversation this page is having; without it, a new one opens.
        { path: "chat/:call", element: <Chat /> },
        { path: "calls", element: <Calls /> },
        // A call in the path is the one being watched; without it, Calls watches every live call.
        { path: "calls/:call", element: <Calls /> },
        { path: "sessions", element: <Sessions /> },
        { path: "sessions/:call", element: <Session /> },
        { path: "pipeline", element: <Pipeline /> },
        { path: "knowledge", element: <Knowledge /> },
        { path: "memory", element: <Memory /> },
        { path: "evals", element: <Evals /> },
        { path: "widget", element: <Widget /> },
      ],
    },
    // A blank page with nothing but the widget on it, the way a site would have it: outside the
    // shell, the same key.
    { path: "/a/:agent/widget/preview", element: <WidgetPreview /> },
    { path: "*", element: <Agents /> },
  ],
  { basename: BASE },
);
