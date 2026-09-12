/** The operator's page starts here: the theme, the ops key this tab holds — or the login — and the router. */

import { StrictMode, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";

import { onUnauthorized } from "../shared/api";
import { CredentialsProvider } from "../shared/credentials";
import { followTheSystemTheme } from "../shared/theme";
import "../shared/styles/app.css";
import { BASE } from "./lib/base";
import { forgetOpsKey, keepOpsKey, keptOpsKey } from "./lib/ops-key";
import { router } from "./router";
import { Login } from "./screens/login";

followTheSystemTheme();

const root = document.getElementById("root");
if (root === null) {
  throw new Error("index.html has no #root for the admin page to mount in");
}

// No `?login=` here, and there never will be one: a code in a URL is how a browser is handed a
// TENANT's key by the process that holds it, and nothing hands out the box's. The operator types
// it, this tab keeps it, and the tab closing is the end of it.
function Admin(): ReactNode {
  const [key, setKey] = useState<string | null>(keptOpsKey());
  onUnauthorized(() => {
    forgetOpsKey();
    setKey(null);
  });

  if (key === null) {
    return (
      <Login
        base={BASE}
        onProved={(proved) => {
          keepOpsKey(proved);
          setKey(proved);
        }}
      />
    );
  }
  return (
    <CredentialsProvider value={{ base: BASE, key }}>
      <RouterProvider router={router} />
    </CredentialsProvider>
  );
}

createRoot(root).render(
  <StrictMode>
    <Admin />
  </StrictMode>,
);
