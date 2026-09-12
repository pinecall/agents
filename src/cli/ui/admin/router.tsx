/** Every URL the operator's page has. Append a route as a screen lands; never reorder — a seam. */

import { createBrowserRouter, Navigate } from "react-router";

import { MOUNTED_AT } from "./lib/base";
import { Fleet } from "./screens/fleet";
import { OneOrgScreen, Orgs } from "./screens/orgs";
import { Routes } from "./screens/routes";
import { Usage } from "./screens/usage";
import { Shell } from "./shell/shell";

// The URL is the state, as it is in the console: which screen, and which org. The basename is
// where the gateway mounts this page, so `/admin/orgs/clinica` reloads onto itself.
export const router = createBrowserRouter(
  [
    {
      path: "/",
      element: <Shell />,
      children: [
        { index: true, element: <Orgs /> },
        { path: "orgs/:named", element: <OneOrgScreen /> },
        { path: "routes", element: <Routes /> },
        { path: "fleet", element: <Fleet /> },
        { path: "usage", element: <Usage /> },
        { path: "*", element: <Navigate to="/" replace /> },
      ],
    },
  ],
  { basename: MOUNTED_AT },
);
