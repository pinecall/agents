/** Every URL the console has. Append a route as a screen lands; never reorder — this file is a seam. */

import { createBrowserRouter, Navigate } from "react-router";

import { BASE } from "./lib/base";
// One import line per screen, and it is the screen's directory, never a file inside it: a screen
// that reorganises itself renames nothing here.
import { Agents } from "./screens/agents";
import { Calls } from "./screens/calls";
import { Chat } from "./screens/chat";
import { Evals } from "./screens/evals";
import { Keys } from "./screens/keys";
import { Knowledge } from "./screens/knowledge";
import { Memory } from "./screens/memory";
import { Pipeline } from "./screens/pipeline";
import { Session, Sessions } from "./screens/sessions";
import { Talk } from "./screens/talk";
import { Shell } from "./shell/shell";

// The URL is the state: which agent, which screen, and later which call. Nothing the console holds
// in memory decides what is on screen, so a reload lands on exactly the same thing. The base is
// the path `pinecall ui` opened the console at, and the router never sees it.
export const router = createBrowserRouter(
  [
    {
      path: "/",
      element: <Shell />,
      children: [
        { index: true, element: <Agents /> },
        { path: "keys", element: <Keys /> },
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
      ],
    },
    { path: "*", element: <Agents /> },
  ],
  { basename: BASE },
);
